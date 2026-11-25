/** DJ HQ core: state, SoundCloud (playlist fetch, track search), file scan +
 *  fuzzy matching, where-to-get-it links, rekordbox tagging, player-compat
 *  conversion, the Downloads inbox and the rekordbox XML export. All file
 *  rewrites go through ffmpeg with an audio-MD5 (tags) or duration (converts)
 *  verification, converts back up the untouched original first, and every
 *  action returns the full view (buildView) the UI renders. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile, ChildProcess } from "child_process";
import { buildId3v23, carriedFrames, carriedChunks, appendChunks, prependTag, copyAfterTag, readKeyInfo, id3Version, infoFields, id3Names, rewriteLosses,
         pictureTag, replaceTagChunk, rawTagFrames, apicFrame, otherChunks, infoAsFrames, plainPcmCopy, Frame } from "./id3";
import { listEntries, extractEntry, ZipEntry } from "./zip";
import { checkXmlFile } from "./rbxml";
import * as store from "./store";

const AUDIO_EXT = [".wav", ".mp3", ".aiff", ".aif", ".flac", ".m4a", ".ogg"];
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** What a player reads, from Pioneer's manuals: WAV and AIFF (and FLAC and ALAC where it has them,
 *  with the same limits) up to `wavBits` at the rates in `srs`; MP3 and AAC at 32, 44.1 or 48 kHz.
 *  `wext`: it often refuses a WAV with a WAVE_FORMAT_EXTENSIBLE header (every player up to the CDJ-3000). */
export interface Device { label: string; wavBits: number; srs: number[]; flac: boolean; alac: boolean; wext?: boolean; }
const HI = [44100, 48000, 88200, 96000], STD = [44100, 48000];
export const DEVICES: Record<string, Device> = {
  // 16-bit WAV and AIFF only: the owner's XDJ-700 refused 24-bit files, although the manual lists 24-bit
  "xdj-700":     { label: "XDJ-700 / XDJ-1000 / CDJ-2000NXS", wavBits: 16, srs: STD, flac: false, alac: false, wext: true },
  "xdj-xz":      { label: "XDJ-XZ / XDJ-RX3", wavBits: 24, srs: STD, flac: true, alac: false, wext: true },
  "xdj-1000mk2": { label: "XDJ-1000MK2", wavBits: 24, srs: STD, flac: true, alac: true, wext: true },
  "nxs2":        { label: "CDJ-2000NXS2", wavBits: 24, srs: HI, flac: true, alac: true, wext: true },
  "cdj-3000":    { label: "CDJ-3000 / OPUS-QUAD", wavBits: 24, srs: HI, flac: true, alac: true, wext: true },
  // 32-bit WAV and AIFF (integer and float) play on the 3000X: seen on the owner's player, not in a spec sheet.
  // ffmpeg writes every such WAV with a WAVE_FORMAT_EXTENSIBLE header, so the 3000X reads that header too.
  "cdj-3000x":   { label: "CDJ-3000X", wavBits: 32, srs: HI, flac: true, alac: true },
};

// ---------------- ffmpeg binaries ----------------

function tryRequire(mod: string): any {
  try { return require(mod); } catch { return null; }
}
function resolveBin(mod: string, fallback: string): string {
  let p = tryRequire(mod);
  if (p && typeof p === "object") p = p.path;
  if (typeof p === "string") {
    p = p.replace("app.asar", "app.asar.unpacked"); // electron-builder unpacks binaries
    if (fs.existsSync(p)) return p;
  }
  return fallback; // rely on PATH
}
export const FFMPEG = resolveBin("ffmpeg-static", "ffmpeg");
export const FFPROBE = resolveBin("ffprobe-static", "ffprobe");

/** The child processes running now (ffmpeg, ffprobe, xattr): shutdown() ends them, so none
 *  goes on writing a temp file after the app is gone. */
const CHILDREN = new Set<ChildProcess>();
/** Temp files being written right now (a tag or picture write, a convert, a WAV to AIFF copy,
 *  a zip entry staged): shutdown() removes them, the stale-temp sweep leaves them alone. */
const LIVE_TMP = new Set<string>();
function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      CHILDREN.delete(child);
      let code = 0;
      if (err) code = typeof (err as any).code === "number" ? (err as any).code : 1;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
    CHILDREN.add(child);
  });
}
/** a temp file next to a library file; `p` is its path (removed by shutdown() while it is listed) */
const liveTmp = (p: string) => { LIVE_TMP.add(p); return p; };
/** liveTmp, after removing a temp file of that name that a write cut off earlier left behind */
const staleGone = (p: string) => { if (!LIVE_TMP.has(p)) try { fs.unlinkSync(p); } catch { /* none */ } return liveTmp(p); };
const doneTmp = (p: string) => { LIVE_TMP.delete(p); try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ } };

// ---------------- state ----------------

export interface PlTrack {
  id: number; title: string; user: string; pub_artist: string | null;
  dur: number; url: string; art: string;
  /** SoundCloud "Buy"/"Free DL" link set by the uploader; undefined on snapshots
   *  fetched by older versions, null when the track has none */
  buy_url?: string | null; buy_title?: string | null;
  /** official SoundCloud download button is available and has downloads left */
  sc_dl?: boolean;
  /** candidate links found in the description: [url, its line, the line above] */
  desc_links?: [string, string, string][];
  /** ms when this app first saw the track in the playlist; 0 = predates tracking */
  added?: number;
}
export interface Playlist { title: string; url: string; tracks: PlTrack[]; }

/** One watched folder of the collection. `id` ("r1", "r2", …) stays with the root for its
 *  lifetime and keys the backups of files under it, so paths can change without losing them. */
export interface CollectionRoot {
  id: string; path: string;
  /** also scan the folders inside this root (on for roots that came from a library that scanned them) */
  subfolders?: boolean;
}
/** The music collection: every playlist matches against the files of these folders. The
 *  folder layout belongs to the user; DJ HQ never derives meaning from it. */
export interface Collection {
  roots: CollectionRoot[];
  /** where "Move" puts a file when the playlist has no folder of its own: the folder picked last */
  last_target?: string;
  /** the default move target (Settings > Collection); first root when unset */
  move_target?: string;
}

export interface Library {
  /** `dir`, `dirs` and `subfolders` are the pre-collection shape (one library owned its
   *  folders). They are kept as written for rollback and for resolving old backups, and are
   *  no longer read anywhere else: the collection's roots say what is scanned. */
  id: string; dir: string; url: string; playlist: Playlist | null;
  /** the playlist's own move target (opt-in): downloads moved in this playlist's context go here */
  target?: string;
  /** legacy: further folders that belonged to this library before the collection */
  dirs?: string[];
  /** legacy: whether this library's folders were scanned with their subfolders */
  subfolders?: boolean;
  /** tracks added after this (ms) are NEW; set by "Mark all as seen" */
  seen_mark?: number;
  /** file-arrival tracking has been initialised for this library (files present then aren't "new") */
  acq_init?: boolean;
  /** imported from a configuration file before the music was copied here: the folder counts as
   *  "not available" (nothing is pruned) and pins follow the files' spelling on disk as they
   *  turn up, until the user says the copy is complete */
  files_pending?: boolean;
  /** the library's id on the computer a configuration file came from (kept for later matching) */
  uid?: string;
  /** earlier main folders of this library (set_dir), newest last, at most 5: the rekordbox
   *  export update (aiff.ts) points tracks that are still listed there at the new folder */
  moved_from?: string[];
  /** earlier main folders that are extra folders of this library now (set_dir to one of its extra
   *  folders swaps the two): removing one from the library adds it to moved_from then */
  former_main?: string[];
  /** backups that Convert WAV files to AIFF made: the WAV's key -> the AIFF's key it became, so
   *  Restore originals can undo that (the WAV back, the AIFF to replaced/, the records back) */
  aiff_from?: Record<string, string>;
}

// dur_cache entry: [size, mtime, duration, [codec, sr, bits], [artist, title, genre], [key, pn, info, id3, pic, ver]]
// info: a WAV's LIST/INFO [artist, title], null without one (and for other formats);
// id3: a WAV's ID3 chunk [artist, title] (ffprobe doesn't show them next to INFO);
// pic: the ID3 tag holds a picture; ver: that tag's version (0 = none), for Add cover art.
// (entries written before the key was read have five elements, and older ones lack the
// later fields: scanFolder adds those from the file's tags alone, without a new ffprobe run)
type CacheEntry = [number, number, number, [string, number, number], [string, string, string],
  [string | null, boolean | null, ([string, string] | null)?, ([string, string] | null)?, boolean?, number?, boolean?]?];

export interface AppState {
  libraries: Library[];
  active: string | null;
  /** the music collection (see Collection); absent only in a pre-collection state, filled by migration */
  collection?: Collection;
  dur_cache: Record<string, any[]>;
  overrides: Record<string, string>;
  /** artist / title typed in or swapped by hand, keyed by track id or "x:" + path; win
   *  over the derived ones. `ok` (artist and title empty) records a derived name the user
   *  kept as it is in Check names: nameSig of the values confirmed, so it lapses by
   *  itself if the derivation ever changes. `file`: nameSig of the different name the
   *  file had when the user kept DJ HQ's (that difference was seen, so it no longer asks
   *  for a look; a new one does). */
  edits: Record<string, { artist: string; title: string; ok?: string; file?: string }>;
  /** manual file assignment: track id -> file name ("" = forced no file) */
  assigned: Record<string, string>;
  /** track ids whose assigned entry the user picked in the match dialog (the others come from
   *  a download moved in or a found file): only these show "Matched by hand" */
  by_hand: Record<string, true>;
  /** SoundCloud track picked for a local file that isn't in the playlist, keyed "x:" + path */
  found: Record<string, Found>;
  /** "not available now": track id -> the links it had when marked; cleared when they change */
  na: Record<string, { sig: string; at: number }>;
  /** what Bandcamp has for a track (see bandcamp.ts), by track id; without a url: looked up at `at`
   *  under the name `sig` and not found. `free`: a free download there. `no`: pages the user said
   *  are not this track */
  bandcamp?: Record<string, { at: number; sig: string; v?: number; url?: string; title?: string; free?: true; no?: string[] }>;
  /** folder watched for fresh downloads; default ~/Downloads */
  inbox_dir?: string;
  /** user settings (see getSettings) */
  settings?: { auto_move?: boolean; refresh_min?: number; like_on_add?: boolean; sc_open?: "discover" | "browser"; do_all?: DoAll;
               /** WAV files DJ HQ moves into a library become AIFF files (wavToAiff); off by default */
               aiff_auto?: boolean;
               /** look for missing tracks on Bandcamp in the background; on unless false */
               bandcamp?: boolean;
               /** days until a track not found there is looked up again; 0 = never (default 14) */
               bandcamp_days?: number;
               /** the address the automated Hypeddit free download fills into a gate's email step */
               dl_email?: string };
  /** probe results for audio inside zips in the downloads folder: "<zip path>|<entry>|<size>" -> [dur, fmt, tags] */
  zip_cache?: Record<string, [number, [string, number, number], [string, string, string]]>;
  /** "<lib id>:<track id>" -> ms when a file for the track first turned up (0 = predates tracking) */
  acquired: Record<string, number>;
  client_id: string | null;
  device: string;
}

/** "Do everything" (move, tag, Platinum Notes, Mixed In Key, rekordbox XML) setup. Paths
 *  are of this computer, so a config export must leave them out. */
export interface DoAll {
  on?: boolean;
  /** Platinum Notes / Mixed In Key: the .app bundle (macOS) or .exe (Windows) */
  pn_app?: string; mik_app?: string;
  /** Mixed In Key's collection database: read (never written) for files that end up without a key tag */
  mik_db?: string;
  /** the rekordbox XML rekordbox imports from: tracks and keys are merged into it */
  rb_xml?: string;
  /** quit Platinum Notes / Mixed In Key after their step, when DJ HQ started them (default on) */
  close_apps?: boolean;
  /** macOS: press Start Processing in Platinum Notes for the user (needs Accessibility; default off) */
  press_start?: boolean;
  /** also send library files that have no Platinum Notes mark or no key (default: only this run's downloads) */
  include_pending?: boolean;
  /** Platinum Notes' output mode as last read (wizard, run start); "unknown" where it can't be read (Windows) */
  pn_mode?: "replace" | "other" | "unknown"; pn_mode_at?: number;
  /** the user says Platinum Notes is set to replace the originals (only asked where pn_mode is "unknown") */
  pn_replace_confirmed?: boolean;
}

/** An error the UI can show in the user's language: a short stable code plus English text. */
export const appError = (code: string, text: string, vars?: Record<string, unknown>) =>
  Object.assign(new Error(text), { code, ...(vars ? { vars } : {}) });

/** One entry of a per-file error list (view.*.error_items, next to the plain `errors` strings):
 *  the file, the error's code and vars when it has them, its English text, and `named` when the
 *  text names the file itself (the UI then shows it alone, else "name: text"). */
export interface ErrorItem { name: string; code?: string; vars?: Record<string, unknown>; text: string; named?: boolean; }
export const errItem = (name: string, e: any): ErrorItem => {
  const text = String(e?.message || e);
  return { name, text, ...(typeof e?.code === "string" && /^[a-z][a-z0-9_]*$/.test(e.code) ? { code: e.code } : {}),
           ...(e?.vars && typeof e.vars === "object" ? { vars: e.vars } : {}), ...(text.startsWith(name + ":") ? { named: true } : {}) };
};

let DATA_DIR = "";
let CAN_PICK = false;
let CAN_REVEAL = false;
export let STATE: AppState;

export function init(dataDir: string, canPick: boolean, canReveal = false): void {
  DATA_DIR = dataDir;
  CAN_PICK = canPick;
  CAN_REVEAL = canReveal;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // throws {code: "db_in_use"} when another DJ HQ has this data folder open
  const r = store.open(DATA_DIR, withDefaults);
  STATE = r.state;
  STATE_PROBLEM = r.problem;
  SAVE_BLOCKED = r.blocked;
  try { migrateToCollection(); }
  catch (e: any) { console.error("DJ HQ could not migrate to the collection model: " + String(e?.message || e)); }
  if (!exitHooked) { exitHooked = true; process.on("exit", shutdown); }
}
let exitHooked = false;

/** One-time move to the collection model: the libraries' folders become the collection's
 *  roots, every file key (pins, aiff_from) becomes the file's absolute path, and each
 *  library keeps its old main folder as its move target, so moves behave as before. The
 *  database is snapshotted to backups/ first; the migration itself is idempotent (it only
 *  runs while the state has no collection) and all-or-nothing in memory before one save. */
export function migrateToCollection(): void {
  if (STATE.collection) return;
  if (!STATE.libraries.length) { STATE.collection = { roots: [] }; if (!SAVE_BLOCKED) saveState(); return; }
  if (SAVE_BLOCKED) return;   // nothing may be written this session; try again next launch
  try {
    const bdir = path.join(DATA_DIR, "backups");
    fs.mkdirSync(bdir, { recursive: true });
    backupDb(path.join(bdir, new Date().toISOString().replace(/[:.]/g, "-") + "-before-collection.djhq.db"));
  } catch (e: any) { console.error("DJ HQ could not back up its database before the collection migration: " + String(e?.message || e)); return; }
  // the roots: every folder of every library, deduplicated; a folder inside another root
  // that scans its subfolders is covered by it and dropped
  let nextId = 1;
  const roots: CollectionRoot[] = [];
  for (const lib of STATE.libraries)
    for (const d of legacyDirs(lib)) {
      if (roots.some((r) => sameDir(r.path, d))) continue;
      roots.push({ id: "r" + nextId++, path: path.resolve(d), ...(lib.subfolders ? { subfolders: true } : {}) });
    }
  const covered = (r: CollectionRoot) => roots.some((o) => o !== r && o.subfolders && insideDir(r.path, o.path));
  const kept = roots.filter((r) => !covered(r));
  // pins and aiff_from move from library-relative keys to absolute paths; the owning library
  // of a pin is the one whose playlist holds the track (the first, if ever two do)
  const owner = new Map<number, Library>();
  for (const lib of STATE.libraries)
    for (const t of lib.playlist?.tracks || [])
      if (!owner.has(t.id)) owner.set(t.id, lib);
  let pins = 0, moved = 0;
  for (const [tid, key] of Object.entries(STATE.assigned)) {
    if (!key || path.isAbsolute(key)) continue;
    pins++;
    const lib = owner.get(Number(tid));
    if (!lib) continue;
    STATE.assigned[tid] = legacyLibPath(lib, key);
    moved++;
  }
  for (const lib of STATE.libraries) {
    if (lib.aiff_from) {
      const af: Record<string, string> = {};
      for (const [a, b] of Object.entries(lib.aiff_from))
        af[path.isAbsolute(a) ? a : legacyLibPath(lib, a)] = path.isAbsolute(b) ? b : legacyLibPath(lib, b);
      lib.aiff_from = af;
    }
    lib.target = lib.dir;   // moves keep landing where they always did
  }
  STATE.collection = { roots: kept };
  saveState();
  console.log(`DJ HQ moved to the collection model: ${kept.length} root folder(s), ${moved} of ${pins} pins rekeyed`);
}

/** Set when the saved data could not be used at launch; the view carries it (state_problem)
 *  so the UI can say so. "state_unreadable": the file (state.json of an older version, or the
 *  database) was moved aside to `file` and the app started fresh; "state_unreadable_kept": it
 *  could not be moved either, so it stays where it is and nothing is saved this session;
 *  "state_newer": the database was saved by a newer version (shown, never written);
 *  "state_import_failed": state.json couldn't be moved into the database (it is used as it is,
 *  nothing is saved, the next launch tries again); "state_store_failed": the database can't be
 *  opened, created or written at `file` (nothing is saved); "state_db_replaced": the database
 *  was moved aside to `file` and the state.json next to it loaded instead (now at `from`);
 *  "state_json_ignored": a state.json written after the database took over is left unused at
 *  `file` (saving goes on). */
let STATE_PROBLEM: { code: string; file: string; from?: string } | null = null;
let SAVE_BLOCKED = false;
export const stateProblem = () => STATE_PROBLEM;

/** Every key the code reads without a check, filled in (older state files, an imported one). */
export function withDefaults(st: any): AppState {
  st.libraries = st.libraries || [];
  st.active = st.active ?? null;
  st.dur_cache = st.dur_cache || {};
  st.overrides = st.overrides || {};
  st.edits = st.edits || {};
  st.assigned = st.assigned || {}; // older state files predate manual matching
  st.by_hand = st.by_hand || {};
  st.found = st.found || {};
  st.na = st.na || {};
  st.bandcamp = st.bandcamp || {};
  st.acquired = st.acquired || {};
  st.settings = st.settings || {};
  st.zip_cache = st.zip_cache || {};
  st.client_id = st.client_id ?? null;
  st.device = st.device || "xdj-700";
  return st;
}
/** Write the changes since the last save to the database (only the rows that changed). */
export function saveState(): void {
  if (SAVE_BLOCKED) return;
  store.save(STATE);
}
/** false while nothing may be saved (see STATE_PROBLEM) */
export const canSave = () => !SAVE_BLOCKED && store.canSave();
/** UI preferences (theme, "tour seen", dismissed update): kept in the database next to the state */
export const getPrefs = () => store.getPrefs();
export const setPrefs = (patch: Record<string, unknown>) => store.setPrefs(patch);
/** a consistent copy of the database (state and preferences) at `dst` */
export const backupDb = (dst: string) => store.snapshot(dst);
/** close the database (quit); every save is already on disk, this releases the lock */
export function shutdown(): void {
  // a quit in the middle of a file write: no catch block runs, so the child processes are
  // ended and the temp files removed here (synchronously: the process is on its way out)
  for (const c of CHILDREN) { try { c.kill("SIGKILL"); } catch { /* ignore */ } }
  CHILDREN.clear();
  for (const p of LIVE_TMP) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  LIVE_TMP.clear();
  store.close();
}

/** Bumped whenever STATE is replaced as a whole (an import): a view that was being built
 *  from the old state starts over instead of pruning the new one with the old folders. */
let STATE_GEN = 0;
/** Put a whole new state in place (configuration import): written first (one transaction),
 *  then swapped in one synchronous step, so no request ever sees half of it. Refused while
 *  nothing may be saved: an import must not write over data that couldn't be read. Returns
 *  the way back: the previous state written and in place again. */
export function replaceState(next: AppState): () => void {
  if (SAVE_BLOCKED) throw appError("store_blocked", "DJ HQ can't save right now, so nothing was imported");
  const prev = STATE;
  store.save(next);
  STATE = next;
  STATE_GEN++;
  return () => {
    store.save(prev);
    STATE = prev;
    STATE_GEN++;
  };
}
export const dataDir = () => DATA_DIR;

/** Write a whole file so that a crash or power cut leaves either the old or the new
 *  version, never half of one: write a temp file next to it, flush it, rename it over. */
export function writeFileAtomic(p: string, text: string): void {
  const tmp = p + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, text);
    try { fs.fsyncSync(fd); } catch {}
  } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, p); }
  catch (e: any) {
    // Windows replaces the target too, but fails while something (a virus scanner, a
    // backup or sync client) holds it open: wait a moment and try once more.
    const busy = e?.code === "EPERM" || e?.code === "EBUSY" || e?.code === "EACCES";
    try {
      if (!busy) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      fs.renameSync(tmp, p);
    } catch (e2) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e2;
    }
  }
}

/** Settings > Bandcamp: how often a track that was not found is looked up again (days, 0 = never) */
export const BANDCAMP_DAYS = [1, 3, 7, 14, 30, 0];
export const REFRESH_CHOICES = [5, 15, 30, 60, 120];
/** What the Settings page shows and edits. inbox_dir is kept top-level for older state files. */
export function getSettings(): any {
  const s = STATE.settings || (STATE.settings = {});
  return {
    inbox_dir: inboxDir(), inbox_default: path.join(os.homedir(), "Downloads"), inbox_custom: !!STATE.inbox_dir,
    auto_move: !!s.auto_move, refresh_min: REFRESH_CHOICES.includes(s.refresh_min || 0) ? s.refresh_min : 15,
    like_on_add: !!s.like_on_add,
    sc_open: s.sc_open === "browser" ? "browser" : "discover",
    aiff_auto: !!s.aiff_auto,
    dl_email: s.dl_email || "",
    bandcamp: s.bandcamp !== false,
    bandcamp_days: BANDCAMP_DAYS.includes(s.bandcamp_days ?? -1) ? s.bandcamp_days : 14,
    data_dir: DATA_DIR,
    ...doAllStatus(),
  };
}

/** The feature switch for "Do everything": the button, its Settings card, the wizard, the
 *  Guide and tour entries and the /api/do-all routes exist only when the environment has
 *  DJ_HQ_DO_ALL_FEATURE_ENABLED=true (also 1 / yes / on; the lower-case name works too).
 *  Read once at start: changing it needs a restart. */
export const DO_ALL_FEATURE = /^(1|true|yes|on)$/i.test(
  String(process.env.DJ_HQ_DO_ALL_FEATURE_ENABLED ?? process.env.dj_hq_do_all_feature_enabled ?? "").trim());

/** The feature switch for the background Hypeddit free download: the Free DL button walks the
 *  gate, the Settings email field and /api/free-download exist only when the environment has
 *  DJ_HQ_DOWNLOAD_BYPASS=true (also 1 / yes / on; the lower-case name works too). Read once at
 *  start: changing it needs a restart. */
export const DOWNLOAD_BYPASS = /^(1|true|yes|on)$/i.test(
  String(process.env.DJ_HQ_DOWNLOAD_BYPASS ?? process.env.dj_hq_download_bypass ?? "").trim());

/** The "Do everything" settings with defaults, and what keeps it from running, as stable
 *  codes. Only cheap existence checks: this runs on every view. */
export function doAllStatus(): { do_all: Required<Omit<DoAll, "pn_mode" | "pn_mode_at">> & { pn_mode: string | null; pn_mode_at: number | null; switched_off: boolean };
                                 do_all_ready: boolean; do_all_missing: string[]; do_all_optional: string[] } {
  const d: DoAll = STATE.settings?.do_all || {};
  const exists = (p?: string) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
  const missing: string[] = [], optional: string[] = [];
  if (!d.pn_app) missing.push("pn_app_missing"); else if (!exists(d.pn_app)) missing.push("pn_app_not_found");
  if (!d.mik_app) missing.push("mik_app_missing"); else if (!exists(d.mik_app)) missing.push("mik_app_not_found");
  if (!d.rb_xml) missing.push("rb_xml_missing");
  else if (!exists(d.rb_xml)) missing.push("rb_xml_not_found");
  else if (isExportXml(d.rb_xml)) missing.push("rb_xml_is_export");
  else { try { fs.accessSync(d.rb_xml, fs.constants.R_OK | fs.constants.W_OK); } catch { missing.push("rb_xml_not_writable"); } }
  if (!d.pn_mode) missing.push("pn_mode_unchecked");
  else if (d.pn_mode === "other") missing.push("pn_mode_wrong");
  else if (d.pn_mode === "unknown" && !d.pn_replace_confirmed) missing.push("pn_mode_unknown");
  if (!d.mik_db) optional.push("mik_db_missing"); else if (!exists(d.mik_db)) optional.push("mik_db_not_found");
  return {
    do_all: { on: !!d.on, pn_app: d.pn_app || "", mik_app: d.mik_app || "", mik_db: d.mik_db || "", rb_xml: d.rb_xml || "",
              close_apps: d.close_apps !== false, press_start: !!d.press_start, include_pending: !!d.include_pending,
              pn_replace_confirmed: !!d.pn_replace_confirmed, pn_mode: d.pn_mode || null, pn_mode_at: d.pn_mode_at || null,
              // off by the user's choice (not just never set up): the button is hidden then
              switched_off: d.on === false },
    do_all_ready: missing.length === 0, do_all_missing: missing, do_all_optional: optional,
  };
}

/** Remember Platinum Notes' output mode as just read (detection, run start). */
export function setPnMode(mode: "replace" | "other" | "unknown"): void {
  const s = STATE.settings || (STATE.settings = {});
  const d = s.do_all || (s.do_all = {});
  if (d.pn_mode === mode) { d.pn_mode_at = Date.now(); return; }
  d.pn_mode = mode; d.pn_mode_at = Date.now();
  saveState();
}

/** DJ HQ's own Export XML file: rewritten whole on every export, so it can't be the
 *  file Do everything merges into (what it adds there would be lost). */
function isExportXml(p: string): boolean {
  const real = (x: string) => { try { return fs.realpathSync.native(x); } catch { return path.resolve(x); } };
  return real(p).toLowerCase() === real(rekordboxXmlPath()).toLowerCase();
}

/** A path as the user typed or pasted it: trimmed, one pair of surrounding quotes off
 *  (Windows' "Copy as path" adds them), a Terminal-escaped one ("Platinum\ Notes")
 *  unescaped, ~ and file:// URLs expanded, made absolute. "" when empty. */
export function typedPath(v: unknown): string {
  let s = String(v ?? "").trim();
  if (s.length > 1 && /^(["']).*\1$/.test(s)) s = s.slice(1, -1).trim();
  if (process.platform !== "win32" && /\\ /.test(s)) s = s.replace(/\\(.)/g, "$1");
  if (/^file:/i.test(s)) {
    s = s.replace(/^file:(\/\/localhost|\/\/)?/i, "");
    try { s = decodeURIComponent(s); } catch { /* keep as is */ }
    if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);
  }
  if (!s) return "";
  return path.resolve(s.replace(/^~(?=$|[\/\\])/, os.homedir()));
}

/** Check and apply a do_all patch (see DoAll). Paths: "" or null clears one. The app
 *  paths are checked for their bundle / exe by the server before this runs. */
function patchDoAll(p: any): void {
  if (!p || typeof p !== "object") throw appError("bad_request", "do_all must be an object");
  const s = STATE.settings || (STATE.settings = {});
  const d: DoAll = { ...(s.do_all || {}) };
  for (const k of ["on", "close_apps", "press_start", "include_pending", "pn_replace_confirmed"] as const)
    if (k in p) d[k] = !!p[k];
  const file = (v: any): string | null => typedPath(v) || null;
  for (const k of ["pn_app", "mik_app"] as const) if (k in p) {
    const v = file(p[k]);
    if (v && !fs.existsSync(v)) throw appError(k + "_not_found", "that app isn't there");
    // stored as the real path (true case, no symlink): it is compared with running apps' paths
    if (v) { try { d[k] = fs.realpathSync.native(v); } catch { d[k] = v; } } else delete d[k];
  }
  if ("mik_db" in p) {
    const v = file(p.mik_db);
    if (v) {
      if (!fs.existsSync(v) || !fs.statSync(v).isFile()) throw appError("mik_db_not_found", "that file isn't there");
      let head = "";
      try { const fd = fs.openSync(v, "r"); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd); head = b.toString("latin1"); } catch {}
      if (head !== "SQLite format 3\0") throw appError("mik_db_not_sqlite", "that file isn't a Mixed In Key database");
      d.mik_db = v;
    } else delete d.mik_db;
  }
  if ("rb_xml" in p) {
    const v = file(p.rb_xml);
    if (v) {
      if (!fs.existsSync(v) || !fs.statSync(v).isFile()) throw appError("rb_xml_not_found", "that file isn't there");
      let head = "";
      try { const fd = fs.openSync(v, "r"); const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd); head = b.toString("utf8", 0, n); } catch {}
      if (!/<DJ_PLAYLISTS[\s>]/.test(head)) throw appError("rb_xml_not_rekordbox", "that file isn't a rekordbox XML collection");
      if (isExportXml(v)) throw appError("rb_xml_is_export", "that is the file DJ HQ's Export XML rewrites; choose rekordbox's own XML file", { path: v });
      // the whole file, merged with a made-up track in memory: a file the run couldn't
      // merge into is refused now, not after the audio was processed
      try { checkXmlFile(v); }
      catch (e: any) { throw appError(typeof e?.code === "string" ? e.code : "rb_xml_failed", String(e?.message || e), { path: v, error: String(e?.message || e) }); }
      d.rb_xml = v;
    } else delete d.rb_xml;
  }
  s.do_all = d;
}
/** POST /api/settings {inbox_dir?: string|null ("" or null = back to ~/Downloads), auto_move?: boolean, refresh_min?: number,
 *  like_on_add?: boolean (Discover: also like a track when adding it to the playlist),
 *  sc_open?: "discover" | "browser" (where SoundCloud links open; the desktop app defaults to Discover),
 *  aiff_auto?: boolean (WAV files moved into the library become AIFF files),
 *  dl_email?: string (the address the automated Hypeddit free download fills into a gate's email step),
 *  do_all?: a partial DoAll (the "Do everything" setup; see patchDoAll)} */
