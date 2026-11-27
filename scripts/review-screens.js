/* Every screen of the app at several window sizes, for a design review.
 *
 *   npm run screens:review
 *
 * Runs on the same throw-away sample home as the README screenshots (sample-home.js), so nothing
 * of yours is touched, and shows the app as it ships: no developer mode, no Free DL bypass, no
 * Do everything. Discover has no soundcloud.com here (no network, no sign-in): its bar is shown
 * over a stand-in page, with /api/sc/* answered in the window and a sample track playing.
 * Writes review-screens/<version>/<width>x<height>/NN-name.png (light), plus a
 * dark/ folder at one size. Long pages come in parts (-2, -3, ...) as they scroll.
 * The pictures are 2x (Retina), as the app looks on a Mac: on a Retina screen Electron renders
 * at 2x even when told 1, so 2 is the default; DJHQ_SCREENS_SCALE sets another factor.
 * DJHQ_SCREENS_LANG=pl takes them in Polish, into review-screens/<version>-pl/. */
const { app, BrowserWindow, nativeTheme } = require("electron");
const fs = require("fs");
const path = require("path");

const SCALE = Number(process.env.DJHQ_SCREENS_SCALE) || 2;
app.commandLine.appendSwitch("force-device-scale-factor", String(SCALE));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const { ROOT, DATA, naId, cleanup } = require("./sample-home");
const VERSION = require("../package.json").version;
/** DJHQ_SCREENS_LANG=pl: the same screens in Polish, in review-screens/<version>-pl/ */
const LANG = process.env.DJHQ_SCREENS_LANG === "pl" ? "pl" : "en";
const OUT = path.join(ROOT, "review-screens", VERSION + (LANG === "en" ? "" : "-" + LANG));
/** the smallest window the app allows (main.ts), a small laptop, the common Mac sizes, full HD */
const SIZES = [[900, 600], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const DARK_SIZE = [1440, 900];

const { startServer } = require(path.join(ROOT, "dist", "server.js"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  nativeTheme.themeSource = "light";
  const server = await startServer({ dataDir: DATA, port: 0, pickFolder: async () => null, reveal: () => {}, packaged: true });
  const port = server.address().port;
  const win = new BrowserWindow({
    width: SIZES[0][0], height: SIZES[0][1], useContentSize: true, show: false,
    backgroundColor: "#f2f2ef", webPreferences: { backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  await wc.loadURL(`http://127.0.0.1:${port}/?titlebar=inset&lang=${LANG}`);
  wc.setZoomFactor(1);
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`, true);
  let dir = "", n = 0;
  const shot = async (name) => {
    await sleep(350);
    const img = await wc.capturePage();
    const file = `${String(++n).padStart(2, "0")}-${name}.png`;
    fs.writeFileSync(path.join(dir, file), img.toPNG());
  };
  /** a page, and the rest of it as it scrolls (at most 6 parts) */
  const shotPage = async (name) => {
    const [h, view] = await js(`const b = document.getElementById('page-body'); b.scrollTop = 0; return [b.scrollHeight, b.clientHeight];`);
    await shot(name);
    for (let i = 2, top = view; top < h - 8 && i <= 6; i++, top += view - 40) {
      await js(`document.getElementById('page-body').scrollTop = ${top};`);
      await shot(`${name}-${i}`);
    }
    await js(`document.getElementById('page-body').scrollTop = 0;`);
  };
  const esc = () => js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); if (typeof closeMenu === 'function') closeMenu();`);
  const size = async (w, h, sub) => {
    win.setContentSize(w, h);
    dir = path.join(OUT, sub || `${w}x${h}`); n = 0;
    fs.mkdirSync(dir, { recursive: true });
    await sleep(500);
  };

  await sleep(1500);   // first scan + render
  // the sample playlist has no SoundCloud page: a refresh is a rescan here
  await js(`
    window.__api = api;
    api = async (p, b) => p === '/api/refresh' ? window.__api('/api/rescan', {}) : window.__api(p, b);
    setTheme('light');
    await api('/api/override', { id: ${naId}, status: 'na' }).then(v => { DATA = v; render(); });
    await refreshPlaylist({ manual: false });
    await loadInbox({ quiet: true });`);
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log("writing " + path.relative(ROOT, OUT) + "/");

  /** the Tasks panel with a Download all opened into its tracks and a Bandcamp run */
  const tasks = () => js(`
    QUEUE = []; Q_OPEN.clear();
    const now = Date.now();
    QUEUE.push({ id: 9001, label: tn('playlist.missing.dlAllTask', 4), status: 'running', started: now - 40000, done: 3, total: 4, msg: '', items: [
      { id: 9011, label: 'Nova Pulse - Daybreak', status: 'done', msg: 'Nova Pulse - Daybreak.wav', dl: { url: 'https://hypeddit.com/x/daybreak', id: '', name: 'Nova Pulse - Daybreak' } },
      { id: 9012, label: 'Perihelion - Wavelength', status: 'failed', msg: t('app.queue.noFileBulk'), dl: { url: 'https://hypeddit.com/x/wavelength', id: '', name: 'Perihelion - Wavelength' } },
      { id: 9013, label: 'Marrow & Vane - Cold Fusion', status: 'done', msg: 'Marrow & Vane - Cold Fusion.wav', dl: { url: 'https://hypeddit.com/x/cold-fusion', id: '', name: 'Marrow & Vane - Cold Fusion' } },
      { id: 9014, label: 'Oriel - Tidal (Original Mix)', status: 'running', msg: '', dl: { url: 'https://hypeddit.com/x/tidal', id: '', name: 'Oriel - Tidal (Original Mix)' } } ] });
    QUEUE.push({ id: 9002, label: t('app.queue.bandcamp'), status: 'done', started: now - 600000, ended: now - 540000, done: 3, total: 3, msg: tn('app.queue.bandcampFound', 1), items: [
      { label: 'Faye Idris - Paper Lanterns', status: 'miss', msg: t('tags.link.notFound') },
      { label: 'Kessler & Monroe - Half Light', status: 'done', msg: 'Half Light (Original Mix)' },
      { label: 'Solenne - Afterglow (Dub)', status: 'miss', msg: t('tags.link.notFound') } ] });
    QUEUE.push({ id: 9003, label: t('app.queue.tags', { lib: qLib() }), status: 'done', started: now - 900000, ended: now - 880000, done: 0, total: 0, msg: '' });
    Q_OPEN.add(9001);
    qToggle(document.getElementById('btn-queue'));`);

  /** Discover: its bar over a stand-in for the soundcloud.com view, which needs the desktop app's
   *  SoundCloud session. /api/sc/* is answered here, as a signed-in account playing a track that is
   *  missing from the playlist. Everything is put back afterwards. */
  const discover = async (name) => {
    await js(`
      const tr = DATA.tracks.find(x => !x.have && !x.na) || DATA.tracks[0];
      const fake = { available: true, signed_in: true, me: { username: 'djyou', avatar: '' }, can: { ok: true, likes: false }, captcha: false,
        url: 'https://soundcloud.com/discover', now: { playing: true, url: tr.url, title: tr.title, artist: tr.artist, in_playlist: false, liked: false,
        pos: 84, track: { id: tr.id, url: tr.url, title: tr.title, user: tr.user || tr.artist, dur: 402, art: tr.art || '' } } };
      window.__fetch = window.__fetch || window.fetch;
      window.fetch = (u, o) => String(u).startsWith('/api/sc/')
        ? Promise.resolve(new Response(JSON.stringify(String(u).endsWith('/status') ? fake : { ok: true }), { headers: { 'Content-Type': 'application/json' } }))
        : window.__fetch(u, o);
      window.__sc = APP.sc; APP.sc = true; SC = fake;
      go('discover');`);
    await sleep(600);
    await js(`
      const f = document.getElementById('dc-frame');
      if (f) f.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:24px;color:var(--text-3);font-size:13px">'
        + '<b style="font-size:15px;color:var(--text-2)">soundcloud.com</b><span>Stand-in for the SoundCloud page: the review screens run offline, without a sign-in.</span></div>';`);
    await shot(name);
    await js(`
      go('missing');
      window.fetch = window.__fetch; APP.sc = window.__sc;
      SC = { available: false, signed_in: false, me: null, can: null, now: null, url: '', captcha: false };
      if (typeof scBarRender === 'function') scBarRender(); render();`);
  };

  /** every screen at the current size */
  const all = async () => {
    // welcome: the first-run screen, with the fields filled in
    await js(`window.__data = DATA; DATA = { ...DATA, libraries: [], active: null, ready: false }; WL_DRAFT = { dir: '~/Music/Trance', url: 'https://soundcloud.com/you/sets/trance-selection' }; render();`);
    await shot("welcome");
    await js(`DATA = window.__data; render();`);
    await js(`SETUP = true; render();`);
    await shot("setup");
    await js(`SETUP = false; render();`);

    await js(`go('missing'); startTour(); tourNext();`);
    await sleep(500);
    await shot("tour");
    await js(`endTour();`);

    await discover("discover");

    await js(`go('new');`);
    await shotPage("new");
    await js(`go('missing');`);
    await shotPage("missing");
    await js(`document.querySelector('#page-body .tr .pill').click();`);
    await sleep(250);
    await shot("missing-status-menu");
    await esc();
    await js(`document.querySelector('#page-body .tr .more').click();`);
    await sleep(250);
    await shot("missing-row-menu");
    await esc();
    await js(`openGuide();`);
    await sleep(400);
    await shot("guide");
    await js(`closeGuide(true);`);
    await js(`openWorkThrough();`);
    await sleep(900);
    await shot("work-through");
    await esc();

    await js(`go('all');`);
    await shotPage("all-tracks");
    await js(`go('have');`);
    await shotPage("have");
    await js(`const t = DATA.tracks.find(x => x.file && x.path && !x.lossy); playFile(t.path, t.title, t.artist);`);
    await sleep(1200);
    await shot("have-player");
    await js(`stopPlayer();`);
    await js(`openAssign(DATA.tracks.find(x => x.file).id);`);
    await sleep(400);
    await shot("match-dialog");
    await esc();

    await js(`go('inbox');`);
    await sleep(2500);   // the inbox scan probes the downloads (zip entries included)
    await shotPage("downloads");

    await js(`go('collection');`);
    await sleep(1200);
    await shotPage("not-in-playlist");
    await js(`
      window.__api2 = api;
      api = async (p, b) => p !== '/api/find' ? window.__api2(p, b) : { q: b.q, candidates: [
        { id: 900201, url: 'https://soundcloud.com/unknown/live-jam-03', title: 'Live Jam 03 (Studio Session)', user: 'Unknown Artist', dur: 492, score: 0.91, name: 0.76, dur_diff: 0, in_playlist: null },
        { id: 900202, url: 'https://soundcloud.com/live-jams/jam-3', title: 'Jam 3', user: 'Live Jams', dur: 455, score: 0.62, name: 0.55, dur_diff: -37, in_playlist: null },
        { id: 900203, url: 'https://soundcloud.com/radio-u/live-jam', title: 'Live Jam (Radio Mix)', user: 'Radio U', dur: 221, score: 0.51, name: 0.51, dur_diff: -271, in_playlist: null },
      ] };
      openFind(COLL.files.findIndex(f => f.unmatched && !f.found));`);
    await sleep(600);
    await shot("find-dialog");
    await esc();
    await js(`api = window.__api2;`);

    await js(`go('prepare');`);
    await shotPage("prepare");
    await js(`exportXml();`);
    await sleep(900);
    await shot("export-dialog");
    await esc();

    await js(`go('settings');`);
    await shotPage("settings");

    await js(`go('missing');`);
    await tasks();
    await sleep(300);
    await shot("tasks");
    await esc();
  };

  for (const [w, h] of SIZES) {
    await size(w, h);
    await all();
    console.log(`  ${w}x${h}: ${n} screens`);
  }
  // dark, at one size: the pages with the most colour
  await size(DARK_SIZE[0], DARK_SIZE[1], "dark");
  await js(`setTheme('dark');`);
  for (const p of ["new", "missing", "have", "inbox", "prepare", "settings"]) {
    await js(`go('${p}');`);
    await sleep(p === "inbox" ? 2500 : 600);
    await shot(p === "inbox" ? "downloads" : p);
  }
  await discover("discover");
  await js(`go('missing'); openGuide();`);
  await sleep(400);
  await shot("guide");
  await js(`closeGuide(true);`);
  await tasks();
  await sleep(300);
  await shot("tasks");
  await esc();
  console.log(`  dark ${DARK_SIZE.join("x")}: ${n} screens`);

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
