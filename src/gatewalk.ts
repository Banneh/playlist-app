/** Walk a Hypeddit gate in a hidden window — the fallback for gates the plain-HTTP walk
 *  (src/hypeddit.ts) cannot finish.
 *
 *  Why a window is needed at all: a gate whose steps include "sp" (Spotify) has no skip button
 *  on that step. The visitor has to connect a Spotify account through OAuth, and the gate's own
 *  script never advances the carousel afterwards either. So the gate is driven here instead:
 *  every other step is skipped, the Spotify step opens its OAuth popup, and the carousel is
 *  pushed on by hand once the popup is gone.
 *
 *  The window lives in a persistent partition, so the Spotify login survives: the first time the
 *  popup is shown so the user can log in, after that it stays hidden and the whole walk is
 *  invisible. The file is caught by will-download and put in the downloads folder. */
import { BrowserWindow, session, type Session } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as core from "./core";

const PARTITION = "persist:hypeddit";
/** a gate that never hands out a file (dead link, a step that will not move on) */
const TIMEOUT_MS = 150000;

let win: BrowserWindow | null = null;
let ses: Session | null = null;
let pending: { file: string | null; resolve: (p: string | null) => void } | null = null;

/** A name in the downloads folder that is not taken yet ("track.mp3" → "track (2).mp3"). */
function freeName(dir: string, name: string): string {
  const ext = path.extname(name), base = path.basename(name, ext) || "download";
  let p = path.join(dir, base + ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

/** The walker's session: a plain Chrome user agent (gates serve a different page to browsers
 *  they don't recognise) and a will-download that puts the file into the downloads folder. */
function getSession(): Session {
  if (ses) return ses;
  const s = session.fromPartition(PARTITION);
  s.setUserAgent(s.getUserAgent().replace(/ ?(Electron|dj-hq|DJ HQ)\/\S+/gi, ""));
  s.on("will-download", (_e, item) => {
    const p = pending;
    if (!p) return;
    const dir = core.inboxDir();
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const target = freeName(dir, item.getFilename() || "download");
    item.setSavePath(target);
    p.file = target;
    item.once("done", (_ev, state) => p.resolve(state === "completed" ? target : p.file));
  });
  ses = s;
  return ses;
}

/** The hidden window the gate is walked in. Made on demand and closed once a file is in (the
 *  session cookies live in the partition, so they survive). */
function getWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  getSession();
  const w = new BrowserWindow({
    show: false,
    width: 1100,
    height: 900,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  // never heard: the gate page and the players its steps open can autoplay
  w.webContents.setAudioMuted(true);
  // the gate opens its social/Spotify steps with window.open: let them through, hidden
  w.webContents.setWindowOpenHandler(() => ({
    action: "allow",
    overrideBrowserWindowOptions: { show: false, width: 520, height: 680, autoHideMenuBar: true },
  }));
  w.webContents.on("did-create-window", (child) => {
    child.webContents.setAudioMuted(true);
    // a Spotify login form means the user has to type something: show that popup, once
    child.webContents.on("did-navigate", (_e, url) => {
      if (/accounts\.spotify\.com\/(pl\/)?login/.test(url) && !child.isVisible()) {
        child.show();
        child.focus();
      }
    });
  });
  if (process.env.DJHQ_DL_DEBUG) {
    w.webContents.on("console-message", (e, _l, m) => { if (/\[w\]/.test(m)) console.log("[gate]", m); });
  }
  win = w;
  return w;
}

/** The script that drives the gate from the inside. Returns "pressed" once the Download button
 *  has been clicked, or "stuck" when no step would move on. */
const WALK_JS = (email: string) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => {
    if (!el) return false;
    if (el.classList.contains('hide')) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth + el.offsetHeight > 0;
  };
  const press = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }));
    return true;
  };
  const fill = (el, v) => {
    if (!el || el.value) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const slide = () => [...document.querySelectorAll('.fangate-slider-content')].find((s) => !s.classList.contains('move-left'));
  const NEXT = ['#email_to_downloads_next', '#skipper', '#skipper_sc_channel', '#skipper_sc_next', '#skipper_yt_channel', '#skipper_yt_next', '#skipper_yt',
    '#skipper_ig_channel', '#skipper_ig_next', '#skipper_ig', '#skipper_tw_channel', '#skipper_tw_next', '#skipper_fb_button', '#skipper_fb',
    '#skipper_tk', '#skipper_tk_next', '#skipper_bc', '#skipper_bc_next', '#skipper_dn', '#skipper_dz', '#skipper_ap', '#skipper_th', '#skipper_mc', '#skipper_fbmsgr',
    '#fbCarouselSocialSection'];
  /** last resort on a slide with none of the known buttons: whatever the gate calls "Next" */
  const ANY_NEXT = '.button-next, .myCarouselSocialSection, .email_to_downloads';

  const email = ${JSON.stringify(email)};
  let spPressed = 0, spSince = 0;
  const log = (...a) => { if (window.__dbg) console.log('[w]', ...a); };

  for (let i = 0; i < 400; i++) {
    await sleep(300);
    const start = document.querySelector('#downloadProcess');
    if (start && vis(start) && !start.__walked) { start.__walked = 1; press(start); continue; }
    const c = slide();
    if (!c) continue;
    const cls = (c.className || '').trim().split(' ')[0];
    if (cls !== window.__last) { window.__last = cls; log('slide ' + cls); }

    // the last slide: press Download
    if (cls === 'dw') {
      const btn = [...document.querySelectorAll('#gateDownloadButton')].find(vis);
      if (btn && !btn.__walked) { btn.__walked = 1; press(btn); return 'pressed'; }
      continue;
    }

    // the email step: fill it in and move on
    if (cls === 'email') {
      fill(document.querySelector('#email_address'), email);
      fill(document.querySelector('#download_email_address'), email);
      const nm = document.querySelector('#email_name');
      if (nm && !nm.value) fill(nm, email.split('@')[0].split(/[._-]/)[0]);
    }

    // the Spotify step: it has a "Skip to next step" link, which marks the step skipped (that is
    // what the download post needs) and moves the carousel on. Only when there is no such link
    // is the OAuth popup worth opening — that is a real Spotify follow, but it needs a login.
    if (cls === 'sp') {
      const skip = c.querySelector('#skipper');
      log('sp: skipper=' + !!skip + ' vis=' + (skip ? vis(skip) : false));
      if (skip && vis(skip) && !skip.__walked) { skip.__walked = 1; press(skip); log('sp skip'); continue; }
      const sp = c.querySelector('#login_to_sp');
      if (sp && vis(sp) && !spPressed) { spPressed = 1; spSince = Date.now(); press(sp); continue; }
      if (spPressed === 1) {
        const pop = window.newWindow;
        const url = pop && !pop.closed ? String(pop.location.href || '') : '';
        // the popup lands on the callback and closes itself; a login form means the user is
        // typing, so give that longer
        const back = !pop || pop.closed || /spotify_callback/.test(url);
        const loggingIn = /accounts\.spotify\.com/.test(url);
        if (back || Date.now() - spSince > (loggingIn ? 120000 : 20000)) {
          try { if (pop && !pop.closed) pop.close(); } catch (e) {}
          if (typeof gateNextSlide === 'function') gateNextSlide(document.querySelector('#login_to_sp'));
          else if (typeof rX5mPQjW7s === 'function') rX5mPQjW7s('login_to_sp');
          spPressed = 2;
        }
      }
      continue;
    }

    // every other step: mark its social links done, then press its Next
    for (const a of c.querySelectorAll('a.undone')) { a.classList.remove('undone'); a.classList.add('done'); }
    for (const sel of NEXT) {
      const el = c.querySelector(sel);
      if (el && vis(el) && !el.__walked) { el.__walked = 1; press(el); log('press ' + sel + ' on ' + cls); break; }
    }
    const any = [...c.querySelectorAll(ANY_NEXT)].find((el) => vis(el) && !el.__walked);
    if (any) { any.__walked = 1; press(any); log('press ' + (any.id || any.className) + ' on ' + cls); }
  }
  return 'stuck';
})()`;

/** Walk a gate in the hidden window and bring the file into the downloads folder.
 *  Resolves with the saved path, or null when the gate handed out no file. */
export async function walk(url: string, email: string): Promise<string | null> {
  const w = getWindow();
  const prev = pending;
  let resolve!: (p: string | null) => void;
  const done = new Promise<string | null>((res) => { resolve = res; });
  const p = { file: null as string | null, resolve };
  pending = p;
  if (prev) prev.resolve(prev.file);
  const t = setTimeout(() => resolve(p.file), TIMEOUT_MS);
  let file: string | null = null;
  try {
    await w.webContents.loadURL(url);
    await new Promise((r) => setTimeout(r, 1500));
    // a hidden window counts as "not visible", so the gate's own visit ping has to be nudged
    await w.webContents.executeJavaScript("try { sgp(); } catch (e) {}").catch(() => {});
    await w.webContents.executeJavaScript("window.__dbg = " + (process.env.DJHQ_DL_DEBUG ? "1" : "0")).catch(() => {});
    const verdict = await w.webContents.executeJavaScript(WALK_JS(email), true).catch(() => "stuck");
    if (process.env.DJHQ_DL_DEBUG) console.log("[gate] verdict", verdict);
    if (verdict !== "pressed") return null;
    file = await done;
    return file;
  } finally {
    clearTimeout(t);
    if (pending === p) pending = null;
    // got the file and no other walk took the window over: close it and the popups it opened
    // (the partition keeps the cookies and the Spotify login, so the next walk starts fresh)
    if (file && !pending) closeAll();
  }
}

/** Close the walker's window and every popup the gate opened in its session. */
function closeAll(): void {
  for (const b of BrowserWindow.getAllWindows()) {
    if (!b.isDestroyed() && b.webContents.session === ses) b.destroy();
  }
  win = null;
}