export async function setSettings(data: any): Promise<any> {
  const s = STATE.settings || (STATE.settings = {});
  if ("inbox_dir" in data) {
    const d = String(data.inbox_dir || "").trim();
    if (!d) delete STATE.inbox_dir;
    else {
      if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw appError("folder_not_found", "that folder doesn't exist", { dir: d });
      STATE.inbox_dir = path.resolve(d);
    }
  }
  if ("auto_move" in data) s.auto_move = !!data.auto_move;
  if ("like_on_add" in data) s.like_on_add = !!data.like_on_add;
  if ("aiff_auto" in data) s.aiff_auto = !!data.aiff_auto;
  if ("bandcamp_days" in data) {
    const n = Number(data.bandcamp_days);
    if (!BANDCAMP_DAYS.includes(n)) throw appError("bad_request", "the Bandcamp interval must be one of " + BANDCAMP_DAYS.join(", ") + " days");
    s.bandcamp_days = n;
  }
  if ("bandcamp" in data) { if (data.bandcamp) delete s.bandcamp; else s.bandcamp = false; }
  if ("dl_email" in data) {
    const v = String(data.dl_email || "").trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw appError("bad_email", "that isn't an email address", { email: v });
    if (v) s.dl_email = v; else delete s.dl_email;
  }
  if ("sc_open" in data) s.sc_open = data.sc_open === "browser" ? "browser" : "discover";
  if ("do_all" in data) patchDoAll(data.do_all);
  if ("refresh_min" in data) {
    const n = Number(data.refresh_min);
    if (!REFRESH_CHOICES.includes(n)) throw appError("bad_request", "refresh interval must be one of " + REFRESH_CHOICES.join(", ") + " minutes");
    s.refresh_min = n;
  }
  saveState();
  return buildView();
}
/** Folders the UI may stream audio from (preview): every collection root and the downloads folder. */
export function allowedDirs(): string[] {
  return [...collRoots().map((r) => path.resolve(r.path)), path.resolve(inboxDir())];
}
/** Total bytes under originals/<lib>/ (backups of converted files + replaced MP3s). */
export function backupBytes(lib: Library | null): number {
  if (!lib) return 0;
  const walk = (d: string): number => {
    let n = 0;
    try { for (const e of fs.readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size; } catch {}
    return n;
  };
  return walk(backupDir(lib));
}

export function activeLib(): Library | null {
  const libs = STATE.libraries;
  if (!libs.length) return null;
  return libs.find((l) => l.id === STATE.active) || libs[0];
}

export function libName(lib: Library): string {
  return lib.playlist?.title || path.basename((lib.dir || "").replace(/\/+$/, "")) || lib.id;
}

// ---------------- the collection ----------------

/** The collection (filled by migrateToCollection / withDefaults' caller: init). */
export function collection(): Collection {
  return STATE.collection || (STATE.collection = { roots: [] });
}
export const collRoots = (): CollectionRoot[] => collection().roots;
/** The root a path lies under (the deepest, if ever roots nest), else null. */
export function rootOf(p: string): CollectionRoot | null {
  let best: CollectionRoot | null = null;
  for (const r of collRoots())
    if (insideDir(p, r.path) && (!best || r.path.length > best.path.length)) best = r;
  return best;
}
/** "<root id>/<relative path>" of a path under the collection, else null: the stable key
 *  backups are stored under (the root's path may change, its id does not). */
export function rootRelKey(p: string): string | null {
  const r = rootOf(p);
  if (!r) return null;
  return "@" + r.id + "/" + path.relative(r.path, p).split(path.sep).join("/");
}
/** The absolute path a backup key names: "@<root id>/<rel>" under that root (null when the
 *  root is gone), anything else through the legacy library layout. */
function backupKeyPath(lib: Library, key: string): string | null {
  if (key.startsWith("@@/")) return null;   // backed up from outside the roots: left for recovery by hand
  const m = /^@(r\d+)\/(.+)$/.exec(key);
  if (!m) return legacyLibPath(lib, key);
  const r = collRoots().find((x) => x.id === m[1]);
  return r ? path.join(r.path, ...m[2].split("/")) : null;
}
/** A short display name for a file of the collection: its path relative to its root
 *  (prefixed with the root's folder name when there are several roots), else the base name. */
export function collDisplay(p: string): string {
  const r = rootOf(p);
  if (!r) return path.basename(p);
  const rel = path.relative(r.path, p).split(path.sep).join("/");
  return collRoots().length > 1 ? path.basename(r.path) + "/" + rel : rel;
}

/** The folders of a library before the collection model (kept for old backups and rollback). */
function legacyDirs(lib: Library): string[] {
  return [lib.dir, ...(lib.dirs || [])].filter(Boolean);
}
/** The pre-collection key prefixes of a library's folders (see the old scanLocal keys). */
function legacyPrefixes(lib: Library): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  if (lib.subfolders && lib.dir) {
    try {
      for (const e of fs.readdirSync(lib.dir, { withFileTypes: true }))
        if (e.isDirectory() && !e.name.startsWith(".")) used.add(e.name);
    } catch {}
  }
  legacyDirs(lib).forEach((d, i) => {
    if (i === 0) { out.set(d, ""); return; }
    const base = path.basename(d.replace(/[\/\\]+$/, "")) || "folder";
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
    used.add(name);
    out.set(d, name + "/");
  });
  return out;
}
/** Absolute path of a pre-collection library file key. */
function legacyLibPath(lib: Library, key: string): string {
  for (const [d, prefix] of legacyPrefixes(lib))
    if (prefix && key.startsWith(prefix)) return path.join(d, ...key.slice(prefix.length).split("/"));
  return path.join(lib.dir || "", ...key.split("/"));
}
/** Absolute path of a file key: keys are absolute paths since the collection model; an old
 *  relative key (from a state saved mid-change) still resolves through the legacy layout. */
function libPath(lib: Library, key: string): string {
  return path.isAbsolute(key) ? key : legacyLibPath(lib, key);
}

function requireLib(): Library {
  const lib = activeLib();
  if (!lib) throw appError("no_library", "add a library first (＋ button in the header)");
  return lib;
}

// ---------------- soundcloud ----------------

async function httpGet(url: string): Promise<string> {
  let r: Response;
  try { r = await fetch(url, { headers: { "User-Agent": UA } }); }
  catch (e: any) { throw appError("sc_offline", String(e?.message || e), { error: String(e?.cause?.code || e?.message || e) }); }   // no connection
  if (!r.ok) {
    const e: any = appError("http_status", `HTTP ${r.status} fetching ${noSecret(url.split("?")[0])}`, { status: r.status, url: noSecret(url.split("?")[0]) });
    e.status = r.status;
    throw e;
  }
  return r.text();
}

async function scrapeClientId(html: string): Promise<string> {
  for (const u of html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g) || []) {
    const m = (await httpGet(u)).match(/client_id[=:]"([A-Za-z0-9]{20,})"/);
    if (m) return m[1];
  }
  throw appError("sc_unreachable", "could not scrape a SoundCloud client_id");
}

/** A pasted SoundCloud link as the library keeps it: https://soundcloud.com/<path>, no query
 *  or fragment (Share adds si= and utm_* tracking), no trailing slash. A private playlist's
 *  share link carries its secret as the last path segment (/s-AbC123); the
 *  ?secret_token=s-AbC123 form is turned into that. Other hosts come back trimmed only. */
export function normScUrl(raw: string): string {
  let s = String(raw || "").trim();
  if (/^(?:www\.|m\.|on\.)?soundcloud\.com\//i.test(s)) s = "https://" + s;
  let u: URL;
  try { u = new URL(s); } catch { return s; }
  if (!/^(?:www\.|m\.)?soundcloud\.com$/i.test(u.hostname)) return s;
  let p = u.pathname.replace(/\/+$/, "");
  const tok = u.searchParams.get("secret_token");
  if (tok && /^s-[A-Za-z0-9]+$/.test(tok) && !scSecret(p)) p += "/" + tok;
  return "https://soundcloud.com" + p;
}
/** normScUrl, after following a short link from the phone app's Share (on.soundcloud.com/…) */
async function expandScUrl(raw: string): Promise<string> {
  const url = normScUrl(raw);
  if (!/^https?:\/\/on\.soundcloud\.com\//i.test(url)) return url;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  return normScUrl(r.url);
}
/** the secret of a share link ("s-AbC123"), else null */
export function scSecret(url: string): string | null {
  // /<user>/sets/<name>/s-… or /<user>/<track>/s-… (a playlist merely named "s-club" is no secret)
  const segs = String(url || "").split(/[?#]/)[0].replace(/^https?:\/\/[^\/]+/i, "").split("/").filter(Boolean);
  const last = segs[segs.length - 1] || "";
  if (!/^s-[A-Za-z0-9]+$/.test(last)) return null;
  return (segs.length === 4 && segs[1] === "sets") || (segs.length === 3 && segs[1] !== "sets") ? last : null;
}
/** a URL with its share-link secret blanked, for error messages */
const noSecret = (url: string) => { const s = scSecret(url); return s ? url.split(s).join("s-…") : url; };

/** "https://soundcloud.com/<user>/likes" -> "<user>", else null */
export function likesUser(url: string): string | null {
  const m = String(url || "").trim().match(/^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^\/?#]+)\/likes\/?(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

/** api-v2 call that rescrapes the client_id once when it has gone stale. `page` is a
 *  soundcloud.com page's HTML, or a way to load one when it is needed. */
async function withClientId<T>(page: string | (() => Promise<string>), fn: () => Promise<T>): Promise<T> {
  const html = async () => typeof page === "string" ? page : page();
  if (!STATE.client_id) STATE.client_id = await scrapeClientId(await html());
  try { return await fn(); }
  catch (e: any) {
    if (e.status !== 401 && e.status !== 403) throw e;
    STATE.client_id = await scrapeClientId(await html());
    return fn();
  }
}

/** Track ids a user has liked, newest first (public likes only; capped at 1000). */
async function fetchLikeIds(userId: number): Promise<number[]> {
  const ids: number[] = [];
  const seen = new Set<number>();
  let next: string | null = `https://api-v2.soundcloud.com/users/${userId}/likes?client_id=${STATE.client_id}&limit=200&offset=0&linked_partitioning=1`;
  while (next && ids.length < 1000) {
    const j = JSON.parse(await httpGet(next));
    for (const it of j.collection || []) {
      const t = it.track;   // playlist likes have .playlist instead
      if (t && typeof t.id === "number" && !seen.has(t.id)) { seen.add(t.id); ids.push(t.id); }
    }
    next = j.next_href ? (j.next_href.includes("client_id=") ? j.next_href : `${j.next_href}&client_id=${STATE.client_id}`) : null;
  }
  return ids.slice(0, 1000);
}

/** Fetch the library's playlist (or likes) into its snapshot. Returns how many of its tracks
 *  SoundCloud would not hand out (deleted, blocked, or private and not shared with the link). */
export async function fetchPlaylist(lib: Library): Promise<number> {
  if (!lib.url) throw linkMissing();
  await healLibUrl(lib).catch(() => {});   // the read below follows a short link on its own
  const r = await readPlaylist(lib.url, lib.playlist);
  lib.playlist = r.playlist;
  saveState();
  return r.unreadable;
}

/** A library may still carry the phone app's short link (on.soundcloud.com/…) from an older
 *  version or an imported configuration. api-v2's resolve does not know those, so the link is
 *  replaced by the page it leads to, once. */
async function healLibUrl(lib: Library): Promise<void> {
  if (!/^https?:\/\/on\.soundcloud\.com\//i.test(normScUrl(lib.url))) return;
  const url = await expandScUrl(lib.url);
  if (/^https?:\/\/on\.soundcloud\.com\//i.test(url) || !/^https?:\/\/(www\.|m\.)?soundcloud\.com\/./i.test(url)) return;
  lib.url = url;
  if (lib.playlist && /^https?:\/\/on\.soundcloud\.com\//i.test(lib.playlist.url || "")) lib.playlist.url = url;
  saveState();
}

/** A library imported from a configuration file whose link was left out has url "": it keeps
 *  its snapshot and everything else, and only fetching waits for Change link…. */
const linkMissing = () => appError("link_missing", "this library has no SoundCloud link yet; set it with Change link… in Settings");

/** Read a playlist or likes link from SoundCloud without touching the state. `prev` is the
 *  snapshot it replaces: its first-seen times are kept (none at all = a first fetch). */
async function readPlaylist(rawUrl: string, prev: Playlist | null): Promise<{ playlist: Playlist; unreadable: number }> {
  const url = normScUrl(rawUrl);
  const likes = likesUser(url);
  let html = "", pageErr: any = null;
  try { html = await httpGet(url); }
  catch (e) { if (likes) throw e; pageErr = e; }   // a playlist gets a second chance through resolve below
  const m = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);<\/script>/);
  const hyd = m ? JSON.parse(m[1]) : [];
  // the client_id comes from the page's scripts; without the page, any other page will do
  const page = html || (() => httpGet(SC_DISCOVER));
  let ids: number[], title: string, plId = 0, secret: string | null = null;
  if (likes) {
    if (!m) throw appError("likes_unreadable", "could not read the likes page (is the profile public?)");
    const user = hyd.find((i: any) => i.hydratable === "user")?.data;
    if (!user || typeof user.id !== "number") throw appError("sc_no_user", "no SoundCloud user found at this URL");
    ids = await withClientId(html, () => fetchLikeIds(user.id));
    if (!ids.length) throw appError("likes_none_public", "no public likes found (are your likes public?)");
    title = `${user.username || likes}'s likes`;
  } else {
    let pl = hyd.find((i: any) => i.hydratable === "playlist")?.data;
    if (!pl || !Array.isArray(pl.tracks)) {
      // the page didn't carry it (a private playlist's share link may not): ask api-v2 what the link is
      pl = await withClientId(page, async () =>
        JSON.parse(await httpGet(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${STATE.client_id}`)))
        .catch((e: any) => { if (![401, 403, 404].includes(e.status)) throw e; return null; });   // offline, 429, 5xx: say so
      if (pl && pl.kind !== "playlist") throw appError("sc_no_playlist", "no playlist found at this URL");
      if (!pl || !Array.isArray(pl.tracks)) {
        if (pageErr && pageErr.status !== 404) throw pageErr;   // SoundCloud trouble (a 503, a bot block), not a private playlist
        throw scSecret(url)
          ? appError("sc_share_link_unreadable", "could not read the playlist from this share link (was the link reset on SoundCloud?)")
          : appError("sc_playlist_private", "could not read the playlist. It may be private: on SoundCloud, open Share on the playlist and paste that link here");
      }
    }
    ids = pl.tracks.map((t: any) => t.id);
    title = pl.title || "Playlist";
    plId = Number(pl.id) || 0;
    secret = pl.secret_token || scSecret(url);
  }
  // a private playlist hands out its private tracks only when the batch names it and its secret
  const via = secret && plId ? `&playlistId=${plId}&playlistSecretToken=${encodeURIComponent(secret)}` : "";
  const tracks: Record<number, any> = await withClientId(page, async () => {
    const got: Record<number, any> = {};
    for (let i = 0; i < ids.length; i += 40) {
      const batch = ids.slice(i, i + 40).join(",");
      const url = `https://api-v2.soundcloud.com/tracks?ids=${batch}&client_id=${STATE.client_id}${via}`;
      for (const t of JSON.parse(await httpGet(url))) got[t.id] = t;
    }
    return got;
  });
  // first-seen time per track: kept across fetches; tracks already in the
  // snapshot (or in a library's very first fetch) are not "new"
  const prevAdded = new Map<number, number>();
  for (const p of prev?.tracks || []) prevAdded.set(p.id, p.added || 0);
  const now = Date.now();
  const out: PlTrack[] = [];
  for (const tid of ids) {
    const t = tracks[tid];
    if (!t) continue;   // counted below: the UI says how many could not be read
    out.push(trackFromApi(t, !prev ? 0 : prevAdded.has(tid) ? prevAdded.get(tid)! : now));
  }
  return { playlist: { title, url, tracks: out }, unreadable: ids.length - out.length };
}

/** One snapshot row from an api-v2 track object. */
function trackFromApi(t: any, added: number): PlTrack {
  return {
    id: Number(t.id),
    title: t.title || "",
    user: t.user?.username || "",
    pub_artist: t.publisher_metadata?.artist || null,
    dur: Math.floor((t.full_duration || t.duration || 0) / 1000),
    url: t.permalink_url || "",
    art: t.artwork_url || t.user?.avatar_url || "",
    buy_url: t.purchase_url || null,
    buy_title: t.purchase_title || null,
    sc_dl: !!(t.downloadable && t.has_downloads_left),
    desc_links: extractLinks(t.description || ""),
    added,
  };
}

// ---------------- soundcloud account (the Discover page) ----------------
// The desktop app shows soundcloud.com in an embedded view where the user signs in
// normally; the session's oauth_token cookie is handed to these functions per call and
// is never written to the saved data. Writes go through the same api-v2 the web player uses.

export interface ScUser { id: number; username: string; permalink: string; avatar: string; }
/** a track the embedded player reports, resolved against SoundCloud */
export interface ScNow { url: string; id: number; title: string; user: string; dur: number; art: string; }

const SC_ORIGIN = { Origin: "https://soundcloud.com", Referer: "https://soundcloud.com/" };
const SC_DISCOVER = "https://soundcloud.com/discover";

/** Signed-in calls go through the embedded SoundCloud page when one is available: SoundCloud's
 *  bot protection (DataDome) only accepts writes that carry a real browser's fingerprint and
 *  cookies. The transport runs fetch() inside that page and returns status + body text. */
export type ScTransport = (method: string, url: string, headers: Record<string, string>, body?: string) => Promise<{ status: number; body: string }>;
let scTransport: ScTransport | null = null;
/** what every SoundCloud action says while the bot check is up in the view (see main.ts) */
export const SC_CAPTCHA = "SoundCloud wants to check you are human. Open Discover and solve the check there first";
export const scCaptchaError = () => appError("sc_captcha", SC_CAPTCHA);
/** a 403's body is DataDome's challenge: {"url":"https://geo.captcha-delivery.com/captcha/?…"} */
export const scCaptchaBody = (txt: string) => /captcha-delivery\.com/i.test(String(txt || ""));
export function setScTransport(t: ScTransport | null): void { scTransport = t; }

async function ensureClientId(): Promise<string> {
  if (!STATE.client_id) {
    const page = activeLib()?.url || SC_DISCOVER;
    // any soundcloud.com page carries the scripts; the library's own may be gone or unreadable
    STATE.client_id = await scrapeClientId(await httpGet(page).catch(() => httpGet(SC_DISCOVER)));
    saveState();
  }
  return STATE.client_id;
}

/** api-v2 request, optionally as the signed-in user; rescrapes the client_id once when
 *  SoundCloud rejects it (a 401 *with* a token means the session is gone, not the id). */
async function scFetch(method: string, pathAndQuery: string, token?: string | null, body?: any): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const cid = await ensureClientId();
    const sep = pathAndQuery.includes("?") ? "&" : "?";
    const url = `https://api-v2.soundcloud.com/${pathAndQuery}${sep}client_id=${cid}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = "OAuth " + token;
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    let status: number, txt: string;
    if (token && scTransport) {
      ({ status, body: txt } = await scTransport(method, url, headers, payload));
      if (status === 0) throw appError("sc_page_failed", "SoundCloud page could not send the request: " + txt, { error: txt });
    } else {
      let r: Response;
      try { r = await fetch(url, { method, headers: { ...headers, "User-Agent": UA, ...SC_ORIGIN }, body: payload }); }
      catch (e: any) { throw appError("sc_offline", String(e?.message || e), { error: String(e?.cause?.code || e?.message || e) }); }
      status = r.status; txt = await r.text();
    }
    if (status >= 200 && status < 300) return txt ? JSON.parse(txt) : {};
    if ((status === 401 || status === 403) && attempt === 0 && !token) { STATE.client_id = null; continue; }
    const where = `${method} ${pathAndQuery.split("?")[0]}`;
    const detail = txt.replace(/\s+/g, " ").trim().slice(0, 160);
    console.error(`soundcloud ${status} on ${where}: ${txt.slice(0, 600)}`);
    if (status === 401) throw appError("sc_signed_out", "SoundCloud signed you out. Sign in again on the Discover page");
    if (status === 403 && token && scTransport && scCaptchaBody(txt)) throw scCaptchaError();   // refused in the view: solvable there
    if (status === 403) throw appError(detail ? "sc_refused_detail" : "sc_refused", `SoundCloud refused this (403 on ${where})${detail ? ": " + detail : ""}`, { where, detail });
    if (status === 404) throw appError("sc_not_found", `SoundCloud could not find that (${where})`, { where });
    throw appError(detail ? "sc_status_detail" : "sc_status", `SoundCloud answered ${status} on ${where}${detail ? ": " + detail : ""}`, { status, where, detail });
  }
}

const meCache = new Map<string, ScUser>();
/** The signed-in user behind a session token (cached per token). */
export async function scMe(token: string): Promise<ScUser> {
  const hit = meCache.get(token);
  if (hit) return hit;
  const u = await scFetch("GET", "me", token);
  if (!u || typeof u.id !== "number") throw appError("not_signed_in", "not signed in");
  const me: ScUser = { id: u.id, username: u.username || u.permalink || "", permalink: u.permalink || "", avatar: u.avatar_url || "" };
  meCache.clear(); meCache.set(token, me);
  return me;
}

const resolveCache = new Map<string, any>();
/** resolve a soundcloud.com URL to its api-v2 object (track / playlist / user); cached */
const resolveKey = (url: string) => normScUrl(url).split(/[?#]/)[0].replace(/\/+$/, "");   // keeps a share link's /s-… secret
async function scResolve(url: string): Promise<any> {
  const key = resolveKey(url);
  const hit = resolveCache.get(key);
  if (hit) return hit;
  const obj = await scFetch("GET", `resolve?url=${encodeURIComponent(key)}`);
  if (resolveCache.size > 500) resolveCache.clear();
  resolveCache.set(key, obj);
  return obj;
}

/** What the Discover bar shows for the track the embedded player reports. */
export async function scNow(url: string): Promise<ScNow | null> {
  if (!/^https?:\/\/(www\.|m\.)?soundcloud\.com\/[^\/]+\/[^\/]+/.test(url)) return null;
  const t = await scResolve(url);
  if (!t || t.kind !== "track") return null;
  return { url: t.permalink_url || url, id: t.id, title: t.title || "", user: t.user?.username || "",
           dur: Math.floor((t.full_duration || t.duration || 0) / 1000), art: t.artwork_url || t.user?.avatar_url || "" };
}

/** Whether the signed-in user may add to the active library's playlist / likes:
 *  { ok: true } or { ok: false, why }. */
export interface ScCan { ok: boolean; likes: boolean; why?: string; why_code?: string; why_vars?: Record<string, unknown>; }
/** the reason as the UI translates it: why (English), why_code and why_vars */
const cannot = (likes: boolean, code: string, why: string, vars?: Record<string, unknown>): ScCan =>
  ({ ok: false, likes, why, why_code: code, ...(vars ? { why_vars: vars } : {}) });
export async function scCanWrite(token: string): Promise<ScCan> {
  const lib = activeLib();
  if (!lib) return cannot(false, "no_library", "no library");
  const me = await scMe(token);
  await healLibUrl(lib);
  if (!lib.url) return cannot(false, "can_no_link", "This library has no SoundCloud link yet; set it with Change link… in Settings.");
  const likes = likesUser(lib.url);
  if (likes) {
    if (likes.toLowerCase() !== me.permalink.toLowerCase())
      return cannot(true, "can_other_likes", `This library follows ${likes}'s likes, but you are signed in as ${me.username}.`, { likes, me: me.username });
    return { ok: true, likes: true };
  }
  const pl = await scResolve(lib.url);
  if (!pl || pl.kind !== "playlist") return cannot(false, "can_playlist_gone", "The library's playlist could not be found on SoundCloud.");
  if (pl.user_id !== me.id)
    return pl.user?.username
      ? cannot(false, "can_not_owner", `This playlist belongs to ${pl.user.username}; you can only add to your own playlists.`, { owner: pl.user.username })
      : cannot(false, "can_not_owner_anon", "This playlist belongs to someone else; you can only add to your own playlists.");
  return { ok: true, likes: false };
}

/** Add (or remove) a track to the active library's playlist or likes as the signed-in
 *  user, then patch the snapshot so the UI shows it right away; the next refresh
 *  reconciles with SoundCloud. */
export async function scSetInPlaylist(token: string, url: string, add: boolean, alsoLike = false): Promise<any> {
  const lib = requireLib();
  if (!lib.playlist) throw appError("playlist_not_fetched", "fetch the playlist first");
  const can = await scCanWrite(token);
  if (!can.ok) throw appError(can.why_code || "bad_request", can.why || "cannot write to this playlist", can.why_vars);
  const t = await scResolve(url);
  if (!t || t.kind !== "track") throw appError("not_a_track", "that is not a SoundCloud track");
  const tid = Number(t.id);
  const me = await scMe(token);
  const have = lib.playlist.tracks.some((x) => x.id === tid);
  if (can.likes) {
    if (add && !have) await scFetch("PUT", `users/${me.id}/track_likes/${tid}`, token);
    if (!add && have) await scFetch("DELETE", `users/${me.id}/track_likes/${tid}`, token);
  } else {
    // the playlist update takes the whole track list: take SoundCloud's current one, not our snapshot,
    // and as the signed-in owner sees it (an anonymous read may leave out their private tracks)
    const pl = await scFetch("GET", `resolve?url=${encodeURIComponent(resolveKey(lib.url))}`, token);
    const ids: number[] = (pl.tracks || []).map((x: any) => Number(x.id)).filter((n: number) => n > 0);
    // tracks the read can't see (private ones) would be missing from the list we send, and
    // SoundCloud would drop them from the playlist: rather not write at all
    if (typeof pl.track_count === "number" && ids.length < pl.track_count)
      throw appError("sc_partial_playlist", `SoundCloud showed DJ HQ only ${ids.length} of the playlist's ${pl.track_count} tracks, so it was left unchanged `
        + "(saving would remove the ones it can't see). Add or remove the track on SoundCloud instead.", { seen: ids.length, total: pl.track_count, n: pl.track_count });
    const next = add ? (ids.includes(tid) ? ids : [...ids, tid]) : ids.filter((n) => n !== tid);
    if (next.length !== ids.length)   // the web player's own shape: plain ids, whole list
      await scFetch("PUT", `playlists/${pl.id}`, token, { playlist: { tracks: next } });
    resolveCache.delete(resolveKey(lib.url));
  }
  // patch the snapshot: likes list newest first, playlists in order of adding
  lib.playlist.tracks = lib.playlist.tracks.filter((x) => x.id !== tid);
  if (add) {
    const row = trackFromApi(t, Date.now());
    if (can.likes) lib.playlist.tracks.unshift(row); else lib.playlist.tracks.push(row);
    // a local file previously "found" as this track is now a real match
    for (const k of Object.keys(STATE.found)) if (STATE.found[k].id === tid) delete STATE.found[k];
  }
  saveState();
  const view = await buildView();
  view.sc_result = { id: tid, added: add, title: t.title || "", user: t.user?.username || "" };
  if (add && alsoLike && !can.likes) {   // "also like what I add": a failure here must not undo the add
    try { await setLiked(token, me, tid, true); view.sc_result.liked = true; }
    catch (e: any) { const it = errItem("", e); view.sc_result.liked = false; view.sc_result.like_error = e.message; view.sc_result.like_error_code = it.code; view.sc_result.like_error_vars = it.vars; }
  }
  return view;
}

// ---------------- likes (the Discover bar's heart, the Your Likes page) ----------------

interface LikesSnap { userId: number; at: number; ids: number[]; tracks: PlTrack[] | null; }
let likesSnap: LikesSnap | null = null;
let likesLoading: Promise<LikesSnap> | null = null;
const LIKES_TTL = 5 * 60 * 1000;

/** The signed-in user's liked track ids, newest first, cached for a few minutes
 *  (fetchLikeIds reads the public likes list, so this needs no token). */
async function likedIds(me: ScUser, force = false): Promise<LikesSnap> {
  if (!force && likesSnap && likesSnap.userId === me.id && Date.now() - likesSnap.at < LIKES_TTL) return likesSnap;
  if (likesLoading) return likesLoading;
  likesLoading = (async () => {
    try {
      await ensureClientId();
      let ids: number[];
      try { ids = await fetchLikeIds(me.id); }
      catch (e: any) {
        if (e.status !== 401 && e.status !== 403) throw e;
        STATE.client_id = null; await ensureClientId();   // stale client id: scrape it again, once
        ids = await fetchLikeIds(me.id);
      }
      likesSnap = { userId: me.id, at: Date.now(), ids, tracks: null };
      return likesSnap;
    } finally { likesLoading = null; }
  })();
  return likesLoading;
}
/** What the Discover bar may already know: the liked ids when they are fresh, else null
 *  (and a refresh starts in the background, so the next poll has them). */
export function likedIdsCached(me: ScUser): Set<number> | null {
  const fresh = likesSnap && likesSnap.userId === me.id && Date.now() - likesSnap.at < LIKES_TTL;
  if (!fresh) likedIds(me).catch(() => {});
  return likesSnap && likesSnap.userId === me.id ? new Set(likesSnap.ids) : null;
}
/** The liked tracks as snapshot rows (fetched once per likes snapshot). */
async function likedTracks(me: ScUser, force = false): Promise<PlTrack[]> {
  const snap = await likedIds(me, force);
  if (snap.tracks) return snap.tracks;
  const got: Record<number, any> = {};
  for (let i = 0; i < snap.ids.length; i += 40) {
    const arr = await scFetch("GET", `tracks?ids=${snap.ids.slice(i, i + 40).join(",")}`);
    for (const t of arr || []) got[t.id] = t;
  }
  snap.tracks = snap.ids.map((id) => got[id]).filter(Boolean).map((t) => trackFromApi(t, 0));
  return snap.tracks;
}

async function setLiked(token: string, me: ScUser, tid: number, on: boolean): Promise<void> {
  await scFetch(on ? "PUT" : "DELETE", `users/${me.id}/track_likes/${tid}`, token);
  if (likesSnap && likesSnap.userId === me.id) {   // keep the cache in step
    likesSnap.ids = likesSnap.ids.filter((x) => x !== tid);
    if (on) likesSnap.ids.unshift(tid);
    if (likesSnap.tracks) {
      likesSnap.tracks = likesSnap.tracks.filter((x) => x.id !== tid);
      if (on) { try { likesSnap.tracks.unshift(trackFromApi(await scFetch("GET", `tracks/${tid}`), 0)); } catch { likesSnap.tracks = null; } }
    }
  }
}

/** Like (or unlike) a track as the signed-in user. When the active library follows
 *  this user's likes, that is the same as adding it there, so the snapshot is patched too. */
export async function scSetLiked(token: string, url: string, on: boolean): Promise<any> {
  const me = await scMe(token);
  const lib = activeLib();
  const mine = lib && likesUser(lib.url)?.toLowerCase() === me.permalink.toLowerCase();
  if (mine && lib?.playlist) {
    const view = await scSetInPlaylist(token, url, on);
    view.sc_like = { id: view.sc_result.id, liked: on, title: view.sc_result.title };
    return view;
  }
  const t = await scResolve(url);
  if (!t || t.kind !== "track") throw appError("not_a_track", "that is not a SoundCloud track");
  await setLiked(token, me, Number(t.id), on);
  const view = await buildView();
  view.sc_like = { id: Number(t.id), liked: on, title: t.title || "", user: t.user?.username || "" };
  return view;
}

/** The Your Likes page: every track the signed-in user liked, with the file that
 *  covers it in any library (matched through the playlist, a "found" file, or by
 *  name and length like the Downloads inbox does) and the playlists it is in. */
export async function scLikesCheck(token: string, force = false): Promise<any> {
  const me = await scMe(token);
  const tracks = await likedTracks(me, force);
  const ids = new Set(tracks.map((t) => t.id));
  type Have = { lib: string; file: string; path: string; lossy: boolean; score: number | null };
  const have = new Map<number, Have>();
  const inPl = new Map<number, string[]>();
  const usedPaths = new Set<string>();
  for (const lib of STATE.libraries) {
    if (!lib.playlist) continue;
    const view = await buildView(lib);
    for (const r of view.tracks) {
      if (r.have && r.file) usedPaths.add(r.file);
      if (!ids.has(r.id)) continue;
      inPl.set(r.id, [...(inPl.get(r.id) || []), libName(lib)]);
      if (r.have && r.file && !have.has(r.id)) have.set(r.id, { lib: libName(lib), file: collDisplay(r.file), path: r.path, lossy: !!r.lossy, score: null });
    }
  }
  // the rest of the collection: a found record first, then name + length matching, with a
  // cheap shared-word filter (the collection can be large)
  const files = await scanCollection();
  const loose: LocalFile[] = [];
  for (const f of files) {
    if (usedPaths.has(f.path)) continue;
    const fnd = STATE.found["x:" + f.path];
    if (fnd && ids.has(fnd.id)) { if (!have.has(fnd.id)) have.set(fnd.id, { lib: "", file: collDisplay(f.path), path: f.path, lossy: LOSSY.test(f.fmt[0]), score: null }); }
    else loose.push(f);
  }
  const toks = tracks.map((t) => new Set(norm(`${t.user} ${t.title}`).split(" ").filter(Boolean)));
  for (const f of loose) {
    const ft = norm(f.base).split(" ").filter(Boolean);
    const cands = tracks.filter((t, i) => !have.has(t.id) && ft.some((w) => toks[i].has(w)));
    if (!cands.length) continue;
    const [t, score] = bestTrackNames([f.base], f.dur, cands);
    if (t && score >= 0.6) have.set(t.id, { lib: "", file: collDisplay(f.path), path: f.path, lossy: LOSSY.test(f.fmt[0]), score: Math.min(1, score) });
  }
  const active = activeLib();
  const rows = tracks.map((t, i) => {
    const { artist, title } = artistTitle(t);
    return { n: i + 1, id: t.id, title, artist, user: t.user, dur: fmtDur(t.dur), url: t.url, art: t.art,
             links: trackLinks(t), have: have.get(t.id) || null, in_playlist: inPl.get(t.id) || [],
             in_active: !!active?.playlist?.tracks.some((x) => x.id === t.id) };
  });
  return { user: me, fetched_at: likesSnap?.at || Date.now(), total: rows.length,
           have: rows.filter((r) => r.have).length, missing: rows.filter((r) => !r.have).length,
           likes_lib: !!(active && likesUser(active.url)?.toLowerCase() === me.permalink.toLowerCase()),
           tracks: rows };
}

// ---------------- local scan ----------------

function lookupTag(tags: Record<string, string>, key: string): string {
  for (const k of Object.keys(tags)) if (k.toLowerCase() === key) return String(tags[k]);
  return "";
}

/** One ffprobe call per file: duration + stream format + current tags. */
async function probe(p: string): Promise<{ dur: number; fmt: [string, number, number]; tags: [string, string, string] }> {
  const empty = { dur: 0, fmt: ["", 0, 0] as [string, number, number], tags: ["", "", ""] as [string, string, string] };
  try {
    const r = await run(FFPROBE, ["-v", "error", "-select_streams", "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,bits_per_sample,bits_per_raw_sample:stream_tags=artist,title,genre:format=duration:format_tags=artist,title,genre",
      "-of", "json", p], 30000);
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] || {};
    const tags = { ...(j.format?.tags || {}), ...(s.tags || {}) };
    return {
      dur: parseFloat(j.format?.duration || "0") || 0,
      // FLAC and ALAC give their depth only as bits_per_raw_sample
      fmt: [s.codec_name || "", parseInt(s.sample_rate || "0", 10) || 0, Number(s.bits_per_sample) || Number(s.bits_per_raw_sample) || 0],
      tags: [lookupTag(tags, "artist"), lookupTag(tags, "title"), lookupTag(tags, "genre")],
    };
  } catch {
    return empty;
  }
}

/** Why a file won't play on the player (null: it plays): "24-bit", "96 kHz", "FLAC unsupported",
 *  or "WAV header" for a WAV that is fine apart from its WAVE_FORMAT_EXTENSIBLE header (`wext`). */
export function compatReason(fmt: [string, number, number], devKey: string, wext = false): string | null {
  const [codec, sr, bits] = fmt;
  const d = DEVICES[devKey] || DEVICES["xdj-700"];
  if ((codec === "flac" && !d.flac) || (codec === "alac" && !d.alac)) return codec.toUpperCase() + " unsupported";
  if (codec.startsWith("pcm") || codec === "flac" || codec === "alac") {
    if (bits && bits > d.wavBits) return `${bits}-bit`;
    if (sr && !d.srs.includes(sr)) return `${sr / 1000} kHz`;
    return wext && d.wext ? "WAV header" : null;
  }
  if (codec === "mp3" || codec === "aac")
    return !sr || [32000, 44100, 48000].includes(sr) ? null : `${sr / 1000} kHz`;
  return (codec || "unknown").toUpperCase() + " unsupported";
}

/** name: the key the UI and state use (relative to its library folder, "/"-separated,
 *  prefixed with the folder name for extra folders); base: the file name alone. */
interface LocalFile { name: string; base: string; path: string; dur: number; fmt: [string, number, number]; tags: [string, string, string];
  /** musical key from the file's tags, and whether Platinum Notes processed it (null = can't tell) */
  key?: string | null; pn?: boolean | null;
  /** a WAV's LIST/INFO [artist, title] (null: it has none, so rekordbox shows no names even
   *  when its ID3 chunk has them); undefined for other formats */
  info?: [string, string] | null;
  /** a WAV's ID3 chunk [artist, title] ("" each when absent); undefined for other formats */
  id3?: [string, string] | null;
  /** the ID3 tag holds a picture, and that tag's version (0: none) */
  pic?: boolean; tagv?: number;
  /** a WAV with a WAVE_FORMAT_EXTENSIBLE header (readKeyInfo's ext) */
  wext?: boolean; }

const keyEntry = (k: ReturnType<typeof readKeyInfo>): [string | null, boolean | null, [string, string] | null, [string, string] | null, boolean, number, boolean] =>
  [k.key, k.pn, k.info ? [k.info.artist, k.info.title] : null, k.id3 ? [k.id3.artist, k.id3.title] : null, !!k.pic, k.ver || 0, !!k.ext];

async function refreshCache(p: string): Promise<void> {
  const st = fs.statSync(p);
  const pr = await probe(p);
  STATE.dur_cache[p] = [st.size, Math.floor(st.mtimeMs / 1000), pr.dur, pr.fmt, pr.tags, keyEntry(readKeyInfo(p))];
  COLL_DIRTY = true;   // the file changed under DJ HQ's own hands: the index rereads it
}

/** A library folder that can't be listed right now: "missing" (not there: an unmounted
 *  drive, a renamed folder, a cloud folder not synced yet), "unreadable" (no permission),
 *  or "empty" (readable, but no audio files in it). */
interface FolderAway { dir: string; why: "missing" | "unreadable" | "empty" | "waiting";
  /** it is the library's main folder */
  main?: true;
  /** it is on a drive that is not mounted (an unplugged disk): away, not moved or deleted */
  drive?: true; }
/** The folder is on a volume that isn't mounted right now: macOS /Volumes/<name>, a Windows
 *  drive letter, Linux /media/<user>/<name>, /run/media/<user>/<name> or /mnt/<name>. */
export function driveMissing(d: string): boolean {
  const there = (p: string) => { try { return fs.existsSync(p); } catch { return true; } };
  const abs = path.resolve(d);
  if (process.platform === "win32") { const root = path.parse(abs).root; return !!root && !there(root); }
  const seg = abs.split("/").filter(Boolean);
  if (process.platform === "darwin") return seg[0] === "Volumes" && seg.length >= 2 && !there("/" + seg.slice(0, 2).join("/"));
  if (seg[0] === "media" && seg.length >= 3) return !there("/" + seg.slice(0, 3).join("/"));
  if (seg[0] === "run" && seg[1] === "media" && seg.length >= 4) return !there("/" + seg.slice(0, 4).join("/"));
  if (seg[0] === "mnt" && seg.length >= 2) return !there("/" + seg.slice(0, 2).join("/"));
  return false;
}
export function folderTrouble(d: string): "missing" | "unreadable" | null {
  try { if (!fs.statSync(d).isDirectory()) return "missing"; }
  catch (e: any) { return e?.code === "ENOENT" || e?.code === "ENOTDIR" ? "missing" : "unreadable"; }
  try { fs.readdirSync(d); return null; } catch { return "unreadable"; }
}

/** The in-memory index of the collection: every audio file of every root, keyed by absolute
 *  path (LocalFile.name is the path). Built by scanCollection and kept between views while
 *  the watcher confirms nothing changed; any mutation or watcher event marks it dirty. */
let COLL_CACHE: { files: LocalFile[]; away: FolderAway[] } | null = null;
let COLL_DIRTY = true;
/** bumped whenever a scan found the collection changed (memoised matches key off it) */
export let COLL_VERSION = 0;
/** true while a watcher keeps the index fresh (set by watch.ts); without one every view rescans */
let WATCHING = false;
export function setWatching(on: boolean): void { WATCHING = on; if (!on) COLL_DIRTY = true; }
/** something changed under the roots (a file op of DJ HQ's, a watcher event): rescan next time */
export function collDirty(): void { COLL_DIRTY = true; }

/** Every audio file of the collection: all roots, with their subfolders where the root asks
 *  for that. With `away`, the roots that could not be listed (or came back empty) are
 *  reported there. A path reachable twice (nested roots) is listed once. */
async function scanCollection(away?: FolderAway[], sweep = true): Promise<LocalFile[]> {
  if (WATCHING && !COLL_DIRTY && COLL_CACHE) {
    away?.push(...COLL_CACHE.away);
    return COLL_CACHE.files;
  }
  const out: LocalFile[] = [];
  const got: FolderAway[] = [];
  const seenPath = new Set<string>();
  for (const r of collRoots()) {
    const d = r.path;
    const why = folderTrouble(d);
    if (why) { got.push({ dir: d, why, ...(why === "missing" && driveMissing(d) ? { drive: true as const } : {}) }); continue; }
    const list = await scanFolder(d, !!r.subfolders, sweep);
    if (!list.length) got.push({ dir: d, why: "empty" });
    for (const f of list) {
      if (seenPath.has(f.path)) continue;
      seenPath.add(f.path);
      out.push({ ...f, name: f.path });
    }
  }
  const changed = !COLL_CACHE
    || COLL_CACHE.files.length !== out.length
    || COLL_CACHE.files.some((f, i) => f.path !== out[i].path || f.dur !== out[i].dur
         || f.fmt.join() !== out[i].fmt.join() || f.tags.join("\u0000") !== out[i].tags.join("\u0000") || f.key !== out[i].key)
    || JSON.stringify(COLL_CACHE.away) !== JSON.stringify(got);
  if (changed) COLL_VERSION++;
  COLL_CACHE = { files: out, away: got };
  COLL_DIRTY = false;
  away?.push(...got);
  return out;
}

/** The collection's files for a library view (the library argument is historic: every
 *  playlist sees the whole collection). */
async function scanLocal(_lib?: Library | null, away?: FolderAway[], sweep = true): Promise<LocalFile[]> {
  return scanCollection(away, sweep);
}

/** Audio files inside a folder (and, with `recursive`, its subfolders), probed once
 *  and cached by size+mtime. Names are relative to the folder, "/"-separated. */
/** A temp file DJ HQ wrote next to a library file ("<name>.<ext>.tmp.<same ext>", see writeTags)
 *  that nothing writes any more: older than 15 minutes and not being written now. */
const STALE_TMP = /^.+\.([A-Za-z0-9]+)\.tmp\.\1$/i;
const STALE_TMP_AGE = 15 * 60 * 1000;
function staleTmp(p: string, name: string): boolean {
  if (!STALE_TMP.test(name) || LIVE_TMP.has(p)) return false;
  try { return Date.now() - fs.statSync(p).mtimeMs > STALE_TMP_AGE; } catch { return false; }
}
/** `sweep` (library folders only, never the downloads folder): a stale temp file of DJ HQ's
 *  (staleTmp) is removed, best effort. A quit in the middle of a write can leave one. */
async function scanFolder(d: string, recursive = false, sweep = false): Promise<LocalFile[]> {
  const cache = STATE.dur_cache;
  const files: LocalFile[] = [];
  const seen = new Set<string>();
  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const f = e.name;
      if (f.startsWith(".")) continue;
      const p = path.join(dir, f);
      if (e.isDirectory()) { if (recursive) await walk(p, rel + f + "/"); continue; }
      if (!e.isFile() || !AUDIO_EXT.includes(path.extname(f).toLowerCase())) continue;
      if (/\.tmp\.[^.]+$/i.test(f)) {   // in-flight rewrite by writeTags/convertAll
        if (sweep && staleTmp(p, f)) try { fs.unlinkSync(p); } catch { /* ignore */ }
        continue;
      }
      const st = fs.statSync(p);
      seen.add(p);
      const wav = path.extname(f).toLowerCase() === ".wav";
      const c = cache[p] as CacheEntry | undefined;
      // a FLAC or ALAC probed before its depth was read (bits_per_raw_sample) is probed once more
      if (!c || c[0] !== st.size || c[1] !== Math.floor(st.mtimeMs / 1000) || c.length < 5 || (!c[3][2] && /^(flac|alac)$/.test(c[3][0])))
        await refreshCache(p);
      else if (c.length < 6 || (c[5]?.length ?? 0) < 7) c[5] = keyEntry(readKeyInfo(p));   // once per older entry
      const en = cache[p] as CacheEntry;
      files.push({ name: rel + f, base: f, path: p, dur: en[2], fmt: en[3], tags: en[4],
                   key: en[5]?.[0] ?? null, pn: en[5]?.[1] ?? null, pic: !!en[5]?.[4], tagv: en[5]?.[5] ?? 0,
                   ...(wav ? { info: en[5]?.[2] ?? null, id3: en[5]?.[3] ?? null, wext: !!en[5]?.[6] } : {}) });
    }
  };
  const away = folderTrouble(d);
  if (!away) await walk(d, "");
  // A folder that is gone or lists nothing (unmounted drive, cloud folder not synced) keeps
  // its cache: dropping it would mean probing (on a cloud folder: downloading) every file again.
  if (!away && files.length) {
    const under = (k: string) => recursive ? k.startsWith(d + path.sep) : path.dirname(k) === d;
    for (const k of Object.keys(cache))
      if (under(k) && !seen.has(k)) delete cache[k];
  }
  saveState();
  return files;
}

// ---------------- matching ----------------

function norm(s: string): string {
  s = s.toLowerCase().normalize("NFKD");
  s = s.replace(/\.(wav|mp3|aiff?|flac|m4a|ogg)$/, "");
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  s = s.replace(/\b(master|extended|original mix|edit|remix|mix|feat|ft|x|the|a|free|dl|download)\b/g, " ");
  return s.split(/\s+/).filter(Boolean).join(" ");
}

/** difflib.SequenceMatcher.ratio() port (no junk heuristics — inputs are short). */
function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  let matches = 0;
  const stack: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop()!;
    const b2j = new Map<string, number[]>();
    for (let j = blo; j < bhi; j++) {
      const arr = b2j.get(b[j]);
      if (arr) arr.push(j); else b2j.set(b[j], [j]);
    }
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      for (const j of b2j.get(a[i]) || []) {
        const k = (j2len.get(j - 1) || 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = newj2len;
    }
    if (bestsize) {
      matches += bestsize;
      stack.push([alo, besti, blo, bestj]);
      stack.push([besti + bestsize, ahi, bestj + bestsize, bhi]);
    }
  }
  return (2 * matches) / (a.length + b.length);
}

function sim(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jac = inter / (ta.size + tb.size - inter);
  return 0.6 * jac + 0.4 * ratio(na, nb);
}

/** Free-download and follower-special junk: any bracket that says "free dl/download"
 *  ("[LIMITED FREE DL]", "( FREE DL )", "[FREE-DL]", "(Free DL <3)"), only those words
 *  when the bracket also credits a remix ("(KLOUD Edit FREE DL)"), a bare one at the
 *  end ("… FREE DL", "… - Free Download"), "[CRS123]". Catalogue codes elsewhere stay. */
export function cleanTitle(s: string): string {
  return s
    .replace(/\s*([\[\(])([^\]\)]*\bfree[\s_-]*(?:dl|download)\b[^\]\)]*)([\]\)])/gi, (_, o, x, c) => {
      const rest = x.replace(/\s*[-|:]?\s*\bfree[\s_-]*(dl|download)\b\s*!*/gi, " ").trim();
      return REMIX_WORD.test(rest) ? ` ${o}${rest}${c}` : " ";
    })
    .replace(/\s*[\[\(](crs\d+|[^\]\)]*follower special[^\]\)]*)[\]\)]/gi, " ")
    .replace(/\s*[-|:]?\s*\bfree[\s_-]*(dl|download)\s*!*\s*$/i, "")
    .replace(/\s+/g, " ").trim();
}

