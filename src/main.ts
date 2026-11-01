/** DJ HQ — Electron entry point. Starts the local server on an ephemeral port
 *  and opens the UI in a window. External links open in the default browser.
 *  The Discover page embeds soundcloud.com in a WebContentsView that keeps its
 *  own session (persist:soundcloud), so the user signs in once and stays in. */
import { app, BrowserWindow, dialog, nativeTheme, session, shell, WebContentsView } from "electron";
import * as path from "path";
import { ScRect, ScView, startServer } from "./server";

// Packaged app keeps its data in the OS user-data dir; running from source uses
// the project folder (same place the Python version kept state.json).
const dataDir =
  process.env.DJHQ_DATA_DIR ||
  (app.isPackaged ? app.getPath("userData") : path.resolve(__dirname, ".."));

let win: BrowserWindow | null = null;

// ---------------- embedded SoundCloud ----------------
const SC_PARTITION = "persist:soundcloud";
const SC_HOME = "https://soundcloud.com/discover";
/** hosts that may load inside the view: SoundCloud itself and the sign-in providers it offers */
const SC_HOSTS = /(^|\.)(soundcloud\.com|sndcdn\.com|google\.com|googleapis\.com|gstatic\.com|apple\.com|facebook\.com|fbcdn\.net|recaptcha\.net)$/i;
const inView = (url: string) => { try { return SC_HOSTS.test(new URL(url).hostname); } catch { return false; } };

let scView: WebContentsView | null = null;
let scShown = false;

function scEnsure(): WebContentsView {
  if (scView) return scView;
  const ses = session.fromPartition(SC_PARTITION);
  // a plain Chrome user agent: Google's sign-in refuses browsers that announce Electron
  ses.setUserAgent(ses.getUserAgent().replace(/ ?(Electron|dj-hq|DJ HQ)\/\S+/gi, ""));
  const v = new WebContentsView({ webPreferences: { partition: SC_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  v.setBackgroundColor("#ffffff");
  const wc = v.webContents;
  // sign-in buttons (Google, Apple, Facebook) open a popup window that must really open,
  // in the same session; links out of SoundCloud (shops, download gates) go to the default browser
  wc.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank" || inView(url))
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, title: "Sign in",
               webPreferences: { partition: SC_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true } } };
    shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => { if (!inView(url)) { e.preventDefault(); shell.openExternal(url); } });
  wc.on("did-finish-load", () => { if (scView && scShown) scFit(scView, scView.getBounds().width); });
  // player keys pressed while the SoundCloud page has the focus: a small listener in the page
  // reports them through the console (the view is sandboxed, with no preload), and they are
  // handed to the UI's dcKey(), the same place that handles keys pressed on the app's own page
  wc.on("dom-ready", () => { wc.executeJavaScript(SC_KEYS_JS, true).catch(() => {}); });
  wc.on("console-message", (e) => {
    const m = /^djhq:key:(.+)$/.exec(e.message || "");
    if (m && win) win.webContents.executeJavaScript(`typeof dcKey === "function" && dcKey(${JSON.stringify(m[1])})`, true).catch(() => {});
  });
  scView = v;
  return v;
}

/** soundcloud.com lays itself out for a ~1200px desktop page and piles up below that;
 *  in a narrower area the page is zoomed out so it keeps its real layout (like browser zoom) */
const SC_LAYOUT_WIDTH = 1200;
function scFit(v: WebContentsView, width: number) {
  const z = Math.max(0.6, Math.min(1, width / SC_LAYOUT_WIDTH));
  if (Math.abs(v.webContents.getZoomFactor() - z) > 0.01) v.webContents.setZoomFactor(z);
}

/** a press on a SoundCloud control, as the mouse would do it: the page's buttons (<a role="button">
 *  these days) listen for the pointer and mouse events, and ignore a bare .click() */
const SC_PRESS_JS = `const press = (el, x, y) => {
  const r = el.getBoundingClientRect();
  if (x === undefined) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
};`;
/** press the big play button of the track page that is open (polls while the page hydrates);
 *  a button already in its "pause" state means the track is playing, so it is left alone */
