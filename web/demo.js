/* Sample data for the guided tour only. Nothing here is real: the artists, titles,
   files and links are made up so the tour can show every screen populated, even on a
   fresh install with no library connected. tour.js swaps DATA / INBOX for these
   objects while the tour runs and restores the real ones afterwards. */

/* 80×80 artwork: a two-colour gradient with the track's initials, as an inline SVG data URI */
function demoArt(initials, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},72%,58%)"/><stop offset="1" stop-color="hsl(${(hue + 48) % 360},70%,32%)"/>
    </linearGradient></defs>
    <rect width="80" height="80" fill="url(#g)"/>
    <circle cx="62" cy="18" r="22" fill="rgba(255,255,255,.12)"/>
    <text x="40" y="49" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="26" font-weight="700"
          fill="rgba(255,255,255,.92)" text-anchor="middle" letter-spacing="1">${initials}</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
}

const DEMO_DEVICES = [
  { id: 'xdj-700', label: 'XDJ-700 / XDJ-1000 / CDJ-2000NXS' },
  { id: 'nxs2', label: 'CDJ-2000NXS2 / XDJ-XZ' },
  { id: 'cdj-3000', label: 'CDJ-3000' },
];
const DEMO_LIB = { id: 'demo', name: 'Sample library', dir: '/Users/you/Music/Sample', dirs: ['/Users/you/Music/Sample'], subfolders: false };
const DEMO_HOME = '/Users/you';
const DEMO_DATA_DIR = DEMO_HOME + '/Library/Application Support/DJ HQ';

const freeLink = (slug, title = 'FREE DOWNLOAD') =>
  ({ url: 'https://hypeddit.com/sample/' + slug, kind: 'free', label: 'Free DL', title, host: 'hypeddit.com', fmt: null });
const buyLink = (artist, slug, fmt = 'WAV', title = 'Buy the WAV') =>
  ({ url: `https://${artist}.bandcamp.com/track/${slug}`, kind: 'buy', label: 'Buy', title, host: artist + '.bandcamp.com', fmt });

/** A full fake /api/state view with eight tracks in every state the app knows. */
function demoView() {
  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  const base = (n, id, artist, title, dur, initials, hue, extra) => ({
    n, id, artist, title, user: artist, dur,
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
      links: [buyLink('velourstatic', 'sirens-over-lisbon'), freeLink('sirens-over-lisbon', 'free dl <3')] }),
    base(4, 900004, 'Kessler & Monroe', 'Half Light', '6:10', 'KM', 28, {
      have: true, file: 'Kessler & Monroe - Half Light.wav', score: 0.97, tagged: true, incompat: '24-bit' }),
    base(5, 900005, 'Oriel', 'Tidal (Original Mix)', '5:54', 'OR', 160, {
      links: [{ url: 'https://toneden.io/sample/tidal', kind: 'free', label: 'Free DL', title: 'Free download', host: 'toneden.io', fmt: 'WAV' }] }),
    base(6, 900006, 'Luma District', 'Northern Sky', '6:27', 'LD', 210, {
      have: true, file: 'Luma District - Northern Sky.mp3', score: 1, tagged: true, lossy: true, upgrade: true,
      links: [buyLink('lumadistrict', 'northern-sky', 'lossless', 'Buy lossless')] }),
    base(7, 900007, 'Faye Idris', 'Paper Lanterns', '4:48', 'FI', 345, {}),
    base(8, 900008, 'Solenne', 'Afterglow (Dub)', '7:31', 'SO', 95, { na: true, auto: false }),
  ];
  const extras = [
    { name: 'Rook & Finch - Velvet Hours.wav', incompat: null, dur: '6:03', lossy: false, artist: 'Rook & Finch', title: 'Velvet Hours',
      edited: false, tagged: true,
      found: { id: 900101, url: 'https://soundcloud.com/sample/velvet-hours', title: 'Velvet Hours', user: 'Rook & Finch', dur: '6:03' } },
    { name: 'Unknown - Live Jam 03.aiff', incompat: null, dur: '8:12', lossy: false, artist: 'Unknown', title: 'Live Jam 03',
      edited: false, tagged: false, found: null },
  ];
  const local_files = [
    ...tracks.filter(t => t.file).map(t => ({ name: t.file, dur: t.dur })),
    ...extras.map(f => ({ name: f.name, dur: f.dur })),
  ];
  const have = tracks.filter(t => t.have).length;
  return {
    libraries: [DEMO_LIB], active: DEMO_LIB.id,
    device: 'xdj-700', devices: DEMO_DEVICES,
    backups: 0, backup_dir: DEMO_DATA_DIR + '/originals/demo', can_pick: false, can_reveal: false,
    ready: true, playlist: 'Sample playlist', playlist_url: 'https://soundcloud.com/sample/sets/sample-playlist',
    genre: 'Sample playlist',
    tracks, extras, local_files,
    have,
    missing: tracks.filter(t => !t.have && !t.na).length,
    na_count: tracks.filter(t => t.na).length,
    upgrades: tracks.filter(t => t.upgrade).length,
    reavailable: [],
    new_count: tracks.filter(t => t.is_new || t.is_new_file).length,
    new_tracks: tracks.filter(t => t.is_new).length,
    new_files: tracks.filter(t => t.is_new_file).length,
    seen_mark: now - 3 * day,
    untagged: tracks.filter(t => t.tagged === false).length + extras.filter(f => f.tagged === false).length,
    incompatible: tracks.filter(t => t.file && t.incompat).length + extras.filter(f => f.incompat).length,
    local_count: local_files.length,
    settings: { inbox_dir: DEMO_HOME + '/Downloads', inbox_default: DEMO_HOME + '/Downloads', inbox_custom: false,
                auto_move: false, refresh_min: 15, data_dir: DEMO_DATA_DIR },
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
    others: 1, already: 0,
  };
}