/** What stands in front of the real "Artist - Title": "Premiere:", "EE PREMIERE:",
 *  "Premiere |", "[PREMIERE]", a catalogue bracket "[DIRW11]", a vinyl side "A1.",
 *  and a catalogue number used as a first dash part when the title repeats it in
 *  brackets ("STICKYHITSVA01 - GI.O - … [STICKYHITSVA01]"; "PRADA2000 - …" is an artist). */
function stripPrefix(s: string): string {
  return s
    .replace(/^\[\s*premiere\s*\]\s*/i, "")
    .replace(/^(?:[^:|\[\]()]{1,25}?\s)?premiere\s*[:|]\s*/i, "")
    .replace(/^\[[a-z]{2,}\s?-?\d+[a-z]?\]\s*/i, "")
    .replace(/^[a-d][1-9]\s*[.)]\s+/i, "")
    .replace(/^([A-Z]{3,}[A-Z0-9]*\d{2,})\s+-\s+(?=.*\s-\s.*[\[(]\1[\])])/, "")
    .trim();
}

/** How sure the resolver is of an artist/title pair, and why (a short code the UI
 *  turns into a sentence):
 *  name-left  the uploader / SoundCloud artist is on the left of the dash (high)
 *  name-right … only on the right, so the two were swapped (high)
 *  remixer    … only named in the remix brackets: the order is kept (medium)
 *  known-left the left side is an artist confirmed elsewhere in the library (medium)
 *  known-right the right side is such an artist, order kept anyway (low)
 *  no-signal  nothing says which side is the artist (low)
 *  pipe / loose-dash  split at " | " or "x- y" with nothing to confirm it (medium)
 *  fragment   one side of the dash was empty, brackets only, or ended in a dash (low)
 *  remix-only the right side is the uploader's remix ("Title - NAME REMIX"), no artist (low)
 *  mix-only   the right side is only remix words ("Title - TRANCE REMIX"), no artist (low)
 *  pub / uploader  no dash: SoundCloud's artist field / the uploader's name
 *  file-name / no-dash  a local file's name, with / without a dash */
type NameConf = "high" | "medium" | "low";
interface Named { artist: string; title: string; conf: NameConf; why: string; }

/** lowercase letters and digits only, accents dropped ("TØM" -> "tøm", "E.T." -> "et") */
export const nameTokens = (s: string): string[] =>
  s.toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export const compact = (s: string) => nameTokens(s).join("");
/** "A, B & C x D vs E aka F feat. G" -> its names */
export const nameParts = (s: string): string[] =>
  s.split(/\s*(?:,|&|(?<=\s)x(?=\s)|\bvs\.?(?=\s)|\baka\b|\band\b|\bfeat\.?(?=\s)|\bft\.?(?=\s)|\bfeaturing\b)\s*/i)
    .map((p) => p.trim()).filter(Boolean);

/** Does the text start with the name (token runs, as nameIn)? */
function nameAtStart(name: string, text: string): boolean {
  const c = compact(name);
  let run = "";
  for (const t of nameTokens(text)) {
    run += t;
    if (run === c) return true;
    if (run.length >= c.length) return false;
  }
  return false;
}

/** Is the text the name itself, or one of the names in it ("A & B", "A x B")? */
const wholeName = (name: string, text: string) =>
  !!compact(name) && [text, ...nameParts(text)].some((p) => compact(p) === compact(name));

/** A side made of nothing but remix and style words ("TRANCE REMIX", "Extended Mix") */
const MIX_WORDS = new Set(["remix", "edit", "bootleg", "rework", "flip", "tool", "refix", "mashup", "vip", "version",
  "dub", "mix", "extended", "original", "club", "radio", "trance", "techno", "house", "hard", "hardstyle", "rave",
  "intro", "outro", "short", "instrumental", "acapella", "vocal", "sped", "speed", "up", "slowed", "the"]);
const genericMix = (s: string) => REMIX_WORD.test(s) && nameTokens(s).every((t) => MIX_WORDS.has(t));

/** A side split into what it names plainly and what it names in brackets or after
 *  "feat." (a remixer or a guest, not the artist of the track). */
function sideText(s: string): { plain: string; aside: string } {
  const aside: string[] = [];
  let plain = s.replace(/[\[(]([^\])]*)[\])]/g, (_, x) => { aside.push(x); return " "; });
  plain = plain.replace(/\b(?:feat|ft|featuring)\b\.?(.*)$/i, (_, x) => { aside.push(x); return " "; });
  return { plain, aside: aside.join(" ") };
}

/** Does the name occur in the text as whole words? Token runs, never substrings, so
 *  "E.T." doesn't match inside "Sweet"; one- and two-letter names must also appear
 *  as written, set off by spaces or punctuation. */
function nameIn(name: string, text: string): boolean {
  const c = compact(name);
  if (!c) return false;
  if (c.length <= 2) {
    const raw = name.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${raw}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text.toLowerCase());
  }
  const tk = nameTokens(text);
  for (let i = 0; i < tk.length; i++) {
    let run = "";
    for (let j = i; j < tk.length && run.length < c.length; j++) {
      run += tk[j];
      if (run === c) return true;
    }
  }
  return false;
}

/** The uploader's names: display name, the profile slug in the URL, each artist in
 *  SoundCloud's artist field. */
function uploaderNames(t: PlTrack): string[] {
  const out = [t.user || ""];
  const slug = /soundcloud\.com\/([^/?#]+)/i.exec(t.url || "")?.[1] || "";
  if (slug && !/^user-?\d+$/i.test(slug)) out.push(slug.replace(/[-_]+/g, " "));
  if (t.pub_artist) out.push(t.pub_artist, ...nameParts(t.pub_artist));
  for (const n of [...out]) { const m = /^dj\.?\s+(.+)$/i.exec(n.trim()); if (m) out.push(m[1]); } // "DJ Discostoff" is "Discostoff's Edit"
  return [...new Set(out.map((n) => n.trim()).filter((n) => compact(n).length > 0))];
}

/** Split "Artist - Title" at the first separator: a spaced dash, en or em dash (high),
 *  else " | " or "word- word" (medium; one example each in real data, so shown for
 *  a look). The left side is the artist, as before; null when there is no separator. */
function splitName(s: string): { l: string; r: string; sep: "dash" | "pipe" | "loose-dash" } | null {
  let m = /\s+[-–—]+\s+|\s[–—]|[–—]\s/.exec(s);
  if (m) return { l: s.slice(0, m.index).trim(), r: s.slice(m.index + m[0].length).trim(), sep: "dash" };
  m = /\s\|\s/.exec(s);
  if (m) return { l: s.slice(0, m.index).trim(), r: s.slice(m.index + m[0].length).trim(), sep: "pipe" };
  m = /(?<=\S)-\s+/.exec(s);
  if (m && /[\p{L}\p{N})\]]$/u.test(s.slice(0, m.index)))
    return { l: s.slice(0, m.index).trim(), r: s.slice(m.index + m[0].length).trim(), sep: "loose-dash" };
  return null;
}

/** Common clean-up and split for a SoundCloud title or a file name: junk and prefixes
 *  off, a dangling dash noted, then the split. */
function prepName(raw: string) {
  let s = stripPrefix(cleanTitle(raw));
  const dangling = /(^|\s)[-–—|]$|^[-–—|](\s|$)/.test(s);
  s = s.replace(/^[-–—|](\s+|$)|(^|\s+)[-–—|]$/g, "").trim();
  return { s, dangling, sp: splitName(s) };
}
const REMIX_WORD = /\b(remix|edit|bootleg|rework|flip|tool|refix|mashup|vip|version|dub|mix)\b/i;
const bracketOnly = (s: string) => /^[\[(][^\])]*[\])]$/.test(s);

/** Artist and title of a playlist track from what SoundCloud stores: the title, the
 *  uploader, its profile slug and the artist field. Remixes keep the convention:
 *  the artist is the left side of the dash. `known` holds names (compact) that
 *  other tracks of the same library confirmed as artists; see knownArtists. */
function artistTitle(t: PlTrack, known?: Set<string>): Named {
  const { s, dangling, sp } = prepName(t.title);
  const fallback = (t.pub_artist || t.user || "").trim();
  if (!sp) return { artist: fallback, title: s, conf: t.pub_artist ? "high" : "medium", why: t.pub_artist ? "pub" : "uploader" };
  let { l, r } = sp;
  // "Operation Blade - (SMITHERS Edit)", "- Title": put it back together, artist as without a dash
  if (!l || !r || bracketOnly(r) || bracketOnly(l))
    return { artist: fallback, title: [l, r].filter(Boolean).join(" "), conf: "low", why: "fragment" };
  const L = sideText(l), R = sideText(r);
  const names = uploaderNames(t);
  const onLeft = names.some((n) => nameIn(n, L.plain));
  const onRight = names.filter((n) => nameIn(n, R.plain));
  const aside = names.some((n) => nameIn(n, L.aside) || nameIn(n, R.aside));
  let res: Named;
  if (onLeft) res = { artist: l, title: r, conf: "high", why: "name-left" };
  // "BOOM BOOM POW - PUK REMIX": the right side is the uploader's remix, not the artist;
  // put it back together like a dash-less remix upload. "Artist - Title NAME Edit" is
  // a remixer, below.
  else if (onRight.some((n) => nameAtStart(n, R.plain)) && REMIX_WORD.test(R.plain))
    return { artist: fallback, title: `${l} (${r})`, conf: "low", why: "remix-only" };
  // the right side is the name, or one of the names in it ("Title - A & UPLOADER"), and
  // not because the left is "(X edit)" by that same person
  else if (onRight.some((n) => wholeName(n, R.plain)) && !onRight.some((n) => nameIn(n, L.aside)))
    res = { artist: r, title: l, conf: "high", why: "name-right" };
  else if (aside || onRight.length) res = { artist: l, title: r, conf: "medium", why: "remixer" };
  else if (known && nameParts(L.plain).some((p) => known.has(compact(p)))) res = { artist: l, title: r, conf: "medium", why: "known-left" };
  else if (known && nameParts(R.plain).some((p) => known.has(compact(p)))) res = { artist: l, title: r, conf: "low", why: "known-right" };
  // "Title - TRANCE REMIX": no name anywhere, the right side is only remix words
  else if (genericMix(R.plain)) return { artist: fallback, title: `${l} (${r})`, conf: "low", why: "mix-only" };
  else if (sp.sep !== "dash") res = { artist: l, title: r, conf: "medium", why: sp.sep };
  else res = { artist: l, title: r, conf: "low", why: "no-signal" };
  if (dangling) { res.conf = "low"; res.why = "fragment"; }
  return res;
}

/** Artists the library itself vouches for: the artist side of every track whose order
 *  a name confirmed, and every artist typed in by hand. Built once per view. */
function knownArtists(tracks: PlTrack[], first: Map<number, Named>): Set<string> {
  const out = new Set<string>();
  const add = (a: string) => { for (const p of nameParts(sideText(a).plain)) { const c = compact(p); if (c.length > 2) out.add(c); } };
  for (const t of tracks) {
    const n = first.get(t.id);
    if (n && (n.why === "name-left" || n.why === "name-right" || n.why === "remixer")) add(n.artist);
  }
  for (const ed of Object.values(STATE.edits)) if (ed.artist) add(ed.artist);
  return out;
}

/** Every track's name, the known-artist pass included. */
function libraryNames(tracks: PlTrack[]): Map<number, Named> {
  const first = new Map(tracks.map((t) => [t.id, artistTitle(t)] as [number, Named]));
  const known = knownArtists(tracks, first);
  for (const t of tracks) {
    const n = first.get(t.id)!;
    if (n.why === "no-signal" || n.why === "pipe" || n.why === "loose-dash" || n.why === "mix-only") first.set(t.id, artistTitle(t, known));
  }
  return first;
}

