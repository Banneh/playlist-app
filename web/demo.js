/* Sample data for the guided tour only. Nothing here is real: the artists, titles,
   files and links are made up so the tour can show every screen populated, even on a
   fresh install with no library connected. tour.js swaps DATA / INBOX for these
   objects while the tour runs and restores the real ones afterwards. */

/* 80×80 artwork: a solid, slightly muted colour with the track's initials, as an inline SVG data URI */
function demoArt(initials, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <rect width="80" height="80" fill="hsl(${hue},38%,40%)"/>
    <text x="40" y="49" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="26" font-weight="700"
          fill="rgba(255,255,255,.92)" text-anchor="middle" letter-spacing="1">${initials}</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
}

const DEMO_DEVICES = [
  { id: 'xdj-700', label: 'XDJ-700 / XDJ-1000 / CDJ-2000NXS' },
  { id: 'nxs2', label: 'CDJ-2000NXS2 / XDJ-XZ' },
  { id: 'cdj-3000', label: 'CDJ-3000' },
  { id: 'cdj-3000x', label: 'CDJ-3000X' },
];
// name: demo.library, filled in by demoView() (the language can change between tours)
const DEMO_LIB = { id: 'demo', dir: '/Users/you/Music/Sample', dirs: ['/Users/you/Music/Sample'], subfolders: false };
const DEMO_HOME = '/Users/you';
const DEMO_DATA_DIR = DEMO_HOME + '/Library/Application Support/DJ HQ';

// link titles are what the uploader wrote, made up like the rest: keys in demo.link.*
const freeLink = (slug, title = 'demo.link.freeDownload') =>
  ({ url: 'https://hypeddit.com/sample/' + slug, kind: 'free', label: 'Free DL', title: t(title), host: 'hypeddit.com', fmt: null });
const buyLink = (artist, slug, fmt = 'WAV', title = 'demo.link.buyWav') =>
  ({ url: `https://${artist}.bandcamp.com/track/${slug}`, kind: 'buy', label: 'Buy', title: t(title), host: artist + '.bandcamp.com', fmt });

