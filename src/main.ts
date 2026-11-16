/** DJ HQ — Electron entry point. Starts the local server on an ephemeral port
 *  and opens the UI in a window. External links open in the default browser.
 *  The Discover page embeds soundcloud.com in a WebContentsView that keeps its
 *  own session (persist:soundcloud), so the user signs in once and stays in. */
import { app, BrowserWindow, dialog, nativeTheme, session, shell, systemPreferences, WebContentsView } from "electron";
import * as path from "path";
import * as core from "./core";
import { PickKind, ScRect, ScView, startServer } from "./server";

// Packaged app keeps its data in the OS user-data dir; running from source uses
// the project folder (same place the Python version kept state.json).
const dataDir =
  process.env.DJHQ_DATA_DIR ||
  (app.isPackaged ? app.getPath("userData") : path.resolve(__dirname, ".."));

let win: BrowserWindow | null = null;

// ---------------- embedded SoundCloud ----------------
const SC_PARTITION = "persist:soundcloud";
const SC_HOME = "https://soundcloud.com/discover";
/** hosts that may load inside the view: SoundCloud itself, the sign-in providers it offers and
 *  its bot check (DataDome's captcha-delivery.com): a check that ever opens on its own must stay in
 *  this session, or the cookie it hands out on success lands in the wrong browser */
const SC_HOSTS = /(^|\.)(soundcloud\.com|sndcdn\.com|google\.com|googleapis\.com|gstatic\.com|apple\.com|facebook\.com|fbcdn\.net|recaptcha\.net|captcha-delivery\.com)$/i;
const inView = (url: string) => { try { return SC_HOSTS.test(new URL(url).hostname); } catch { return false; } };

let scView: WebContentsView | null = null;
let scShown = false;