/** Worth a look in Check names: nothing confirms the order, or a risky split. */
const nameNeedsLook = (n: Named) => n.conf === "low" || n.why === "pipe" || n.why === "loose-dash";
/** A row's Check names flag and the reason shown for it: the derivation's doubts, or the
 *  file already carrying a different name (unless the user typed the name, or kept DJ
 *  HQ's having seen that very difference). */
function nameLook(nm: Named, ed: AppState["edits"][string] | undefined, hand: boolean, confirmed: boolean,
                  differs: { file_artist: string; file_title: string } | null): { check: boolean; why: string } {
  if (hand) return { check: false, why: nm.why };
  if (differs && !keptOver(ed, confirmed, differs)) return { check: true, why: "file-differs" };
  return { check: !confirmed && nameNeedsLook(nm), why: nm.why };
}
/** The key a confirmed (kept as is) name is stored under in edits[].ok */
const nameSig = (artist: string, title: string) => `${artist}\t${title}`;
/** A hand edit: values typed in or swapped (an entry with only `ok` is a confirmation) */
const handEdit = (ed: AppState["edits"][string] | undefined) => !!ed && !!(ed.artist || ed.title);

/** the same name apart from case, punctuation and junk words; a name made only of what
 *  norm() strips (non-Latin script, "The Edit") is compared as written, case aside, so it
 *  never equals an empty field */
const looseEq = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x || y ? x === y : a.trim().toLowerCase() === b.trim().toLowerCase();
};
/** exact, apart from runs of spaces: for names the user typed or swapped, which should
 *  end up in the file as they are, junk words included */
const sameName = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
/** which of artist / title the user typed or swapped (only those are compared and written exactly) */
const handFields = (ed: AppState["edits"][string] | undefined): [boolean, boolean] => [!!ed?.artist, !!ed?.title];
/** the file's own artist / title when it says something else than the row's (both
 *  shown then, so the user sees the whole name the file has); null when it agrees */
function fileDiffers(f: LocalFile, artist: string, title: string): { file_artist: string; file_title: string } | null {
  const da = differingName(f, 0, artist), dt = differingName(f, 1, title);
  return da || dt ? { file_artist: da || ownNames(f, 0)[0] || "", file_title: dt || ownNames(f, 1)[0] || "" } : null;
}
/** the file's own artist (0) or title (1), non-empty ones only: ffprobe's (a WAV's INFO
 *  when it has one) first, then a WAV's ID3 chunk, which ffprobe hides next to INFO */
const ownNames = (f: LocalFile, i: 0 | 1) => [f.tags[i].trim(), (f.id3?.[i] || "").trim()].filter(Boolean);
/** one of those that says something else than `want` (an empty `want` writes nothing over) */
const differingName = (f: LocalFile, i: 0 | 1, want: string) => want ? ownNames(f, i).find((v) => !looseEq(v, want)) : undefined;

/** What tagging a file writes, decided in one place for Write tags and the pipeline.
 *  A derived (or kept) name that only differs from the file's in spelling (case,
 *  punctuation, junk words) leaves the file's spelling: the file is usually the better
 *  source of capitals. A hand-typed field is written exactly. An empty name writes the
 *  file's own. `replaces`: a non-empty artist or title in the file would give way to a
 *  different name; `hand`: the user chose every such name (typed the field, or kept DJ HQ's
 *  name having seen the file's: `decided`), so it is written without asking. */
export interface TagPlan { artist: string; title: string; replaces: boolean; hand: boolean; }
function tagPlan(f: LocalFile, artist: string, title: string, hand: [boolean, boolean], decided = false): TagPlan {
  const pick = (i: 0 | 1, want: string, h: boolean) => {
    const cur = ownNames(f, i)[0] || "";
    return !want ? cur : !h && cur && looseEq(cur, want) ? cur : want;
  };
  const a = pick(0, artist, hand[0]), t = pick(1, title, hand[1]);
  const differs = [!!differingName(f, 0, a), !!differingName(f, 1, t)];
  const replaces = differs[0] || differs[1];
  return { artist: a, title: t, replaces, hand: replaces && (decided || ((!differs[0] || hand[0]) && (!differs[1] || hand[1]))) };
}
/** Keep in Check names with the file's different name on screen: DJ HQ's name was chosen over it */
const keptOver = (ed: AppState["edits"][string] | undefined, confirmed: boolean, differs: ReturnType<typeof fileDiffers>) =>
  confirmed && !!differs && ed?.file === nameSig(differs.file_artist, differs.file_title);

/** Artist/title for a local file that isn't in the playlist, from "Artist - Title.ext"
 *  (no uploader to check against, so a clean dash split is trusted). */
function extraName(f: LocalFile): Named {
  const { s, dangling, sp } = prepName(f.base.replace(/\.[^.]+$/, ""));
  if (!sp) return { artist: "", title: s, conf: "medium", why: "no-dash" };
  if (dangling || !sp.l || !sp.r || bracketOnly(sp.r) || bracketOnly(sp.l))
    return { artist: "", title: [sp.l, sp.r].filter(Boolean).join(" "), conf: "low", why: "fragment" };
  return { artist: sp.l, title: sp.r, conf: sp.sep === "dash" ? "high" : "medium", why: sp.sep === "dash" ? "file-name" : sp.sep };
}

/** extraName overridden by an inline edit */
function extraArtistTitle(f: LocalFile): [string, string] {
  let { artist: a, title: t } = extraName(f);
  const ed = STATE.edits["x:" + f.path];
  if (ed) { a = ed.artist || a; t = ed.title || t; }
  return [a, t];
}

// ---------------- purchase / free-download links ----------------

/** Download gates and file hosts: a link there is a free download whatever it's called. */
const FREE_HOSTS = /(^|\.)(hypeddit\.com|droploud\.com|downloadgater\.com|gaterush\.me|gatekit\.pro|toneden\.io|fangate\.eu|powergate\.me|pumpyoursound\.com|drive\.google\.com|dropbox\.com|wetransfer\.com|we\.tl|mega\.nz|mediafire\.com|1drv\.ms)$/i;
/** Shops, and smart links that fan out to shops/streaming. */
const SHOP_HOSTS = /(^|\.)(bandcamp\.com|beatport\.com|junodownload\.com|traxsource\.com|lnk\.to|ffm\.to|fanlink\.to|bfan\.link|hyperfollow\.com|push\.fm|smarturl\.it|lnk\.site|ditto\.fm|orcd\.co|found\.ee|li\.sten\.to|songwhip\.com|song\.link|album\.link|linkfire\.com|lnkfi\.re)$/i;
/** Socials, streaming, profile hubs: never where you get the file. */
const NOISE_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|youtu\.be|spotify\.com|spotify\.link|paypal\.com|paypal\.me|ko-fi\.com|buymeacoffee\.com|gofundme\.com|komi\.io|apple\.com|deezer\.com|tidal\.com|soundcloud\.com|snd\.sc|linktr\.ee|linksr\.io|lnk\.bio|beacons\.ai|ra\.co|discord\.gg|discord\.com|t\.me|telegram\.me|patreon\.com|mixcloud\.com|twitch\.tv|threads\.net|managerone\.io|amazon\.com|shazam\.com)$/i;
const FREE_WORDS = /\bfree\b|\bdl\b|download|gratis/i;
const BUY_WORDS = /\bbuy|purchase|pre-?order|out now|available|support|shop|stream/i;

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/** A Hypeddit download gate: the only host the automated free download knows how to walk. */
export const isHypeddit = (url: string) => /(^|\.)hypeddit\.com$/i.test(hostOf(url));

/** Candidate "get the track here" links in a description: [url, its line, the
 *  line before it]. Socials/streaming are dropped; scheme-less URLs only count
 *  for known hosts (descriptions are full of "www.instagram.com/..."). */
export function extractLinks(desc: string): [string, string, string][] {
  const out: [string, string, string][] = [];
  let prev = "";
  for (const raw of (desc || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const re = /(https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s<>"'\)\]]*)?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      let url = m[0].replace(/[.,;:!?]+$/, "");
      let host = m[2].toLowerCase();
      // SoundCloud's redirect around a link, copied into a description
      if (/^(gate\.sc|exit\.sc)$/.test(host)) {
        let to = "";
        try { to = new URL(m[1] ? url : "https://" + url).searchParams.get("url") || ""; } catch { /* not a link */ }
        if (!/^https?:\/\//i.test(to)) continue;
        url = to; host = hostOf(to); m[1] = "https://";
      }
      if (NOISE_HOSTS.test(host) || /^https?:\/\/docs\.google\.com\/forms\//i.test(url)) continue;
      if (!m[1]) {
        if (!FREE_HOSTS.test(host) && !SHOP_HOSTS.test(host)) continue;
        url = "https://" + url;
      }
      if (!out.some((o) => o[0] === url)) out.push([url, line, prev]);
      if (out.length >= 6) return out;
    }
    prev = line;
  }
  return out;
}

function wordKind(s: string): "free" | "buy" | null {
  const f = FREE_WORDS.test(s), b = BUY_WORDS.test(s);
  if (f && b) return /\bfree\b/i.test(s) ? "free" : "buy"; // "free dl" beats "support"; "stream/download" is a shop
  return f ? "free" : b ? "buy" : null;
}

/** Host is decisive for gates/file hosts; otherwise the words on the link's own
 *  line, then the line above ("FREE DOWNLOAD:\nhttps://..."), then shop hosts. */
function classify(host: string, line: string, prev: string): "free" | "buy" | null {
  if (FREE_HOSTS.test(host)) return "free";
  return wordKind(line) || wordKind(prev) || (SHOP_HOSTS.test(host) ? "buy" : null);
}

export interface BuyLink {
  url: string; kind: "free" | "buy"; label: string; title: string; host: string;
  /** format the link text or shop makes certain: "WAV", "AIFF", "FLAC", "lossless", "MP3" */
  fmt: string | null;
  /** SoundCloud's own download button (its title is the english "Download on SoundCloud"; the ui says it in its language) */
  sc_dl?: boolean;
  /** the file can be downloaded without a page (see directdl.ts) */
  direct?: DirectKind;
  /** found by the Bandcamp search, not given by the uploader */
  found?: boolean;
}

export type DirectKind = "drive" | "dropbox" | "file" | "soundcloud";
/** The id of a file shared on Google Drive ("" for a folder or anything else) */
export function driveFileId(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return ""; }
  if (!/^(drive|docs)\.google\.com$/i.test(u.hostname)) return "";
  const id = /^\/(?:a\/[^/]+\/)?(?:u\/\d+\/)?file\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(u.pathname)?.[1]
    || (/^\/(?:u\/\d+\/)?(?:open|uc)$/.test(u.pathname) ? u.searchParams.get("id") || "" : "");
  return /^[\w-]{10,}$/.test(id) ? id : "";
}
/** What DJ HQ downloads itself: one file on Drive or Dropbox, or an https link straight to audio or a zip */
export function directKind(url: string): Exclude<DirectKind, "soundcloud"> | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (driveFileId(url)) return "drive";
  if (/(^|\.)dropbox\.com$/i.test(u.hostname)) return /^\/(s|scl\/fi)\//i.test(u.pathname) ? "dropbox" : null;
  // a name with a dot that is no IP address: never something on this computer or its network
  return u.protocol === "https:" && !u.port && /\.(wav|mp3|aiff?|flac|zip)$/i.test(u.pathname)
    && /\.[a-z]{2,}$/i.test(u.hostname) && !/\.(local|localhost|internal|lan|home)$/i.test(u.hostname) ? "file" : null;
}

const FMT_WORDS: [RegExp, string][] = [
  [/\bwavs?\b/i, "WAV"], [/\baiff?\b/i, "AIFF"], [/\bflac\b/i, "FLAC"],
  [/lossless|hi-?res|24[ -]?bit/i, "lossless"], [/\bmp3s?\b|\b320\b/i, "MP3"],
];
const BANDCAMP = /(^|\.)bandcamp\.com$/i;
function fmtHint(words: string, host: string): string | null {
  for (const [re, label] of FMT_WORDS) if (re.test(words)) return label;
  return BANDCAMP.test(host) ? "lossless" : null; // Bandcamp buyers pick WAV / FLAC / AIFF
}

/** an artist's Bandcamp page, not a release on it */
const bandcampRoot = (url: string) => { try { return !/^\/(track|album)\//i.test(new URL(url).pathname); } catch { return true; } };
/** Preference within a kind: a Bandcamp release over other shops over smart links over a bare
 *  Bandcamp page; a free download known to be lossless over unknown over known MP3, and one
 *  without a gate over one behind a gate (unless only the gate is known to be lossless). */
function linkRank(l: BuyLink): number {
  if (l.kind === "buy")
    return BANDCAMP.test(l.host) ? (bandcampRoot(l.url) ? 0 : 3) : /(^|\.)(beatport|junodownload|traxsource)\.com$/i.test(l.host) ? 2 : 1;
  return l.direct ? (l.fmt === "MP3" ? 1.5 : l.fmt ? 4 : 3) : l.fmt === "MP3" ? 0 : l.fmt ? 2 : 1;
}

/** Where to get the track, at most one buy and one free link: the uploader's
 *  purchase button, links found in the description, SoundCloud's own
 *  download button, then what the Bandcamp search found; within a kind the better-ranked link wins. Buy sorts
 *  first: shops sell lossless files, free downloads are often MP3. */
export function trackLinks(t: PlTrack): BuyLink[] {
  const out: BuyLink[] = [];
  const add = (url: string, kind: "free" | "buy", title: string, host: string, scDl = false, found = false) => {
    if (out.some((o) => o.url === url)) return;
    const l: BuyLink = { url, kind, label: kind === "free" ? "Free DL" : "Buy", title, host, fmt: fmtHint(title, host) };
    if (scDl) l.sc_dl = true;
    if (found) l.found = true;
    const direct = scDl ? "soundcloud" : kind === "free" ? directKind(url) : null;
    if (direct) l.direct = direct;
    const i = out.findIndex((o) => o.kind === kind);
    if (i < 0) out.push(l);
    else if (linkRank(l) > linkRank(out[i])) out[i] = l;
  };
  if (t.buy_url && /^https?:\/\//i.test(t.buy_url)) {
    const host = hostOf(t.buy_url);
    if (host) {
      const title = (t.buy_title || "").trim();
      add(t.buy_url, FREE_WORDS.test(title) || FREE_HOSTS.test(host) ? "free" : "buy", title, host);
    }
  }
  for (const [url, line, prev] of t.desc_links || []) {
    const host = hostOf(url);
    const kind = host ? classify(host, line, prev) : null;
    if (!kind) continue;
    // tooltip: the words around the link; never a bare URL (e.g. the Instagram line above it)
    const words = (s: string) => s.replace(/(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?/gi, "")
      .replace(/^[\s\-:>⬇→\[\]()]+|[\s\-:>⬇→\[\]()]+$/g, "").trim();
    const ctx = words(line) || words(prev);
    add(url, kind, ctx.slice(0, 80), host);
  }
  if (t.sc_dl && t.url) add(t.url, "free", "Download on SoundCloud", "soundcloud.com", true);
  const bc = bandcampFound(t.id);
  if (bc?.url) add(bc.url, bc.free ? "free" : "buy", bc.title || "", hostOf(bc.url), false, true);
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "buy" ? -1 : 1));
}

/** One of a track's links, by its address: the only thing a download request may name. The track
 *  is one of a library's, or of the likes list. `name`: a file name for a server that gives none. */
export function knownLink(id: string, url: string): { id: number; url: string; name: string; link: BuyLink } | null {
  const t = [...STATE.libraries.flatMap((l) => l.playlist?.tracks || []), ...(likesSnap?.tracks || [])].find((x) => String(x.id) === id);
  const link = t && trackLinks(t).find((l) => l.url === url);
  if (!t || !link) return null;
  const nm = artistTitle(t);
  return { id: t.id, url: t.url, name: [nm.artist, nm.title].filter(Boolean).join(" - "), link };
}
/** Where SoundCloud's download button gets the file (signed in; a short-lived address) */
export async function scDownloadUrl(token: string, id: number, trackUrl: string): Promise<string> {
  const secret = scSecret(trackUrl);
  const r = await scFetch("GET", `tracks/${id}/download${secret ? "?secret_token=" + encodeURIComponent(secret) : ""}`, token);
  const u = String(r?.redirectUri || "");
  if (!/^https:\/\//i.test(u)) throw appError("sc_no_download", "SoundCloud gave no file for this track");
  return u;
}
/** The links on an uploader's SoundCloud profile */
export async function scProfileLinks(profile: string): Promise<string[]> {
  if (!profile) return [];
  const u = await scFetch("GET", "resolve?url=" + encodeURIComponent(profile));
  if (u?.kind !== "user" || typeof u.id !== "number") return [];
  const list = await scFetch("GET", `users/soundcloud:users:${u.id}/web-profiles`);
  return Array.isArray(list) ? list.map((x: any) => String(x?.url || "")).filter(Boolean) : [];
}

/** The active library's tracks worth a Bandcamp search: missing ones (not found links that are
 *  good already) and lossy files, newest first; with an id that track alone, whatever it has. */
export async function bandcampWanted(id?: string): Promise<{ id: number; artist: string; title: string; names: string[]; dur: number; prio: number; profile: string; hosts: string[] }[]> {
  const lib = requireLib();
  const view = await buildView(lib);
  const rows = new Map<number, any>((view.tracks || []).map((r: any) => [r.id, r]));
  const out = [];
  for (const t of lib.playlist?.tracks || []) {
    const r = rows.get(t.id);
    if (!r || (id !== undefined && String(t.id) !== id)) continue;
    const good = (r.links as BuyLink[]).some((l) => (l.kind === "buy" && linkRank(l) >= 2) || (l.found && l.kind === "free"));
    if (id === undefined && (good || (r.have && !r.lossy))) continue;
    const slug = /soundcloud\.com\/([^/?#]+)/i.exec(t.url || "")?.[1] || "";
    const names = [...new Set([...nameParts(r.artist), r.artist, ...uploaderNames(t)].map((n: string) => n.trim()).filter((n) => compact(n)))];
    const hosts = [...new Set([t.buy_url || "", ...(t.desc_links || []).map((d) => d[0])].map(hostOf).filter((h) => /\.bandcamp\.com$/i.test(h)))];
    out.push({ row: r, w: { id: t.id, artist: r.artist, title: r.title, names, dur: t.dur, prio: r.have ? 2 : r.links.length ? 1 : 0, profile: slug ? "https://soundcloud.com/" + slug : "", hosts } });
  }
  return out.sort((a, b) => Number(a.row.have) - Number(b.row.have) || (b.row.added || 0) - (a.row.added || 0)).map((x) => x.w);
}
/** the rules a Bandcamp page has to pass (bandcamp.ts): findings made under older ones don't count and are looked up again */
export const BANDCAMP_RULES = 2;
export function bandcampFound(id: number) {
  const r = STATE.bandcamp?.[String(id)];
  return r?.url && r.v === BANDCAMP_RULES ? r : null;
}
/** the links a track of any library has now */
export function linksOf(id: number): BuyLink[] {
  for (const l of STATE.libraries) { const t = l.playlist?.tracks.find((x) => x.id === id); if (t) return trackLinks(t); }
  return [];
}
export const bandcampNo = (id: number, url: string) => !!STATE.bandcamp?.[String(id)]?.no?.includes(url);
/** "Not this track" on a link the Bandcamp search found: that page is never offered for it again */
export async function bandcampReject(data: any): Promise<any> {
  const tid = String(data.id), rec = STATE.bandcamp?.[tid];
  if (rec?.url) {
    const t = activeLib()?.playlist?.tracks.find((x) => String(x.id) === tid);
    STATE.bandcamp![tid] = { at: Date.now(), sig: rec.sig, v: BANDCAMP_RULES, no: [...(rec.no || []), rec.url].slice(-20) };
    // a track marked not available stays so: the link went away because the user said so
    if (STATE.na[tid] && t) STATE.na[tid].sig = linksSig(trackLinks(t));
    saveState();
  }
  return buildView();
}

const linksSig = (ls: BuyLink[]) => ls.map((l) => l.url).sort().join("|");
const LOSSY = /^(mp3|aac|vorbis|opus|wma)/;

/** The file's tags match the names here: loosely (tagPlan keeps the file's spelling),
 *  exactly for a field the user typed (`hand`). An empty name is never written (the
 *  file's own stays), so it isn't compared either. A WAV also needs its LIST/INFO chunk
 *  to carry them: rekordbox reads nothing else there, and Platinum Notes' rewrite drops
 *  it while leaving the ID3 chunk, which ffprobe (and so f.tags) still reads. */
function isTagged(f: LocalFile, artist: string, title: string, genre: string, hand: [boolean, boolean] = [false, false]): boolean {
  const eq = (h: boolean) => h ? sameName : looseEq;
  const info = f.info === undefined || (!!f.info && (!artist || looseEq(f.info[0], artist)) && (!title || looseEq(f.info[1], title)));
  return info && (!artist || eq(hand[0])(f.tags[0], artist)) && (!title || eq(hand[1])(f.tags[1], title))
    && (!genre || looseEq(f.tags[2], genre));
}

// ---------------- tagging & conversion ----------------

/** MD5 of the stored audio packets (the compressed frames, or the PCM for WAV/AIFF).
 *  Deliberately not the decoded audio: decoding depends on container details that a
 *  rewrite legitimately normalises (a missing Xing header, a wrong ID3 size, junk
 *  before the first frame), which made bit-identical rewrites look "changed". */
async function audioMd5(p: string): Promise<string> {
  const r = await run(FFMPEG, ["-v", "error", "-i", p, "-map", "0:a", "-c", "copy", "-f", "md5", "-"], 120000);
  return r.stdout.trim();
}

async function probeDuration(p: string): Promise<number> {
  const r = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1", p], 30000);
  return parseFloat(r.stdout.trim()) || 0;
}

function metaArgs(artist: string, title: string, genre: string): string[] {
  const out: string[] = [];
  for (const [k, v] of [["title", title], ["artist", artist], ["genre", genre]] as const)
    if (v) out.push("-metadata", `${k}=${v}`);
  return out;
}

/** The file's ID3 tag with title, artist and genre replaced (the given ones) and
 *  every other frame kept: Mixed In Key's key and energy, comments, cover art,
 *  Serato data, Platinum Notes' marker. ID3v2.3/UTF-16, which rekordbox reads. */
function mergedTag(p: string, artist: string, title: string, genre: string): Buffer {
  const set = ([["TPE1", artist], ["TIT2", title], ["TCON", genre]] as const).filter(([, v]) => v).map(([id]) => id);
  return buildId3v23(artist, title, genre, carriedFrames(p, set));
}

const ID3_EXT = [".wav", ".mp3", ".aiff", ".aif"];

/** Rewrite the file with new tags, bit-perfect audio (MD5-verified). WAV gets a
 *  RIFF INFO chunk (from ffmpeg) plus an `id3 ` chunk (rekordbox ignores anything
 *  else), aiff an `ID3 ` chunk, mp3 a leading tag: in all three DJ HQ writes the
 *  ID3 tag itself (mergedTag), because ffmpeg would drop frames it doesn't know
 *  (GEOB) and turn COMM into TXXX. The WAV/AIFF chunks ffmpeg doesn't write
 *  (Platinum Notes' PLTN, cues, bext) are carried over. flac/m4a/ogg: native tags.
 *  An mp3/aiff with no ID3v2.3/2.4 tag (none at all, ID3v2.2, ID3v1 only, AIFF text
 *  chunks only) has nothing to carry frame by frame: ffmpeg copies what it can read.
 *  `same(v, i)`: the file's own artist (0) / title (1) `v` already says the name, so that
 *  INFO field or ID3 frame stays as it is (its spelling, every value of a multi-value
 *  frame): Write tags in every file. The file keeps its mode, birth date and extended
 *  attributes (Finder tags), since the new copy replaces it by rename. */
async function writeTags(p: string, artist: string, title: string, genre: string,
                         same?: (v: string, i: 0 | 1) => boolean): Promise<void> {
  const ext = path.extname(p).toLowerCase();
  const own = ext === ".wav" || (ID3_EXT.includes(ext) && id3Version(p) >= 3); // DJ HQ writes the ID3 tag
  const md5 = await audioMd5(p);
  if (!md5) throw appError("checksum_failed", "could not checksum audio");
  const tmp = staleGone(p + ".tmp" + ext);
  const args = ["-y", "-v", "error", "-i", p];
  if (ext === ".wav") {
    // the file's metadata is mapped through, so the INFO fields DJ HQ doesn't set (album,
    // date, comment, track) stay; ffmpeg writes only INFO ids, never the ID3 frames. The
    // INFO chunk's own values are handed back by id: mapped, the ID3 chunk's would win.
    const info = infoFields(p) || [], iv = (id: string) => info.find(([k]) => k === id)?.[1].trim() || "";
    const a = same && same(iv("IART"), 0) ? "" : artist, t = same && same(iv("INAM"), 1) ? "" : title;
    const set = [a && "IART", t && "INAM", genre && "IGNR"];
    args.push("-map", "0:a", "-c", "copy", ...metaArgs(a, t, genre));
    for (const [k, v] of info) if (v && !set.includes(k)) args.push("-metadata", `${k}=${v}`);
    args.push("-fflags", "+bitexact", "-flags:a", "+bitexact");
  } else if (own) {
    args.push("-map", "0:a", "-c", "copy", "-map_metadata", "-1");
    if (ext === ".mp3") args.push("-id3v2_version", "0");
  } else {
    args.push("-map", "0", "-c", "copy", ...metaArgs(artist, title, genre));
    if (ext === ".mp3") args.push("-id3v2_version", "3");
    if (ext === ".aiff" || ext === ".aif") args.push("-write_id3v2", "1", "-id3v2_version", "3");
    // ffmpeg would keep a v2.2 key only as TXXX "TKE", which readKeyInfo doesn't read
    const key = ID3_EXT.includes(ext) ? readKeyInfo(p).key : null;
    if (key) args.push("-metadata", `TKEY=${key}`);
  }
  args.push(tmp);
  // a field whose own ID3 frame says the name already is carried (mergedTag gets "")
  const ids = own && same ? id3Names(p) : null;
  const ia = ids && same!(ids[0], 0) ? "" : artist, it = ids && same!(ids[1], 1) ? "" : title;
  // an mp3 with a tag of its own: the audio bytes are copied as they are (see copyAfterTag)
  const raw = own && ext === ".mp3";
  const r = raw ? { code: 0, stderr: "" } : await run(FFMPEG, args, 300000);
  try {
    if (raw) copyAfterTag(p, tmp);
    if (r.code !== 0) throw appError("ffmpeg_failed", "ffmpeg: " + r.stderr.slice(0, 200), { error: r.stderr.slice(0, 200) });
    if (own && ext === ".mp3") prependTag(tmp, mergedTag(p, ia, it, genre));
    else if (own)
      appendChunks(tmp, [{ id: ext === ".wav" ? "id3 " : "ID3 ", data: mergedTag(p, ia, it, genre) },
                         ...carriedChunks(p, true, true)]);
    if (ext === ".wav") plainWav(tmp);
    if ((await audioMd5(tmp)) !== md5) throw appError("audio_would_change", "audio data would change, left untouched");
    await keepFileMeta(p, tmp);
    fs.renameSync(tmp, p);   // in here: a rename that fails (a locked file) leaves no copy behind
  } catch (e) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw e;
  } finally { LIVE_TMP.delete(tmp); }
  await refreshCache(p);
}

/** What the rename of a rewritten copy over `p` would lose: its mode, its birth date (an
 *  earlier mtime pulls the birth time back on APFS/HFS+; then mtime becomes now) and, on
 *  macOS, its extended attributes (Finder tags, "where from"). Best effort: never fails a write. */
async function keepFileMeta(p: string, tmp: string): Promise<void> {
  try {
    const st = fs.statSync(p);
    fs.chmodSync(tmp, st.mode & 0o7777);
    const now = new Date();
    if (st.birthtimeMs > 0) { fs.utimesSync(tmp, st.atime, st.birthtime); fs.utimesSync(tmp, st.atime, now); }
  } catch { /* ignore */ }
  if (process.platform !== "darwin") return;
  const names = (await run("/usr/bin/xattr", [p], 10000).catch(() => null))?.stdout.split("\n").filter(Boolean) || [];
  for (const n of names) {
    const v = await run("/usr/bin/xattr", ["-px", n, p], 10000).catch(() => null);
    if (v && v.code === 0) await run("/usr/bin/xattr", ["-wx", n, v.stdout.replace(/\s+/g, ""), tmp], 10000).catch(() => null);
  }
}

// ---------------- cover art ----------------

/** Why Add cover art leaves a file alone ("add": it gets one): it has a picture already
 *  (never replaced), its track has no artwork on SoundCloud (an uploader's avatar doesn't
 *  count), DJ HQ doesn't write its tag itself (FLAC, M4A, OGG; an MP3/AIFF with an ID3v2.2
 *  tag or none), or it isn't tagged yet (a WAV without an ID3 chunk too: Write tags gives
 *  it one). Extras have no track to take the artwork from. */
type ArtWhy = "add" | "has_pic" | "no_art" | "format" | "untagged";
const ART_LEFT = ["has_pic", "untagged", "format", "no_art", "extra"] as const;
const artworkUrl = (u: string) => /^https?:\/\/[^\/?#]+\/(?:[^?#]*\/)?artworks-[^\/?#]+$/i.test(u || "");
function artReason(f: LocalFile, art: string, tagged: boolean): ArtWhy {
  if (f.pic) return "has_pic";
  if (!artworkUrl(art)) return "no_art";
  const ext = path.extname(f.path).toLowerCase();
  if (!ID3_EXT.includes(ext)) return "format";
  if (!tagged) return "untagged";
  if ((f.tagv || 0) < 3) return ext === ".wav" ? "untagged" : "format";
  return "add";
}
/** the view's count for the Prepare page: files that get a picture, and the rest by reason */
function artCounts(rows: any[], extras: number): { add: number; left: Record<string, number> } {
  const left: Record<string, number> = Object.fromEntries(ART_LEFT.map((k) => [k, 0]));
  let add = 0;
  for (const r of rows) if (r.art_why === "add") add++; else if (r.art_why) left[r.art_why]++;
  left.extra = extras;
  return { add, left };
}

/** The sizes asked for, best first: 500x500 (above the 240x240 rekordbox exports to players,
 *  under the 800x800 older players read from a file), 300x300, then the link as stored
 *  ("-large", 100x100). Never "-original": up to 4000x4000 and several MB. Any host, as the
 *  name alone carries the size. */
function artSizes(url: string): string[] {
  const m = /^(.*\/artworks-[^\/?#]*?)-[a-z0-9]+\.(?:jpe?g|png)$/i.exec(url);
  return [...new Set(m ? [m[1] + "-t500x500.jpg", m[1] + "-t300x300.jpg", url] : [url])];
}
const ART_MAX = 2 * 1024 * 1024, ART_TIMEOUT = 15000;
interface Picture { mime: string; data: Buffer; }
/** the picture's type from its first bytes (the server's Content-Type is not trusted) */
function pictureMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}
/** A track's artwork: a plain GET of the public image (no cookies, no SoundCloud session),
 *  the next size down only when one doesn't exist (404/410: a 429 or 403 is an error, so a
 *  later run tries 500x500 again rather than a small picture going in for good), a JPEG
 *  or PNG under 2 MB or an error. The body is counted as it arrives: a server that sends
 *  no length can't fill memory. */
async function fetchArt(url: string): Promise<Picture> {
  let status = 0;
  for (const u of artSizes(url)) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(Object.assign(new Error("timed out"), { name: "TimeoutError" })), ART_TIMEOUT);
    let b: Buffer;
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: ctl.signal });
      if (r.status === 404 || r.status === 410) { status = r.status; await r.body?.cancel().catch(() => {}); continue; }
      if (!r.ok) { await r.body?.cancel().catch(() => {}); throw appError("art_http", `HTTP ${r.status} fetching the artwork`, { status: r.status }); }
      const tooLarge = () => appError("art_too_large", "the artwork is larger than 2 MB");
      if (Number(r.headers.get("content-length")) > ART_MAX) { await r.body?.cancel().catch(() => {}); throw tooLarge(); }
      const parts: Buffer[] = [];
      let n = 0;
      if (r.body) for await (const c of r.body as any) {
        n += c.length;
        if (n > ART_MAX) { ctl.abort(); throw tooLarge(); }
        parts.push(Buffer.from(c));
      }
      b = Buffer.concat(parts);
    } catch (e: any) {
      if (e?.code && /^art_/.test(e.code)) throw e;
      const timedOut = e?.name === "TimeoutError" || ctl.signal.reason?.name === "TimeoutError";
      // undici hides the reason in its cause (an AggregateError when every address was refused)
      if (timedOut) throw appError("art_timeout", "the artwork download timed out");
      const why = String(e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.message || e);
      throw appError("art_download", "could not download the artwork: " + why, { error: why });
    } finally { clearTimeout(timer); }
    const mime = pictureMime(b);
    if (!mime || b.length < 64) throw appError("art_not_image", "the artwork link did not return a JPEG or PNG picture");
    return { mime, data: b };
  }
  throw appError("art_http", `HTTP ${status} fetching the artwork`, { status });
}

/** Add one picture to a file that has none: its ID3 tag gets an APIC frame and keeps every
 *  other frame byte for byte (pictureTag); an MP3's audio bytes are copied as they are, a
 *  WAV's or AIFF's other chunks (LIST/INFO, PLTN, unknown ones) too. Checked before the
 *  copy replaces the file: the old frames plus the new one, the other chunks unchanged,
 *  the audio MD5. Mode, birth date and extended attributes are kept (keepFileMeta). */
async function writePicture(p: string, pic: Picture): Promise<void> {
  const ext = path.extname(p).toLowerCase();
  const md5 = await audioMd5(p);
  if (!md5) throw appError("checksum_failed", "could not checksum audio");
  const tmp = staleGone(p + ".tmp" + ext);
  // by content, not by name: a WAV saved as .mp3 gets its ID3 chunk replaced, not a tag in front of "RIFF"
  const before = rawTagFrames(p), chunks = otherChunks(p);
  try {
    if (!before) throw appError("art_no_tag", "the file has no ID3v2.3/2.4 tag DJ HQ can add a picture to");
    const tag = pictureTag(p, pic.mime, pic.data);
    if (chunks) replaceTagChunk(p, tmp, tag);
    else if (ext === ".mp3") { copyAfterTag(p, tmp); prependTag(tmp, tag); }
    else throw appError("art_layout", "not a WAV or AIFF file inside, left untouched");
    const after = rawTagFrames(tmp), want = [...before.frames, apicFrame(before.ver, pic.mime, pic.data)];
    const same = (a: { id: string; data: Buffer }[] | null, b: { id: string; data: Buffer }[] | null) =>
      !!a && !!b && a.length === b.length && a.every((x, i) => x.id === b[i].id && x.data.equals(b[i].data));
    if (!after || after.ver !== before.ver || after.frames.length !== want.length || !after.frames.every((f, i) => f.equals(want[i]))
        || (chunks && !same(chunks, otherChunks(tmp))))
      throw appError("art_check_failed", "the copy with the picture did not come out as planned, left untouched");
    if ((await audioMd5(tmp)) !== md5) throw appError("audio_would_change", "audio data would change, left untouched");
    await keepFileMeta(p, tmp);
    fs.renameSync(tmp, p);
  } catch (e) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw e;
  } finally { LIVE_TMP.delete(tmp); }
  await refreshCache(p);
}

