/* Regenerates docs/screens/*.png for the README from prepared sample data.
 *
 *   npm run screens
 *
 * Nothing of yours is touched: a throw-away home folder is built in the system temp
 * dir (a sample library with real audio files, a Downloads folder, the app's data
 * folder), the app's own server runs against it, and a hidden Electron window renders
 * every screen at 2x. The folder is deleted afterwards. The artists and tracks are
 * made up (the same cast as the guided tour's sample data). */
const { app, BrowserWindow, nativeTheme } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screens");
/* The sandbox home. On a Mac it is /Users/Shared, so the paths in the pictures read
 * ~/Music/Trance and ~/Downloads like everyone's; elsewhere the system temp dir.
 * Only folders that do not exist yet are created, and only those are removed again. */
const SHARED = "/Users/Shared";
let HOME = path.join(os.tmpdir(), "djhq-screens");
const created = [];
function claim(dir) {
  if (fs.existsSync(dir)) throw new Error(`${dir} exists already — not touching it`);
  fs.mkdirSync(dir, { recursive: true });
  created.unshift(dir);   // removed in reverse order
}
function cleanup() {
  for (const d of created) fs.rmSync(d, { recursive: true, force: true });
}
if (process.platform === "darwin") {
  try { fs.accessSync(SHARED, fs.constants.W_OK); HOME = SHARED; } catch {}
}
if (HOME !== SHARED) fs.rmSync(HOME, { recursive: true, force: true });
process.env.HOME = HOME;   // os.homedir() → the sandbox
process.env.USERPROFILE = HOME;

const MUSIC = path.join(HOME, "Music", "Trance");
const MUSIC2 = path.join(HOME, "Music", "Bandcamp purchases");
const DL = path.join(HOME, "Downloads");
const DATA = path.join(HOME, "Library", "Application Support", "DJ HQ");
if (HOME === SHARED) { claim(path.join(HOME, "Music")); claim(DL); claim(path.join(HOME, "Library")); }
else claim(HOME);
for (const d of [MUSIC, MUSIC2, DL, DATA]) fs.mkdirSync(d, { recursive: true });

app.commandLine.appendSwitch("force-device-scale-factor", "2");   // README images are 2x
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// ---------------- the sample playlist ----------------

const PLAYLIST = "Trance Selection";
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** 80×80 artwork: a two-colour gradient with the track's initials (same look as the tour). */
function art(initials, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},72%,58%)"/><stop offset="1" stop-color="hsl(${(hue + 48) % 360},70%,32%)"/>
    </linearGradient></defs>
    <rect width="80" height="80" fill="url(#g)"/>
    <circle cx="62" cy="18" r="22" fill="rgba(255,255,255,.12)"/>
    <text x="40" y="49" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="26" font-weight="700"
          fill="rgba(255,255,255,.92)" text-anchor="middle" letter-spacing="1">${initials}</text>
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg.replace(/\s+/g, " "));
}
const secs = (m, s) => m * 60 + s;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const free = (s) => ({ buy_url: "https://hypeddit.com/track/" + s, buy_title: "FREE DOWNLOAD" });
const buy = (artist, s, title = "Buy the WAV") => ({ buy_url: `https://${slug(artist)}.bandcamp.com/track/${s}`, buy_title: title });