/** A full fake /api/state view with eight tracks in every state the app knows. */
function demoView() {
  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  const base = (n, id, artist, title, dur, initials, hue, extra) => ({
    n, id, artist, title, user: artist, dur, sc_title: `${artist} - ${title}`,
    name_conf: 'high', name_why: 'name-left', name_ok: false, check_name: false,
    url: `https://soundcloud.com/sample/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    art: demoArt(initials, hue),
    have: false, na: false, auto: true, file: null, score: null, manual_match: false,
    links: [], lossy: false, upgrade: false, added: 0, is_new: false, acquired: 0, is_new_file: false,
    tagged: null, incompat: null, override: null, edited: false,
    ...extra,
  });
  const tracks = [
    base(1, 900001, 'Nova Pulse', 'Midnight Runner (Extended Mix)', '6:42', 'NP', 262, {
      links: [freeLink('midnight-runner')], added: now - 2 * day, is_new: true }),
    base(2, 900002, 'Aurelia Kane', 'Glasshouse', '5:18', 'AK', 320, {
      have: true, file: 'Aurelia Kane - Glasshouse.wav', score: 1, tagged: false,
      acquired: now - 1 * day, is_new_file: true, links: [freeLink('glasshouse')] }),
    base(3, 900003, 'Velour Static', 'Sirens Over Lisbon (Club Edit)', '7:05', 'VS', 198, {
      links: [buyLink('velourstatic', 'sirens-over-lisbon'), freeLink('sirens-over-lisbon', 'demo.link.freeDl')] }),
    base(4, 900004, 'Kessler & Monroe', 'Half Light', '6:10', 'KM', 28, {
      have: true, file: 'Kessler & Monroe - Half Light.wav', score: 0.97, tagged: true, incompat: '24-bit' }),
    base(5, 900005, 'Oriel', 'Tidal (Original Mix)', '5:54', 'OR', 160, {
      links: [{ url: 'https://toneden.io/sample/tidal', kind: 'free', label: 'Free DL', title: t('demo.link.freeDownloadPlain'), host: 'toneden.io', fmt: 'WAV' }] }),
    base(6, 900006, 'Luma District', 'Northern Sky', '6:27', 'LD', 210, {
      have: true, file: 'Luma District - Northern Sky.mp3', score: 1, tagged: true, lossy: true, upgrade: true,
      links: [buyLink('lumadistrict', 'northern-sky', 'lossless', 'demo.link.buyLossless')] }),
    // uploaded by a label as "Title - Artist": nothing says which side is the artist
    base(7, 900007, 'Paper Lanterns', 'Faye Idris', '4:48', 'FI', 345, {
      user: 'Lantern Records', name_conf: 'low', name_why: 'no-signal', check_name: true }),
    base(8, 900008, 'Solenne', 'Afterglow (Dub)', '7:31', 'SO', 95, { na: true, auto: false }),
  ];
  const extras = [
    { name: 'Rook & Finch - Velvet Hours.wav', incompat: null, dur: '6:03', lossy: false, artist: 'Rook & Finch', title: 'Velvet Hours',
      edited: false, tagged: true, name_conf: 'high', name_why: 'file-name', name_ok: false, check_name: false,
      found: { id: 900101, url: 'https://soundcloud.com/sample/velvet-hours', title: 'Velvet Hours', user: 'Rook & Finch', dur: '6:03' } },
    { name: 'Unknown - Live Jam 03.aiff', incompat: null, dur: '8:12', lossy: false, artist: 'Unknown', title: 'Live Jam 03',
      edited: false, tagged: false, name_conf: 'high', name_why: 'file-name', name_ok: false, check_name: false, found: null },
  ];
  const local_files = [
    ...tracks.filter(x => x.file).map(x => ({ name: x.file, dur: x.dur })),
    ...extras.map(f => ({ name: f.name, dur: f.dur })),
  ];
  const have = tracks.filter(x => x.have).length;
  const playlist = t('demo.playlist');
  return {
    collection: { roots: [{ id: 'r1', path: DEMO_LIB.dir, subfolders: false }], move_target: null, last_target: null },
    libraries: [{ ...DEMO_LIB, name: t('demo.library') }], active: DEMO_LIB.id,
    device: 'xdj-700', devices: DEMO_DEVICES,
    backups: 0, backup_dir: DEMO_DATA_DIR + '/originals/demo', can_pick: false, can_reveal: false,
    ready: true, playlist, playlist_url: 'https://soundcloud.com/sample/sets/sample-playlist',
    genre: playlist,
    tracks, extras, local_files,
    have,
    missing: tracks.filter(x => !x.have && !x.na).length,
    na_count: tracks.filter(x => x.na).length,
    upgrades: tracks.filter(x => x.upgrade).length,
    reavailable: [],
    new_count: tracks.filter(x => x.is_new || x.is_new_file).length,
    new_tracks: tracks.filter(x => x.is_new).length,
    new_files: tracks.filter(x => x.is_new_file).length,
    seen_mark: now - 3 * day,
    name_checks: tracks.filter(x => x.check_name).length + extras.filter(f => f.check_name).length,
    untagged: tracks.filter(x => x.tagged === false).length + extras.filter(f => f.tagged === false).length,
    incompatible: tracks.filter(x => x.file && x.incompat).length + extras.filter(f => f.incompat).length,
    local_count: local_files.length,
    settings: { inbox_dir: DEMO_HOME + '/Downloads', inbox_default: DEMO_HOME + '/Downloads', inbox_custom: false,
                auto_move: false, refresh_min: 15, data_dir: DEMO_DATA_DIR,
                // Do everything, set up and switched on, so its card and button show (the tour never starts a run)
                do_all: { on: true, pn_app: '/Applications/Platinum Notes 10.app', mik_app: '/Applications/Mixed In Key 11.app',
                          mik_db: DEMO_HOME + '/Library/Application Support/Mixedinkey/Collection11.mikdb', rb_xml: DEMO_HOME + '/Documents/rekordbox.xml',
                          close_apps: true, press_start: false, include_pending: false, pn_replace_confirmed: false, pn_mode: 'replace', pn_mode_at: now },
                do_all_ready: true, do_all_missing: [], do_all_optional: [] },
    backup_bytes: 0,
  };
}

/** A fake /api/inbox result: three downloads that match sample tracks, one of them an upgrade. */
function demoInbox() {
  return {
    dir: DEMO_HOME + '/Downloads', exists: true,
    items: [
      { name: 'Nova Pulse - Midnight Runner (Extended Mix).wav', dur: '6:42', dur_diff: 0, lossy: false,
        id: 900001, n: 1, artist: 'Nova Pulse', title: 'Midnight Runner (Extended Mix)', score: 1, action: 'move', cur_file: null },
      { name: 'Oriel - Tidal (Original Mix).wav', dur: '5:55', dur_diff: 1, lossy: false,
        id: 900005, n: 5, artist: 'Oriel', title: 'Tidal (Original Mix)', score: 0.94, action: 'move', cur_file: null },
      { name: 'Luma District - Northern Sky.wav', dur: '6:27', dur_diff: 0, lossy: false,
        id: 900006, n: 6, artist: 'Luma District', title: 'Northern Sky', score: 1, action: 'upgrade',
        cur_file: 'Luma District - Northern Sky.mp3' },
    ],
    unmatched: [
      { name: 'Vela Sound - Afterglow (Club Mix).wav', zip: null, dur: '7:04', lossy: false, artist: 'Vela Sound', title: 'Afterglow (Club Mix)', n: 1 },
    ],
    others: 1, already: 0,
  };
}

/** A fake /api/collection/view result, built from the sample view's files. */
function demoCollection() {
  const v = typeof DATA === 'object' && DATA && DATA.collection ? DATA : demoView();
  const root = DEMO_LIB.dir;
  const files = [];
  for (const x of v.tracks || []) {
    if (!x.file) continue;
    files.push({ name: root + '/' + x.file, disp: x.file, base: x.file, path: root + '/' + x.file, root: 'r1',
      dur: x.dur, lossy: !!x.lossy, incompat: x.incompat || null, artist: x.artist, title: x.title,
      edited: false, check_name: false, tagged: x.tagged !== false, key: null, pn: null,
      in: [{ lib: 'demo', name: t('demo.library'), track: (x.artist ? x.artist + ' - ' : '') + x.title }], unmatched: false, found: null });
  }
  for (const f of v.extras || [])
    files.push({ ...f, disp: f.name, base: f.name, path: root + '/' + f.name, root: 'r1', key: null, pn: null, in: [], unmatched: !f.found });
  files.forEach((f, i) => { f.n = i + 1; });
  return { roots: [{ id: 'r1', path: root, subfolders: false }], folders_away: [], files,
    total: files.length, unmatched: files.filter(f => f.unmatched).length,
    untagged: files.filter(f => f.tagged === false).length, incompatible: files.filter(f => f.incompat).length, error: null };
}