function copyPreservingTimes(src: string, dst: string): void {
  fs.copyFileSync(src, dst);
  const st = fs.statSync(src);
  fs.utimesSync(dst, st.atime, st.mtime);
}

// ---------------- view ----------------

const backupDir = (lib: Library) => path.join(DATA_DIR, "originals", lib.id);

/** Backed-up originals of a library: [key, backup path], key as scanLocal hands it
 *  out (backups mirror the library's folder layout under originals/<lib>/; the
 *  replaced/ folder holds MP3s that lossless downloads replaced and is not one). */
function backupEntries(lib: Library): [string, string][] {
  const bdir = backupDir(lib);
  const out: [string, string][] = [];
  const walk = (dir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (e.isDirectory()) { if (!(dir === bdir && e.name === "replaced")) walk(path.join(dir, e.name), rel + e.name + "/"); }
      else if (e.isFile()) out.push([rel + e.name, path.join(dir, e.name)]);
    }
  };
  walk(bdir, "");
  return out;
}

/** The files next to `p` with its name and another audio extension ("X.aif" for "X.wav"; rule E). */
function otherExt(p: string): string[] {
  const dir = path.dirname(p), base = path.basename(p), stem = stemKey(base);
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => n !== base && AUDIO_EXT_RE.test(n) && !/\.tmp\.[^.]+$/i.test(n) && stemKey(n) === stem)
    .map((n) => path.join(dir, n)).filter((q) => { try { return fs.statSync(q).isFile(); } catch { return false; } });
}
/** The backup key a collection file is stored under in originals/<lib>/: "@<root id>/<rel>",
 *  or "@@/<base name>" for a file that lies outside every root (it can still be restored by
 *  its recorded place). */
function backupKeyFor(p: string): string {
  return rootRelKey(p) || "@@/" + path.basename(p);
}
/** The AIFF a backup of Convert WAV files to AIFF became, when it is still there: its path
 *  twice (key and path are the same since the collection model). `abs` is the backed-up
 *  file's own place in the collection. */
function aiffOfBackup(lib: Library, abs: string): [string, string] | null {
  const aAbs = lib.aiff_from?.[abs];
  if (!aAbs) return null;
  if (fs.existsSync(aAbs)) return [aAbs, aAbs];
  // the AIFF was renamed in another letter case or to .aiff meanwhile: the one such file
  const c = otherExt(abs).filter((q) => /\.aiff?$/i.test(q));
  if (c.length !== 1) return null;
  return [c[0], c[0]];
}
/** Backups that could go back into the collection: [key, backup path, where it goes, the AIFF
 *  it became (Convert WAV files to AIFF) when that is there]. Left out: a backup whose folder
 *  (or root) is gone, and one whose file is now there under another extension that DJ HQ did
 *  not convert it to (converted by hand): putting the original back would double the file. */
function restorable(lib: Library): [string, string, string, [string, string] | null][] {
  const out: [string, string, string, [string, string] | null][] = [];
  for (const [key, src] of backupEntries(lib)) {
    const dst = backupKeyPath(lib, key);
    if (!dst || !fs.existsSync(path.dirname(dst))) continue;
    const aiff = aiffOfBackup(lib, dst);
    if (!aiff && !fs.existsSync(dst) && otherExt(dst).length) continue;
    out.push([key, src, dst, aiff]);
  }
  return out;
}

function restorableCount(lib: Library | null): number {
  // backups that differ (size/mtime) from the current library copy
  if (!lib) return 0;
  let n = 0;
  for (const [, src, dst, aiff] of restorable(lib)) {
    if (aiff) { n++; continue; }   // a WAV that became an AIFF: restoring it undoes that
    try {
      const b = fs.statSync(src), c = fs.statSync(dst);
      if (b.size !== c.size || Math.abs(b.mtimeMs - c.mtimeMs) > 1000) n++;
    } catch {
      n++;
    }
  }
  return n;
}

const fmtDur = (d: number) => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;

// ---------------- rule E: the audio extension does not matter ----------------

const AUDIO_EXT_RE = /\.(wav|mp3|aiff?|flac|m4a|ogg)$/i;
/** A file key (or path) without its audio extension, NFC, lower case: "Sub/X.wav" and
 *  "sub/x.AIF" are the same recording in another format. */
export function stemKey(key: string): string {
  return key.normalize("NFC").replace(AUDIO_EXT_RE, "").toLowerCase();
}
/** Move what DJ HQ remembers about one file to another name: the pins of this library's tracks
 *  (`assigned`, by_hand stays with the track), the found / edits records keyed "x:" + path
 *  (never over a record the new path has already), and the old path's cache entry. Old and new
 *  are given as key and absolute path each, so a folder change can use it too. */
function moveRecords(trackIds: Set<number>, oldKey: string, newKey: string, oldPath: string, newPath: string): boolean {
  let changed = false;
  if (oldKey !== newKey)
    for (const [tid, f] of Object.entries(STATE.assigned))
      if (f === oldKey && trackIds.has(Number(tid))) { STATE.assigned[tid] = newKey; changed = true; }
  if (oldPath !== newPath) {
    for (const map of [STATE.found, STATE.edits] as Record<string, unknown>[]) {
      const ok = "x:" + oldPath, nk = "x:" + newPath;
      if (ok in map) { if (!(nk in map)) map[nk] = map[ok]; delete map[ok]; changed = true; }
    }
    if (oldPath in STATE.dur_cache) { delete STATE.dur_cache[oldPath]; changed = true; }
  }
  return changed;
}
const libTrackIds = (lib: Library) => new Set((lib.playlist?.tracks || []).map((t) => t.id));
/** moveRecords for a file of `lib` that changed its name (a WAV converted to AIFF) */
function renameRecords(lib: Library, oldKey: string, newKey: string): void {
  if (moveRecords(libTrackIds(lib), oldKey, newKey, libPath(lib, oldKey), libPath(lib, newKey))) saveState();
}
/** Rule E, on every view, across the whole collection: a pin, found or edits record whose
 *  file is gone follows the one file that is that file elsewhere: first the same path with
 *  another audio extension ("X.wav" converted to "X.aif"), then the one file with the same
 *  base name in another folder of the collection (the user tidied their folders), first as
 *  written, then without its audio extension. Never a guess: with no such file or several,
 *  or one that another pin (or record) names already, nothing changes. While the file is
 *  there the record stays on it. Nothing follows anything while a root is away. */
function followRenamed(files: LocalFile[], byPath: Map<string, LocalFile>): void {
  const pathStem = new Map<string, LocalFile[]>();   // the path without its extension (same folder)
  const byBase = new Map<string, LocalFile[]>();     // the base name, case and Unicode folded
  const byBaseStem = new Map<string, LocalFile[]>(); // the base name without its extension
  const put = (m: Map<string, LocalFile[]>, k: string, f: LocalFile) => m.set(k, [...(m.get(k) || []), f]);
  for (const f of files) {
    put(pathStem, stemKey(f.path), f);
    put(byBase, f.base.normalize("NFC").toLowerCase(), f);
    put(byBaseStem, stemKey(f.base), f);
  }
  const follow = (p: string, taken: (f: LocalFile) => boolean): LocalFile | null => {
    for (const m of [pathStem.get(stemKey(p)), byBase.get(path.basename(p).normalize("NFC").toLowerCase()), byBaseStem.get(stemKey(path.basename(p)))]) {
      const c = (m || []).filter((f) => !taken(f));
      if (c.length === 1) return c[0];
    }
    return null;
  };
  let changed = false;
  const pinned = new Set(Object.values(STATE.assigned).filter(Boolean));
  for (const [tid, fname] of Object.entries(STATE.assigned)) {
    if (!fname || !path.isAbsolute(fname) || byPath.has(fname)) continue;
    const c = follow(fname, (f) => pinned.has(f.name));
    if (!c) continue;
    pinned.add(c.name);
    STATE.assigned[tid] = c.name;
    changed = true;
  }
  for (const map of [STATE.found, STATE.edits] as Record<string, unknown>[]) {
    for (const k of Object.keys(map)) {
      if (!k.startsWith("x:")) continue;
      const p = k.slice(2);
      if (byPath.has(p) || !rootOf(p)) continue;
      const c = follow(p, (f) => ("x:" + f.path) in map);
      if (!c) continue;
      map["x:" + c.path] = map[k];
      delete map[k];
      changed = true;
    }
  }
  if (changed) saveState();
}

/** A library imported before its music was copied here (files_pending): pins whose file isn't
 *  in the scan are moved to a file that turned up under another spelling (matchKeys). The
 *  wait ends only when the user says the copy is complete (files_ready): every pinned file
 *  being there says nothing about the files still on their way, whose arrival times would be
 *  dropped (and then come back as NEW FILE). */
function filesPending(lib: Library, files: LocalFile[], fmap: Map<string, LocalFile>, trackIds: Set<number>): void {
  const pins = Object.entries(STATE.assigned).filter(([k, f]) => f && trackIds.has(Number(k)));
  const waiting = pins.filter(([, f]) => !fmap.has(f));
  if (waiting.length && files.length) {
    const taken = new Set(pins.map(([, f]) => f));
    const m = matchKeys(waiting.map(([, f]) => f), files.map((f) => f.name).filter((n) => !taken.has(n)));
    let moved = false;
    for (const [k, f] of waiting) { const to = m.map.get(f); if (to) { STATE.assigned[k] = to.to; moved = true; } }
    if (moved) saveState();
  }
}

/** Find files again after they were copied to another computer or folder: each wanted key
 *  ("/"-separated, relative) is matched to one of `onDisk` by its exact key, then with
 *  Unicode composition and case folded (NFD from macOS, a case-changing copy), then by a file
 *  name that is unique on both sides, then by that name without its audio extension (a file
 *  converted to another format). One file takes at most one key: two keys that would land
 *  on the same file, or a name found twice, count as not found (`ambiguous`). */
export type MatchHow = "exact" | "folded" | "base" | "stem";
export function matchKeys(wanted: string[], onDisk: string[]): { map: Map<string, { to: string; how: MatchHow }>; ambiguous: number } {
  const map = new Map<string, { to: string; how: MatchHow }>();
  const want = [...new Set(wanted)];
  const disk = new Set(onDisk), taken = new Set<string>();
  for (const w of want) if (disk.has(w)) { map.set(w, { to: w, how: "exact" }); taken.add(w); }
  const fold = (s: string) => s.normalize("NFC").toLowerCase();
  const base = (s: string) => fold(s.slice(s.lastIndexOf("/") + 1));
  // last: the file name without its audio extension (rule E: "X.wav" was converted to "X.aif")
  const stem = (s: string) => stemKey(base(s));
  let ambiguous = 0;
  for (const [fn, how] of [[fold, "folded"], [base, "base"], [stem, "stem"]] as const) {
    const byDisk = new Map<string, string[]>(), byWant = new Map<string, string[]>();
    for (const d of onDisk) if (!taken.has(d)) { const k = fn(d); byDisk.set(k, [...(byDisk.get(k) || []), d]); }
    for (const w of want) if (!map.has(w)) { const k = fn(w); byWant.set(k, [...(byWant.get(k) || []), w]); }
    ambiguous = 0;
    for (const [k, ws] of byWant) {
      const ds = byDisk.get(k) || [];
      if (ws.length === 1 && ds.length === 1) { map.set(ws[0], { to: ds[0], how }); taken.add(ds[0]); }
      else if (ds.length) ambiguous += ws.length;
    }
  }
  return { map, ambiguous };
}

/** The audio files under a folder as relative "/" keys, from the directory listing alone
 *  (no probe, no stat of the files, nothing cached): what scanFolder would list, at any depth
 *  with `recursive`. Reading the names downloads nothing from an online-only cloud folder. */
export function listAudioKeys(d: string, recursive: boolean, cap = 200000): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= cap) return;
      const f = e.name;
      if (f.startsWith(".")) continue;
      if (e.isDirectory()) { if (recursive) walk(path.join(dir, f), rel + f + "/"); continue; }
      if (!e.isFile() || !AUDIO_EXT.includes(path.extname(f).toLowerCase()) || /\.tmp\.[^.]+$/i.test(f)) continue;
      out.push(rel + f);
    }
  };
  walk(d, "");
  return out;
}

/** Which file goes with which track: the pins (`manual`: track id -> file key, "" = no file)
 *  first, then every other file to the playlist track its name and length are closest to
 *  (sim). matched: track id -> [file key, score] (score -1: a pin); fileHit: the files that
 *  went to a track (the rest are extras). Pure: the folder change's preview uses it too. */
function matchFiles(files: LocalFile[], tracks: PlTrack[], manual: Map<number, string>): { matched: Map<number, [string, number]>; fileHit: Set<string> } {
  const manualFiles = new Set([...manual.values()].filter(Boolean));
  const fmap = new Set(files.map((f) => f.name));
  const matched = new Map<number, [string, number]>(); // score -1 = manual
  const fileHit = new Set<string>();
  // A file and a track with no normalised word in common can never reach the 0.6 bar
  // (without the Jaccard part the most a pair can score is 0.4 + 0.15), so each file is
  // only scored against the tracks it shares a word with. The collection can hold tens
  // of thousands of files; comparing each with every track would not scale.
  const byToken = new Map<string, number[]>();
  const trackToks: Set<string>[] = tracks.map((t, i) => {
    const toks = new Set([...norm(t.title).split(" "), ...norm(`${t.user} ${t.title}`).split(" ")].filter(Boolean));
    for (const w of toks) byToken.set(w, [...(byToken.get(w) || []), i]);
    return toks;
  });
  for (const f of files) {
    if (manualFiles.has(f.name)) { fileHit.add(f.name); continue; }
    const cand = new Set<number>();
    for (const w of norm(f.base).split(" ")) if (w) for (const i of byToken.get(w) || []) cand.add(i);
    let best: PlTrack | null = null, bestS = 0;
    for (const i of cand) {
      const t = tracks[i];
      if (manual.has(t.id)) continue; // manually decided, don't steal / re-fill
      let s = Math.max(sim(f.base, t.title), sim(f.base, `${t.user} ${t.title}`));
      const dd = Math.abs(f.dur - t.dur);
      s += dd < 3 ? 0.15 : dd < 10 ? 0.07 : 0;
      if (s > bestS) { best = t; bestS = s; }
    }
    if (best && bestS >= 0.6) {
      const prev = matched.get(best.id);
      if (!prev || bestS > prev[1]) matched.set(best.id, [f.name, Math.round(bestS * 100) / 100]);
      fileHit.add(f.name);
    }
  }
  for (const [tid, fname] of manual)
    if (fname && fmap.has(fname)) matched.set(tid, [fname, -1]); // a pin into a folder that's away stays, without a file
  return { matched, fileHit };
}

/** matchFiles for a library against the collection, memoised: the result holds until the
 *  collection changes (COLL_VERSION), the playlist's tracks change or the pins change. */
const MATCH_CACHE = new Map<string, { ver: number; sig: string; matched: Map<number, [string, number]>; fileHit: Set<string> }>();
function matchLib(lib: Library, files: LocalFile[], tracks: PlTrack[], manual: Map<number, string>): { matched: Map<number, [string, number]>; fileHit: Set<string> } {
  const sig = tracks.map((t) => t.id).join(",") + "|" + [...manual].map(([k, v]) => k + ":" + v).sort().join("|");
  const hit = MATCH_CACHE.get(lib.id);
  if (hit && hit.ver === COLL_VERSION && hit.sig === sig) return hit;
  const r = matchFiles(files, tracks, manual);
  MATCH_CACHE.set(lib.id, { ver: COLL_VERSION, sig, ...r });
  return r;
}

/** `plans`: a tag_plan on tagged rows too (Write tags in every file); the page never needs them */
export async function buildView(libArg?: Library, opts: { plans?: boolean } = {}): Promise<any> {
  const gen = STATE_GEN;
  const lib = libArg || activeLib();
  let dev = STATE.device || "xdj-700";
  if (!DEVICES[dev]) dev = "xdj-700";
  const coll = collection();
  const base: any = {
    libraries: STATE.libraries.map((l) => ({ id: l.id, name: libName(l), url: l.url, target: l.target || null })),
    active: lib ? lib.id : null,
    collection: { roots: coll.roots.map((r) => ({ id: r.id, path: r.path, subfolders: !!r.subfolders })),
                  move_target: coll.move_target || null, last_target: coll.last_target || null },
    device: dev,
    devices: Object.entries(DEVICES).map(([id, d]) => ({ id, label: d.label })),
    backups: restorableCount(lib),
    backup_dir: lib ? backupDir(lib) : null,
    can_pick: CAN_PICK,
    can_reveal: CAN_REVEAL,
    settings: getSettings(),
    backup_bytes: backupBytes(lib),
    state_problem: STATE_PROBLEM,
    // imported without its SoundCloud link: nothing is fetched until Change link… sets one
    link_missing: !!lib && !lib.url,
  };
  if (!lib || !lib.playlist) {
    const away: FolderAway[] = [];
    if (coll.roots.length) await scanCollection(away);
    return { ...base, ready: false, folders_away: away };
  }
  const away: FolderAway[] = [];
  const files = await scanCollection(away);
  if (gen !== STATE_GEN) return buildView(undefined, opts);   // the state was replaced (an import) while the folders were scanned
  const pl = lib.playlist;
  const genre = pl.title || "Trance";
  const fmap = new Map(files.map((f) => [f.name, f]));
  const byPath = fmap;   // keys are the files' absolute paths
  const trackIds = new Set(pl.tracks.map((t) => t.id));
  // rule E first: a record whose file moved or changed extension follows it, before anything is pruned
  followRenamed(files, byPath);
  // A root that is gone or unreadable, or one that lists no audio although files in it are
  // pinned or found, is "not available": the drive is unplugged, the cloud folder hasn't
  // synced, the folder was renamed. Its files aren't gone for good, so nothing is forgotten
  // (pins, found, file-arrival times) until every root is back.
  const inDir = (d: string, p: string) => p.startsWith(d + path.sep);
  const notAvailable = away.filter((a) => a.why !== "empty"
    || Object.values(STATE.assigned).some((f) => f && inDir(a.dir, f))
    || Object.keys(STATE.found).some((k) => inDir(a.dir, k.slice(2))));
  if (lib.files_pending) { filesPending(lib, files, fmap, trackIds); notAvailable.push({ dir: lib.dir, why: "waiting" }); }
  const keep = notAvailable.length > 0;
  // manual assignments win over auto-matching; drop entries whose file vanished. The pins
  // are one map for all libraries: those of another library's tracks are its business
  const otherIds = new Set(STATE.libraries.filter((l) => l !== lib).flatMap((l) => (l.playlist?.tracks || []).map((t) => t.id)));
  let assignedDirty = false;
  if (!keep) for (const k of Object.keys(STATE.assigned)) {
    const fname = STATE.assigned[k];
    if (!trackIds.has(Number(k)) && otherIds.has(Number(k))) continue;
    if (!trackIds.has(Number(k)) || (fname !== "" && !fmap.has(fname))) {
      delete STATE.assigned[k]; delete STATE.by_hand[k];
      assignedDirty = true;
    }
  }
  if (!keep) for (const k of Object.keys(STATE.by_hand)) if (!(k in STATE.assigned)) { delete STATE.by_hand[k]; assignedDirty = true; }
  // local files whose SoundCloud match has since been added to the playlist:
  // pin the file to that track (unless the track already has a manual file)
  for (const k of Object.keys(STATE.found)) {
    if (!k.startsWith("x:") || !rootOf(k.slice(2))) continue;
    const ff = byPath.get(k.slice(2));
    if (!ff) { if (!keep) { delete STATE.found[k]; assignedDirty = true; } continue; }
    const fname = ff.name;
    const tid = String(STATE.found[k].id);
    if (!trackIds.has(Number(tid))) continue;
    if (keep && STATE.assigned[tid] && !fmap.has(STATE.assigned[tid])) continue; // its pinned file may be in the folder that's away
    if (!STATE.assigned[tid] || !fmap.has(STATE.assigned[tid])) {
      for (const a of Object.keys(STATE.assigned)) if (STATE.assigned[a] === fname && trackIds.has(Number(a))) { delete STATE.assigned[a]; delete STATE.by_hand[a]; }
      STATE.assigned[tid] = fname;
      delete STATE.overrides[tid];
    }
    delete STATE.found[k];
    assignedDirty = true;
  }
  if (assignedDirty) saveState();
  const manual = new Map<number, string>(); // track id -> file name ("" = no file)
  for (const [k, fname] of Object.entries(STATE.assigned)) {
    if (!trackIds.has(Number(k))) continue;   // another library's pin: its file name means nothing here
    manual.set(Number(k), fname);
  }
  const { matched, fileHit } = matchLib(lib, files, pl.tracks, manual);
  // the inbox is part of the index: a fresh download already matches its track and the row
  // says "in inbox" instead of "missing", before anything is moved into the collection
  const inboxMatch = new Map<number, { name: string; zip: string | null; score: number }>();
  try {
    const idir = inboxDir();
    if (fs.existsSync(idir) && !collRoots().some((r) => sameDir(r.path, idir))) {
      for (const f of (await scanInbox(idir)).files) {
        if (fmap.has(f.path)) continue;   // the inbox lies inside a root: the file is in the collection already
        const [t, score] = bestTrackNames(f.matchNames, f.dur, pl.tracks);
        if (!t || score < 0.6 || matched.has(t.id)) continue;
        const prev = inboxMatch.get(t.id);
        if (!prev || score > prev.score) inboxMatch.set(t.id, { name: f.name, zip: f.zip || null, score });
      }
    }
  } catch { /* the inbox is never load-bearing for the view */ }
  const reavailable: string[] = [];
  let naDirty = false;
  const now = Date.now();
  const names = libraryNames(pl.tracks);
  const rows = pl.tracks.map((t, i) => {
    const nm = names.get(t.id)!;
    let a = nm.artist, ti = nm.title;
    const ed = STATE.edits[String(t.id)];
    const hand = handEdit(ed);
    if (hand) { a = ed!.artist || a; ti = ed!.title || ti; }
    const confirmed = !hand && !!ed?.ok && ed.ok === nameSig(a, ti);
    const m = matched.get(t.id);
    let have = !!m;
    const o = STATE.overrides[String(t.id)];
    if (o === "have" || o === "missing") have = o === "have";
    const links = trackLinks(t);
    // "not available now" ends by itself when a file turns up or the links change
    let na = false;
    const naRec = STATE.na[String(t.id)];
    if (naRec) {
      if (have || naRec.sig !== linksSig(links)) {
        delete STATE.na[String(t.id)]; naDirty = true;
        if (!have) reavailable.push(`${a} - ${ti}`);
      } else na = true;
    }
    let tagged: boolean | null = null, incompat: string | null = null, lossy = false;
    let key: string | null = null, pn: boolean | null = null;
    let differs: ReturnType<typeof fileDiffers> = null, plan: TagPlan | null = null, artWhy: ArtWhy | null = null;
    if (m) {
      const f = fmap.get(m[0])!;
      tagged = isTagged(f, a, ti, genre, handFields(ed));
      artWhy = artReason(f, t.art, tagged);
      differs = fileDiffers(f, a, ti);
      if (!tagged || opts.plans) plan = tagPlan(f, a, ti, handFields(ed), keptOver(ed, confirmed, differs));
      incompat = compatReason(f.fmt, dev, f.wext);
      lossy = LOSSY.test(f.fmt[0]);
      key = f.key ?? null; pn = f.pn ?? null;
    }
    const upgrade = have && lossy && links.some((l) => l.kind === "buy" && !!l.fmt && l.fmt !== "MP3");
    // when did a file for this track first turn up? (NEW FILE until marked seen)
    const ak = `${lib.id}:${t.id}`;
    if (m) {
      if (!(ak in STATE.acquired)) { STATE.acquired[ak] = lib.acq_init ? now : 0; naDirty = true; }
    } else if (ak in STATE.acquired && !keep) { delete STATE.acquired[ak]; naDirty = true; }
    const acquired = m ? STATE.acquired[ak] : 0;
    const look = nameLook(nm, ed, hand, confirmed, differs);
    return { n: i + 1, id: t.id, artist: a, title: ti, user: t.user, sc_title: t.title,
             name_conf: nm.conf, name_why: look.why, name_ok: confirmed, check_name: look.check, ...differs,
             dur: fmtDur(t.dur), url: t.url, art: t.art,
             have, na, in_inbox: !have && !na ? inboxMatch.get(t.id) || null : null,
             auto: !!m, file: m ? m[0] : null, file_disp: m ? collDisplay(m[0]) : null, path: m ? fmap.get(m[0])!.path : null,
             score: m && m[1] >= 0 ? Math.min(1, m[1]) : null,
             pinned: manual.has(t.id), manual_match: manual.has(t.id) && !!STATE.by_hand[t.id], links, bc_at: STATE.bandcamp?.[String(t.id)]?.v === BANDCAMP_RULES ? STATE.bandcamp[String(t.id)].at : 0, lossy, upgrade,
             added: t.added || 0, is_new: (t.added || 0) > (lib.seen_mark || 0),
             acquired, is_new_file: acquired > (lib.seen_mark || 0),
             tagged, incompat, key, pn, override: o || null, edited: hand, ...(plan ? { tag_plan: plan } : {}),
             ...(artWhy ? { art_why: artWhy } : {}) };
  });
  // first pass stamped existing files with 0 (not while a folder is away: its files would be NEW when it returns)
  if (!lib.acq_init && !keep) { lib.acq_init = true; naDirty = true; }
  if (naDirty) saveState();
  // the files this playlist's bulk actions (tag, convert, AIFF) work on: its matched files
  const matchedFiles = rows.filter((r: any) => r.file && fmap.has(r.file)).map((r: any) => fmap.get(r.file)!);
  return {
    ...base, ready: true, playlist: pl.title, playlist_url: pl.url,
    genre, tracks: rows,
    extras: [],   // per-playlist extras are gone: the collection browser shows every file instead
    folders_away: notAvailable,   // [{dir, why: "missing" | "unreadable" | "empty"}]: nothing is pruned meanwhile
    local_files: files.map((f) => ({ name: f.name, disp: collDisplay(f.path), path: f.path, dur: fmtDur(Math.round(f.dur)) })),
    have: rows.filter((r) => r.have).length,
    missing: rows.filter((r) => !r.have && !r.na).length,
    na_count: rows.filter((r) => r.na).length,
    in_inbox: rows.filter((r) => r.in_inbox).length,
    upgrades: rows.filter((r) => r.upgrade).length,
    reavailable,
    new_count: rows.filter((r) => r.is_new || r.is_new_file).length,
    new_tracks: rows.filter((r) => r.is_new).length,
    new_files: rows.filter((r) => r.is_new_file).length,
    seen_mark: lib.seen_mark || 0,
    name_checks: rows.filter((r) => r.check_name).length,
    untagged: rows.filter((r) => r.tagged === false).length,
    incompatible: matchedFiles.filter((f) => compatReason(f.fmt, dev, f.wext)).length,
    local_count: files.length,
    art: artCounts(rows, 0),
    aiff: { on: !!STATE.settings?.aiff_auto, wav: matchedFiles.filter((f) => path.extname(f.path).toLowerCase() === ".wav").length },
  };
}

