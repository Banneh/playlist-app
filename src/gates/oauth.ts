/** The consent driver: one hidden window per walk, on the app's own SoundCloud session.
 *
 *  Port of `tools/gate-test/sc-auth.js`. The window starts hidden and only `needAttention()`
 *  makes it visible; it goes back to hidden as soon as the page leaves the state that needed a
 *  human. The landing URL is captured from navigation events because several callback pages call
 *  `window.close()` before anything could read `getURL()`.
 *
 *  Rules that matter (all measured):
 *   - `setWindowOpenHandler` is wired before the first `loadURL`, or the Google popup opens in a
 *     window the driver cannot see.
 *   - `loadURL` is never awaited on an endpoint that 302s; it does not resolve.
 *   - A non-auth URL counts as "landed" only after an auth host was actually seen, otherwise the
 *     caller's own start page would count. */
import { BrowserWindow, type Session } from "electron";
import { classify, isKnown, reasonFor } from "./attention";
import { sleep } from "./http";
import type { AttentionReason } from "./types";

const AUTH_HOST = /secure\.soundcloud\.com|api-auth\.soundcloud\.com|accounts\.google\.com|about:blank/;
const CONSENT_TIMEOUT_MS = 120000;
const ATTENTION_TIMEOUT_MS = 5 * 60 * 1000;

const CLICK_JS = (patterns: string[]) => `(() => {
  const pats = ${JSON.stringify(patterns)};
  const els = [...document.querySelectorAll('button, a, div[role=button], input[type=submit], li, div[data-identifier]')];
  for (const p of pats) {
    const re = new RegExp(p, 'i');
    const el = els.find((e) => re.test((e.textContent || '').trim()) || re.test(e.getAttribute('aria-label') || '') || re.test(e.getAttribute('data-identifier') || ''));
    if (el) { el.click(); return 'clicked: ' + (el.textContent || el.getAttribute('data-identifier') || '').trim().slice(0, 40); }
  }
  return null;
})()`;

const GOOGLE = ["^Przejdź dalej, używając Google$", "Continue with Google", "Google"];
const CONSENT = ["^Połącz$", "^Connect$", "^Autoryzuj$", "^Authorize$", "^Zezwól$", "^Allow$", "^Continue$", "^Kontynuuj$"];
const ACCOUNT = ["@gmail\\.com", "@googlemail\\.com"];
/** Spotify's Google link is an <a href="/en/login/google?flow_ctx=…"> whose synthetic click is
 *  swallowed; the href has to be navigated to. */
const GOOGLE_HREF = `(() => {
  const a = document.querySelector('a[href*="/login/google"]');
  return a ? new URL(a.getAttribute('href'), location.href).href : null;
})()`;

export class WalkWindow {
  win: BrowserWindow;
  popups: BrowserWindow[] = [];
  private visible = false;
  private destroyed = false;
  private releaseWaiters: Array<() => void> = [];

  constructor(readonly ses: Session, readonly log: (m: string) => void) {
    this.win = this.makeWindow();
  }