const SC_PLAY_JS = `(() => new Promise((res) => {
  ${SC_PRESS_JS}
  const t0 = Date.now();
  const tick = () => {
    const b = [...document.querySelectorAll('.sc-button-play.playButton, .soundTitle__playButtonHero .sc-button-play, .fullHero .sc-button-play')]
      .find((x) => !x.closest('.playControls') && !x.classList.contains('sc-button-disabled'));
    if (b) { if (!b.classList.contains('sc-button-pause')) press(b); return res(true); }
    if (Date.now() - t0 > 8000) return res(false);
    setTimeout(tick, 250);
  };
  tick();
}))()`;
/** open a page in the view and, when asked, start the track on it once it has loaded */
function scGo(v: WebContentsView, url: string, play?: boolean) {
  const wc = v.webContents;
  const press = () => { wc.executeJavaScript(SC_PLAY_JS, true).catch(() => {}); };
  if (wc.getURL() === url && !wc.isLoading()) { if (play) press(); return; }
  if (play) wc.once("did-finish-load", press);
  wc.loadURL(url);
}

/** keys the Discover page handles (see DC_KEYS in web/pages/discover.js): forwarded from the
 *  SoundCloud page when the focus is there and nothing is being typed; SoundCloud's own
 *  shortcuts (Shift+…) and everything else stay with the page */
const SC_KEYS_JS = `(() => {
  if (window.__djhqKeys) return; window.__djhqKeys = true;
  const KEYS = new Set([' ', 'ArrowLeft', 'ArrowRight', 'n', 'N', 'p', 'P', 'a', 'A', 'l', 'L']);
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !KEYS.has(e.key)) return;
    const el = document.activeElement, tag = el ? el.tagName : '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (el && el.isContentEditable)) return;
    e.preventDefault(); e.stopPropagation();
    console.log('djhq:key:' + e.key);
  }, true);
})()`;
/** the player bar at the bottom of soundcloud.com, driven from outside: play/pause, the
 *  previous or next track of SoundCloud's queue, or a jump of n seconds (class names are SoundCloud's) */
const scPlayerJs = (action: string, n: number) => `(() => {
  ${SC_PRESS_JS}
  const live = (sel) => { const b = document.querySelector(sel); return b && !b.disabled && !b.classList.contains('disabled') && !b.classList.contains('sc-button-disabled') ? b : null; };
  const hit = (sel) => { const b = live(sel); if (b) press(b); return !!b; };
  switch (${JSON.stringify(action)}) {
    case 'toggle': {
      if (hit('.playControls__play')) return { ok: true };
      // nothing queued yet: the first play button on the page (a track page's big one or the first in a list)
      const b = [...document.querySelectorAll('.sc-button-play')].find((x) => !x.closest('.playControls') && !x.classList.contains('sc-button-disabled'));
      if (b) press(b);
      return { ok: !!b };
    }
    case 'next': return { ok: hit('.playControls__next') };
    case 'prev': return { ok: hit('.playControls__prev') };
    case 'seek': {
      const w = document.querySelector('.playbackTimeline__progressWrapper');
      const max = w ? +w.getAttribute('aria-valuemax') : 0, now = w ? +w.getAttribute('aria-valuenow') : 0;
      if (!w || !(max > 0) || !live('.playControls__play')) return { ok: false };
      // a press on the timeline where the new position is, so SoundCloud's own player does the seek
      const to = Math.max(0, Math.min(max, now + ${JSON.stringify(n)}));
      const r = w.getBoundingClientRect();
      press(w, r.left + r.width * (to / max), r.top + r.height / 2);
      return { ok: true, at: to, of: max };
    }
  }
  return { ok: false };
})()`;