/** The collection browser: every file of every root, with what the playlists make of it.
 *  `unmatched`: the file is no playlist's track and has no found record either. */
export async function collectionView(): Promise<any> {
  const gen = STATE_GEN;
  let dev = STATE.device || "xdj-700";
  if (!DEVICES[dev]) dev = "xdj-700";
  const away: FolderAway[] = [];
  const files = await scanCollection(away);
  if (gen !== STATE_GEN) return collectionView();
  // what each playlist makes of its matched files, straight from the views (same names,
  // same tag status the playlist page shows)
  const usedBy = new Map<string, { lib: string; name: string; track: string; row: any }[]>();
  for (const l of STATE.libraries) {
    if (!l.playlist) continue;
    const v = await buildView(l);
    for (const r of v.tracks || []) {
      if (!r.file) continue;
      const label = [r.artist, r.title].filter(Boolean).join(" - ");
      usedBy.set(r.file, [...(usedBy.get(r.file) || []), { lib: l.id, name: libName(l), track: label, row: r }]);
    }
  }
  const rows = files.map((f, i) => {
    const used = usedBy.get(f.name) || [];
    const fnd = STATE.found["x:" + f.path];
    const first = used[0]?.row;
    let named: any;
    if (first) {
      named = { artist: first.artist, title: first.title, edited: !!first.edited,
                name_conf: first.name_conf, name_why: first.name_why, name_ok: first.name_ok, check_name: first.check_name,
                ...(first.file_artist !== undefined ? { file_artist: first.file_artist, file_title: first.file_title } : {}),
                tagged: first.tagged !== false };
    } else {
      const nm = extraName(f);
      let xa = nm.artist, xt = nm.title;
      const ed = STATE.edits["x:" + f.path];
      const hand = handEdit(ed);
      if (hand) { xa = ed!.artist || xa; xt = ed!.title || xt; }
      const confirmed = !hand && !!ed?.ok && ed.ok === nameSig(xa, xt);
      const differs = fileDiffers(f, xa, xt);
      const look = nameLook(nm, ed, hand, confirmed, differs);
      named = { artist: xa, title: xt, edited: hand, ...differs,
                name_conf: nm.conf, name_why: look.why, name_ok: confirmed, check_name: look.check,
                tagged: isTagged(f, xa, xt, "", handFields(ed)) };
    }
    return { n: i + 1, name: f.name, disp: collDisplay(f.path), base: f.base, path: f.path, root: rootOf(f.path)?.id || null,
             incompat: compatReason(f.fmt, dev, f.wext), dur: fmtDur(Math.round(f.dur)), lossy: LOSSY.test(f.fmt[0]),
             ...named,
             key: f.key ?? null, pn: f.pn ?? null,
             in: used.map(({ lib, name, track }) => ({ lib, name, track })),
             unmatched: !used.length && !fnd,
             found: fnd ? { ...fnd, dur: fmtDur(fnd.dur) } : null };
  });
  const coll = collection();
  return {
    roots: coll.roots.map((r) => ({ id: r.id, path: r.path, subfolders: !!r.subfolders })),
    folders_away: away,
    files: rows,
    total: rows.length,
    unmatched: rows.filter((r) => r.unmatched).length,
    untagged: rows.filter((r) => !r.tagged).length,
    incompatible: rows.filter((r) => r.incompat).length,
  };
}

// ---------------- actions ----------------

/** One file Write tags would write: its key, the edit key its name lives under, the plan
 *  (tagPlan), the file's current artist / title, and whether it counts as tagged. `all`:
 *  tagged files too (a view built with plans), except one with no name at all: nothing to
 *  write, and nothing to keep. */
interface TagTodo { key: string; edit: string; plan: TagPlan; file_artist: string; file_title: string; tagged: boolean; hand: [boolean, boolean]; }
function tagTodo(view: any, all = false): TagTodo[] {
  const out: TagTodo[] = [];
  const add = (key: string, edit: string, r: any) => out.push({ key, edit, plan: r.tag_plan, tagged: r.tagged === true,
    file_artist: r.file_artist ?? r.tag_plan.artist, file_title: r.file_title ?? r.tag_plan.title,
    hand: handFields(STATE.edits[edit]) });
  const want = (r: any) => r.tag_plan && (all ? !!(r.tag_plan.artist || r.tag_plan.title) : r.tagged === false);
  for (const r of view.tracks || []) if (r.file && want(r)) add(r.file, String(r.id), r);
  for (const e of view.extras || []) if (want(e)) add(e.name, "x:" + e.path, e);
  return out;
}

/** Write tags in every file (tagAll {all}): how far the run is, for GET /api/tag/progress
 *  (the request itself only answers at the end), and its tag_report once done (a page
 *  reloaded meanwhile picks it up there). One run at a time; while it goes every other
 *  /api/tag (and convert / restore) is refused (tagIdle), not queued behind it for minutes. */
/** Add cover art (addArt) is the other every-file run and shares this, `kind` saying which goes. */
/** Convert WAV files to AIFF (aiffAll) is the third, kind "aiff". */
/** Convert (Prepare for player) is the fourth, kind "convert". */
export const TAG_RUN: { running: boolean; kind: "tags" | "art" | "aiff" | "convert"; done: number; total: number; report: any } =
  { running: false, kind: "tags", done: 0, total: 0, report: null };
export function tagIdle(): void {
  if (TAG_RUN.running && TAG_RUN.kind === "art") throw appError("art_running", "pictures are being added to the files; wait until that is done");
  if (TAG_RUN.running && TAG_RUN.kind === "aiff") throw appError("aiff_running", "WAV files are being converted to AIFF; wait until that is done");
  if (TAG_RUN.running && TAG_RUN.kind === "convert") throw appError("convert_running", "files are being converted for the player; wait until that is done");
  if (TAG_RUN.running) throw appError("tag_running", "tags are being written in every file; wait until that is done");
}
/** claimed by the route before the run is queued, so a second click finds it taken */
export function claimTagRun(kind: "tags" | "art" | "aiff" | "convert" = "tags"): void {
  tagIdle();
  Object.assign(TAG_RUN, { running: true, kind, done: 0, total: 0, report: null });
}

/** A tagged file Write tags in every file leaves alone: DJ HQ doesn't write its tag itself
 *  (FLAC, M4A, OGG, an ID3v2.2 or tagless MP3/AIFF: ffmpeg would rename or drop the key and
 *  other marks), or the rewrite would drop something it holds (rewriteLosses). */
function leaveTagged(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  if (!(ext === ".wav" || (ID3_EXT.includes(ext) && id3Version(p) >= 3))) return true;
  return rewriteLosses(p).length > 0;
}
/** size and whole-second mtime, as dur_cache keeps them; `cached`: the entry the view (and
 *  so the plan) was made from */
const fileStamp = (p: string, cached = false) => {
  if (cached) { const c = STATE.dur_cache[p]; return c ? c[0] + ":" + c[1] : "-"; }
  try { const st = fs.statSync(p); return st.size + ":" + Math.floor(st.mtimeMs / 1000); } catch { return ""; }
};

/** Write tags. A file whose own (non-empty) artist or title would give way to a different
 *  name is only written with `replace`; with `keep_file` its names become hand edits first
 *  (so the file keeps them and only gets what it lacks); with neither it is left alone and
 *  listed in `kept`. `replace` / `keep_file` cover only the previewed replaces (`seen`:
 *  the preview's sigs), so one that turned up meanwhile is never written over unasked. A
 *  name the user chose is written without asking. `preview` writes nothing: {writes,
 *  replaces} for the page to ask with. */
export async function tagAll(opts: { preview?: boolean; replace?: boolean; keep_file?: boolean; seen?: string[]; all?: boolean } = {}): Promise<any> {
  if (!opts.all || opts.preview) return tagRun(opts);
  try {
    const view = await tagRun(opts);
    TAG_RUN.report = view.tag_report;
    return view;
  } finally { TAG_RUN.running = false; }   // claimed by the route (claimTagRun)
}
/** tagAll; `all` also rewrites the files that count as tagged (with the same plans, so a file's
 *  own spelling and a different own name are treated as above): the repair after other apps
 *  dropped tags DJ HQ can't see missing (a WAV's INFO chunk was lost before 2.0.1 noticed).
 *  There a field the file already says stays as it is in each of its tags, a tagged file
 *  the rewrite would lose something in is left (`left`), and so is one that changed on disk
 *  since its plan was made (`changed`: the run takes minutes; another app may rename meanwhile). */
async function tagRun(opts: { preview?: boolean; replace?: boolean; keep_file?: boolean; seen?: string[]; all?: boolean }): Promise<any> {
  const lib = requireLib(), all = !!opts.all, vo = { plans: all };
  let left: string[] = [];
  const list = async () => {
    const view = await buildView(undefined, vo);
    let todo = tagTodo(view, all);
    if (all) {
      left = todo.filter((x) => x.tagged && leaveTagged(libPath(lib, x.key))).map((x) => x.key);
      todo = todo.filter((x) => !left.includes(x.key));
    }
    return { view, todo, stamps: new Map(all ? todo.map((x) => [x.key, fileStamp(libPath(lib, x.key), true)]) : []) };
  };
  let { view, todo, stamps } = await list();
  const sig = (x: TagTodo) => [x.key, x.plan.artist, x.plan.title, x.file_artist, x.file_title].join("\t");
  const seen = new Set(opts.seen || []);
  const asked = (x: TagTodo) => x.plan.replaces && !x.plan.hand;
  const shown = (x: TagTodo) => asked(x) && seen.has(sig(x));
  if (opts.preview) {
    return { writes: todo.length, ...(all ? { left: left.length } : {}),
      replaces: todo.filter((x) => x.plan.replaces).map((x) => ({ key: x.key, artist: x.plan.artist,
      title: x.plan.title, file_artist: x.file_artist, file_title: x.file_title, hand: x.plan.hand, sig: sig(x) })) };
  }
  let keptOwn = 0;
  if (opts.keep_file && !opts.replace && todo.some(shown)) {
    for (const x of todo.filter(shown)) {
      // a field the user typed stays theirs; the rest becomes what the file says
      const ed = STATE.edits[x.edit], [ha, ht] = handFields(ed);
      const a = ha ? ed!.artist : x.file_artist, t = ht ? ed!.title : x.file_title;
      if (a || t) { STATE.edits[x.edit] = { artist: a, title: t }; keptOwn++; }
    }
    saveState();
    ({ view, todo, stamps } = await list());
  }
  const genre = view.genre || "Trance";
  let done = 0;
  const errors: string[] = [], error_items: ErrorItem[] = [], kept: string[] = [], changed: string[] = [];
  if (all) TAG_RUN.total = todo.length;
  for (const x of todo) {
    const p = libPath(lib, x.key);
    // the file's own name may stay where it says the plan's (its spelling, all its values)
    const want = [x.plan.artist, x.plan.title];
    const same = all ? (v: string, i: 0 | 1) => !!v && (v === want[i] || (!x.hand[i] && looseEq(v, want[i]))) : undefined;
    if (all) try { fs.unlinkSync(p + ".tmp" + path.extname(p)); } catch { /* none: a run cut off before leaves one */ }
    if (asked(x) && !(opts.replace && shown(x))) kept.push(x.key);
    else if (all && fileStamp(p) !== stamps.get(x.key)) changed.push(x.key);
    else try {
      await writeTags(p, x.plan.artist, x.plan.title, genre, same);
      done++;
    } catch (e: any) {
      errors.push(`${x.key}: ${e.message}`);
      error_items.push(errItem(x.key, e));
    }
    if (all) TAG_RUN.done++;
  }
  view = await buildView();
  view.tag_report = { done, errors, error_items, kept, kept_own: keptOwn,
    ...(all ? { all: true, total: todo.length, left: left.length, changed } : {}) };
  return view;
}

/** Add cover art: the SoundCloud artwork of each playlist track goes into its file when the
 *  file has no picture (artReason says which files). `preview` writes nothing: {writes, left
 *  by reason, wav: how many of them are WAVs, where rekordbox may not show it}. The run (claimed by the route: claimTagRun("art")) downloads a few pictures
 *  ahead of the file being written, keeps them for this run only, and skips a file that
 *  changed on disk since the view was made; a download or write that fails is that file's error. */
export async function addArt(opts: { preview?: boolean } = {}): Promise<any> {
  if (opts.preview) return artRun(true);
  try {
    const view = await artRun(false);
    TAG_RUN.report = view.art_report;
    return view;
  } finally { TAG_RUN.running = false; }
}
async function artRun(preview: boolean): Promise<any> {
  const lib = requireLib();
  let view = await buildView(lib);
  const left = view.art?.left || Object.fromEntries(ART_LEFT.map((k) => [k, 0]));
  const todo: { key: string; path: string; art: string; stamp: string }[] = (view.tracks || [])
    .filter((r: any) => r.art_why === "add" && r.path).map((r: any) => ({ key: r.file, path: r.path, art: r.art, stamp: fileStamp(r.path, true) }));
  if (preview) return { writes: todo.length, wav: todo.filter((x) => path.extname(x.path).toLowerCase() === ".wav").length, left };
  TAG_RUN.total = todo.length;
  const pics = new Map<string, Promise<Picture>>();
  const pic = (u: string) => { let q = pics.get(u); if (!q) { q = fetchArt(u); q.catch(() => {}); pics.set(u, q); } return q; };
  let done = 0, offline = 0, failedNet = new Set<string>();
  const errors: string[] = [], error_items: ErrorItem[] = [], changed: string[] = [];
  for (let i = 0; i < todo.length; i++) {
    const x = todo[i];
    // three different links failing to download in a row, none in between: the network (or
    // SoundCloud) is down. The rest is left for a later run instead of minutes of time-outs.
    if (failedNet.size >= 3) { offline = todo.length - i; TAG_RUN.done = todo.length; break; }
    for (const y of todo.slice(i, i + 3)) pic(y.art);   // three downloads at most
    try { fs.unlinkSync(x.path + ".tmp" + path.extname(x.path)); } catch { /* none: a run cut off before leaves one */ }
    try {
      const got = await pic(x.art);
      failedNet.clear();
      if (fileStamp(x.path) !== x.stamp) changed.push(x.key);
      else { await writePicture(x.path, got); done++; }
    } catch (e: any) {
      if (e?.code === "art_download" || e?.code === "art_timeout") failedNet.add(x.art); else if (/^art_(http|not_image|too_large)$/.test(e?.code)) failedNet.clear();
      errors.push(`${x.key}: ${e.message}`);
      error_items.push(errItem(x.key, e));
    }
    TAG_RUN.done++;
  }
  view = await buildView();
  view.art_report = { done, errors, error_items, changed, total: todo.length, left, art: true, ...(offline ? { offline } : {}) };
  return view;
}

/** What DJ HQ knows about some files of the active library (keys as the view hands
 *  them out): the names it would tag them with, whether the tags already say so,
 *  whether the name needs a look (Check names), duration, musical key and Platinum
 *  Notes mark from the file's tags. One view build for the lot; files not in the
 *  library (any more) are left out. */
export interface BatchFile { key: string; path: string; track_id: number | null; artist: string; title: string; genre: string;
  tagged: boolean; check_name: boolean; dur: number; size: number; tkey: string | null; pn: boolean | null;
  /** when not tagged: what tagging writes (tagPlan), and the file's current names */
  plan: TagPlan | null; file_artist: string; file_title: string; file_genre: string;
  /** a WAV's LIST/INFO [artist, title] (null: none); undefined for other formats */
  info?: [string, string] | null; }
export async function batchInfo(keys: string[]): Promise<BatchFile[]> {
  const lib = requireLib();
  const view = await buildView(lib);
  if (!view.ready) return [];
  const files = new Map((await scanCollection()).map((f) => [f.name, f]));
  const rows = new Map<string, any>();
  for (const r of view.tracks || []) if (r.file) rows.set(r.file, r);
  const out: BatchFile[] = [];
  for (const k of keys) {
    const f = files.get(k);
    let r = rows.get(k);
    if (!f) continue;
    if (!r) {
      // not one of this playlist's matched files: its names as the collection browser derives them
      const nm = extraName(f);
      let xa = nm.artist, xt = nm.title;
      const ed = STATE.edits["x:" + f.path];
      const hand = handEdit(ed);
      if (hand) { xa = ed!.artist || xa; xt = ed!.title || xt; }
      const confirmed = !hand && !!ed?.ok && ed.ok === nameSig(xa, xt);
      const differs = fileDiffers(f, xa, xt);
      const look = nameLook(nm, ed, hand, confirmed, differs);
      const tagged = isTagged(f, xa, xt, view.genre || "Trance", handFields(ed));
      r = { id: null, artist: xa, title: xt, tagged, check_name: look.check,
            tag_plan: tagged ? null : tagPlan(f, xa, xt, handFields(ed), keptOver(ed, confirmed, differs)) };
    }
    let size = 0;
    try { size = fs.statSync(f.path).size; } catch {}
    out.push({ key: k, path: f.path, track_id: typeof r.id === "number" ? r.id : null, artist: r.artist, title: r.title,
               genre: view.genre || "Trance", tagged: r.tagged !== false, check_name: !!r.check_name,
               dur: f.dur, size, tkey: f.key ?? null, pn: f.pn ?? null,
               plan: r.tagged === false ? r.tag_plan || null : null,
               file_artist: ownNames(f, 0)[0] || "", file_title: ownNames(f, 1)[0] || "", file_genre: f.tags[2],
               ...(f.info !== undefined ? { info: f.info } : {}) });
  }
  return out;
}

/** The artist / title a file goes into the rekordbox XML with: the file's own spelling where
 *  it says the same as DJ HQ's name (as tagging keeps it), and the file's whole name when it
 *  has a different one the user hasn't settled yet (`own`: the pipeline didn't write over it). */
export function listedNames(f: BatchFile, own: boolean): { artist: string; title: string } {
  const pick = (cur: string, want: string) => cur.trim() && (own || !want || looseEq(cur, want)) ? cur : want;
  return { artist: pick(f.file_artist, f.artist), title: pick(f.file_title, f.title) };
}

/** The file still says exactly these names (and genre), where rekordbox reads them: for a
 *  WAV in its LIST/INFO chunk too. Empty values aren't checked. */
export function fileCarries(f: BatchFile, artist: string, title: string, genre: string): boolean {
  const ok = (cur: string, want: string) => !want || sameName(cur, want);
  return ok(f.file_artist, artist) && ok(f.file_title, title) && (!genre || looseEq(f.file_genre, genre))
    && (f.info === undefined || (!!f.info && ok(f.info[0], artist) && ok(f.info[1], title)));
}

/** Tag one library file (writeTags: bit-perfect audio, other frames and chunks kept).
 *  Callers pass a BatchFile's plan names, so the file's spelling rule holds here too. */
export async function tagFile(key: string, artist: string, title: string, genre: string): Promise<void> {
  await writeTags(libPath(requireLib(), key), artist, title, genre);
}

/** The collection files matched to a library's playlist: what that playlist's bulk runs
 *  (Write tags, Convert, WAV to AIFF) work on. The rest of the collection is not this
 *  playlist's to rewrite. */
async function matchedFilesOf(lib: Library): Promise<LocalFile[]> {
  const view = await buildView(lib);
  const fmap = new Map((await scanCollection()).map((f) => [f.name, f]));
  return (view.tracks || []).filter((r: any) => r.file && fmap.has(r.file)).map((r: any) => fmap.get(r.file)!);
}

/** The active playlist's matched files that look unprocessed: no Platinum Notes mark
 *  (where the format can tell) or no musical key in the tags. */
export async function unprocessedFiles(): Promise<string[]> {
  const lib = requireLib();
  return (await matchedFilesOf(lib)).filter((f) => f.pn === false || !f.key).map((f) => f.name);
}

/** The rate a file goes to for a player: its own when the player takes it, else the highest the
 *  player takes in the same family (44.1 or 48 kHz multiples) that is not above it. */
function targetRate(sr: number, dev: Device): number {
  if (!sr || dev.srs.includes(sr)) return sr || 44100;
  const fam = sr % 48000 === 0 ? 48000 : 44100;
  const ok = dev.srs.filter((x) => x % fam === 0 && x <= sr);
  return ok.length ? Math.max(...ok) : fam;
}
/** A temp WAV with a WAVE_FORMAT_EXTENSIBLE header (ffmpeg writes one for more than 16 bits or
 *  48 kHz) gets the plain PCM header Pioneer players read; the samples and other chunks stay. */
function plainWav(tmp: string): void {
  const t2 = staleGone(tmp + ".tmp.wav");
  try { if (plainPcmCopy(tmp, t2)) fs.renameSync(t2, tmp); } finally { doneTmp(t2); }
}

/** Convert every file of the active library that won't play on the player (compatReason):
 *  - WAV and AIFF in place, with the same name and length, so rekordbox keeps hot cues, grids and
 *    analysis: a lower depth or rate where needed, and a WAV that is only refused for its
 *    WAVE_FORMAT_EXTENSIBLE header gets the plain one (the samples copied byte for byte);
 *  - FLAC and ALAC on a player that reads them, in place in the same format (depth or rate);
 *  - anything the player can't read at all (FLAC, ALAC, OGG, an MP3 or AAC at an odd rate) becomes
 *    an AIFF next to it (toAiff): the name changes, so rekordbox needs its export updated.
 *  The untouched original goes to the backups first; Restore originals brings it back. The run is
 *  claimed by the route (claimTagRun("convert")), so GET /api/tag/progress counts its files. */
export async function convertAll(): Promise<any> {
  try {
    const view = await convertRun();
    TAG_RUN.report = view.convert_report;
    return view;
  } finally { TAG_RUN.running = false; }
}
async function convertRun(): Promise<any> {
  const lib = requireLib();
  const devKey = DEVICES[STATE.device] ? STATE.device : "xdj-700";
  const dev = DEVICES[devKey];
  const bdir = backupDir(lib);
  let done = 0, aiff = 0;
  const errors: string[] = [], error_items: ErrorItem[] = [];
  const fail = (name: string, e: any) => { errors.push(`${name}: ${e.message}`); error_items.push(errItem(name, e)); };
  const todo = (await matchedFilesOf(lib)).filter((f) => compatReason(f.fmt, devKey, f.wext));
  TAG_RUN.total = todo.length;
  for (const f of todo) {
    TAG_RUN.done++;   // counted as it starts: the ring shows the file being worked on
    const why = compatReason(f.fmt, devKey, f.wext)!;
    const [codec, sr, bits] = f.fmt;
    const ext = path.extname(f.name).toLowerCase();
    const pcm = codec.startsWith("pcm") && [".wav", ".aiff", ".aif"].includes(ext);
    const same = (codec === "flac" && dev.flac && ext === ".flac") || (codec === "alac" && dev.alac && ext === ".m4a");
    const newSr = targetRate(sr, dev), newBits = Math.min(bits || 16, dev.wavBits);
    if (!codec) { fail(f.name, appError("convert_manual_unknown", "this format can't be read, so it was left as it is")); continue; }
    if (!pcm && !same) {
      try { await toAiff(lib, f, newSr, /^(pcm|flac|alac)/.test(codec) ? newBits : 16); aiff++; done++; }
      catch (e: any) { fail(f.name, e); }
      continue;
    }
    const tmp = liveTmp(f.path + ".tmp" + ext);
    try {
      const bpath = path.join(bdir, ...backupKeyFor(f.path).split("/"));
      fs.mkdirSync(path.dirname(bpath), { recursive: true });
      if (!fs.existsSync(bpath)) copyPreservingTimes(f.path, bpath);
      if (why === "WAV header") {
        // only the header: the samples and every chunk byte for byte
        if (!plainPcmCopy(f.path, tmp)) throw appError("convert_header_failed", "the WAV header could not be rewritten");
        if ((await audioMd5(tmp)) !== (await audioMd5(f.path))) throw appError("audio_would_change", "audio data would change, left untouched");
      } else if (same) {
        // FLAC / ALAC in their own format; tags and the cover go along
        const s32 = newBits > 16, args = ["-y", "-v", "error", "-nostdin", "-i", f.path, "-map", "0:a:0", "-map", "0:v?", "-c:v", "copy",
          "-map_metadata", "0", "-c:a", codec, "-sample_fmt", codec === "flac" ? (s32 ? "s32" : "s16") : (s32 ? "s32p" : "s16p"),
          ...(s32 ? ["-bits_per_raw_sample", String(newBits)] : []), "-ar", String(newSr), tmp];
        const r = await run(FFMPEG, args, 600000);
        if (r.code !== 0) throw appError("ffmpeg_failed", "ffmpeg: " + r.stderr.slice(0, 200), { error: r.stderr.slice(0, 200) });
        if (Math.abs((await probeDuration(tmp)) - f.dur) > 0.5) throw appError("duration_changed", "duration changed after convert, aborted");
      } else {
        const [artist, title, genre] = f.tags;
        const isAiff = ext === ".aiff" || ext === ".aif";
        const acodec = `pcm_s${newBits <= 16 ? 16 : newBits <= 24 ? 24 : 32}${isAiff ? "be" : "le"}`;
        const args = ["-y", "-v", "error", "-i", f.path, "-map", "0:a",
                      "-c:a", acodec, "-ar", String(newSr), "-map_metadata", "-1"];
        if (!isAiff) args.push(...metaArgs(artist, title, genre)); // RIFF INFO, as writeTags
        args.push(tmp);
        const r = await run(FFMPEG, args, 600000);
        if (r.code !== 0) throw appError("ffmpeg_failed", "ffmpeg: " + r.stderr.slice(0, 200), { error: r.stderr.slice(0, 200) });
        if (Math.abs((await probeDuration(tmp)) - f.dur) > 0.5)
          throw appError("duration_changed", "duration changed after convert, aborted");
        // The ID3 tag (rekordbox reads it) keeps every frame: key, energy, comments.
        // Platinum Notes' marker (PLTN chunk, or GEOB frame) is kept too: its processing
        // is in the samples and survives a change of bit depth or rate, and without the
        // marker it would process the file a second time. Peak chunks are dropped, cue
        // and loop positions only when the sample rate changes.
        const tag = mergedTag(f.path, artist, title, genre);
        const keep = carriedChunks(f.path, false, newSr === sr);
        appendChunks(tmp, tag.length > 10 ? [{ id: isAiff ? "ID3 " : "id3 ", data: tag }, ...keep] : keep);
        if (!isAiff) plainWav(tmp);
      }
      await keepFileMeta(f.path, tmp);
      fs.renameSync(tmp, f.path);
      await refreshCache(f.path);
      done++;
    } catch (e: any) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      fail(f.name, e);
    } finally { LIVE_TMP.delete(tmp); }
  }
  saveState();
  const view = await buildView();
  view.convert_report = { done, aiff, errors, error_items, backup_dir: bdir };
  return view;
}

/** An ALAC file as a WAV the in-app preview can play (Chromium has no ALAC decoder): decoded once
 *  into a folder in the system's temp folder, where the last few stay; null when the file is not
 *  ALAC (AAC in an .m4a plays as it is) or can't be decoded. The file itself is only read. */