// id, artist, title, length, initials, hue, link, options
const CAST = [
  [900001, "Nova Pulse",       "Midnight Runner (Extended Mix)", secs(6, 42), "NP", 262, free("midnight-runner"), { added: now - 2 * DAY }],
  [900002, "Aurelia Kane",     "Glasshouse",                     secs(5, 18), "AK", 320, free("glasshouse"), { file: "wav", untagged: true, newfile: true }],
  [900003, "Velour Static",    "Sirens Over Lisbon (Club Edit)", secs(7, 5),  "VS", 198, buy("Velour Static", "sirens-over-lisbon"), { desc: "https://hypeddit.com/track/sirens-over-lisbon" }],
  [900004, "Kessler & Monroe", "Half Light",                     secs(6, 10), "KM", 28,  {}, { file: "hires" }],
  [900005, "Oriel",            "Tidal (Original Mix)",           secs(5, 54), "OR", 160, { buy_url: "https://toneden.io/oriel/post/tidal", buy_title: "Free download" }, {}],
  [900006, "Luma District",    "Northern Sky",                   secs(6, 27), "LD", 210, buy("Luma District", "northern-sky", "Buy lossless"), { file: "mp3" }],
  [900007, "Faye Idris",       "Paper Lanterns",                 secs(4, 48), "FI", 345, {}, {}],
  [900008, "Solenne",          "Afterglow (Dub)",                secs(7, 31), "SO", 95,  {}, { na: true }],
  [900009, "Marrow & Vane",    "Cold Fusion",                    secs(6, 3),  "MV", 10,  free("cold-fusion"), { added: now - 1 * DAY }],
  [900010, "Ida Lennox",       "Second Sun (Extended Mix)",      secs(7, 12), "IL", 120, buy("Ida Lennox", "second-sun"), { file: "wav", dir: 2 }],
  [900011, "Perihelion",       "Wavelength",                     secs(5, 36), "PH", 285, free("wavelength"), {}],
  [900012, "Tamsin Rowe",      "Still Water",                    secs(6, 55), "TR", 48,  {}, { file: "wav", dir: 2, manual: true }],
  [900013, "Nova Pulse",       "Daybreak",                       secs(5, 2),  "NP", 262, free("daybreak"), {}],
  [900014, "Castellan",        "Orbital Drift (Club Mix)",       secs(8, 4),  "CA", 180, buy("Castellan", "orbital-drift"), { file: "wav" }],
];

// ---------------- files ----------------

const FFMPEG = require(path.join(ROOT, "node_modules", "ffmpeg-static"));
/** a real audio file: a quiet sine tone of the right length, tagged unless told otherwise */
function makeAudio(file, dur, { artist, title, tagged = true, kind = "wav" }) {
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:duration=${dur}`, "-af", "volume=0.1", "-ac", "1"];
  if (kind === "hires") args.push("-ar", "96000", "-c:a", "pcm_s24le");
  else if (kind === "mp3") args.push("-ar", "44100", "-c:a", "libmp3lame", "-b:a", "320k");
  else args.push("-ar", "44100", "-c:a", "pcm_s16le");
  if (tagged) args.push("-metadata", `artist=${artist}`, "-metadata", `title=${title}`, "-metadata", `genre=${PLAYLIST}`);
  if (kind !== "mp3") args.push("-write_id3v2", "1", "-id3v2_version", "3");   // WAV: an id3 chunk is what the app reads
  args.push(file);
  execFileSync(FFMPEG, args);
}

const tracks = [], assigned = {}, acquired = {}, found = {};
let naId = 0;
for (const [id, artist, title, dur, ini, hue, link, o] of CAST) {
  tracks.push({ id, title, user: artist, pub_artist: null, dur, url: `https://soundcloud.com/${slug(artist)}/${slug(title)}`,
                art: art(ini, hue), buy_url: link.buy_url || null, buy_title: link.buy_title || null, sc_dl: false,
                desc_links: o.desc ? [[o.desc, "free dl <3 " + o.desc, ""]] : [], added: o.added || 0 });
  if (o.file) {
    const ext = o.file === "mp3" ? ".mp3" : ".wav";
    const name = `${artist} - ${title}${ext}`;
    makeAudio(path.join(o.dir === 2 ? MUSIC2 : MUSIC, name), dur, { artist, title, tagged: !o.untagged, kind: o.file });
    if (o.manual) assigned[String(id)] = "Bandcamp purchases/" + name;
    acquired[`lib1:${id}`] = o.newfile ? now - 1 * DAY : 0;
  }
  if (o.na) naId = id;
}
// files that aren't in the playlist: one already found on SoundCloud, one untagged live recording
makeAudio(path.join(MUSIC, "Rook & Finch - Velvet Hours.wav"), secs(6, 3), { artist: "Rook & Finch", title: "Velvet Hours" });
found["x:" + path.join(MUSIC, "Rook & Finch - Velvet Hours.wav")] =
  { id: 900101, url: "https://soundcloud.com/rook-finch/velvet-hours", title: "Velvet Hours", user: "Rook & Finch", dur: secs(6, 3) };