const sc: ScView = {
  async show(rect: ScRect, url?: string, play?: boolean) {
    if (!win) return;
    const v = scEnsure();
    if (!scShown) { win.contentView.addChildView(v); scShown = true; }
    v.setBounds(rect);
    scFit(v, rect.width);
    const cur = v.webContents.getURL();
    if (url) scGo(v, url, play);
    else if (!cur) v.webContents.loadURL(SC_HOME);
  },
  hide() {
    if (win && scView && scShown) { win.contentView.removeChildView(scView); scShown = false; }
  },
  setBounds(rect: ScRect) { if (scView && scShown) { scView.setBounds(rect); scFit(scView, rect.width); } },
  navigate(url: string, play?: boolean) { scGo(scEnsure(), url, play); },
  back() { const h = scView?.webContents.navigationHistory; if (h && h.canGoBack()) h.goBack(); },
  async player(action: string, n?: number) {
    if (!scView || !scView.webContents.getURL()) return { ok: false };
    return scView.webContents.executeJavaScript(scPlayerJs(action, Number(n) || 0), true).catch(() => ({ ok: false }));
  },
  url() { return scView ? scView.webContents.getURL() : ""; },
  async nowPlaying() {
    if (!scView || scView.webContents.isLoading() && !scView.webContents.getURL()) return null;
    // the player bar at the bottom of soundcloud.com; class names are SoundCloud's and may change
    return scView.webContents.executeJavaScript(`(() => {
      const badge = document.querySelector('.playbackSoundBadge');
      const t = badge && (badge.querySelector('.playbackSoundBadge__titleLink') || badge.querySelector('a[href][title]:not(.playbackSoundBadge__avatar)'));
      if (!t) return null;
      const a = badge.querySelector('a.playbackSoundBadge__lightLink') || badge.querySelector('.playbackSoundBadge__lightLink a');
      const p = document.querySelector('.playControls__play');
      return { url: t.href, title: t.getAttribute('title') || t.textContent.trim(), artist: a ? (a.getAttribute('title') || a.textContent.trim()) : '',
               playing: !!(p && p.classList.contains('playing')) };
    })()`, true).catch(() => null);
  },
  async token() {
    const cookies = await session.fromPartition(SC_PARTITION).cookies.get({ name: "oauth_token", domain: "soundcloud.com" });
    const c = cookies.find((x) => x.value);
    return c ? c.value : null;
  },
  async api(method, url, headers, body) {
    const wc = scEnsure().webContents;
    // the page must be a loaded soundcloud.com page (the user may add from Not in playlist before ever opening Discover)
    const onSc = /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(wc.getURL());
    if (!onSc || wc.isLoading()) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 20000);
        wc.once("did-finish-load", () => { clearTimeout(t); resolve(); });
        if (!onSc) wc.loadURL(SC_HOME);
      });
    }
    const code = `(async () => {
      try {
        const r = await fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: ${JSON.stringify(headers)},
          body: ${body === undefined ? "undefined" : JSON.stringify(body)}, credentials: "include" });
        return { status: r.status, body: await r.text() };
      } catch (e) { return { status: 0, body: String(e && e.message || e) }; }
    })()`;
    return wc.executeJavaScript(code, true);
  },
  async signOut() {
    const ses = session.fromPartition(SC_PARTITION);
    await ses.clearStorageData();
    await ses.clearCache();
    if (scView) scView.webContents.loadURL(SC_HOME);
  },
};

app.whenReady().then(async () => {
  const server = await startServer({
    dataDir,
    port: Number(process.env.DJHQ_PORT || 0),
    pickFolder: async () => {
      const r = await dialog.showOpenDialog(win!, {
        title: "Choose your music folder",
        properties: ["openDirectory"],
      });
      return r.canceled ? null : r.filePaths[0];
    },
    reveal: (p) => shell.showItemInFolder(p),
    packaged: app.isPackaged,
    sc,
  });
  const port = (server.address() as any).port;

  const mac = process.platform === "darwin";
  win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1116" : "#f4f5f7",
    title: "DJ HQ",
    // macOS: the window chrome blends into the sidebar (traffic lights over it)
    ...(mac ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 18 } } : {}),
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://127.0.0.1:${port}/${mac ? "?titlebar=inset" : ""}`);
  win.on("closed", () => { win = null; scShown = false; scView = null; });
});

app.on("window-all-closed", () => app.quit());