  /** A callback page may call `window.close()`; the walk then needs a fresh window. */
  private makeWindow(): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      width: 640,
      height: 780,
      webPreferences: { session: this.ses, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    // never heard while nobody sees it: gate pages and the players their steps open can autoplay
    win.webContents.setAudioMuted(!this.visible);
    win.webContents.setWindowOpenHandler(({ url }) => {
      this.log("[auth] popup " + url.slice(0, 80));
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 640, show: this.visible, webPreferences: { session: this.ses } } };
    });
    win.webContents.on("did-create-window", (w) => {
      w.webContents.setAudioMuted(!this.visible);
      this.popups.push(w);
      if (this.visible) w.showInactive();
    });
    win.on("closed", () => this.log("[auth] window closed"));
    return win;
  }

  private ensure(): BrowserWindow {
    if (this.win.isDestroyed()) this.win = this.makeWindow();
    return this.win;
  }

  get webContents() { return this.ensure().webContents; }

  js<T = any>(code: string): Promise<T> {
    return this.webContents.executeJavaScript(code) as Promise<T>;
  }

  /** Navigate without awaiting: a 302 endpoint never resolves a loadURL promise. */
  load(url: string): void {
    this.webContents.loadURL(url).catch(() => {});
  }

  private show(): void {
    if (this.destroyed || this.visible) return;
    this.visible = true;
    // shown to a human: sound as in any window they look at
    if (!this.win.isDestroyed()) { this.win.webContents.setAudioMuted(false); this.win.showInactive(); }
    for (const p of this.popups) if (!p.isDestroyed()) { p.webContents.setAudioMuted(false); p.showInactive(); }
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (!this.win.isDestroyed()) { this.win.hide(); this.win.webContents.setAudioMuted(true); }
    for (const p of this.popups) if (!p.isDestroyed()) { p.hide(); p.webContents.setAudioMuted(true); }
  }

  private release(): void {
    const waiters = this.releaseWaiters;
    this.releaseWaiters = [];
    for (const f of waiters) f();
  }

  /** Show the window and wait until the page moves on (the human did their part) or 5 minutes pass. */
  needAttention(reason: AttentionReason): Promise<void> {
    return this.needAttentionIn(this.win, reason);
  }

  private async needAttentionIn(target: BrowserWindow, reason: AttentionReason): Promise<void> {
    if (this.destroyed) return;
    this.log("[attention] " + reason);
    const at = target.isDestroyed() ? "" : target.webContents.getURL();
    this.show();
    if (target !== this.win && !target.isDestroyed()) { target.webContents.setAudioMuted(false); target.showInactive(); }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearInterval(iv);
        clearTimeout(t);
        this.releaseWaiters = this.releaseWaiters.filter((f) => f !== done);
        resolve();
      };
      const iv = setInterval(() => {
        if (this.destroyed || target.isDestroyed() || target.webContents.getURL() !== at) done();
      }, 500);
      const t = setTimeout(done, ATTENTION_TIMEOUT_MS);
      this.releaseWaiters.push(done);
    });
    this.hide();
  }

  /** Drive the consent screen from `startUrl` until `done(url)` matches or the flow lands back on a
   *  non-auth page. Resolves with the landing URL ("" when it timed out). */
  consent(startUrl: string, done: (u: string) => boolean, signal: AbortSignal, timeoutMs = CONSENT_TIMEOUT_MS): Promise<string> {
    return this.drive(this.win, startUrl, done, signal, timeoutMs);
  }

  /** Drive a consent screen that a page opened in a popup (pumpyoursound's `SC.connect()`). */
  async consentPopup(popup: BrowserWindow, done: (u: string) => boolean, signal: AbortSignal, timeoutMs = CONSENT_TIMEOUT_MS): Promise<string> {
    return this.drive(popup, "", done, signal, timeoutMs);
  }

  private async drive(target: BrowserWindow, startUrl: string, done: (u: string) => boolean, signal: AbortSignal, timeoutMs: number): Promise<string> {
    const isMain = target === this.win;
    const wcOf = () => (isMain ? this.webContents : target.webContents);
    const urlOf = () => (isMain ? (this.win.isDestroyed() ? "" : this.win.webContents.getURL()) : target.isDestroyed() ? "" : target.webContents.getURL());
    let landed = "";
    let sawAuth = false;
    const note = (u: string) => {
      if (!u) return;
      if (AUTH_HOST.test(u)) { sawAuth = true; return; }
      if (sawAuth && !landed) { landed = u; this.log("[auth] landed " + u.slice(0, 90)); this.release(); }
    };
    const onNav = (_e: unknown, u: string) => note(u);
    let wc = wcOf();
    const attach = (c: Electron.WebContents) => {
      c.on("did-navigate", onNav);
      c.on("will-redirect", onNav);
      c.on("did-navigate-in-page", onNav);
    };
    attach(wc);

    const js = <T,>(code: string) => wcOf().executeJavaScript(code) as Promise<T>;
    const go = (u: string) => { wcOf().loadURL(u).catch(() => {}); };
    const attention = (r: AttentionReason) => (target === this.win ? this.needAttention(r) : this.needAttentionIn(target, r));

    const deadline = Date.now() + timeoutMs;
    let googleClicked = false, consentClicked = false, accountClicked = false, unknownSince = 0;
    let lastUrl = "", urlSince = Date.now(), clickedAt = 0;
    try {
      if (startUrl) go(startUrl);
      while (!landed) {
        if (signal.aborted) throw new Error("aborted");
        if (Date.now() > deadline) break;
        await sleep(700);
        // a callback page may close the window; the walk continues in a fresh one
        if (!isMain && target.isDestroyed()) { landed = landed || lastUrl; break; }
        const cur = wcOf();
        if (cur !== wc) { wc = cur; attach(wc); }
        const url = urlOf();
        if (!url || url === "about:blank") continue;
        if (url !== lastUrl) { lastUrl = url; urlSince = Date.now(); consentClicked = false; clickedAt = 0; this.log("[auth] at " + url.slice(0, 90)); }
        if (done(url)) { landed = url; break; }
        // A click before the page's own scripts are attached is swallowed; give it a moment, and
        // retry once when nothing happened after a click.
        const settled = Date.now() - urlSince > 2000;
        if (consentClicked && Date.now() - clickedAt > 6000) consentClicked = false;

        const st = await classify(wcOf());
        const reason = reasonFor(st);
        if (reason) await attention(reason);
        else if (!isKnown(st)) {
          if (!unknownSince) unknownSince = Date.now();
          else if (Date.now() - unknownSince > 3000) await attention("unknown");
        } else unknownSince = 0;
        if (landed) break;

        if (/accounts\.google\.com/.test(url) && !accountClicked) {
          const r = await js<string | null>(CLICK_JS(ACCOUNT)).catch(() => null);
          if (r) { this.log("[auth] google account " + r); accountClicked = true; }
          else {
            const r2 = await js<string | null>(CLICK_JS(["^Continue$", "^Kontynuuj$"])).catch(() => null);
            if (r2) this.log("[auth] google continue " + r2);
          }
        } else if (/secure\.soundcloud\.com/.test(url)) {
          // Google may be skipped entirely when the SSO session is fresh: try consent on every pass.
          if (!googleClicked) {
            const r = await js<string | null>(CLICK_JS(GOOGLE)).catch(() => null);
            if (r) { this.log("[auth] google sso " + r); googleClicked = true; }
          }
          if (!consentClicked && settled) {
            const r = await js<string | null>(CLICK_JS(CONSENT)).catch(() => null);
            if (r) { this.log("[auth] consent " + r); consentClicked = true; clickedAt = Date.now(); }
          }
        } else if (/accounts\.spotify\.com/.test(url)) {
          if (!googleClicked) {
            const href = await js<string | null>(GOOGLE_HREF).catch(() => null);
            if (href) { this.log("[auth] spotify google href"); googleClicked = true; go(href); continue; }
          }
          if (!consentClicked && settled) {
            const r = await js<string | null>(CLICK_JS(CONSENT)).catch(() => null);
            if (r) { this.log("[auth] spotify consent " + r); consentClicked = true; clickedAt = Date.now(); }
          }
        }
      }
      return landed || urlOf();
    } finally {
      if (!wc.isDestroyed()) {
        wc.removeListener("did-navigate", onNav);
        wc.removeListener("will-redirect", onNav);
        wc.removeListener("did-navigate-in-page", onNav);
      }
      this.destroyPopups();
      this.hide();
    }
  }

  private destroyPopups(): void {
    for (const p of this.popups) if (!p.isDestroyed()) p.destroy();
    this.popups = [];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.release();
    this.destroyPopups();
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}