makeAudio(path.join(MUSIC, "Unknown - Live Jam 03.wav"), secs(8, 12), { artist: "", title: "", tagged: false });
// the Downloads folder: two fresh downloads and a Bandcamp zip
makeAudio(path.join(DL, "Nova Pulse - Midnight Runner (Extended Mix).wav"), secs(6, 42), { artist: "Nova Pulse", title: "Midnight Runner (Extended Mix)" });
makeAudio(path.join(DL, "Luma District - Northern Sky.wav"), secs(6, 27), { artist: "Luma District", title: "Northern Sky" });
{
  const tmp = fs.mkdtempSync(path.join(HOME, "zip-"));
  makeAudio(path.join(tmp, "Velour Static - Sirens Over Lisbon (Club Edit).wav"), secs(7, 5), { artist: "Velour Static", title: "Sirens Over Lisbon (Club Edit)" });
  makeAudio(path.join(tmp, "Velour Static - Interlude.wav"), secs(1, 48), { artist: "Velour Static", title: "Interlude" });
  execFileSync("zip", ["-q", "-j", path.join(DL, "Velour Static - Sirens Over Lisbon.zip"), ...fs.readdirSync(tmp).map((f) => path.join(tmp, f))]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

fs.writeFileSync(path.join(DATA, "state.json"), JSON.stringify({
  libraries: [{ id: "lib1", dir: MUSIC, dirs: [MUSIC2], url: "https://soundcloud.com/you/sets/trance-selection",
                playlist: { title: PLAYLIST, url: "https://soundcloud.com/you/sets/trance-selection", tracks },
                seen_mark: now - 3 * DAY, acq_init: true }],
  active: "lib1", dur_cache: {}, overrides: {}, edits: {}, assigned, found, na: {}, acquired, client_id: null, device: "xdj-700",
  settings: { auto_move: false, refresh_min: 15 },
}));
fs.writeFileSync(path.join(DATA, "prefs.json"), JSON.stringify({ tourDone: true, theme: "light" }));

// ---------------- the screens ----------------

const { startServer } = require(path.join(ROOT, "dist", "server.js"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  nativeTheme.themeSource = "light";
  const server = await startServer({ dataDir: DATA, port: 0, pickFolder: async () => null, reveal: () => {}, packaged: true });
  const port = server.address().port;
  const win = new BrowserWindow({
    width: 1240, height: 808, useContentSize: true, show: false,
    backgroundColor: "#f4f5f7", webPreferences: { backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  await wc.loadURL(`http://127.0.0.1:${port}/?titlebar=inset`);
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

  // the tour, on its own sample data, at the Missing step
  await js(`go('missing'); startTour(); tourNext();`);
  await sleep(500);
  await shot("tour");
  await js(`endTour();`);

  await js(`go('missing');`);
  await shot("missing-light");
  await js(`const pill = document.querySelector('#page-body .tr .pill'); pill.click();`);
  await sleep(250);
  await shot("status-menu", await box(".menu", 130));
  await esc();
  await js(`setTheme('dark');`);
  await shot("missing-dark");
  await js(`setTheme('light');`);

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

  await js(`go('extras');`);
  await shot("not-in-playlist");
  // the find dialog, with prepared SoundCloud results instead of a live search
  await js(`
    window.__api2 = api;
    api = async (p, b) => p !== '/api/find' ? window.__api2(p, b) : { q: b.q, candidates: [
      { id: 900201, url: 'https://soundcloud.com/unknown/live-jam-03', title: 'Live Jam 03 (Studio Session)', user: 'Unknown Artist', dur: 492, score: 0.91, name: 0.76, dur_diff: 0, in_playlist: null },
      { id: 900202, url: 'https://soundcloud.com/live-jams/jam-3', title: 'Jam 3', user: 'Live Jams', dur: 455, score: 0.62, name: 0.55, dur_diff: -37, in_playlist: null },
      { id: 900203, url: 'https://soundcloud.com/radio-u/live-jam', title: 'Live Jam (Radio Mix)', user: 'Radio U', dur: 221, score: 0.51, name: 0.51, dur_diff: -271, in_playlist: null },
    ] };
    openFind(DATA.extras.findIndex(f => !f.found));`);
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