const PREVIEW_DIR = path.join(os.tmpdir(), "djhq-preview");
export async function previewAs(p: string): Promise<string | null> {
  if (path.extname(p).toLowerCase() !== ".m4a") return null;
  const c = STATE.dur_cache[p] as CacheEntry | undefined;
  const codec = c?.[3]?.[0] || (await probe(p)).fmt[0];
  if (codec !== "alac") return null;
  const st = fs.statSync(p);
  const out = path.join(PREVIEW_DIR, require("crypto").createHash("sha1").update(`${p}|${st.size}|${st.mtimeMs}`).digest("hex").slice(0, 20) + ".wav");
  if (fs.existsSync(out)) { try { fs.utimesSync(out, new Date(), new Date()); } catch { /* ignore */ } return out; }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const part = out + ".part.wav";
  const r = await run(FFMPEG, ["-y", "-v", "error", "-nostdin", "-i", p, "-map", "0:a:0", "-c:a", "pcm_s16le", part], 120000);
  if (r.code !== 0) { try { fs.unlinkSync(part); } catch { /* none */ } return null; }
  fs.renameSync(part, out);
  // the three played last stay
  try {
    const old = fs.readdirSync(PREVIEW_DIR).filter((n) => n.endsWith(".wav") && !n.endsWith(".part.wav"))
      .map((n) => path.join(PREVIEW_DIR, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const q of old.slice(3)) fs.unlinkSync(q);
  } catch { /* another DJ HQ may be tidying too */ }
  return out;
}

/** The AIFF a file of another format becomes ("X.flac" > "X.aif"), and one of that name already there. */
const asAiffKey = (key: string) => key.replace(/\.[^./]+$/, ".aif");
const asAiffThere = (p: string) => [".aif", ".aiff", ".AIF", ".AIFF"].some((e) => fs.existsSync(p.replace(/\.[^./\\]+$/, e)));

/** The names, key and a few more tags of any file (FLAC and OGG keep them as Vorbis comments,
 *  M4A as iTunes atoms), and its front cover, for the ID3 tag of the AIFF it becomes. */
async function sourceTags(p: string, picOut: string): Promise<{ frames: Frame[]; artist: string; title: string; genre: string; key: string }> {
  const r = await run(FFPROBE, ["-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", p], 30000);
  let tags: Record<string, string> = {};
  try { const j = JSON.parse(r.stdout); tags = { ...(j.streams?.[0]?.tags || {}), ...(j.format?.tags || {}) }; } catch { /* none */ }
  const get = (...ks: string[]) => { for (const k of ks) { const v = lookupTag(tags, k).trim(); if (v) return v; } return ""; };
  const text = (id: string, v: string): Frame => ({ id, data: Buffer.concat([Buffer.from([0x01, 0xff, 0xfe]), Buffer.from(v, "utf16le"), Buffer.from([0, 0])]) });
  const frames: Frame[] = [];
  const key = get("initialkey", "key", "tkey");
  if (key) frames.push(text("TKEY", key));
  const album = get("album"); if (album) frames.push(text("TALB", album));
  const bpm = get("bpm", "tbpm", "tmpo"); if (/^\d+(\.\d+)?$/.test(bpm)) frames.push(text("TBPM", String(Math.round(Number(bpm)))));
  const year = /^\d{4}/.exec(get("date", "year", "tyer"))?.[0]; if (year) frames.push(text("TYER", year));
  // the cover: the first picture stream, copied as it is
  const pr = await run(FFMPEG, ["-y", "-v", "error", "-nostdin", "-i", p, "-an", "-map", "0:v:0", "-c", "copy", "-f", "image2", picOut], 30000);
  try {
    if (pr.code === 0) {
      const img = fs.readFileSync(picOut), mime = pictureMime(img);
      if (mime) frames.push({ id: "APIC", data: Buffer.concat([Buffer.from([0x00]), Buffer.from(mime + "\0", "latin1"), Buffer.from([0x03, 0x00]), img]) });
    }
  } catch { /* no picture */ } finally { try { fs.unlinkSync(picOut); } catch { /* none */ } }
  return { frames, artist: get("artist"), title: get("title"), genre: get("genre"), key };
}

/** One file the player can't read (FLAC, ALAC, OGG, an MP3 or AAC at an odd rate) becomes an AIFF
 *  next to it: `bits` deep at `sr` (the same samples when neither changes, checked by their MD5),
 *  with an ID3v2.3 tag written by DJ HQ (names, key, album, BPM, year, the cover). Then the AIFF
 *  takes the file's place, the original goes to the backups (Restore originals puts it back and
 *  moves the AIFF out, as for a WAV made AIFF), and what DJ HQ remembers follows it; aiff_from
 *  records it, so Update a rekordbox export points the tracks at the AIFF. Returns the new key. */
async function toAiff(lib: Library, f: LocalFile, sr: number, bits: number): Promise<string> {
  const key = f.name, src = f.path;
  if (asAiffThere(src)) throw appError("aiff_exists", "an AIFF file with this name is already there, so the file was left alone");
  const before = await probeAudio(src);
  if (!before) throw appError("convert_manual_unknown", "this format can't be read, so it was left as it is");
  const newKey = asAiffKey(key), dst = libPath(lib, newKey);
  const tmp = staleGone(dst + ".tmp.aif");
  const depth = bits <= 16 ? 16 : bits <= 24 ? 24 : 32;
  const exact = sr === before.sr && depth === before.bits && /^(pcm|flac|alac)/.test(before.codec);
  try {
    const r = await run(FFMPEG, ["-y", "-v", "error", "-nostdin", "-i", src, "-map", "0:a:0", "-c:a", `pcm_s${depth}be`, "-ar", String(sr),
      "-map_metadata", "-1", "-write_id3v2", "0", "-fflags", "+bitexact", tmp], 600000);
    if (r.code !== 0) throw appError("ffmpeg_failed", "ffmpeg: " + r.stderr.slice(0, 200), { error: r.stderr.slice(0, 200) });
    const t = await sourceTags(src, dst + ".cover");
    const tag = buildId3v23(t.artist, t.title, t.genre, t.frames);
    if (tag.length > 10) appendChunks(tmp, [{ id: "ID3 ", data: tag }]);
    const after = await probeAudio(tmp);
    const bad = (why: string) => appError("aiff_check_failed", "the AIFF copy did not come out as planned, so the file was kept: " + why, { why });
    if (!after || after.sr !== sr || after.bits !== depth || after.ch !== before.ch || Math.abs(after.dur - before.dur) > 0.1) throw bad("format");
    if (exact && (await pcmMd5(src)) !== (await pcmMd5(tmp))) throw bad("audio");
    if (t.key && readKeyInfo(tmp).key !== t.key) throw bad("tag");
    await keepFileMeta(src, tmp);
    if (fs.existsSync(dst)) throw appError("aiff_exists", "an AIFF file with this name is already there, so the file was left alone");
    fs.renameSync(tmp, dst);
  } catch (e) {
    doneTmp(tmp);
    throw e;
  } finally { LIVE_TMP.delete(tmp); }
  try {
    const bpath = path.join(backupDir(lib), ...backupKeyFor(src).split("/"));
    fs.mkdirSync(path.dirname(bpath), { recursive: true });
    backupMove(src, fs.existsSync(bpath) ? replacedName(lib, path.basename(src)) : bpath);
  } catch (e: any) {
    try { fs.unlinkSync(dst); } catch { /* ignore */ }
    throw appError("aiff_backup_failed", "the original could not be moved to the backups, so it was kept and the AIFF copy was removed: " + String(e?.message || e), { error: String(e?.code || e?.message || e) });
  }
  renameRecords(lib, key, newKey);
  lib.aiff_from = { ...(lib.aiff_from || {}), [key]: newKey };
  delete STATE.dur_cache[src];
  await refreshCache(dst);
  saveState();
  return newKey;
}

// ---------------- WAV to AIFF ----------------

/** The PCM codecs a WAV may have to become an AIFF, and the AIFF codec each becomes: the
 *  same samples in big-endian order. Nothing else is converted (float, 8 bit, compressed). */
const AIFF_CODEC: Record<string, string> = { pcm_s16le: "pcm_s16be", pcm_s24le: "pcm_s24be", pcm_s32le: "pcm_s32be",
  pcm_f32le: "pcm_f32be", pcm_f64le: "pcm_f64be" };   // float: the same samples in an AIFF-C file
/** What ffprobe says about a file's first audio stream: codec, rate, bit depth, channels, duration, names. */
async function probeAudio(p: string): Promise<{ codec: string; sr: number; bits: number; ch: number; dur: number; tags: [string, string, string] } | null> {
  const r = await run(FFPROBE, ["-v", "error", "-select_streams", "a:0", "-show_entries",
    "stream=codec_name,sample_rate,bits_per_sample,bits_per_raw_sample,channels:stream_tags=artist,title,genre:format=duration:format_tags=artist,title,genre",
    "-of", "json", p], 30000);
  try {
    const j = JSON.parse(r.stdout), st = j.streams?.[0];
    if (!st) return null;
    const tags = { ...(j.format?.tags || {}), ...(st.tags || {}) };
    return { codec: st.codec_name || "", sr: parseInt(st.sample_rate || "0", 10) || 0,
             bits: Number(st.bits_per_sample) || Number(st.bits_per_raw_sample) || 0, ch: Number(st.channels) || 0,
             dur: parseFloat(j.format?.duration || "0") || 0,
             tags: [lookupTag(tags, "artist"), lookupTag(tags, "title"), lookupTag(tags, "genre")] };
  } catch { return null; }
}
/** MD5 of the decoded audio as 32-bit samples: the same for a WAV and its AIFF copy exactly when
 *  every sample is the same (a plain "-f md5" decodes to 16 bit and misses the low byte of a 24-bit sample). */
async function pcmMd5(p: string, as = "pcm_s32le"): Promise<string> {
  const r = await run(FFMPEG, ["-v", "error", "-nostdin", "-i", p, "-map", "0:a:0", "-c:a", as, "-f", "md5", "-"], 600000);
  return r.code === 0 ? r.stdout.trim() : "";
}
const isRiffWave = (p: string) => {
  try { const fd = fs.openSync(p, "r"); const b = Buffer.alloc(12); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
        return b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE"; } catch { return false; }
};
/** the AIFF a WAV key becomes, and an AIFF of that name already there ("X.aif" or "X.aiff") */
const aiffKey = (key: string) => key.replace(/\.wav$/i, ".aif");
const aiffThere = (p: string) => [".aif", ".aiff", ".AIF", ".AIFF"].some((e) => fs.existsSync(p.replace(/\.wav$/i, e)));
/** Why a WAV of the library can't become an AIFF now (null: it can): its format, or an AIFF with its name. */
function aiffSkip(f: LocalFile): "format" | "exists" | null {
  if (!AIFF_CODEC[f.fmt[0]]) return "format";
  return aiffThere(f.path) ? "exists" : null;
}
/** The error that says why a WAV stays WAV for its format: float audio in words, else the codec. */
function aiffFormatError(codec: string): Error {
  const fl = /^pcm_f(\d+)/.exec(codec);
  if (fl) return appError("aiff_float", `this file holds ${fl[1]}-bit float audio, which most players cannot play, so it was left as WAV. If Prepare for player lists it as not playable, use Convert there first, then convert to AIFF again`, { bits: Number(fl[1]) });
  return appError("aiff_format", `${codec} audio stays WAV: only WAV files with 16, 24 or 32-bit integer samples are converted`, { codec });
}
const aiffExistsError = () => appError("aiff_exists", "an AIFF file with this name is already there, so the WAV was left alone");

/** Move a file into the backups (or out of them): a rename, or on another volume a copy with
 *  its times kept and then the source removed (the copy is removed again when that fails). */
function backupMove(src: string, dst: string): void {
  try { fs.renameSync(src, dst); }
  catch (e: any) {
    if (e?.code !== "EXDEV") throw e;
    copyPreservingTimes(src, dst);
    try { fs.unlinkSync(src); } catch (e2) { try { fs.unlinkSync(dst); } catch { /* ignore */ } throw e2; }
  }
  COLL_DIRTY = true;
}
/** A free name in originals/<lib>/replaced/ for `base` (" (2)", " (3)" … when taken), the folder made. */
function replacedName(lib: Library, base: string): string {
  const rdir = path.join(backupDir(lib), "replaced");
  fs.mkdirSync(rdir, { recursive: true });
  let keep = path.join(rdir, base);
  for (let i = 2; fs.existsSync(keep); i++) keep = path.join(rdir, base.replace(/(\.[^.]+)$/, ` (${i})$1`));
  return keep;
}

/** One WAV of the library becomes an AIFF: the same samples (pcm_sNNle to pcm_sNNbe, same rate,
 *  depth and channels; nothing is ever resampled or changed in depth), its names and every other
 *  ID3 frame (key, comments, Platinum Notes' mark, cover) as an ID3v2.3 tag written by DJ HQ, the
 *  LIST/INFO fields the tag lacks as frames, Platinum Notes' PLTN chunk, the file's dates and
 *  extended attributes. Written to "X.aif.tmp.aif" and checked before the WAV goes: decoded audio
 *  (32-bit MD5), format, duration, the names ffprobe reads and the key / picture / mark DJ HQ
 *  reads. Then the AIFF takes the WAV's place, the WAV goes to the backups (originals/<lib>/<key>,
 *  so Restore originals can put it back; an older backup of that key is kept), and everything
 *  DJ HQ remembers about the file follows it. On any doubt the WAV stays and the copy is
 *  deleted. Returns the new key. */
export async function wavToAiff(lib: Library, key: string): Promise<string> {
  const src = libPath(lib, key);
  if (path.extname(src).toLowerCase() !== ".wav") throw appError("aiff_format", "only WAV files are converted", { codec: path.extname(src).slice(1) || "?" });
  const before = await probeAudio(src);
  const be = before && isRiffWave(src) ? AIFF_CODEC[before.codec] : undefined;
  if (!before || !be) throw aiffFormatError(before?.codec || "unknown");
  if (aiffThere(src)) throw appError("aiff_exists", "an AIFF file with this name is already there, so the WAV was left alone");
  const newKey = aiffKey(key), dst = libPath(lib, newKey);
  const tmp = staleGone(dst + ".tmp.aif");
  const fail = (why: string) => appError("aiff_check_failed", "the AIFF copy did not match the WAV, so the WAV was kept: " + why, { why });
  let srcMd5 = "";
  // float audio is compared as float (as 32-bit integers it would be clipped and rounded)
  const md5As = /^pcm_f/.test(before.codec) ? before.codec : "pcm_s32le";
  try {
    const r = await run(FFMPEG, ["-y", "-v", "error", "-nostdin", "-i", src, "-map", "0:a:0", "-c:a", be,
      "-map_metadata", "-1", "-write_id3v2", "0", "-fflags", "+bitexact", tmp], 600000);
    if (r.code !== 0) throw appError("ffmpeg_failed", "ffmpeg: " + r.stderr.slice(0, 200), { error: r.stderr.slice(0, 200) });
    // the names rekordbox showed for the WAV (its LIST/INFO first, as ffprobe reads it), every other frame carried
    const [artist, title, genre] = before.tags;
    const tag = mergedTag(src, artist, title, genre);
    const have = carriedFrames(src, []).map((f) => f.id);
    const extra = infoAsFrames(src, have);
    const full = extra.length ? buildId3v23(artist, title, genre, [...carriedFrames(src, ["TPE1", "TIT2", "TCON"].filter((_, i) => [artist, title, genre][i])), ...extra]) : tag;
    const pltn = carriedChunks(src, true, true).filter((c) => c.id === "PLTN");
    const wrote = full.length > 10;
    appendChunks(tmp, [...(wrote ? [{ id: "ID3 ", data: full }] : []), ...pltn]);
    if (process.env.DJHQ_TEST_AIFF_CORRUPT === "1") {   // tests: a copy whose audio differs must never replace the WAV
      const fd = fs.openSync(tmp, "r+"); const b = Buffer.alloc(1); const at = Math.floor(fs.fstatSync(fd).size / 2);
      fs.readSync(fd, b, 0, 1, at); b[0] ^= 0x01; fs.writeSync(fd, b, 0, 1, at); fs.closeSync(fd);
    }
    // the check, before anything is removed
    const after = await probeAudio(tmp);
    if (!after || after.codec !== be || after.sr !== before.sr || after.bits !== before.bits || after.ch !== before.ch
        || Math.abs(after.dur - before.dur) > 0.05) throw fail("format");
    const [m1, m2] = [await pcmMd5(src, md5As), await pcmMd5(tmp, md5As)];
    if (!m1 || m1 !== m2) throw fail("audio");
    srcMd5 = m1;
    // (a name the WAV shows none for comes from its ID3 chunk, carried as it is)
    if (after.tags.some((v, i) => !!before.tags[i].trim() && v.trim() !== before.tags[i].trim())) throw fail("names");
    const k1 = readKeyInfo(src), k2 = readKeyInfo(tmp);
    if ((wrote && k2.ver !== 3) || k1.key !== k2.key || !!k1.pic !== !!k2.pic || k1.pn !== k2.pn) throw fail("tag");
    await keepFileMeta(src, tmp);
    if (fs.existsSync(dst)) throw appError("aiff_exists", "an AIFF file with this name is already there, so the WAV was left alone");
    fs.renameSync(tmp, dst);
  } catch (e) {
    doneTmp(tmp);
    throw e;
  } finally { LIVE_TMP.delete(tmp); }
  // the WAV to the backups: only then is it gone from the library. A backup of this key that is
  // there already is never thrown away, and the WAV just converted is never dropped unless the
  // backup holds the same audio:
  // - the backup is the WAV of an earlier conversion of this name (aiff_from), so this WAV is a
  //   later file (a new download of the same name): it becomes the backup, the older one goes to replaced/;
  // - otherwise the backup is the original a Convert on the Prepare page kept: it stays the backup
  //   (Restore originals puts that original back) and this WAV goes to replaced/.
  try {
    const bpath = path.join(backupDir(lib), ...backupKeyFor(src).split("/"));
    if (!fs.existsSync(bpath)) {
      fs.mkdirSync(path.dirname(bpath), { recursive: true });
      backupMove(src, bpath);
    } else if (srcMd5 && (await pcmMd5(bpath, md5As)) === srcMd5) fs.unlinkSync(src);
    else if (lib.aiff_from?.[key]) {
      const keep = replacedName(lib, path.basename(bpath));
      backupMove(bpath, keep);
      try { backupMove(src, bpath); } catch (e) { try { backupMove(keep, bpath); } catch { /* ignore */ } throw e; }
    } else backupMove(src, replacedName(lib, path.basename(src)));
  } catch (e: any) {
    try { fs.unlinkSync(dst); } catch { /* ignore */ }
    throw appError("aiff_backup_failed", "the WAV could not be moved to the backups, so it was kept and the AIFF copy was removed: " + String(e?.message || e), { error: String(e?.code || e?.message || e) });
  }
  renameRecords(lib, key, newKey);
  lib.aiff_from = { ...(lib.aiff_from || {}), [key]: newKey };
  delete STATE.dur_cache[src];
  await refreshCache(dst);
  saveState();
  return newKey;
}

/** Convert WAV files to AIFF for the active library. `preview`: nothing is written; {wav, convert,
 *  skip: {format, exists}, bytes (of the WAVs that would go to the backups), free_bytes (in the data
 *  folder), backup_dir}. The run (claimed by the route: claimTagRun("aiff")) goes through every WAV
 *  with wavToAiff, skips one that changed on disk since the scan, and reports in view.aiff_report
 *  (also TAG_RUN.report): {aiff: true, done, total, kept: the WAVs left as they are and why, errors,
 *  error_items, changed, backup_dir}. */
export async function aiffAll(opts: { preview?: boolean } = {}): Promise<any> {
  if (opts.preview) return aiffRun(true);
  try {
    const view = await aiffRun(false);
    TAG_RUN.report = view.aiff_report;
    return view;
  } finally { TAG_RUN.running = false; }
}
async function aiffRun(preview: boolean): Promise<any> {
  const lib = requireLib();
  const wavs = (await matchedFilesOf(lib)).filter((f) => path.extname(f.name).toLowerCase() === ".wav");
  const bdir = backupDir(lib);
  if (preview) {
    const skip = { format: 0, exists: 0 };
    const kept: ErrorItem[] = [];   // which files stay WAV and why (at most 200)
    let convert = 0, bytes = 0;
    for (const f of wavs) {
      const why = aiffSkip(f);
      if (why) {
        skip[why]++;
        if (kept.length < 200) kept.push(errItem(f.name, why === "format" ? aiffFormatError(f.fmt[0] || "unknown") : aiffExistsError()));
        continue;
      }
      convert++;
      try { bytes += fs.statSync(f.path).size; } catch { /* gone */ }
    }
    let free: number | null = null;
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); const st = (fs as any).statfsSync(DATA_DIR); free = Number(st.bavail) * Number(st.bsize); } catch { /* unknown */ }
    return { wav: wavs.length, convert, skip, kept, bytes, free_bytes: free, backup_dir: bdir };
  }
  TAG_RUN.total = wavs.length;
  const stamps = new Map(wavs.map((f) => [f.path, fileStamp(f.path, true)]));
  let done = 0;
  const kept: ErrorItem[] = [], errors: string[] = [], error_items: ErrorItem[] = [], changed: string[] = [];
  for (const f of wavs) {
    const stamp = stamps.get(f.path);
    try { const t = aiffKey(f.path) + ".tmp.aif"; if (!LIVE_TMP.has(t)) fs.unlinkSync(t); } catch { /* none: a run cut off before leaves one */ }
    if (fileStamp(f.path) !== stamp) changed.push(f.name);
    else try {
      await wavToAiff(lib, f.name);
      done++;
    } catch (e: any) {
      if (e?.code === "aiff_format" || e?.code === "aiff_float" || e?.code === "aiff_exists") kept.push(errItem(f.name, e));
      else { errors.push(`${f.name}: ${e.message}`); error_items.push(errItem(f.name, e)); }
    }
    TAG_RUN.done++;
  }
  const view = await buildView();
  view.aiff_report = { aiff: true, done, total: wavs.length, kept, errors, error_items, changed, backup_dir: bdir };
  return view;
}

/** Copy backed-up originals back into the library folder (backups are kept). A WAV that Convert
 *  WAV files to AIFF made an AIFF of is an undo of that: the WAV comes back, the AIFF goes to
 *  originals/<lib>/replaced/ (nothing is deleted; Clean up frees it), and what DJ HQ remembers
 *  about the AIFF (pins, found, edits) moves back to the WAV. */
export async function restoreAll(): Promise<any> {
  const lib = requireLib();
  let done = 0, aiff_undone = 0;
  const errors: string[] = [], error_items: ErrorItem[] = [];
  for (const [key, src, dst, aiff] of restorable(lib)) {
    try {
      const had = fs.existsSync(dst);
      copyPreservingTimes(src, dst);
      if (aiff) {
        try { backupMove(aiff[1], replacedName(lib, path.basename(aiff[1]))); }
        catch (e) { if (!had) try { fs.unlinkSync(dst); } catch { /* ignore */ } throw e; }
        renameRecords(lib, aiff[0], dst);
        delete STATE.dur_cache[aiff[1]];
        aiff_undone++;
      }
      done++;
    } catch (e: any) {
      errors.push(`${key}: ${e.message}`);
      error_items.push(errItem(key, e));
    }
  }
  const view = await buildView();
  view.restore_report = { done, aiff_undone, errors, error_items };
  return view;
}

/** Delete every backup of the active library (originals/<lib>/, including replaced/). */
export async function cleanBackups(): Promise<any> {
  const lib = requireLib();
  const bdir = backupDir(lib);
  let files = 0, freed = 0;
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { freed += fs.statSync(p).size; files++; }
    }
  };
  if (fs.existsSync(bdir)) { walk(bdir); fs.rmSync(bdir, { recursive: true, force: true }); }
  if (lib.aiff_from) { delete lib.aiff_from; saveState(); }   // nothing left to undo
  const view = await buildView();
  view.clean_report = { freed_bytes: freed, files };
  return view;
}

export const sameDir = (a: string, b: string) => {
  try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return path.resolve(a) === path.resolve(b); }
};
const insideDir = (inner: string, outer: string) => {
  const rel = path.relative(path.resolve(outer), path.resolve(inner));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
/** A folder given by the user (typed or picked): "~" expanded, must exist. */
function userDir(raw: any): string {
  const d = String(raw || "").trim().replace(/^~(?=$|\/)/, os.homedir());
  if (!d) throw appError("no_folder", "no folder given");
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw appError("folder_not_found", `folder not found: ${d}`, { dir: d });
  return path.resolve(d);
}

/** POST /api/library: {op: "add", url, dir?} · {op: "select", id} · {op: "remove", id}
 *  · {op: "set_url", url, id?} · {op: "set_target", dir, id?} (the playlist's own move
 *  target; "" or null clears it) · {op: "files_ready", id?}
 *  (the ops act on the active library unless `id` says otherwise). add may bring a first
 *  folder along (the setup page): it becomes a collection root when it isn't one yet.
 *  add and set_url answer with view.fetch_report = {unreadable}, set_url also with {same,
 *  of, had}: how many of the tracks were already in the old playlist. When the new link
 *  misses tracks the library had, set_url changes nothing and answers {confirm: report}
 *  (not a view) unless `confirm: true` was sent. */
export async function libraryOp(data: any): Promise<any> {
  const op = data.op;
  const libs = STATE.libraries;
  const target = (): Library => {
    const lib = data.id ? libs.find((l) => l.id === data.id) : activeLib();
    if (!lib) throw appError("library_not_found", "library not found");
    return lib;
  };
  if (op === "add") {
    const url = await expandScUrl(data.url);
    if (!url.startsWith("http")) throw appError("url_not_full", "please give a full SoundCloud playlist or likes URL");
    if (data.dir) addRoot(userDir(data.dir));   // the setup page brings the first folder along
    const nid = "lib" + (Math.max(0, ...libs
      .filter((l) => /^lib\d+$/.test(l.id)).map((l) => parseInt(l.id.slice(3), 10))) + 1);
    const lib: Library = { id: nid, dir: "", url, playlist: null };
    libs.push(lib);
    STATE.active = nid;
    const unreadable = await fetchPlaylist(lib); // throws on bad URL / no internet; lib stays for retry
    const view = await buildView();
    view.fetch_report = { unreadable };
    return view;
  } else if (op === "set_target") {
    const lib = target();
    const d = String(data.dir || "").trim();
    if (!d) delete lib.target;
    else {
      const t = userDir(d);
      if (!rootOf(t) && !collRoots().some((r) => sameDir(r.path, t)))
        throw appError("target_outside_collection", "the move target must be a folder of the collection", { dir: t });
      lib.target = t;
    }
  } else if (op === "set_url") {
    // a new link for the same library, typically the same playlist made private (its share link):
    // read it first; only a good read replaces the link and the snapshot. Everything keyed by
    // track id or file stays as it is, and refresh's merge keeps the first-seen times.
    const lib = target();
    const url = await expandScUrl(data.url);
    if (!url.startsWith("http")) throw appError("url_not_full", "please give a full SoundCloud playlist or likes URL");
    // (a library imported without its link has none to compare with: the track check below still guards it)
    if (lib.url && !!likesUser(url) !== !!likesUser(lib.url))
      throw likesUser(lib.url) ? appError("link_is_likes", "this library follows a Likes page; add a new library for a playlist")
                               : appError("link_is_playlist", "this library follows a playlist; add a new library for a Likes page");
    const r = await readPlaylist(url, lib.playlist);
    const before = new Set((lib.playlist?.tracks || []).map((t) => t.id));
    const same = r.playlist.tracks.filter((t) => before.has(t.id)).length;
    const report = { unreadable: r.unreadable, same, of: r.playlist.tracks.length, had: before.size };
    // tracks the library had that the new link doesn't show lose their matches with the next view:
    // nothing is changed until the user has seen how many (a wrong playlist, tracks it can't read)
    if (same < before.size && !data.confirm) return { confirm: report };
    lib.url = url;
    lib.playlist = r.playlist;
    saveState();
    const view = await buildView();
    view.fetch_report = report;
    return view;
  } else if (op === "select") {
    if (libs.some((l) => l.id === data.id)) STATE.active = data.id;
  } else if (op === "remove") {
    if (libs.length <= 1) throw appError("last_library", "cannot remove the last library");
    STATE.libraries = libs.filter((l) => l.id !== data.id);
    if (STATE.active === data.id) STATE.active = STATE.libraries[0].id;
  } else if (op === "files_ready") {
    // an imported library whose music was being copied: the user says the copy is complete, so
    // pins whose file still isn't there are dropped with the next view, as for any other library
    delete target().files_pending;
  } else {
    throw appError("bad_request", "unknown library op");
  }
  saveState();
  return buildView();
}

/** Add a folder as a collection root (used by collectionOp and the setup flow). A folder
 *  that is a root already is left as it is; one inside a root that scans its subfolders is
 *  refused (it is covered); a root inside the new folder stays (files are listed once). */
function addRoot(d: string, subfolders = true): CollectionRoot {
  const coll = collection();
  const have = coll.roots.find((r) => sameDir(r.path, d));
  if (have) return have;
  for (const r of coll.roots)
    if (r.subfolders && insideDir(d, r.path))
      throw appError("folder_inside", `${d} is inside ${r.path}, which is scanned with its subfolders already`, { dir: d, parent: r.path });
  const id = "r" + (Math.max(0, ...coll.roots.map((r) => parseInt(/^r(\d+)$/.exec(r.id)?.[1] || "0", 10))) + 1);
  const root: CollectionRoot = { id, path: d, ...(subfolders ? { subfolders: true } : {}) };
  coll.roots.push(root);
  COLL_DIRTY = true;
  return root;
}

/** POST /api/collection: {op: "add_root", dir, subfolders?} · {op: "remove_root", id}
 *  · {op: "subfolders", id, on} · {op: "set_move_target", dir} ("" or null: back to the
 *  first root) · {op: "rescan"}. remove_root answers with view.remove_report: the tracks
 *  (of any playlist) whose file was under that root and that have none now. */
export async function collectionOp(data: any): Promise<any> {
  const op = data.op;
  const coll = collection();
  if (op === "add_root") {
    addRoot(userDir(data.dir), data.subfolders !== false);
  } else if (op === "remove_root") {
    const root = coll.roots.find((r) => r.id === data.id || (data.dir && sameDir(r.path, String(data.dir))));
    if (!root) throw appError("root_not_found", "that folder is not part of the collection");
    // what every playlist holds under this root right now, for the report
    const had: { lib: string; id: number; artist: string; title: string; file: string }[] = [];
    for (const l of STATE.libraries) {
      if (!l.playlist) continue;
      for (const r of ((await buildView(l)).tracks || []))
        if (r.file && (r.file as string).startsWith(root.path + path.sep)) had.push({ lib: l.id, id: r.id, artist: r.artist, title: r.title, file: r.file });
    }
    coll.roots = coll.roots.filter((r) => r !== root);
    if (coll.move_target && insideUnder(coll.move_target)) delete coll.move_target;
    if (coll.last_target && insideUnder(coll.last_target)) delete coll.last_target;
    for (const l of STATE.libraries) if (l.target && insideUnder(l.target)) delete l.target;
    function insideUnder(p: string) { return sameDir(p, root!.path) || insideDir(p, root!.path); }
    for (const k of Object.keys(STATE.dur_cache)) if (k.startsWith(root.path + path.sep)) delete STATE.dur_cache[k];
    COLL_DIRTY = true;
    MATCH_CACHE.clear();
    saveState();
    const view = await buildView();
    // rule E may have carried a record to a same-named file elsewhere; report what is left without one
    const lost: typeof had = [];
    for (const l of STATE.libraries) {
      if (!l.playlist) continue;
      const now = new Set(((l === activeLib() ? view : await buildView(l)).tracks || []).filter((r: any) => r.file).map((r: any) => r.id));
      for (const h of had) if (h.lib === l.id && !now.has(h.id)) lost.push(h);
    }
    view.remove_report = { dir: root.path, before: had.length, lost: lost.slice(0, 200), lost_count: lost.length };
    return view;
  } else if (op === "subfolders") {
    const root = coll.roots.find((r) => r.id === data.id);
    if (!root) throw appError("root_not_found", "that folder is not part of the collection");
    if (data.on) root.subfolders = true; else delete root.subfolders;
    COLL_DIRTY = true;
  } else if (op === "set_move_target") {
    const d = String(data.dir || "").trim();
    if (!d) delete coll.move_target;
    else {
      const t = userDir(d);
      if (!rootOf(t) && !coll.roots.some((r) => sameDir(r.path, t)))
        throw appError("target_outside_collection", "the move target must be a folder of the collection", { dir: t });
      coll.move_target = t;
    }
  } else if (op === "rescan") {
    COLL_DIRTY = true;
  } else {
    throw appError("bad_request", "unknown collection op");
  }
  saveState();
  return buildView();
}

/** The folders a move can land in: every root and (one level at a time) the subfolders
 *  under it, for the destination picker. `under`: list that folder's subfolders instead. */
export function moveTargets(under?: string): { path: string; name: string; dirs: { name: string; path: string; has_dirs: boolean }[] }[] {
  const list = (d: string) => {
    const out: { name: string; path: string; has_dirs: boolean }[] = [];
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        let has = false;
        try { has = fs.readdirSync(p, { withFileTypes: true }).some((x) => x.isDirectory() && !x.name.startsWith(".")); } catch {}
        out.push({ name: e.name, path: p, has_dirs: has });
      }
    } catch {}
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };
  if (under) {
    const d = path.resolve(under);
    if (!rootOf(d) && !collRoots().some((r) => sameDir(r.path, d)))
      throw appError("target_outside_collection", "that folder is not part of the collection", { dir: d });
    return [{ path: d, name: path.basename(d), dirs: list(d) }];
  }
  return collRoots().map((r) => ({ path: r.path, name: path.basename(r.path), dirs: list(r.path) }));
}

