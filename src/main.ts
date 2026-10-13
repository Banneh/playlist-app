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
  scView = v;
  return v;
}

const sc: ScView = {
  async show(rect: ScRect, url?: string) {
    if (!win) return;
    const v = scEnsure();
    if (!scShown) { win.contentView.addChildView(v); scShown = true; }
    v.setBounds(rect);
    const cur = v.webContents.getURL();
    if (url) { if (cur !== url) v.webContents.loadURL(url); }
    else if (!cur) v.webContents.loadURL(SC_HOME);
  },
  hide() {
    if (win && scView && scShown) { win.contentView.removeChildView(scView); scShown = false; }
  },
  setBounds(rect: ScRect) { if (scView && scShown) scView.setBounds(rect); },
  navigate(url: string) { scEnsure().webContents.loadURL(url); },
  back() { const h = scView?.webContents.navigationHistory; if (h && h.canGoBack()) h.goBack(); },
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