function scEnsure(): WebContentsView {
  if (scView) return scView;
  const ses = session.fromPartition(SC_PARTITION);
  // a plain Chrome user agent: Google's sign-in refuses browsers that announce Electron
  ses.setUserAgent(ses.getUserAgent().replace(/ ?(Electron|dj-hq|DJ HQ)\/\S+/gi, ""));
  // backgroundThrottling off: the view plays on with the window on another page, and a track
  // can be started while it is detached (a cover clicked on a list); throttled, SoundCloud's
  // player ignores the press until the view is shown
  const v = new WebContentsView({ webPreferences: { partition: SC_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  v.setBackgroundColor("#ffffff");
  // a track can start from any list before Discover was ever opened: the view then lives
  // detached from the window, and the page needs a real size to lay itself out and play
  v.setBounds({ x: 0, y: 0, width: SC_LAYOUT_WIDTH, height: 800 });
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
  wc.on("dom-ready", () => { scEval(SC_KEYS_JS); });
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
/** Run a script in the SoundCloud page as it is right now. webContents.executeJavaScript holds a
 *  script back until the page's load event, and soundcloud.com is usable (and playing) long before
 *  that: a slow ad or tracker script kept the status poll and the play press waiting for seconds,
 *  with the bar stuck on its spinner. The main frame runs it at once; null when there is no page. */
function scEval<T = unknown>(code: string): Promise<T | null> {
  const wc = scView?.webContents;
  if (!wc || wc.isDestroyed() || !wc.getURL()) return Promise.resolve(null);
  try { return wc.mainFrame.executeJavaScript(code, true).then((r) => r as T, () => null); }
  catch { return Promise.resolve(null); }
}

const scPath = (url: string) => { try { return decodeURI(new URL(url).pathname).replace(/\/+$/, "").toLowerCase(); } catch { return ""; } };
const scSamePage = (a: string, b: string) => { try { const x = new URL(a), y = new URL(b); return x.host === y.host && scPath(a) === scPath(b) && x.search === y.search; } catch { return false; } };
const scOnSite = (url: string) => /^https:\/\/(www\.)?soundcloud\.com\//.test(url);

/** Open another soundcloud.com page through the site's own router (a press on a link, which it
 *  turns into an in-page navigation): no reload, so it takes a fraction of a second and whatever
 *  is playing plays on. The play buttons of the page being left are marked for a few seconds, so
 *  the track starter below never presses one of them while the new page is still being drawn. */
const scRouteJs = (url: string) => `(() => {
  ${SC_PRESS_JS}
  if (!document.body || document.readyState === 'loading') return null;
  document.querySelectorAll('.sc-button-play, .blockedTrack, .missingListenHero').forEach((x) => { x.__djhqStale = Date.now(); });
  const u = new URL(${JSON.stringify(url)});
  const a = document.createElement('a');
  a.href = u.pathname + u.search + u.hash;
  a.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(a);
  press(a, 0, 0);
  a.remove();
  return 'routed';
})()`;
/** One step of starting the track whose page is open: press its big play button and say what
 *  happened. "playing": the button shows pause, so SoundCloud is playing this track; "gone": the
 *  page says the track is not there; "wait": the page is not drawn yet, or a press was made a moment
 *  ago and gets time to take (a second press would pause it again). */
const scStartJs = (url: string, ms: number) => `(() => {
  ${SC_PRESS_JS}
  const fresh = (x) => !(x.__djhqStale && Date.now() - x.__djhqStale < 3000);
  if ([...document.querySelectorAll('.blockedTrack, .missingListenHero')].some(fresh)) return 'gone';
  const here = decodeURI(location.pathname).replace(/\\/+$/, '').toLowerCase();
  // the page of this track (after 4 s also the page SoundCloud redirected a renamed track to)
  if (here !== ${JSON.stringify(scPath(url))} && ${ms} < 4000) return 'wait';
  const b = [...document.querySelectorAll('.soundTitle__playButtonHero .sc-button-play, .fullHero .sc-button-play, .l-listen-hero .sc-button-play, .sc-button-play.playButton')]
    .find((x) => fresh(x) && !x.closest('.playControls') && !x.classList.contains('sc-button-disabled'));
  if (!b) return 'wait';
  if (b.classList.contains('sc-button-pause')) return 'playing';
  const now = Date.now();
  if (window.__djhqPressed && now - window.__djhqPressed < 2500) return 'wait';
  window.__djhqPressed = now;
  press(b);
  return 'pressed';
})()`;

/** the track a list asked for last and how far it got; the status poll hands it to the UI, whose
 *  bottom bar shows its spinner until this says the track plays (or could not be started) */
let scStart: { url: string; state: "starting" | "playing" | "failed" | "gone" } | null = null;
let scGoSeq = 0;
const SC_START_MS = 20000;

/** open a page in the view and, when asked, start the track on it */
async function scGo(v: WebContentsView, url: string, play?: boolean) {
  const wc = v.webContents;
  const seq = ++scGoSeq;   // a newer request takes over from this one
  scStart = play ? { url, state: "starting" } : null;
  const cur = wc.getURL();
  // a track to start is on its page whatever the query says (?in=… of a set it was opened from)
  let there = !wc.isLoadingMainFrame() && (play ? scOnSite(cur) && scOnSite(url) && scPath(cur) === scPath(url) : scSamePage(cur, url));
  if (!there && scOnSite(cur) && scOnSite(url) && !wc.isLoadingMainFrame()) {
    there = (await scEval<string>(scRouteJs(url))) === "routed";
    if (seq !== scGoSeq) return;
    // the router did not take it (or SoundCloud changed how links work): load the page the plain way
    if (there) setTimeout(() => { if (seq === scGoSeq && scView === v && scPath(wc.getURL()) !== scPath(url) && !wc.isLoadingMainFrame()) wc.loadURL(url); }, 1500);
  }
  if (!there) wc.loadURL(url);
  if (!play) return;
  const t0 = Date.now();
  const step = async () => {
    if (seq !== scGoSeq || scView !== v) return;
    const r = await scEval<string>(scStartJs(url, Date.now() - t0));
    if (seq !== scGoSeq) return;
    if (r === "playing" || r === "gone") { scStart = { url, state: r }; return; }
    if (Date.now() - t0 > SC_START_MS) { scStart = { url, state: "failed" }; return; }
    setTimeout(step, 250);
  };
  step();
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
 *  previous or next track of SoundCloud's queue, a jump of n seconds or to second n (class names are SoundCloud's) */
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
    case 'pause': {   // only when it plays: a file from disk takes over
      const b = live('.playControls__play');
      if (b && b.classList.contains('playing')) press(b);
      return { ok: true };
    }
    case 'next': return { ok: hit('.playControls__next') };
    case 'prev': return { ok: hit('.playControls__prev') };
    case 'seek': case 'seekto': {   // a jump of n seconds, or to second n (the seek line of the app's bar)
      const rel = ${JSON.stringify(action)} === 'seek';
      const w = document.querySelector('.playbackTimeline__progressWrapper');
      const max = w ? +w.getAttribute('aria-valuemax') : 0, now = w ? +w.getAttribute('aria-valuenow') : 0;
      if (!w || !(max > 0) || !live('.playControls__play')) return { ok: false };
      // a press on the timeline where the new position is, so SoundCloud's own player does the seek
      const to = Math.max(0, Math.min(max, (rel ? now : 0) + ${JSON.stringify(n)}));
      const r = w.getBoundingClientRect();
      press(w, r.left + r.width * (to / max), r.top + r.height / 2);
      return { ok: true, at: to, of: max };
    }
  }
  return { ok: false };
})()`;

/** SoundCloud's bot check. soundcloud.com runs DataDome's tag: a request it refuses (a whole page,
 *  or a fetch to one of the api-v2 paths the tag watches, likes and playlists among them) comes back
 *  403 with a challenge from captcha-delivery.com, which the tag shows in an iframe laid over the
 *  page, the same one a refused page load gets (with a `dd` object, rt 'c', in the page). While it
 *  is up, playing and every write through the view fail. /captcha/ is the check a person solves;
 *  /interstitial/ is the device check that passes by itself, so it does not count. */
const SC_CAPTCHA_URL = /^https:\/\/([^\/]+\.)?captcha-delivery\.com\/captcha/i;
const SC_CAPTCHA_JS = `(() => {
  const dd = (u) => { try { const x = new URL(u, location.href); return /(^|\\.)captcha-delivery\\.com$/i.test(x.hostname) && /^\\/captcha/i.test(x.pathname); } catch { return false; } };
  for (const f of document.querySelectorAll('iframe')) {
    if (!dd(f.src)) continue;
    const r = f.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;   // a frame the tag left behind, hidden, is no check
  }
  const c = window.dd;   // a page that is only the check, before its script has drawn the frame
  return !!(c && typeof c === 'object' && c.rt === 'c' && /captcha-delivery\\.com/i.test(String(c.host || '')));
})()`;
/** when a write through the view last came back refused by the bot check: the tag may take a
 *  moment to draw the check, and the notice should not wait for it */
let scCaptchaAt = 0;
async function scCaptcha(): Promise<boolean> {
  const wc = scView?.webContents;
  if (!wc || wc.isDestroyed() || !wc.getURL()) return false;   // no view yet: nothing to look at, and none is made for it
  if (Date.now() - scCaptchaAt < 15000 || SC_CAPTCHA_URL.test(wc.getURL())) return true;   // or the view is on the check itself
  const r = await scEval<boolean>(SC_CAPTCHA_JS);
  if (r !== null) return !!r;
  // the page did not answer (busy loading): the frames the view has loaded say it too
  try { return wc.mainFrame.framesInSubtree.some((f) => SC_CAPTCHA_URL.test(f.url)); } catch { return false; }
}

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
    if (action === "pause") { scGoSeq++; scStart = null; }   // a track that is still being started is called off too
    return (await scEval<{ ok: boolean; at?: number; of?: number }>(scPlayerJs(action, Number(n) || 0))) || { ok: false };
  },
  url() { return scView ? scView.webContents.getURL() : ""; },
  async nowPlaying() {
    // the player bar at the bottom of soundcloud.com; class names are SoundCloud's and may change
    return scEval<{ url: string; title: string; artist: string; playing: boolean; at: number; of: number }>(`(() => {
      const badge = document.querySelector('.playbackSoundBadge');
      const t = badge && (badge.querySelector('.playbackSoundBadge__titleLink') || badge.querySelector('a[href][title]:not(.playbackSoundBadge__avatar)'));
      if (!t) return null;
      const a = badge.querySelector('a.playbackSoundBadge__lightLink') || badge.querySelector('.playbackSoundBadge__lightLink a');
      const p = document.querySelector('.playControls__play');
      // position and length in seconds, from the timeline (0 when it is not there)
      const w = document.querySelector('.playbackTimeline__progressWrapper');
      const num = (k) => { const v = w ? +w.getAttribute(k) : 0; return v > 0 ? v : 0; };
      return { at: num('aria-valuenow'), of: num('aria-valuemax'),
               url: t.href, title: t.getAttribute('title') || t.textContent.trim(), artist: a ? (a.getAttribute('title') || a.textContent.trim()) : '',
               playing: !!(p && p.classList.contains('playing')) };
    })()`);
  },
  starting() { return scStart; },
  captcha: scCaptcha,
  async token() {
    const cookies = await session.fromPartition(SC_PARTITION).cookies.get({ name: "oauth_token", domain: "soundcloud.com" });
    const c = cookies.find((x) => x.value);
    return c ? c.value : null;
  },
  async api(method, url, headers, body) {
    const wc = scEnsure().webContents;
    if (SC_CAPTCHA_URL.test(wc.getURL())) throw new Error(core.SC_CAPTCHA);   // on the check itself: don't navigate away from it
    // the page must be a loaded soundcloud.com page (the user may add from Not in playlist before ever opening Discover)
    // (the page's document is enough for a fetch: its load event can be many seconds later, see scEval)
    const onSc = /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(wc.getURL());
    if (!onSc || wc.isLoadingMainFrame()) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(t); wc.removeListener("dom-ready", done); resolve(); };
        const t = setTimeout(done, 20000);
        wc.on("dom-ready", done);
        if (!onSc) wc.loadURL(SC_HOME);
      });
    }
    // the bot check is up: the request would only be refused again (or wait for the check)
    if (await scCaptcha()) throw new Error(core.SC_CAPTCHA);
    const code = `(async () => {
      try {
        const r = await fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: ${JSON.stringify(headers)},
          body: ${body === undefined ? "undefined" : JSON.stringify(body)}, credentials: "include" });
        return { status: r.status, body: await r.text() };
      } catch (e) { return { status: 0, body: String(e && e.message || e) }; }
    })()`;
    const r = await (wc.mainFrame.executeJavaScript(code, true) as Promise<{ status: number; body: string }>);
    // refused by the bot check: its answer is {"url":"https://geo.captcha-delivery.com/captcha/?…"}
    if (r && r.status === 403 && core.scCaptchaBody(r.body)) scCaptchaAt = Date.now();
    return r;
  },
  async signOut() {
    const ses = session.fromPartition(SC_PARTITION);
    await ses.clearStorageData();
    await ses.clearCache();
    if (scView) scView.webContents.loadURL(SC_HOME);
  },
};

/** The file pickers of the "Do everything" setup. On macOS an app is a folder (a
 *  bundle) that the open panel shows as one item when "app" is the only extension;
 *  a path inside a bundle is cut back to the bundle. */
const PICK_TEXT: Record<PickKind, string> = {
  pn_app: "Choose Platinum Notes",
  mik_app: "Choose Mixed In Key",
  mik_db: "Choose Mixed In Key’s database",
  rb_xml: "Choose the rekordbox XML file rekordbox imports from",
  config: "Choose the DJ HQ configuration file to import",
};
async function pickFile(kind: PickKind): Promise<string | null> {
  const mac = process.platform === "darwin", winOs = process.platform === "win32";
  const home = app.getPath("home");
  const opt: Electron.OpenDialogOptions = { title: PICK_TEXT[kind], properties: ["openFile"] };
  if (kind === "pn_app" || kind === "mik_app") {
    opt.filters = [{ name: "Apps", extensions: [mac ? "app" : winOs ? "exe" : "*"] }];
    opt.defaultPath = mac ? "/Applications" : winOs ? path.join(process.env.LOCALAPPDATA || home, "Programs") : home;
  } else if (kind === "mik_db") {
    opt.filters = [{ name: "Mixed In Key database", extensions: mac ? ["mikdb"] : ["db"] }, { name: "All files", extensions: ["*"] }];
    opt.defaultPath = mac ? path.join(home, "Library", "Application Support", "Mixedinkey")
      : path.join(process.env.LOCALAPPDATA || home, "Mixed In Key", "Mixed In Key");
  } else if (kind === "config") {
    opt.filters = [{ name: "DJ HQ configuration", extensions: ["json"] }, { name: "All files", extensions: ["*"] }];
    opt.defaultPath = app.getPath("documents");
  } else {
    opt.filters = [{ name: "rekordbox XML", extensions: ["xml"] }];
    opt.defaultPath = path.join(home, "Documents");
  }
  const r = win ? await dialog.showOpenDialog(win, opt) : await dialog.showOpenDialog(opt);
  if (r.canceled || !r.filePaths[0]) return null;
  let p = r.filePaths[0];
  if (mac) { const i = p.indexOf(".app/"); if (i >= 0) p = p.slice(0, i + 4); }
  return p;
}

/** Export configuration: a save dialog (Documents by default), then the file written whole. */
async function saveFile(defaultName: string, text: string): Promise<string | null> {
  const opt: Electron.SaveDialogOptions = { title: "Save the DJ HQ configuration", defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "DJ HQ configuration", extensions: ["json"] }] };
  const r = win ? await dialog.showSaveDialog(win, opt) : await dialog.showSaveDialog(opt);
  if (r.canceled || !r.filePath) return null;
  core.writeFileAtomic(r.filePath, text);
  return r.filePath;
}

/** Do everything's "Press Start for me" needs DJ HQ in Privacy & Security → Accessibility.
 *  macOS shows its own prompt only once; after that the list itself is opened. */
let axAsked = false;
function axTrusted(prompt: boolean): boolean {
  if (process.platform !== "darwin") return false;
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (trusted || !prompt) return trusted;
  if (!axAsked) { axAsked = true; return systemPreferences.isTrustedAccessibilityClient(true); }
  shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  return false;
}

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
    pickFile,
    saveFile,
    ...(process.platform === "darwin" ? { axTrusted } : {}),
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
