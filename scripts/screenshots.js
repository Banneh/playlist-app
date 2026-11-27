/* Regenerates docs/screens/*.png for the README from prepared sample data.
 *
 *   npm run screens
 *
 * Nothing of yours is touched: a throw-away home folder is built in the system temp
 * dir (a sample library with real audio files, a Downloads folder, the app's data
 * folder), the app's own server runs against it, and a hidden Electron window renders
 * every screen at 2x. The folder is deleted afterwards. The artists and tracks are
 * made up (the same cast as the guided tour's sample data); see sample-home.js. */
const { app, BrowserWindow, nativeTheme } = require("electron");
const fs = require("fs");
const path = require("path");

app.commandLine.appendSwitch("force-device-scale-factor", "2");   // README images are 2x
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const { ROOT, DATA, naId, cleanup } = require("./sample-home");
const OUT = path.join(ROOT, "docs", "screens");

// ---------------- the screens ----------------

const { startServer } = require(path.join(ROOT, "dist", "server.js"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  nativeTheme.themeSource = "light";
  const server = await startServer({ dataDir: DATA, port: 0, pickFolder: async () => null, reveal: () => {}, packaged: true });
  const port = server.address().port;
  const win = new BrowserWindow({
    width: 1240, height: 808, useContentSize: true, show: false,
    backgroundColor: "#f2f2ef", webPreferences: { backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  await wc.loadURL(`http://127.0.0.1:${port}/?titlebar=inset&lang=en`);   // the README screenshots are English
  wc.setZoomFactor(1);   // a zoom remembered for 127.0.0.1 in Electron's own profile would scale every picture
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`, true);
  const shot = async (name, rect) => {
    await sleep(350);
    const img = await wc.capturePage(rect);
    fs.writeFileSync(path.join(OUT, name + ".png"), img.toPNG());
    console.log("  " + name + ".png" + (rect ? ` (${rect.width}×${rect.height})` : ""));
  };
  /** the window-pixel box of an element, grown by a margin, for cropped shots */
  const box = async (sel, pad = 120) => {
    const r = await js(`const e = [...document.querySelectorAll('${sel}')].pop(); const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, innerWidth, innerHeight];`);
    const x = Math.max(0, Math.floor(r[0] - pad)), y = Math.max(0, Math.floor(r[1] - pad));
    return { x, y, width: Math.min(r[4] - x, Math.ceil(r[2] + 2 * pad)), height: Math.min(r[5] - y, Math.ceil(r[3] + 2 * pad)) };
  };
  const esc = () => js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); if (typeof closeMenu === 'function') closeMenu();`);

  await sleep(1500);   // first scan + render
  // the sample playlist has no SoundCloud page: a refresh is a rescan here, so the
  // sidebar reads "Playlist checked" instead of an error
  await js(`
    window.__api = api;
    api = async (p, b) => p === '/api/refresh' ? window.__api('/api/rescan', {}) : window.__api(p, b);
    setTheme('light');
    await api('/api/override', { id: ${naId}, status: 'na' }).then(v => { DATA = v; render(); });
    await refreshPlaylist({ manual: false });`);
  console.log("writing " + path.relative(ROOT, OUT) + "/");

  // welcome: the first-run screen, with the fields filled in
  await js(`window.__data = DATA; DATA = { ...DATA, libraries: [], active: null, ready: false }; WL_DRAFT = { dir: '~/Music/Trance', url: 'https://soundcloud.com/you/sets/trance-selection' }; render();`);
  await shot("welcome");
  await js(`DATA = window.__data; render();`);
  // "Before we start", the screen that follows the first library
  await js(`SETUP = true; render();`);
  await shot("setup");
  await js(`SETUP = false; render();`);

  // the tour, on its own sample data, at the Missing step
  await js(`go('missing'); startTour(); tourNext();`);
  await sleep(500);
  await shot("tour");
  await js(`endTour();`);

  await js(`go('missing');`);
  await shot("missing-light");
  await js(`openGuide();`);
  await sleep(400);
  await shot("guide");
  await js(`closeGuide(true);`);
  await js(`const pill = document.querySelector('#page-body .tr .pill'); pill.click();`);
  await sleep(250);
  await shot("status-menu", await box(".menu", 130));
  await esc();
  await js(`setTheme('dark');`);
  await shot("missing-dark");
  // the other two palettes, one shot each (the README shows Cue)
  await js(`setPalette('wave');`);
  await shot("missing-waveform");
  await js(`setPalette('uv');`);
  await shot("missing-afterhours");
  await js(`setPalette('cue'); setTheme('light');`);

  await js(`openWorkThrough();`);
  await sleep(900);
  await shot("work-through");
  await esc();

  await js(`go('have');`);
  await shot("have");
  await js(`const t = DATA.tracks.find(x => x.file && x.path && !x.lossy); playFile(t.path, t.title, t.artist);`);
  await sleep(1200);
  await shot("preview");
  await js(`stopPlayer();`);
  await js(`openAssign(DATA.tracks.find(x => x.file).id);`);
  await sleep(400);
  await shot("match-dialog", await box(".dialog", 40));
  await esc();

  await js(`go('new');`);
  await shot("new");

  await js(`go('inbox');`);
  await sleep(2500);   // the inbox scan probes the downloads (zip entries included)
  await shot("downloads");

  await js(`go('collection');`);
  await sleep(1200);   // the collection view loads on show
  await shot("not-in-playlist");
  // the find dialog, with prepared SoundCloud results instead of a live search
  await js(`
    window.__api2 = api;
    api = async (p, b) => p !== '/api/find' ? window.__api2(p, b) : { q: b.q, candidates: [
      { id: 900201, url: 'https://soundcloud.com/unknown/live-jam-03', title: 'Live Jam 03 (Studio Session)', user: 'Unknown Artist', dur: 492, score: 0.91, name: 0.76, dur_diff: 0, in_playlist: null },
      { id: 900202, url: 'https://soundcloud.com/live-jams/jam-3', title: 'Jam 3', user: 'Live Jams', dur: 455, score: 0.62, name: 0.55, dur_diff: -37, in_playlist: null },
      { id: 900203, url: 'https://soundcloud.com/radio-u/live-jam', title: 'Live Jam (Radio Mix)', user: 'Radio U', dur: 221, score: 0.51, name: 0.51, dur_diff: -271, in_playlist: null },
    ] };
    openFind(COLL.files.findIndex(f => f.unmatched && !f.found));`);
  await sleep(600);
  await shot("find-dialog", await box(".dialog", 40));
  await esc();
  await js(`api = window.__api2;`);

  await js(`go('prepare');`);
  await shot("prepare");
  await js(`exportXml();`);
  await sleep(900);
  await shot("export-dialog", await box(".dialog", 40));
  await esc();

  await js(`go('settings');`);
  await shot("settings");

  win.destroy();
  server.close();
  cleanup();
  console.log("done");
  app.quit();
}).catch((e) => {
  console.error(e);
  cleanup();
  app.exit(1);
});