export async function refresh(): Promise<any> {
  const unreadable = await fetchPlaylist(requireLib());
  const view = await buildView();
  view.fetch_report = { unreadable };
  return view;
}

export async function setDevice(device: string): Promise<any> {
  if (DEVICES[device]) {
    STATE.device = device;
    saveState();
  }
  return buildView();
}

export async function setOverride(data: any): Promise<any> {
  const tid = String(data.id), status = data.status;
  delete STATE.overrides[tid];
  delete STATE.na[tid];
  if (status === "have" || status === "missing") STATE.overrides[tid] = status;
  else if (status === "na") { // hidden from Missing until its links change
    const t = activeLib()?.playlist?.tracks.find((x) => String(x.id) === tid);
    STATE.na[tid] = { sig: linksSig(t ? trackLinks(t) : []), at: Date.now() };
  }
  saveState();
  return buildView();
}

export async function setAssign(data: any): Promise<any> {
  // file: name = pin this file to the track, "" = force no file, null = back to auto
  const tid = String(data.id);
  const file = data.file;
  if (file === null || file === undefined) {
    delete STATE.assigned[tid]; delete STATE.by_hand[tid];
  } else {
    if (file) // a file belongs to at most one track
      for (const k of Object.keys(STATE.assigned))
        if (k !== tid && STATE.assigned[k] === file) { delete STATE.assigned[k]; delete STATE.by_hand[k]; }
    STATE.assigned[tid] = file;
    STATE.by_hand[tid] = true;
    delete STATE.overrides[tid]; // explicit assignment supersedes a have/missing override
    delete STATE.na[tid];
  }
  saveState();
  return buildView();
}

// ---------------- soundcloud search (local files not in the playlist) ----------------

export interface Found { id: number; url: string; title: string; user: string; dur: number; }
interface Candidate extends Found { score: number; name: number; dur_diff: number; in_playlist: number | null; }

/** api-v2 GET with the scraped client_id; rescrapes it once on 401/403. */
async function scApi(lib: Library, pathAndQuery: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    if (!STATE.client_id) { STATE.client_id = await scrapeClientId(await httpGet(lib.url || SC_DISCOVER)); saveState(); }
    try {
      return JSON.parse(await httpGet(`https://api-v2.soundcloud.com/${pathAndQuery}&client_id=${STATE.client_id}`));
    } catch (e: any) {
      if ((e.status === 401 || e.status === 403) && attempt === 0) { STATE.client_id = null; continue; }
      throw e;
    }
  }
}

function extraQuery(f: LocalFile): string {
  const [a, t] = extraArtistTitle(f);
  return cleanTitle(`${a} ${t}`).replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/** Search SoundCloud for a local file; candidates scored like the playlist
 *  matcher (name similarity + duration closeness), best first. Bracketed text
 *  such as "(Extended Mix)" makes SoundCloud's search return junk or nothing,
 *  so the bracket-free query goes first and the full one is merged in. */
async function searchCandidates(lib: Library, f: LocalFile, q: string): Promise<Candidate[]> {
  const bare = q.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, " ").replace(/\s+/g, " ").trim();
  const queries = bare && bare !== q ? [bare, q] : [q];
  const inPl = new Map<number, number>();
  (lib.playlist?.tracks || []).forEach((t, i) => inPl.set(t.id, i + 1));
  const stem = f.base.replace(/\.[^.]+$/, "");
  const [a, t] = extraArtistTitle(f);
  const mine = [stem, `${a} ${t}`];
  const seen = new Set<number>();
  const out: Candidate[] = [];
  for (const qq of queries) {
    const r = await scApi(lib, `search/tracks?q=${encodeURIComponent(qq)}&limit=10`);
    for (const c of r.collection || []) {
      if (c.kind !== "track" || !c.permalink_url || seen.has(c.id)) continue;
      seen.add(c.id);
      const dur = Math.round((c.full_duration || c.duration || 0) / 1000);
      const user = c.user?.username || "";
      const title = c.title || "";
      let name = 0;
      for (const m of mine) name = Math.max(name, sim(m, title), sim(m, `${user} ${title}`));
      const dd = Math.abs(f.dur - dur);
      const score = name + (dd < 3 ? 0.15 : dd < 10 ? 0.07 : 0);
      out.push({ id: c.id, url: c.permalink_url, title, user, dur,
                 score: Math.round(Math.min(1, score) * 100) / 100, name: Math.round(name * 100) / 100,
                 dur_diff: Math.round(dur - f.dur), in_playlist: inPl.get(c.id) || null });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

/** Accept without asking when either: close name AND same length with a clear
 *  gap to the runner-up (remix vs original normalise to the same words); or an
 *  essentially exact name with a big gap, whatever the length — that's the
 *  radio edit of your extended file, and for "add it to the playlist" it's
 *  the right track. */
function confident(c: Candidate[]): boolean {
  if (!c.length || c[0].in_playlist) return false;
  const gap = c.length === 1 ? 1 : c[0].score - c[1].score;
  return (c[0].score >= 0.75 && Math.abs(c[0].dur_diff) <= 3 && gap >= 0.08)
      || (c[0].name >= 0.9 && gap >= 0.2); // other artists' same-titled songs score ~0.73
}

export async function findTrack(data: any): Promise<any> {
  const lib = requireLib();
  const f = (await scanLocal(lib)).find((x) => x.name === data.file);
  if (!f) throw appError("file_not_found", "file not found in the library folder");
  const q = String(data.q || "").trim() || extraQuery(f);
  return { q, candidates: await searchCandidates(lib, f, q) };
}

/** Remember the SoundCloud track picked for a file (null = forget). If the track
 *  is already in the playlist this is really a manual match, so pin it instead. */
export async function setFound(data: any): Promise<any> {
  const lib = requireLib();
  const key = "x:" + libPath(lib, String(data.file || ""));
  const t = data.track;
  if (!t) { delete STATE.found[key]; saveState(); return buildView(); }
  delete STATE.found[key];
  if ((lib.playlist?.tracks || []).some((p) => p.id === t.id))
    return setAssign({ id: t.id, file: data.file });
  STATE.found[key] = { id: Number(t.id), url: String(t.url), title: String(t.title || ""),
                       user: String(t.user || ""), dur: Number(t.dur) || 0 };
  saveState();
  return buildView();
}

const FIND_ALL_CAP = 300;
export async function findAll(): Promise<any> {
  const lib = requireLib();
  const cv = await collectionView();
  const fmap = new Map((await scanCollection()).map((f) => [f.name, f]));
  let found = 0, in_playlist = 0, unsure = 0, none = 0, left = 0;
  const errors: string[] = [], error_items: ErrorItem[] = [];
  const todo = (cv.files || []).filter((e: any) => e.unmatched && !e.found);
  left = Math.max(0, todo.length - FIND_ALL_CAP);
  for (const e of todo.slice(0, FIND_ALL_CAP)) {
    const f = fmap.get(e.name);
    if (!f) continue;
    try {
      const c = await searchCandidates(lib, f, extraQuery(f));
      if (confident(c)) {
        const { id, url, title, user, dur } = c[0];
        STATE.found["x:" + f.path] = { id, url, title, user, dur };
        found++;
      } else if (!c.length || c[0].score < 0.5) none++; // nothing plausible
      else if (c[0].in_playlist && Math.abs(c[0].dur_diff) <= 3) in_playlist++; // matcher missed it; user confirms
      else unsure++;
    } catch (err: any) {
      errors.push(`${f.name}: ${err.message}`);
      error_items.push(errItem(f.name, err));
    }
  }
  saveState();
  const view = await buildView();
  view.find_report = { found, in_playlist, unsure, none, left, errors, error_items };
  return view;
}

// ---------------- rekordbox xml ----------------

const APP_VERSION: string = tryRequire("../package.json")?.version || "0";
const KIND: Record<string, string> = { ".wav": "WAV File", ".mp3": "MP3 File", ".aiff": "AIFF File",
  ".aif": "AIFF File", ".flac": "FLAC File", ".m4a": "M4A File", ".ogg": "OGG File" };
const xmlAttr = (s: any) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** rekordbox wants file://localhost/<percent-encoded absolute path>, drive letter unencoded on Windows */
const rbLocation = (p: string) => "file://localhost" + (p.startsWith("/") ? "" : "/")
  + p.split(path.sep).map((s) => encodeURIComponent(s).replace(/%3A/gi, ":")).join("/");

export const rekordboxXmlPath = () => path.join(DATA_DIR, "rekordbox.xml");

/** Write every library's matched files as a rekordbox playlist, in playlist
 *  order, to one fixed file (point rekordbox at it once; re-export any time). */
export async function exportRekordboxXml(): Promise<any> {
  let id = 0;
  const coll: string[] = [], lists: string[] = [];
  const playlists: { playlist: string; tracks: number }[] = [];
  for (const lib of STATE.libraries) {
    if (!lib.playlist) continue;
    const view = await buildView(lib);
    const files = new Map((await scanLocal(lib)).map((f) => [f.name, f]));
    const keys: number[] = [];
    for (const r of view.tracks) {
      const f = r.have && r.file ? files.get(r.file) : undefined;
      if (!f) continue;
      id++;
      coll.push(`  <TRACK TrackID="${id}" Name="${xmlAttr(r.title)}" Artist="${xmlAttr(r.artist)}" Genre="${xmlAttr(view.genre)}"`
        + ` Kind="${xmlAttr(KIND[path.extname(f.name).toLowerCase()] || "Audio File")}" TotalTime="${Math.round(f.dur)}"`
        + (f.key ? ` Tonality="${xmlAttr(f.key)}"` : "") // the file's TKEY as written (Mixed In Key: Camelot)
        + ` Location="${xmlAttr(rbLocation(f.path))}"/>`);
      keys.push(id);
    }
    lists.push(`    <NODE Name="${xmlAttr(lib.playlist.title)}" Type="1" KeyType="0" Entries="${keys.length}">\n`
      + keys.map((k) => `      <TRACK Key="${k}"/>`).join("\n") + (keys.length ? "\n" : "") + "    </NODE>");
    playlists.push({ playlist: lib.playlist.title, tracks: keys.length });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="DJ HQ" Version="${xmlAttr(APP_VERSION)}" Company="DJ HQ"/>
  <COLLECTION Entries="${coll.length}">
${coll.join("\n")}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="${lists.length}">
${lists.join("\n")}
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;
  fs.writeFileSync(rekordboxXmlPath(), xml);
  return { path: rekordboxXmlPath(), playlists, tracks: coll.length };
}

// ---------------- downloads inbox ----------------

export const inboxDir = () => STATE.inbox_dir || path.join(os.homedir(), "Downloads");


/** Audio inside the zip files of the downloads folder (album purchases): each
 *  entry probed once by extracting it to <data>/tmp, cached by zip path + entry + size. */
interface InboxFile extends LocalFile { zip?: string; matchNames: string[]; }

const ZIP_SEP = "|";
function zipEntryAudio(e: ZipEntry): boolean {
  const base = path.posix.basename(e.name);
  return !e.isDir && !e.name.startsWith("__MACOSX/") && !base.startsWith(".") && AUDIO_EXT.includes(path.extname(base).toLowerCase());
}
/** Names to match a zip entry under: without the track number, and for
 *  "Artist - Album - 01 Title" also "Artist - Title" and "Title". */
function zipMatchNames(base: string): string[] {
  const stem = base.replace(/\.[^.]+$/, "");
  const noNum = stem.replace(/^\s*\d{1,3}(?:\s*[-._)]\s*|\s+)(?=\S)/, "").trim() || stem;
  const names = new Set<string>([noNum]);
  const parts = noNum.split(/\s+-\s+/);
  if (parts.length >= 3) { names.add(parts[0] + " - " + parts.slice(2).join(" - ")); names.add(parts.slice(2).join(" - ")); }
  return [...names];
}
async function scanInboxZips(dir: string): Promise<{ files: InboxFile[]; errors: string[]; error_items: ErrorItem[] }> {
  const files: InboxFile[] = [], errors: string[] = [], error_items: ErrorItem[] = [];
  const cache = STATE.zip_cache || (STATE.zip_cache = {});
  const live = new Set<string>();
  const tmpDir = path.join(DATA_DIR, "tmp");
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.startsWith(".") || path.extname(f).toLowerCase() !== ".zip") continue;
    const zp = path.join(dir, f);
    let entries: ZipEntry[];
    try { entries = listEntries(zp).filter(zipEntryAudio); }
    catch (e: any) { errors.push(`${f}: ${e.message}`); error_items.push(errItem(f, e)); continue; }
    for (const e of entries) {
      const key = [zp, e.name, e.size].join(ZIP_SEP);
      live.add(key);
      if (!cache[key]) {
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmp = path.join(tmpDir, `probe-${process.pid}-${Date.now()}${path.extname(e.name).toLowerCase()}`);
        try {
          extractEntry(zp, e, tmp);
          const pr = await probe(tmp);
          cache[key] = [pr.dur, pr.fmt, pr.tags];
        } catch (err: any) { errors.push(`${f}: ${err.message}`); error_items.push(errItem(f, err)); continue; }   // extractEntry names the entry itself
        finally { try { fs.unlinkSync(tmp); } catch {} }
      }
      const [dur, fmt, tags] = cache[key];
      const base = path.posix.basename(e.name);
      files.push({ name: base, base, path: zp + ZIP_SEP + e.name, dur, fmt, tags, zip: f, matchNames: zipMatchNames(base) });
    }
  }
  let changed = false;
  for (const k of Object.keys(cache)) if (!live.has(k) && k.startsWith(dir + path.sep)) { delete cache[k]; changed = true; }
  if (changed) saveState();
  return { files, errors, error_items };
}

function bestTrackNames(names: string[], dur: number, tracks: PlTrack[]): [PlTrack | null, number] {
  let best: PlTrack | null = null, bestS = 0;
  for (const t of tracks) {
    let s = 0;
    for (const n of names) s = Math.max(s, sim(n, t.title), sim(n, `${t.user} ${t.title}`));
    const dd = Math.abs(dur - t.dur);
    s += dd < 3 ? 0.15 : dd < 10 ? 0.07 : 0;
    if (s > bestS) { best = t; bestS = s; }
  }
  return [best, Math.round(bestS * 100) / 100];
}

/** Fresh downloads that belong to this playlist: each audio file (and each audio
 *  entry of a zip) in the downloads folder, matched against the tracks like the
 *  library matcher does. With the auto-move setting on, exact matches of tracks
 *  you don't have yet are moved straight away and listed in `moved`. */
/** every audio file in the downloads folder, loose or inside a zip */
async function scanInbox(dir: string): Promise<{ files: InboxFile[]; errors: string[]; error_items: ErrorItem[] }> {
  const plain: InboxFile[] = (await scanFolder(dir)).map((f) => ({ ...f, matchNames: [f.name] }));
  const zips = await scanInboxZips(dir);
  return { files: [...plain, ...zips.files], errors: zips.errors, error_items: zips.error_items };
}

export async function inboxView(opts: { auto?: boolean } = {}): Promise<any> {
  const lib = requireLib();
  const dir = inboxDir();
  const base = { dir, exists: fs.existsSync(dir), items: [] as any[], unmatched: [] as any[], others: 0, already: 0,
                 moved: [] as string[], move_errors: [] as string[], zip_errors: [] as string[],
                 move_error_items: [] as ErrorItem[], zip_error_items: [] as ErrorItem[], aiff_kept: [] as ErrorItem[] };
  if (!base.exists || !lib.playlist) return base;
  const view = await buildView();
  const rows = new Map<number, any>(view.tracks.map((r: any) => [r.id, r]));
  const libFiles = await scanLocal(lib);
  const libNames = new Set(libFiles.map((f) => f.base));
  // rule E: "X.wav" in the downloads is already there when the library has "X.aif" (converted);
  // not when the library's file is lossy and the download isn't (that may be an upgrade)
  const libStems = new Map<string, boolean>();   // stem -> every library file of that name is lossless
  for (const f of libFiles) { const k = stemKey(f.base); libStems.set(k, (libStems.get(k) ?? true) && !LOSSY.test(f.fmt[0])); }
  const scan = await scanInbox(dir);
  base.zip_errors = scan.errors;
  base.zip_error_items = scan.error_items;
  for (const f of scan.files) {
    if (libNames.has(f.name)) { base.already++; continue; } // copied in already
    if (libStems.get(stemKey(f.name)) || (libStems.has(stemKey(f.name)) && LOSSY.test(f.fmt[0]))) { base.already++; continue; } // in another format
    const [t, score] = bestTrackNames(f.matchNames, f.dur, lib.playlist.tracks);
    const row = t && rows.get(t.id);
    const lossy = LOSSY.test(f.fmt[0]);
    if (!t || !row || score < 0.6) {   // not in the playlist: can still be moved in, or looked up on SoundCloud first
      const [artist, title] = extraArtistTitle(f);
      base.unmatched.push({ name: f.name, zip: f.zip || null, dur: fmtDur(Math.round(f.dur)), lossy, artist, title, n: base.unmatched.length + 1 });
      continue;
    }
    let action: "move" | "upgrade" | null = null;
    if (!row.have) action = "move";
    else if (row.lossy && !lossy) action = "upgrade";
    if (!action) { base.already++; continue; } // we already hold an equal or better file
    base.items.push({ name: f.name, zip: f.zip || null, dur: fmtDur(Math.round(f.dur)), dur_diff: Math.round(f.dur - t.dur), lossy,
                      id: t.id, n: row.n, artist: row.artist, title: row.title, score: Math.min(1, score),
                      action, cur_file: row.file });
  }
  base.others = base.unmatched.length;
  // auto-move: exact matches (same name, same length) of tracks we don't have yet
  if (opts.auto !== false && STATE.settings?.auto_move && base.items.length && !collRoots().some((r) => sameDir(r.path, dir))) {
    const movedTracks = new Set<number>();
    const keep: any[] = [];
    for (const it of base.items) {
      const exact = it.action === "move" && it.score >= 0.999 && Math.abs(it.dur_diff) <= 2 && !movedTracks.has(it.id);
      if (!exact) { keep.push(it); continue; }
      try {
        const r = await inboxMoveOne({ file: it.name, id: it.id, zip: it.zip });
        base.moved.push(it.name); movedTracks.add(it.id);
        if (r.aiff && !r.aiff.ok) base.aiff_kept.push(r.aiff.item!);
      }
      catch (e: any) { base.move_errors.push(withName(it.name, e.message)); base.move_error_items.push(errItem(it.name, e)); keep.push(it); }
    }
    base.items = keep;
  }
  return base;
}

function moveFile(src: string, dst: string): void {
  try { fs.renameSync(src, dst); }
  catch (e: any) {
    if (e.code !== "EXDEV") throw e;
    fs.copyFileSync(src, dst); // other volume: copy, then remove the original
    fs.unlinkSync(src);
  }
  COLL_DIRTY = true;
}

/** Move one inbox file (or one entry of a zip in the inbox) into the library and
 *  pin it to its track (`id`). When the track already has a (lossy) file, that file goes
 *  to originals/<lib>/replaced/. Zips stay where they are.
 *  Without an id the file is a download that matches nothing in the playlist: it is moved
 *  as it is and, with `track` (a SoundCloud search result), remembered as found for that
 *  track, the way Not in playlist does; a track already in the playlist is matched outright. */
export async function inboxMove(data: any): Promise<any> {
  const r = await inboxMoveOne(data);
  const view = await buildView();
  view.move_report = { key: r.key, aiff_kept: r.aiff && !r.aiff.ok ? [r.aiff.item] : [] };
  return view;
}

/** inboxMove without the view: the moved file's library key and path, and its track. With
 *  "AIFF instead of WAV" on, a WAV becomes an AIFF right after the move (wavToAiff), before it is
 *  pinned, and the key returned is the AIFF's; `aiff` says how that went. A WAV that can't be
 *  converted stays as it is and is moved all the same ({ok: false, item}: the reason). */
/** Where a move out of the inbox lands: the folder asked for (`dest`, a collection folder
 *  from the picker), else the playlist's own target, the folder picked last, the default
 *  move target, the first root. The explicit pick is remembered as the last one. */
function resolveMoveDest(lib: Library | null, dest: unknown): { dir: string; chosen: boolean } {
  const coll = collection();
  const ok = (d: string | undefined | null): string | null => {
    if (!d) return null;
    if (!rootOf(d) && !coll.roots.some((r) => sameDir(r.path, d))) return null;
    try { if (!fs.statSync(d).isDirectory()) return null; } catch { return null; }
    return path.resolve(d);
  };
  if (dest) {
    const d = ok(typedPath(dest));
    if (!d) throw appError("target_outside_collection", "the move target must be a folder of the collection", { dir: String(dest) });
    return { dir: d, chosen: true };
  }
  const d = ok(lib?.target) || ok(coll.last_target) || ok(coll.move_target) || ok(coll.roots[0]?.path);
  if (!d) throw appError("no_collection_folder", "add a folder to the collection first (Settings > Collection)");
  return { dir: d, chosen: false };
}

/** The folder a move for this library would land in right now, or null when the collection
 *  has no usable folder (the pipeline checks it before planning). */
export function moveDest(lib: Library | null): string | null {
  try { return resolveMoveDest(lib, undefined).dir; } catch { return null; }
}

export async function inboxMoveOne(data: any): Promise<{ key: string; path: string; track_id: number | null; aiff?: { ok: boolean; item?: ErrorItem } }> {
  const lib = requireLib();
  const name = path.basename(String(data.file || ""));
  const zip = data.zip ? path.basename(String(data.zip)) : "";
  if (!name) throw appError("no_file", "no file given");
  const dest = resolveMoveDest(lib, data.dest);
  const dst = path.join(dest.dir, name);
  if (fs.existsSync(dst)) throw appError("name_taken", `${name}: a file with this name is already in the library`, { name });
  // the WAV would become an AIFF that is there already
  const toAiff = !!STATE.settings?.aiff_auto && path.extname(name).toLowerCase() === ".wav";
  if (toAiff && aiffThere(dst)) throw appError("name_taken", `${name}: a file with this name is already in the library`, { name });
  const found = data.track && typeof data.track === "object" ? data.track : null;
  const inList = (id: any) => !!lib.playlist?.tracks.some((t) => String(t.id) === String(id));
  // the playlist track the file is for: the one given, or the found track when it is in the playlist already
  const tid = data.id != null && data.id !== "" ? String(data.id) : found && inList(found.id) ? String(found.id) : "";
  if (data.id != null && data.id !== "" && !inList(tid)) throw appError("track_not_in_playlist", "track is not in the playlist");
  const src = path.join(inboxDir(), zip || name);
  if (!fs.existsSync(src)) throw appError("download_gone", `${zip || name}: no longer in the downloads folder`, { name: zip || name });
  // stage the new file first (a failed extraction must not touch the library)
  let staged: string | null = null;
  if (zip) {
    const entry = listEntries(src).filter(zipEntryAudio).find((e) => path.posix.basename(e.name) === name);
    if (!entry) throw appError("zip_entry_missing", `${name}: not found inside ${zip}`, { name, zip });
    // "X.wav.tmp.wav": the folder scan ignores *.tmp.<ext>, and its sweep removes one a kill left behind
    staged = staleGone(dst + ".tmp" + path.extname(dst));
    try { extractEntry(src, entry, staged); } catch (e) { doneTmp(staged); throw e; }
  }
  const row = tid ? (await buildView()).tracks.find((r: any) => String(r.id) === tid) : null;
  let kept: [string, string] | null = null;
  if (row?.have && row.file) {
    const rdir = path.join(backupDir(lib), "replaced");
    const old = libPath(lib, row.file);
    const base = path.basename(old);
    fs.mkdirSync(rdir, { recursive: true });
    let keep = path.join(rdir, base);
    for (let i = 2; fs.existsSync(keep); i++) keep = path.join(rdir, base.replace(/(\.[^.]+)$/, ` (${i})$1`));
    moveFile(old, keep);
    kept = [old, keep];
    delete STATE.dur_cache[old];
  }
  try {
    if (staged) fs.renameSync(staged, dst);
    else { moveFile(src, dst); delete STATE.dur_cache[src]; }
  } catch (e) {
    if (kept) try { moveFile(kept[1], kept[0]); } catch {}   // put the replaced file back
    if (staged) try { fs.unlinkSync(staged); } catch {}
    throw e;
  } finally { if (staged) LIVE_TMP.delete(staged); }
  if (dest.chosen) { collection().last_target = dest.dir; }
  let key = dst, at = dst, aiff: { ok: boolean; item?: ErrorItem } | undefined;
  if (toAiff) {
    try { key = await wavToAiff(lib, dst); at = key; aiff = { ok: true }; }
    catch (e: any) { aiff = { ok: false, item: errItem(name, e) }; }
  }
  for (const a of Object.keys(STATE.assigned)) if (STATE.assigned[a] === key) { delete STATE.assigned[a]; delete STATE.by_hand[a]; }
  delete STATE.found["x:" + at];
  if (tid) {
    STATE.assigned[tid] = key;   // pinned to the track, but not "by hand": the download is the file for it
    delete STATE.by_hand[tid];
    delete STATE.overrides[tid];
    delete STATE.na[tid];
  } else if (found && found.url) {   // not in the playlist yet: Not in playlist shows it as found, one Add away
    STATE.found["x:" + at] = { id: Number(found.id), url: String(found.url), title: String(found.title || ""),
                               user: String(found.user || ""), dur: Number(found.dur) || 0 };
  }
  saveState();
  return { key, path: at, track_id: tid ? Number(tid) : null, ...(aiff ? { aiff } : {}) };   // the main folder's files are keyed by name
}

/** Search SoundCloud for a download that matches nothing in the playlist:
 *  {file, zip?, q?} → {q, candidates}, scored like Not in playlist's Find. */
export async function inboxFind(data: any): Promise<any> {
  const lib = requireLib();
  const name = path.basename(String(data.file || ""));
  const zip = data.zip ? path.basename(String(data.zip)) : "";
  const f = (await scanInbox(inboxDir())).files.find((x) => x.name === name && (x.zip || "") === zip);
  if (!f) throw appError("download_gone", `${name}: no longer in the downloads folder`, { name });
  const q = String(data.q || "").trim() || extraQuery(f);
  return { q, candidates: await searchCandidates(lib, f, q) };
}

export async function inboxMoveAll(): Promise<any> {
  const scan = await inboxView();
  let done = scan.moved.length;   // auto-move may have handled some already
  const errors: string[] = [...scan.move_errors], error_items: ErrorItem[] = [...scan.move_error_items];
  const aiff_kept: ErrorItem[] = [...scan.aiff_kept];
  for (const it of scan.items) {
    try {
      const r = await inboxMoveOne({ file: it.name, id: it.id, zip: it.zip }); done++;
      if (r.aiff && !r.aiff.ok) aiff_kept.push(r.aiff.item!);
    } catch (e: any) { errors.push(withName(it.name, e.message)); error_items.push(errItem(it.name, e)); }
  }
  const view = await buildView();
  view.inbox_report = { done, errors, error_items, aiff_kept };
  return view;
}

/** "<file>: <message>", unless the message names the file already */
const withName = (name: string, msg: string) => String(msg).startsWith(name + ":") ? String(msg) : `${name}: ${msg}`;

/** What "Move all" would move right now, without moving anything (auto-move is not
 *  run either): the matched downloads, never the unmatched ones. Each entry is what
 *  inboxMoveOne takes, plus its names for display. */
export async function inboxMovePlan(): Promise<{ file: string; zip: string | null; id: number; artist: string; title: string; action: string }[]> {
  const scan = await inboxView({ auto: false });
  return scan.items.map((it: any) => ({ file: it.name, zip: it.zip, id: it.id, artist: it.artist, title: it.title, action: it.action }));
}

export async function markSeen(): Promise<any> {
  requireLib().seen_mark = Date.now();
  saveState();
  return buildView();
}

/** Set artist / title by hand (empty both = back to the derived ones). With `confirm`,
 *  artist and title are the derived name the user kept as it is in Check names: stored
 *  as a confirmation, not a hand edit, so the row loses its flag but keeps following
 *  the derivation (and is flagged again if that ever changes). */
export async function setEdit(data: any): Promise<any> {
  const lib = requireLib();
  const key = data.file ? "x:" + libPath(lib, String(data.file)) : String(data.id);
  const a = (data.artist || "").trim(), ti = (data.title || "").trim();
  if (data.confirm) {
    // confirms the name DJ HQ reads now, not the posted one; a hand edit stays as it is
    const tracks = lib.playlist ? lib.playlist.tracks : [];
    const n = data.file ? extraName({ base: path.basename(key.slice(2)) } as LocalFile)
      : tracks.some((t) => String(t.id) === key) ? libraryNames(tracks).get(Number(key)) : undefined;
    if (n && !handEdit(STATE.edits[key])) {
      // the different name the file has right now was on screen: kept over it, it stops asking
      const v = await buildView(lib);
      const r = data.file ? (v.extras || []).find((x: any) => x.name === String(data.file)) : (v.tracks || []).find((x: any) => String(x.id) === key);
      STATE.edits[key] = { artist: "", title: "", ok: nameSig(n.artist, n.title),
                           ...(r?.file_artist !== undefined ? { file: nameSig(r.file_artist, r.file_title) } : {}) };
    }
  } else if (a || ti) STATE.edits[key] = { artist: a, title: ti };
  else delete STATE.edits[key];
  saveState();
  return buildView();
}
