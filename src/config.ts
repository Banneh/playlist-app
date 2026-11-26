/** Export and import of the configuration: one JSON file ("DJ HQ config <date>.djhq.json")
 *  that carries the libraries (link, playlist snapshot, folders as hints, pins, edits,
 *  overrides, "not available" marks, found tracks, file-arrival times) and the portable
 *  settings to another computer, the Windows PC or a backup.
 *
 *  Nothing in the file is keyed by an absolute path: tracks by their SoundCloud id, files by
 *  their library-relative "/" key. Paths of this computer (the downloads folder, the Do
 *  everything setup) go into a "machine" block that an import ignores unless asked; caches,
 *  the SoundCloud session, backed-up originals and the exported XML never leave.
 *
 *  An import is two steps: plan (read and check the file, nothing written; a random,
 *  single-use plan id held in memory) and apply (folders chosen on this computer, then the
 *  whole new state is built in memory, a copy of the current database is saved in backups/,
 *  and the new state is written and swapped in at once). v1 replaces everything: the id-keyed
 *  maps are global, so a second library merged next to existing ones isn't safe yet.
 *
 *  The export reads STATE directly and lists folders by name only: it never builds the view,
 *  so a folder that is away while exporting can't prune anything. */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as core from "./core";
import type { AppState, Library, Playlist, PlTrack } from "./core";

export const FORMAT = "djhq-config";
/** v1: libraries own their folders (pre-collection); v2: the collection's roots carry the
 *  files and every key is "@<root index>/<relative path>". Exports are v2; both import. */
export const FORMAT_VERSION = 2;
const MAX_BYTES = 64 * 1024 * 1024;
const APP_VERSION: string = (() => { try { return require("../package.json").version || "0"; } catch { return "0"; } })();

/** Per track of a library, as the file stores it. */
interface TrackRec {
  /** pinned file: a library-relative key, "" = forced "no file" */
  file?: string; by_hand?: true;
  override?: "have" | "missing";
  edit?: { artist: string; title: string; ok?: string; file?: string };
  na?: { sig: string; at: number };
  /** ms when a file for the track first turned up (0 = before tracking) */
  acquired?: number;
}
/** Per file of a library ("x:" + path entries of this computer, made relative). */
interface FileRec { edit?: { artist: string; title: string; ok?: string; file?: string }; found?: core.Found; }
interface FolderRec { path: string; key_prefix: string; away?: "missing" | "unreadable"; }
interface LibRec {
  uid: string; url: string; subfolders: boolean; seen_mark: number; acq_init: boolean;
  /** v1 only; a v2 file keeps its folders on the collection instead */
  folders: FolderRec[]; playlist: Playlist | null;
  tracks: Record<string, TrackRec>; files: Record<string, FileRec>;
  /** v1: the audio files the library's folders held at export time (null: a folder was away) */
  file_names: string[] | null;
  /** v2: the playlist's own move target, as "@<root>/<rel>" ("@<root>" for the root itself) */
  target?: string;
}
/** One collection root of a v2 file. */
interface RootRec {
  path: string; subfolders: boolean; away?: "missing" | "unreadable";
  /** the audio files the root held at export time, relative "/" keys (null: it was away) */
  file_names: string[] | null;
}

// ---------------- export ----------------

const isPrivateLink = (u: string) => !!core.scSecret(u) || /^(https?:\/\/)?on\.soundcloud\.com\//i.test(String(u || "").trim());
/** a share link without its secret (what a private track's page is without access) */
const withoutSecret = (u: string) => { const s = core.scSecret(u); return s ? u.split(/[?#]/)[0].replace(new RegExp("/" + s + "/?$"), "") : u; };

/** Every string inside v with share-link secrets taken out: the /s-… segment of a SoundCloud
 *  link and any secret_token parameter (a track link, a buy link or a link in a description
 *  can carry the playlist's secret too). */
function scrubSecrets<T>(v: T): T {
  const one = (s: string) => s
    .replace(/([?&])secret_token=[^&#\s"'<>]*&?/gi, "$1")
    .replace(/[?&](?=#|$)/g, "")
    .replace(/(soundcloud\.com\/[^\/\s?#"'<>]+\/[^\s?#"'<>]+?)\/s-[A-Za-z0-9]+(?=[\/?#\s"'<>]|$)/gi, "$1");
  const walk = (x: any): any => typeof x === "string" ? one(x)
    : Array.isArray(x) ? x.map(walk)
    : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]))
    : x;
  return walk(v);
}

/** The pre-collection folders of a library (kept on the library for rollback and old backups). */
function legacyDirs(lib: Library): string[] {
  return [lib.dir, ...(lib.dirs || [])].filter(Boolean);
}
/** The pre-collection key prefixes of a library's folders (what core.dirPrefixes was). */
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

/** What the export dialog needs to know first: private links, roots that are away. */
export function exportInfo(): any {
  const S = core.STATE;
  const roots = S.collection?.roots || [];
  return {
    file_name: exportFileName(),
    roots_away: roots.filter((r) => !!core.folderTrouble(r.path)).map((r) => r.path),
    libraries: S.libraries.map((l) => ({
      id: l.id, name: core.libName(l), private_link: isPrivateLink(l.url) || isPrivateLink(l.playlist?.url || ""),
      private_tracks: (l.playlist?.tracks || []).filter((t) => !!core.scSecret(t.url)).length,
      folders_away: [], link_missing: !l.url,
    })),
  };
}
export const exportFileName = () => `DJ HQ config ${new Date().toISOString().slice(0, 10)}.djhq.json`;

/** The configuration as a JSON document (format v2: the collection's roots carry the files,
 *  every file key is "@<root index>/<relative path>"). leaveLinksOut blanks every library and
 *  playlist link (and takes the secret off private tracks' links); the file says so. */
export function buildExport(opts: { leaveLinksOut?: boolean; theme?: unknown }): any {
  const S = core.STATE;
  const libs = S.libraries;
  const out = !!opts.leaveLinksOut;
  const roots = S.collection?.roots || [];
  // the files each root holds right now, by name only (no probe, no view)
  const rootRecs: RootRec[] = roots.map((r) => {
    const away = core.folderTrouble(r.path);
    return { path: r.path, subfolders: !!r.subfolders, ...(away ? { away } : {}),
             file_names: away ? null : core.listAudioKeys(r.path, !!r.subfolders).sort() };
  });
  /** "@<root index>/<rel>" of an absolute path under a root ("@<root index>" for the root
   *  itself), the deepest root winning; null outside every root */
  const relOf = (abs: string): string | null => {
    let best = -1, bestLen = -1;
    roots.forEach((r, i) => {
      if (core.sameDir(r.path, abs)) { if (r.path.length > bestLen) { best = i; bestLen = r.path.length; } return; }
      const rel = path.relative(r.path, abs);
      if (rel && !rel.startsWith("..") && !path.isAbsolute(rel) && r.path.length > bestLen) { best = i; bestLen = r.path.length; }
    });
    if (best < 0) return null;
    const rel = path.relative(roots[best].path, abs).split(path.sep).join("/");
    return "@" + best + (rel ? "/" + rel : "");
  };
  const holders = new Map<string, Library[]>();
  for (const lib of libs) for (const t of lib.playlist?.tracks || []) holders.set(String(t.id), [...(holders.get(String(t.id)) || []), lib]);
  const recs = new Map<Library, LibRec>();
  for (const lib of libs) {
    const playlist: Playlist | null = lib.playlist ? JSON.parse(JSON.stringify(lib.playlist)) : null;
    if (playlist && out) {
      playlist.url = "";
      playlist.tracks = playlist.tracks.map((t) => scrubSecrets({ ...t, url: withoutSecret(t.url) }));
    }
    const target = lib.target ? relOf(lib.target) : null;
    recs.set(lib, {
      uid: lib.id, url: out ? "" : lib.url, subfolders: false, seen_mark: lib.seen_mark || 0, acq_init: !!lib.acq_init,
      folders: [], playlist, tracks: {}, files: {}, file_names: null,
      ...(target ? { target } : {}),
    });
  }
  const dropped = { pins: 0, edits: 0, found: 0 };
  const orphans: Record<string, TrackRec> = {};
  const track = (lib: Library, tid: string) => recs.get(lib)!.tracks[tid] || (recs.get(lib)!.tracks[tid] = {});
  // a pin goes to every library that has the track (pins are absolute paths; outside the roots they are dropped)
  for (const [tid, file] of Object.entries(S.assigned)) {
    const hs = holders.get(tid) || [];
    if (!hs.length) { dropped.pins++; continue; }   // the view drops it too: the track is in no playlist
    let key = file;
    if (file) {
      const rel = path.isAbsolute(file) ? relOf(file) : null;
      if (!rel) { dropped.pins++; continue; }
      key = rel;
    }
    const r = track(hs[0], tid);
    r.file = key;
    if (S.by_hand[tid]) r.by_hand = true;
  }
  // per-track marks go to every library that has the track
  const each = (map: Record<string, any>, put: (r: TrackRec, v: any) => void) => {
    for (const [tid, v] of Object.entries(map)) {
      if (!/^\d+$/.test(tid)) continue;
      const hs = holders.get(tid) || [];
      if (!hs.length) { put(orphans[tid] || (orphans[tid] = {}), v); continue; }
      for (const l of hs) put(track(l, tid), v);
    }
  };
  each(S.overrides, (r, v) => { if (v === "have" || v === "missing") r.override = v; });
  each(S.na, (r, v) => { r.na = { sig: String(v.sig || ""), at: Number(v.at) || 0 }; });
  each(Object.fromEntries(Object.entries(S.edits).filter(([k]) => !k.startsWith("x:"))), (r, v) => { r.edit = v; });
  for (const [k, v] of Object.entries(S.acquired)) {
    const i = k.indexOf(":");
    const lib = libs.find((l) => l.id === k.slice(0, i)), tid = k.slice(i + 1);
    if (lib && (holders.get(tid) || []).includes(lib)) track(lib, tid).acquired = Number(v) || 0;
  }
  // files: "x:" + an absolute path becomes "@<root>/<rel>"; they go on the first library
  // (v2 keeps per-file records with the collection, carried by one library record)
  const fileHome = libs[0] ? recs.get(libs[0])!.files : null;
  for (const [k, v] of Object.entries(S.edits)) {
    if (!k.startsWith("x:")) continue;
    const rel = relOf(k.slice(2));
    if (!rel || !fileHome) { dropped.edits++; continue; }
    (fileHome[rel] || (fileHome[rel] = {})).edit = v;
  }
  for (const [k, v] of Object.entries(S.found)) {
    const rel = relOf(k.slice(2));
    if (!rel || !fileHome) { dropped.found++; continue; }
    (fileHome[rel] || (fileHome[rel] = {})).found = out ? scrubSecrets({ ...v, url: withoutSecret(v.url) }) : v;
  }
  const s = S.settings || {};
  const settings: any = {};
  if (typeof s.auto_move === "boolean") settings.auto_move = s.auto_move;
  if (typeof s.refresh_min === "number") settings.refresh_min = s.refresh_min;
  if (typeof s.like_on_add === "boolean") settings.like_on_add = s.like_on_add;
  if (typeof s.aiff_auto === "boolean") settings.aiff_auto = s.aiff_auto;
  if (s.bandcamp === false) settings.bandcamp = false;
  if (core.BANDCAMP_DAYS.includes(s.bandcamp_days ?? -1)) settings.bandcamp_days = s.bandcamp_days;
  if (s.sc_open) settings.sc_open = s.sc_open;
  const machine: any = {};
  if (S.inbox_dir) machine.inbox_dir = S.inbox_dir;
  if (s.do_all) machine.do_all = s.do_all;
  const moveTarget = S.collection?.move_target ? relOf(S.collection.move_target) : null;
  const anyPrivate = libs.some((l) => isPrivateLink(l.url) || isPrivateLink(l.playlist?.url || "") || (l.playlist?.tracks || []).some((t) => !!core.scSecret(t.url)));
  return {
    format: FORMAT, format_version: FORMAT_VERSION, app_version: APP_VERSION,
    exported_at: new Date().toISOString(),
    source: { platform: process.platform, sep: path.sep },
    links_left_out: out,
    contains_private_links: !out && anyPrivate,
    settings, device: S.device,
    prefs: typeof opts.theme === "string" ? { theme: opts.theme } : {},
    active: Math.max(0, libs.findIndex((l) => l.id === core.activeLib()?.id)),
    collection: { roots: rootRecs, ...(moveTarget ? { move_target: moveTarget } : {}) },
    libraries: libs.map((l) => recs.get(l)),
    orphans: { tracks: orphans },
    dropped,
    machine,
  };
}

// ---------------- import: reading and checking the file ----------------

const fail = (code: string, text: string, vars?: Record<string, unknown>) => core.appError(code, text, vars);
const invalid = (what: string) => fail("config_invalid", `this configuration file is damaged or not one DJ HQ wrote (${what})`, { what });
const outside = (what: string) => fail("config_path_outside", `this configuration file is damaged or not one DJ HQ wrote (${what}: a file name that points outside the library folder)`, { what });

const isObj = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: any) => typeof v === "string";
const isNum = (v: any) => typeof v === "number" && Number.isFinite(v);
/** A library-relative key: "/"-separated, never absolute or climbing out of the folder. */
export function relKeyOk(k: unknown): boolean {
  if (typeof k !== "string" || !k || k.length > 4096 || k.includes("\0")) return false;
  if (/^[\/\\]/.test(k) || /^[A-Za-z]:/.test(k)) return false;
  return !k.split(/[\/\\]/).some((seg) => seg === "..");
}
const TID = /^\d{1,16}$/;

function checkEdit(v: any, what: string) {
  if (!isObj(v) || !isStr(v.artist) || !isStr(v.title) || (v.ok !== undefined && !isStr(v.ok)) || (v.file !== undefined && !isStr(v.file))) throw invalid(what);
  return { artist: v.artist, title: v.title, ...(v.ok !== undefined ? { ok: v.ok } : {}), ...(v.file !== undefined ? { file: v.file } : {}) };
}
/** A SoundCloud track's link as DJ HQ stores it ("" when there is none). The pages put these
 *  links into click handlers, so nothing else gets in: no other scheme or site, no quote,
 *  space or control character. */
const scLinkOk = (u: unknown) => u === "" || (isStr(u) && /^https:\/\/([a-z0-9-]+\.)*soundcloud\.com\/[^\s'"`<>\\]*$/i.test(u as string));
/** a cover image: https, nothing that could end the attribute it sits in */
const artOk = (u: unknown) => u === "" || (isStr(u) && /^https:\/\/[^\s'"`<>\\]*$/i.test(u as string));
const strOrNull = (v: any) => v === null || isStr(v);
function checkFound(v: any, what: string): core.Found {
  if (!isObj(v) || !isNum(v.id) || !scLinkOk(v.url) || !isStr(v.title) || !isStr(v.user) || !isNum(v.dur)) throw invalid(what);
  return { id: v.id, url: v.url, title: v.title, user: v.user, dur: v.dur };
}
function checkTrack(v: any, what: string): TrackRec {
  if (!isObj(v)) throw invalid(what);
  const r: TrackRec = {};
  if (v.file !== undefined) { if (!(v.file === "" || relKeyOk(v.file))) throw invalid(what + ".file"); r.file = v.file; }
  if (v.by_hand !== undefined) { if (typeof v.by_hand !== "boolean") throw invalid(what + ".by_hand"); if (v.by_hand) r.by_hand = true; }
  if (v.override !== undefined) { if (v.override !== "have" && v.override !== "missing") throw invalid(what + ".override"); r.override = v.override; }
  if (v.edit !== undefined) r.edit = checkEdit(v.edit, what + ".edit");
  if (v.na !== undefined) { if (!isObj(v.na) || !isStr(v.na.sig) || !isNum(v.na.at)) throw invalid(what + ".na"); r.na = { sig: v.na.sig, at: v.na.at }; }
  if (v.acquired !== undefined) { if (!isNum(v.acquired) || v.acquired < 0) throw invalid(what + ".acquired"); r.acquired = v.acquired; }
  return r;
}
function checkPlaylist(v: any, what: string): Playlist | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || !isStr(v.title) || !isStr(v.url) || !linkOk(v.url) || !Array.isArray(v.tracks) || v.tracks.length > 100000) throw invalid(what);
  // each track rebuilt from checked fields only: the views trust their types
  const tracks = v.tracks.map((t: any, i: number): PlTrack => {
    const w = `${what}.tracks[${i}]`;
    if (!isObj(t) || !isNum(t.id) || !isStr(t.title) || !isStr(t.user) || !isNum(t.dur) || !scLinkOk(t.url)) throw invalid(w);
    if (t.art !== undefined && t.art !== null && !artOk(t.art)) throw invalid(w + ".art");
    if (t.pub_artist !== undefined && !strOrNull(t.pub_artist)) throw invalid(w + ".pub_artist");
    if (t.buy_url !== undefined && !strOrNull(t.buy_url)) throw invalid(w + ".buy_url");
    if (t.buy_title !== undefined && !strOrNull(t.buy_title)) throw invalid(w + ".buy_title");
    if (t.sc_dl !== undefined && typeof t.sc_dl !== "boolean") throw invalid(w + ".sc_dl");
    if (t.added !== undefined && !isNum(t.added)) throw invalid(w + ".added");
    if (t.desc_links !== undefined && !(Array.isArray(t.desc_links) && t.desc_links.length <= 1000
        && t.desc_links.every((x: any) => Array.isArray(x) && x.length === 3 && x.every(isStr)))) throw invalid(w + ".desc_links");
    const r: PlTrack = { id: t.id, title: t.title, user: t.user, pub_artist: t.pub_artist ?? null, dur: t.dur, url: t.url, art: t.art || "" };
    if (t.buy_url !== undefined) { r.buy_url = t.buy_url; r.buy_title = t.buy_title ?? null; }
    if (t.sc_dl !== undefined) r.sc_dl = t.sc_dl;
    if (t.desc_links !== undefined) r.desc_links = t.desc_links.map((x: string[]) => [x[0], x[1], x[2]] as [string, string, string]);
    if (t.added !== undefined) r.added = t.added;
    return r;
  });
  return { title: v.title, url: v.url, tracks };
}
const linkOk = (u: string) => u === "" || /^https?:\/\//i.test(u);

/** "@<root index>" or "@<root index>/<relative key>", with the index inside the roots */
function v2KeyOk(k: unknown, rootsLen: number): boolean {
  if (typeof k !== "string") return false;
  const m = /^@(\d{1,3})(?:\/([\s\S]+))?$/.exec(k);
  if (!m || Number(m[1]) >= rootsLen) return false;
  return m[2] === undefined || relKeyOk(m[2]);
}

/** Everything the file says, checked; unknown keys are ignored. `roots` is empty for a v1 file. */
export function readConfig(text: string): { doc: any; libs: LibRec[]; roots: RootRec[]; notes: string[] } {
  if (Buffer.byteLength(text) > MAX_BYTES) throw fail("config_too_big", "this file is far too big to be a DJ HQ configuration");
  let doc: any;
  try { doc = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw fail("config_not_json", "this file can't be read as a DJ HQ configuration (it isn't JSON, or it was cut off)"); }
  if (!isObj(doc) || doc.format !== FORMAT) throw fail("config_not_djhq", "this file isn't a DJ HQ configuration");
  const v = doc.format_version;
  if (!Number.isInteger(v) || v < 1) throw invalid("format_version");
  if (v > FORMAT_VERSION) throw fail("config_newer", "this configuration was saved by a newer DJ HQ; update DJ HQ on this computer first",
                                    { version: v, app_version: isStr(doc.app_version) ? doc.app_version : "" });
  if (!Array.isArray(doc.libraries) || !doc.libraries.length || doc.libraries.length > 50) throw invalid("libraries");
  const notes: string[] = [];
  // v2: the collection's roots carry the files
  let roots: RootRec[] = [];
  if (v >= 2) {
    const c = doc.collection;
    if (!isObj(c) || !Array.isArray(c.roots) || !c.roots.length || c.roots.length > 50) throw invalid("collection");
    roots = c.roots.map((r: any, j: number): RootRec => {
      const w = `collection.roots[${j}]`;
      if (!isObj(r) || !isStr(r.path)) throw invalid(w);
      let file_names: string[] | null = null;
      if (r.file_names !== undefined && r.file_names !== null) {
        if (!Array.isArray(r.file_names) || r.file_names.length > 500000) throw invalid(w + ".file_names");
        for (const k of r.file_names) if (!relKeyOk(k)) throw outside(w + ".file_names");
        file_names = r.file_names;
      }
      return { path: r.path, subfolders: !!r.subfolders,
               ...(r.away === "missing" || r.away === "unreadable" ? { away: r.away } : {}), file_names };
    });
    if (c.move_target !== undefined && !v2KeyOk(c.move_target, roots.length)) throw invalid("collection.move_target");
  }
  const keyOk = (k: unknown) => v >= 2 ? v2KeyOk(k, roots.length) : relKeyOk(k);
  const libs: LibRec[] = doc.libraries.map((l: any, i: number): LibRec => {
    const w = `libraries[${i}]`;
    if (!isObj(l)) throw invalid(w);
    if (!isStr(l.url) || !linkOk(l.url)) throw invalid(w + ".url");
    let folders: FolderRec[] = [];
    if (v < 2) {
      if (!Array.isArray(l.folders) || !l.folders.length || l.folders.length > 50) throw invalid(w + ".folders");
      folders = l.folders.map((f: any, j: number) => {
        if (!isObj(f) || !isStr(f.path) || !isStr(f.key_prefix)) throw invalid(`${w}.folders[${j}]`);
        if (j === 0 ? f.key_prefix !== "" : !(relKeyOk(f.key_prefix) && f.key_prefix.endsWith("/"))) throw invalid(`${w}.folders[${j}].key_prefix`);
        return { path: f.path, key_prefix: f.key_prefix, ...(f.away === "missing" || f.away === "unreadable" ? { away: f.away } : {}) };
      });
    }
    const tracks: Record<string, TrackRec> = {};
    if (l.tracks !== undefined) {
      if (!isObj(l.tracks)) throw invalid(w + ".tracks");
      for (const [tid, t] of Object.entries(l.tracks)) {
        if (!TID.test(tid)) throw invalid(`${w}.tracks.${tid.slice(0, 40)}`);
        const r = checkTrack(t, `${w}.tracks.${tid}`);
        if (r.file !== undefined && r.file !== "" && !keyOk(r.file)) throw outside(`${w}.tracks.${tid}.file`);
        tracks[tid] = r;
      }
    }
    const files: Record<string, FileRec> = {};
    if (l.files !== undefined) {
      if (!isObj(l.files)) throw invalid(w + ".files");
      for (const [k, f] of Object.entries<any>(l.files)) {
        if (!keyOk(k)) throw outside(w + ".files");
        if (!isObj(f)) throw invalid(`${w}.files`);
        files[k] = { ...(f.edit !== undefined ? { edit: checkEdit(f.edit, `${w}.files edit`) } : {}),
                     ...(f.found !== undefined ? { found: checkFound(f.found, `${w}.files found`) } : {}) };
      }
    }
    let file_names: string[] | null = null;
    if (v < 2 && l.file_names !== undefined && l.file_names !== null) {
      if (!Array.isArray(l.file_names) || l.file_names.length > 500000) throw invalid(w + ".file_names");
      for (const k of l.file_names) if (!relKeyOk(k)) throw outside(w + ".file_names");
      file_names = l.file_names;
    }
    if (l.target !== undefined && !keyOk(l.target)) throw invalid(w + ".target");
    for (const k of ["seen_mark"]) if (l[k] !== undefined && !isNum(l[k])) throw invalid(`${w}.${k}`);
    for (const k of ["subfolders", "acq_init"]) if (l[k] !== undefined && typeof l[k] !== "boolean") throw invalid(`${w}.${k}`);
    return {
      uid: isStr(l.uid) ? l.uid.slice(0, 64) : `lib${i + 1}`, url: l.url, subfolders: !!l.subfolders,
      seen_mark: Number(l.seen_mark) || 0, acq_init: l.acq_init !== false,
      folders, playlist: checkPlaylist(l.playlist, w + ".playlist"), tracks, files, file_names,
      ...(isStr(l.target) ? { target: l.target } : {}),
    };
  });
  if (doc.settings !== undefined && !isObj(doc.settings)) throw invalid("settings");
  if (doc.machine !== undefined && !isObj(doc.machine)) throw invalid("machine");
  if (doc.orphans !== undefined && (!isObj(doc.orphans) || (doc.orphans.tracks !== undefined && !isObj(doc.orphans.tracks)))) throw invalid("orphans");
  for (const [tid, t] of Object.entries<any>(doc.orphans?.tracks || {})) { if (!TID.test(tid)) throw invalid("orphans"); checkTrack(t, "orphans." + tid); }
  const s = doc.settings || {};
  if (s.refresh_min !== undefined && !core.REFRESH_CHOICES.includes(s.refresh_min)) notes.push("refresh_min_ignored");
  if (s.sc_open !== undefined && s.sc_open !== "discover" && s.sc_open !== "browser") notes.push("sc_open_ignored");
  if (doc.device !== undefined && !core.DEVICES[doc.device]) notes.push("device_ignored");
  return { doc, libs, roots, notes };
}

// ---------------- import: plans ----------------

interface Plan { id: string; at: number; doc: any; libs: LibRec[]; roots: RootRec[]; notes: string[]; }
const PLANS = new Map<string, Plan>();
const PLAN_TTL = 2 * 60 * 60 * 1000;
function keepPlan(p: Plan): void {
  const now = Date.now();
  for (const [k, v] of PLANS) if (now - v.at > PLAN_TTL) PLANS.delete(k);
  while (PLANS.size >= 8) PLANS.delete(PLANS.keys().next().value!);
  PLANS.set(p.id, p);
}
function getPlan(id: unknown): Plan {
  const p = typeof id === "string" ? PLANS.get(id) : undefined;
  if (!p || Date.now() - p.at > PLAN_TTL) throw fail("config_plan_gone", "choose the configuration file again (the import was started too long ago, or already done)");
  return p;
}

/** a folder hint of the other computer, split on either separator (the file may come from Windows) */
const hintBase = (p: string) => String(p || "").replace(/[\/\\]+$/, "").split(/[\/\\]/).pop() || p;
/** the pins, known files and per-file entries of one folder of an exported library, as keys relative to that folder */
function folderWants(l: LibRec, fi: number): { pins: string[]; known: string[]; files: string[] } {
  const own = (k: string) => folderOf(l, k);
  const strip = (k: string) => k.slice(l.folders[fi].key_prefix.length);
  const pins = Object.values(l.tracks).map((t) => t.file).filter((f): f is string => !!f && own(f) === fi).map(strip);
  const known = (l.file_names || []).filter((k) => own(k) === fi).map(strip);
  const files = Object.keys(l.files).filter((k) => own(k) === fi).map(strip);
  return { pins, known, files };
}
/** which folder of the exported library a key belongs to: the longest extra-folder prefix it starts with, else the main one */
function folderOf(l: LibRec, key: string): number {
  let best = 0, len = 0;
  l.folders.forEach((f, i) => { if (i && f.key_prefix && key.startsWith(f.key_prefix) && f.key_prefix.length > len) { best = i; len = f.key_prefix.length; } });
  return best;
}
const libTitle = (l: LibRec) => l.playlist?.title || (l.folders[0] ? hintBase(l.folders[0].path) : "") || l.uid;

/** the pins, known files and per-file records that live under one root of a v2 file, as
 *  keys relative to that root */
function rootWants(p: { libs: LibRec[]; roots: RootRec[] }, ri: number): { pins: string[]; known: string[]; files: string[] } {
  const pre = "@" + ri;
  const strip = (k: string) => k.startsWith(pre + "/") ? k.slice(pre.length + 1) : "";
  const pins: string[] = [], files: string[] = [];
  for (const l of p.libs) {
    for (const t of Object.values(l.tracks)) { const r = t.file && strip(t.file); if (r) pins.push(r); }
    for (const k of Object.keys(l.files)) { const r = strip(k); if (r) files.push(r); }
  }
  return { pins, known: p.roots[ri].file_names || [], files };
}

/** POST /api/config/import/plan: the file read and checked, nothing written. */
export function plan(text: string): any {
  const { doc, libs, roots, notes } = readConfig(text);
  const p: Plan = { id: crypto.randomBytes(18).toString("hex"), at: Date.now(), doc, libs, roots, notes };
  keepPlan(p);
  const S = core.STATE;
  const same = doc.source?.platform === process.platform;
  if (roots.length) {   // a v2 file: the folders step asks for the collection's roots
    return {
      plan: p.id, v2: true,
      file: { app_version: isStr(doc.app_version) ? doc.app_version : "", exported_at: isStr(doc.exported_at) ? doc.exported_at : "",
              platform: isStr(doc.source?.platform) ? doc.source.platform : "", links_left_out: !!doc.links_left_out },
      roots: roots.map((r, i) => {
        let suggest = "";
        if (same && path.isAbsolute(r.path)) { try { if (fs.statSync(r.path).isDirectory()) suggest = path.resolve(r.path); } catch {} }
        const w = rootWants(p, i);
        return { i, hint: r.path, name: hintBase(r.path), subfolders: r.subfolders, away: r.away || null, suggest,
                 wants: { pins: new Set(w.pins).size, known: w.known.length, files: w.files.length } };
      }),
      libraries: libs.map((l, i) => {
        const t = Object.values(l.tracks);
        const pins = t.filter((r) => r.file).length, byHand = t.filter((r) => r.file && r.by_hand).length;
        return {
          i, name: libTitle(l), tracks: l.playlist ? l.playlist.tracks.length : 0, fetched: !!l.playlist,
          link: l.url ? (isPrivateLink(l.url) ? "private" : "ok") : "missing",
          likes: !!core.likesUser(l.url),
          pins, by_hand: byHand, other_pins: pins - byHand, no_file: t.filter((r) => r.file === "").length,
          edits: t.filter((r) => r.edit).length + Object.values(l.files).filter((f) => f.edit).length,
          overrides: t.filter((r) => r.override).length, na: t.filter((r) => r.na).length,
          found: Object.values(l.files).filter((f) => f.found).length,
          known_files: null, subfolders: false, folders: [],
        };
      }),
      dropped: isObj(doc.dropped) ? { pins: Number(doc.dropped.pins) || 0, edits: Number(doc.dropped.edits) || 0, found: Number(doc.dropped.found) || 0 } : { pins: 0, edits: 0, found: 0 },
      settings: doc.settings || {}, device: core.DEVICES[doc.device] ? doc.device : null,
      theme: isStr(doc.prefs?.theme) ? doc.prefs.theme : null,
      machine: { inbox_dir: isStr(doc.machine?.inbox_dir) ? doc.machine.inbox_dir : null, do_all: isObj(doc.machine?.do_all), same_platform: same },
      notes,
      replaces: S.libraries.map((l) => ({ id: l.id, name: core.libName(l), tracks: l.playlist?.tracks.length || 0,
        pins: Object.entries(S.assigned).filter(([k, f]) => f && (l.playlist?.tracks || []).some((t) => String(t.id) === k)).length })),
    };
  }
  return {
    plan: p.id,
    file: { app_version: isStr(doc.app_version) ? doc.app_version : "", exported_at: isStr(doc.exported_at) ? doc.exported_at : "",
            platform: isStr(doc.source?.platform) ? doc.source.platform : "", links_left_out: !!doc.links_left_out },
    libraries: libs.map((l, i) => {
      const t = Object.values(l.tracks);
      const pins = t.filter((r) => r.file).length, byHand = t.filter((r) => r.file && r.by_hand).length;
      return {
        i, name: libTitle(l), tracks: l.playlist ? l.playlist.tracks.length : 0, fetched: !!l.playlist,
        link: l.url ? (isPrivateLink(l.url) ? "private" : "ok") : "missing",
        likes: !!core.likesUser(l.url),
        pins, by_hand: byHand, other_pins: pins - byHand, no_file: t.filter((r) => r.file === "").length,
        edits: t.filter((r) => r.edit).length + Object.values(l.files).filter((f) => f.edit).length,
        overrides: t.filter((r) => r.override).length, na: t.filter((r) => r.na).length,
        found: Object.values(l.files).filter((f) => f.found).length,
        known_files: l.file_names ? l.file_names.length : null,
        subfolders: l.subfolders,
        folders: l.folders.map((f, fi) => {
          // the same computer (a backup brought back): the old folder, if it is still there
          let suggest = "";
          if (same && path.isAbsolute(f.path)) { try { if (fs.statSync(f.path).isDirectory()) suggest = path.resolve(f.path); } catch {} }
          return { i: fi, hint: f.path, name: hintBase(f.path), main: fi === 0, away: f.away || null, suggest,
                   wants: (({ pins, known, files }) => ({ pins: pins.length, known: known.length, files: files.length }))(folderWants(l, fi)) };
        }),
      };
    }),
    dropped: isObj(doc.dropped) ? { pins: Number(doc.dropped.pins) || 0, edits: Number(doc.dropped.edits) || 0, found: Number(doc.dropped.found) || 0 } : { pins: 0, edits: 0, found: 0 },
    settings: doc.settings || {}, device: core.DEVICES[doc.device] ? doc.device : null,
    theme: isStr(doc.prefs?.theme) ? doc.prefs.theme : null,
    machine: { inbox_dir: isStr(doc.machine?.inbox_dir) ? doc.machine.inbox_dir : null, do_all: isObj(doc.machine?.do_all), same_platform: same },
    notes,
    replaces: S.libraries.map((l) => ({ id: l.id, name: core.libName(l), tracks: l.playlist?.tracks.length || 0,
      pins: Object.entries(S.assigned).filter(([k, f]) => f && (l.playlist?.tracks || []).some((t) => String(t.id) === k)).length })),
  };
}

// ---------------- import: folders on this computer ----------------

/** A folder typed or picked for an imported library: must exist, and not be a disk's root
 *  (several prefix checks can't handle "G:\" or "/" yet). Problem as a code, or the path. */
function checkDir(raw: unknown): { dir: string } | { problem: string } {
  const d = core.typedPath(raw);
  if (!d) return { problem: "folder_none" };
  try { if (!fs.statSync(d).isDirectory()) return { problem: "folder_not_found" }; }
  catch { return { problem: "folder_not_found" }; }
  try { fs.readdirSync(d); } catch { return { problem: "folder_unreadable" }; }
  if (path.parse(d).root === d) return { problem: "folder_root" };
  return { dir: d };
}

interface FolderMatch {
  dir: string; files: number;
  pins: { total: number; found: number }; known: { total: number; found: number }; entries: { total: number; found: number };
  ambiguous: number; needs_subfolders: boolean; how: { exact: number; folded: number; base: number; stem: number };
  map: Map<string, { to: string; how: core.MatchHow }>;
}
/** Match one exported folder's keys to the files in `dir` (names only, any depth). */
function matchFolder(l: LibRec, fi: number, dir: string): FolderMatch {
  const w = folderWants(l, fi);
  const disk = core.listAudioKeys(dir, true);
  const m = core.matchKeys([...w.pins, ...w.known, ...w.files], disk);
  const hit = (ks: string[]) => ks.filter((k) => m.map.has(k)).length;
  const how = { exact: 0, folded: 0, base: 0, stem: 0 };
  for (const v of m.map.values()) how[v.how]++;
  return {
    dir, files: disk.length,
    pins: { total: new Set(w.pins).size, found: hit([...new Set(w.pins)]) },
    known: { total: w.known.length, found: hit(w.known) },
    entries: { total: w.files.length, found: hit(w.files) },
    ambiguous: m.ambiguous,
    needs_subfolders: !l.subfolders && [...m.map.values()].some((v) => v.to.includes("/")),
    how, map: m.map,
  };
}
const matchOut = (r: FolderMatch) => { const { map, ...rest } = r; return rest; };

/** Match one v2 root's keys to the files in `dir` (names only, any depth). */
function matchRoot(p: { libs: LibRec[]; roots: RootRec[] }, ri: number, dir: string): FolderMatch {
  const w = rootWants(p, ri);
  const disk = core.listAudioKeys(dir, true);
  const m = core.matchKeys([...w.pins, ...w.known, ...w.files], disk);
  const hit = (ks: string[]) => ks.filter((k) => m.map.has(k)).length;
  const how = { exact: 0, folded: 0, base: 0, stem: 0 };
  for (const v of m.map.values()) how[v.how]++;
  return {
    dir, files: disk.length,
    pins: { total: new Set(w.pins).size, found: hit([...new Set(w.pins)]) },
    known: { total: w.known.length, found: hit(w.known) },
    entries: { total: w.files.length, found: hit(w.files) },
    ambiguous: m.ambiguous,
    needs_subfolders: !p.roots[ri].subfolders && [...m.map.values()].some((v) => v.to.includes("/")),
    how, map: m.map,
  };
}

/** POST /api/config/import/probe {plan, lib, folder, dir} (a v1 file) or {plan, root, dir}
 *  (a v2 file): how many of that folder's files are found in `dir`, without changing anything. */
export function probe(data: any): any {
  const p = getPlan(data.plan);
  if (p.roots.length) {
    const ri = Number(data.root) || 0;
    if (!p.roots[ri]) throw fail("bad_request", "no such folder in the file");
    const c = checkDir(data.dir);
    if ("problem" in c) return { root: ri, problem: c.problem };
    return { root: ri, ...matchOut(matchRoot(p, ri, c.dir)) };
  }
  const l = p.libs[Number(data.lib)];
  if (!l) throw fail("bad_request", "no such library in the file");
  const fi = Number(data.folder) || 0;
  if (!l.folders[fi]) throw fail("bad_request", "no such folder in the file");
  const c = checkDir(data.dir);
  if ("problem" in c) return { lib: Number(data.lib), folder: fi, problem: c.problem };
  return { lib: Number(data.lib), folder: fi, ...matchOut(matchFolder(l, fi, c.dir)) };
}

// ---------------- import: applying ----------------

const backupsDir = () => path.join(core.dataDir(), "backups");
const stamp = (d = new Date()) => { const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
/** a backup set: the database copy, or (DJ HQ 1.7 and older) state.json and prefs.json */
const BACKUP_RE = /^(\d{8}-\d{6}(?:-\d+)?)-before-import\.(?:(?:state|prefs)\.json|djhq\.db)$/;
const BACKUP_KEEP_DAYS = 7;
/** Copy the database (state and preferences, one consistent file) to
 *  backups/<time>-before-import.djhq.db; the last 5 such sets are kept, and every set of the
 *  past week (several tries in a row never push out the data from before the first). Nothing
 *  else in backups/ (or the data folder) is touched. */
function backupCurrent(): string[] {
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  let st = stamp();
  for (let n = 2; fs.readdirSync(dir).some((f) => f.startsWith(st + "-before-import.")); n++) st = `${stamp()}-${n}`;
  const dst = path.join(dir, `${st}-before-import.djhq.db`);
  core.backupDb(dst);
  const sets = [...new Set(fs.readdirSync(dir).map((f) => BACKUP_RE.exec(f)?.[1]).filter((x): x is string => !!x))].sort();
  const recent = stamp(new Date(Date.now() - BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000));
  for (const old of sets.slice(0, Math.max(0, sets.length - 5)).filter((s) => s < recent))
    for (const f of fs.readdirSync(dir)) if (BACKUP_RE.exec(f)?.[1] === old) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
  return [dst];
}

const sameOrInside = (a: string, b: string) => { const r = path.relative(b, a); return !r || (!r.startsWith("..") && !path.isAbsolute(r)); };

/** POST /api/config/import/apply {plan, folders: [[main, extra…] per library; null skips an
 *  extra folder], confirm_replace, no_files: [library indexes that may be imported without
 *  any file found], machine?: also take the other computer's downloads folder and Do
 *  everything setup (when they exist here)}. Returns the new view with import_report. */
export async function apply(data: any, opts: { jobActive: boolean }): Promise<any> {
  const p = getPlan(data.plan);
  if (p.roots.length) return applyV2(p, data, opts);
  if (opts.jobActive) throw fail("job_active", "a Do everything run is going; wait for it to finish (or cancel it) before importing");
  const S = core.STATE;
  if (S.libraries.length && data.confirm_replace !== true)
    throw fail("confirm_replace", "importing replaces the libraries on this computer; confirm that first");
  const chosen: unknown[][] = Array.isArray(data.folders) ? data.folders : [];
  const noFiles = new Set((Array.isArray(data.no_files) ? data.no_files : []).map(Number));
  // the folders: each must exist; none may be the same as, or inside, another one
  const dirs: (string | null)[][] = p.libs.map((l, li) => l.folders.map((_, fi) => {
    const raw = Array.isArray(chosen[li]) ? chosen[li][fi] : undefined;
    if (fi > 0 && (raw === null || raw === undefined || raw === "")) return null;   // an extra folder left out
    const c = checkDir(raw);
    if ("problem" in c) throw fail(c.problem, "choose a folder that exists on this computer for " + libTitle(l), { lib: libTitle(l), folder: fi });
    return c.dir;
  }));
  const all = dirs.flat().filter((d): d is string => !!d);
  all.forEach((a, i) => all.forEach((b, j) => {
    if (i !== j && sameOrInside(a, b)) throw fail("folder_twice", `${a} is ${a === b ? "chosen twice" : "inside " + b}; each library folder must be on its own`, { dir: a, other: b });
  }));
  const matches = p.libs.map((l, li) => l.folders.map((_, fi) => dirs[li][fi] ? matchFolder(l, fi, dirs[li][fi]!) : null));
  const dormant = p.libs.map((l, li) => {
    // a folder left out counts for nothing: its matches are dropped, as the wizard says
    const want = matches[li].reduce((n, m) => n + (m ? m.pins.total + m.known.total : 0), 0);
    const found = matches[li].reduce((n, m) => n + (m ? m.pins.found + m.known.found : 0), 0);
    if (want > 0 && found === 0 && !noFiles.has(li))
      throw fail("no_files_found", `none of the files of ${libTitle(l)} are in the folder chosen for it; choose the right folder, or confirm importing it without its files for now`, { lib: libTitle(l), i: li });
    return want > 0 && found === 0;
  });
  // ids: never one this state uses, nor one with backed-up originals on disk (Restore would
  // copy those foreign files into the new library, Clean up would delete them). A library
  // brought back to its own folder on this computer keeps its id, and so its originals.
  const used = new Set(S.libraries.map((l) => l.id));
  const kept = new Set<string>();
  const ownId = (l: LibRec, dir: string): string | null => {
    const cur = S.libraries.find((x) => x.id === l.uid && core.sameDir(x.dir, dir));
    if (!cur || kept.has(cur.id)) return null;
    kept.add(cur.id);
    return cur.id;
  };
  const newId = () => {
    for (let n = 1; ; n++) {
      const id = "lib" + n;
      if (!used.has(id) && !fs.existsSync(path.join(core.dataDir(), "originals", id))) { used.add(id); return id; }
    }
  };
  const next: any = {
    libraries: [], active: null, dur_cache: {}, zip_cache: { ...(S.zip_cache || {}) }, overrides: {}, edits: {}, assigned: {}, by_hand: {},
    found: {}, na: {}, acquired: {}, settings: {}, bandcamp: { ...(S.bandcamp || {}) }, sc_card: { ...(S.sc_card || {}) }, client_id: S.client_id ?? null, device: S.device,
  };
  const report: any = { libraries: [], backups: [], machine_used: false, notes: [...p.notes] };
  const put = <T>(map: Record<string, T>, k: string, v: T) => { if (!(k in map)) map[k] = v; };
  p.libs.forEach((l, li) => {
    const lib: Library = { id: ownId(l, dirs[li][0]!) || newId(), uid: l.uid, dir: dirs[li][0]!, url: l.url, playlist: l.playlist,
                           seen_mark: l.seen_mark, acq_init: l.acq_init };
    const extras = dirs[li].slice(1).filter((d): d is string => !!d);
    if (extras.length) lib.dirs = extras;
    const ms = matches[li];
    const subOn = !l.subfolders && ms.some((m) => m && m.needs_subfolders);
    if (l.subfolders || subOn) lib.subfolders = true;
    // no file found at all: nothing can tie the arrival times to files, so files that turn up are
    // not "new" (the first view stamps them 0); with pins, the library waits for its music
    if (!ms.some((m) => m && (m.pins.found || m.known.found || m.entries.found))) lib.acq_init = false;
    if (dormant[li]) lib.files_pending = true;
    // the key prefixes of this computer (extra folders are named after the chosen folder)
    const pre = legacyPrefixes(lib);
    const newPrefix = dirs[li].map((d) => d ? pre.get(d)! : null);
    /** an exported key -> {key here, absolute path here, found} (null: its folder was left out) */
    const here = (k: string) => {
      const fi = folderOf(l, k), d = dirs[li][fi];
      if (!d) return null;
      const rest = k.slice(l.folders[fi].key_prefix.length);
      const m = ms[fi]!.map.get(rest);
      const rel = m ? m.to : rest;
      return { key: newPrefix[fi] + rel, abs: path.join(d, ...rel.split("/")), found: !!m };
    };
    const rep = { i: li, id: lib.id, name: libTitle(l), dir: lib.dir, dirs: legacyDirs(lib), pins: 0, pins_dropped: 0, by_hand: 0,
                  edits: 0, found: 0, dropped: 0, files_pending: !!dormant[li], subfolders_on: subOn,
                  folders: ms.map((m) => m ? matchOut(m) : null) };
    const pinTaken = new Set<string>();
    for (const [tid, t] of Object.entries(l.tracks)) {
      if (t.file === "") { put(next.assigned, tid, ""); if (t.by_hand) next.by_hand[tid] = true; }
      else if (t.file) {
        const h = here(t.file);
        if (h && (h.found || dormant[li]) && !pinTaken.has(h.key) && !(tid in next.assigned)) {
          next.assigned[tid] = h.key; pinTaken.add(h.key); rep.pins++;
          if (t.by_hand) { next.by_hand[tid] = true; rep.by_hand++; }
        } else rep.pins_dropped++;
      }
      if (t.override) put(next.overrides, tid, t.override);
      if (t.edit) { put(next.edits, tid, t.edit); rep.edits++; }
      if (t.na) put(next.na, tid, t.na);
      // the file-arrival time travels with the track: a file that turns up for it later (by its pin,
      // or matched by name) keeps it, so nothing shows as new that wasn't; the view drops it otherwise
      if (t.acquired !== undefined) next.acquired[`${lib.id}:${tid}`] = t.acquired;
    }
    for (const [k, f] of Object.entries(l.files)) {
      const h = here(k);
      if (!h) { rep.dropped++; continue; }
      if (f.edit) { put(next.edits, "x:" + h.abs, f.edit); rep.edits++; }
      if (f.found) { if (h.found || dormant[li]) { put(next.found, "x:" + h.abs, f.found); rep.found++; } else rep.dropped++; }
    }
    // the probe cache of this computer, for files under the new folders (a backup restored here costs no new probe)
    for (const [k, v] of Object.entries(S.dur_cache)) if (legacyDirs(lib).some((d) => sameOrInside(k, d))) next.dur_cache[k] = v;
    next.libraries.push(lib);
    report.libraries.push(rep);
  });
  for (const [tid, t] of Object.entries<any>(p.doc.orphans?.tracks || {})) {
    if (t.override) put(next.overrides, tid, t.override);
    if (t.edit) put(next.edits, tid, t.edit);
    if (t.na) put(next.na, tid, t.na);
  }
  next.active = next.libraries[Math.min(Math.max(0, Number(p.doc.active) || 0), next.libraries.length - 1)].id;
  // settings: the portable ones from the file; this computer's paths stay unless asked for
  const fs_ = p.doc.settings || {};
  const st: any = {};
  if (typeof fs_.auto_move === "boolean") st.auto_move = fs_.auto_move;
  if (core.REFRESH_CHOICES.includes(fs_.refresh_min)) st.refresh_min = fs_.refresh_min;
  if (typeof fs_.like_on_add === "boolean") st.like_on_add = fs_.like_on_add;
  if (typeof fs_.aiff_auto === "boolean") st.aiff_auto = fs_.aiff_auto;
  if (fs_.bandcamp === false) st.bandcamp = false;
  if (core.BANDCAMP_DAYS.includes(fs_.bandcamp_days)) st.bandcamp_days = fs_.bandcamp_days;
  if (fs_.sc_open === "discover" || fs_.sc_open === "browser") st.sc_open = fs_.sc_open;
  if (S.settings?.do_all) st.do_all = S.settings.do_all;
  if (S.inbox_dir) next.inbox_dir = S.inbox_dir;
  if (data.machine === true && isObj(p.doc.machine)) {
    const m = p.doc.machine;
    const isDir = (d: any) => { try { return isStr(d) && path.isAbsolute(d) && fs.statSync(d).isDirectory(); } catch { return false; } };
    if (isDir(m.inbox_dir)) { next.inbox_dir = path.resolve(m.inbox_dir); report.machine_used = true; }
    if (isObj(m.do_all)) {
      // only what exists here; the output mode is read again on this computer
      const d: any = {};
      for (const k of ["on", "close_apps", "press_start", "include_pending"]) if (typeof m.do_all[k] === "boolean") d[k] = m.do_all[k];
      for (const k of ["pn_app", "mik_app", "mik_db", "rb_xml"]) if (isStr(m.do_all[k]) && path.isAbsolute(m.do_all[k]) && fs.existsSync(m.do_all[k])) d[k] = m.do_all[k];
      st.do_all = d; report.machine_used = true;
    }
  }
  next.settings = st;
  if (core.DEVICES[p.doc.device]) next.device = p.doc.device;
  const state: AppState = core.withDefaults(next);

  // a copy of the current data first, then the new state written and swapped in at once
  if (!core.canSave()) throw fail("store_blocked", "DJ HQ can't save right now, so nothing was imported");
  try { report.backups = backupCurrent(); }
  catch (e: any) {
    throw fail("config_backup_failed", `DJ HQ couldn't save a copy of the current data before importing, so nothing was changed (${e?.message || e})`, { error: String(e?.message || e) });
  }
  const theme = p.doc.prefs?.theme;
  const prevPrefs = core.getPrefs();
  const setTheme = theme === "system" || theme === "light" || theme === "dark";
  const themeBack = () => { if (setTheme) { try { core.setPrefs({ theme: prevPrefs.theme }); } catch {} } };
  let undo: () => void;
  try {
    if (setTheme) core.setPrefs({ theme });
    undo = core.replaceState(state);
    // a v1 file describes libraries that own folders: the same migration that moved this
    // computer to the collection model turns them into collection roots and absolute keys
    core.migrateToCollection();
  } catch (e) { themeBack(); throw e; }
  PLANS.delete(p.id);   // used up: the state is in place
  let view: any;
  try {
    if (process.env.DJHQ_TEST_FAIL_VIEW && !__dirname.includes("app.asar")) throw new Error("test: the view failed");
    view = await core.buildView();
  }
  catch (e: any) {
    // the new state can't be shown: the one from before goes back, theme and all
    undo();
    themeBack();
    throw fail("config_view_failed", `the imported data couldn't be shown, so the data from before is back in place (${e?.message || e})`, { error: String(e?.message || e) });
  }
  view.import_report = report;
  return view;
}

/** apply for a v2 file: the user mapped the collection's roots to folders on this computer
 *  (data.roots, one path or null per exported root; a skipped root drops what lived under
 *  it). The new state is built in the collection shape directly, so no migration runs. */
async function applyV2(p: Plan, data: any, opts: { jobActive: boolean }): Promise<any> {
  if (opts.jobActive) throw fail("job_active", "a Do everything run is going; wait for it to finish (or cancel it) before importing");
  const S = core.STATE;
  if (S.libraries.length && data.confirm_replace !== true)
    throw fail("confirm_replace", "importing replaces the libraries on this computer; confirm that first");
  const chosen: unknown[] = Array.isArray(data.roots) ? data.roots : [];
  const dirs: (string | null)[] = p.roots.map((r, i) => {
    const raw = chosen[i];
    if (raw === null || raw === undefined || raw === "") return null;
    const c = checkDir(raw);
    if ("problem" in c) throw fail(c.problem, "choose a folder that exists on this computer for " + hintBase(r.path), { lib: hintBase(r.path), folder: i });
    return c.dir;
  });
  if (!dirs.some(Boolean)) throw fail("folder_none", "choose at least one collection folder");
  const all = dirs.filter((d): d is string => !!d);
  all.forEach((a, i) => all.forEach((b, j) => {
    if (i !== j && sameOrInside(a, b)) throw fail("folder_twice", `${a} is ${a === b ? "chosen twice" : "inside " + b}; each collection folder must be on its own`, { dir: a, other: b });
  }));
  const matches = p.roots.map((r, i) => dirs[i] ? matchRoot(p, i, dirs[i]!) : null);
  const wantPins = p.libs.reduce((n, l) => n + Object.values(l.tracks).filter((t) => t.file).length, 0);
  const foundAny = matches.reduce((n, m) => n + (m ? m.pins.found + m.known.found + m.entries.found : 0), 0);
  const dormant = wantPins > 0 && foundAny === 0;
  if (dormant && data.no_files_ok !== true)
    throw fail("no_files_found", "none of the files of this configuration are in the folders chosen; choose the right folders, or confirm importing without the files for now", {});
  /** a v2 key on this computer, through the per-root match; null when its root was skipped */
  const abs = (key: string): string | null => {
    const m = /^@(\d+)(?:\/(.+))?$/.exec(key);
    if (!m) return null;
    const ri = Number(m[1]), d = dirs[ri];
    if (!d) return null;
    if (!m[2]) return d;
    const hit = matches[ri]!.map.get(m[2]);
    return path.join(d, ...(hit ? hit.to : m[2]).split("/"));
  };
  const matched = (key: string): boolean => {
    const m = /^@(\d+)\/(.+)$/.exec(key);
    return !!m && !!dirs[Number(m[1])] && matches[Number(m[1])]!.map.has(m[2]);
  };
  const next: any = {
    collection: { roots: [] }, libraries: [], active: null, dur_cache: {}, zip_cache: { ...(S.zip_cache || {}) },
    overrides: {}, edits: {}, assigned: {}, by_hand: {}, found: {}, na: {}, acquired: {}, settings: {},
    bandcamp: { ...(S.bandcamp || {}) }, sc_card: { ...(S.sc_card || {}) }, client_id: S.client_id ?? null, device: S.device,
  };
  let rid = 1;
  p.roots.forEach((r, i) => {
    if (!dirs[i]) return;
    const sub = r.subfolders || matches[i]!.needs_subfolders;
    next.collection.roots.push({ id: "r" + rid++, path: dirs[i], ...(sub ? { subfolders: true } : {}) });
  });
  if (p.doc.collection?.move_target) {
    const t = abs(p.doc.collection.move_target);
    if (t) next.collection.move_target = t;
  }
  const used = new Set(S.libraries.map((l) => l.id));
  const newId = () => {
    for (let n = 1; ; n++) {
      const id = "lib" + n;
      if (!used.has(id) && !fs.existsSync(path.join(core.dataDir(), "originals", id))) { used.add(id); return id; }
    }
  };
  const report: any = { v2: true, libraries: [], roots: matches.map((m, i) => m ? { i, ...matchOut(m) } : { i, skipped: true }),
                        backups: [], machine_used: false, notes: [...p.notes] };
  const put = <T>(map: Record<string, T>, k: string, v: T) => { if (!(k in map)) map[k] = v; };
  const pinTaken = new Set<string>();
  p.libs.forEach((l, li) => {
    const lib: Library = { id: newId(), uid: l.uid, dir: "", url: l.url, playlist: l.playlist,
                           seen_mark: l.seen_mark, acq_init: l.acq_init };
    const target = l.target ? abs(l.target) : null;
    if (target) lib.target = target;
    if (foundAny === 0) lib.acq_init = false;   // nothing to tie arrival times to: nothing shows as new
    const libPins = Object.values(l.tracks).filter((t) => t.file).length;
    if (dormant && libPins) lib.files_pending = true;
    const rep = { i: li, id: lib.id, name: libTitle(l), dir: "", dirs: [], pins: 0, pins_dropped: 0, by_hand: 0,
                  edits: 0, found: 0, dropped: 0, files_pending: !!lib.files_pending, subfolders_on: false, folders: [] as any[] };
    for (const [tid, t] of Object.entries(l.tracks)) {
      if (t.file === "") { put(next.assigned, tid, ""); if (t.by_hand) next.by_hand[tid] = true; }
      else if (t.file) {
        const a = abs(t.file);
        if (a && (matched(t.file) || dormant) && !pinTaken.has(a) && !(tid in next.assigned)) {
          next.assigned[tid] = a; pinTaken.add(a); rep.pins++;
          if (t.by_hand) { next.by_hand[tid] = true; rep.by_hand++; }
        } else rep.pins_dropped++;
      }
      if (t.override) put(next.overrides, tid, t.override);
      if (t.edit) { put(next.edits, tid, t.edit); rep.edits++; }
      if (t.na) put(next.na, tid, t.na);
      if (t.acquired !== undefined) next.acquired[`${lib.id}:${tid}`] = t.acquired;
    }
    for (const [k, f] of Object.entries(l.files)) {
      const a = abs(k);
      if (!a) { rep.dropped++; continue; }
      if (f.edit) { put(next.edits, "x:" + a, f.edit); rep.edits++; }
      if (f.found) { if (matched(k) || dormant) { put(next.found, "x:" + a, f.found); rep.found++; } else rep.dropped++; }
    }
    next.libraries.push(lib);
    report.libraries.push(rep);
  });
  for (const [tid, t] of Object.entries<any>(p.doc.orphans?.tracks || {})) {
    if (t.override) put(next.overrides, tid, t.override);
    if (t.edit) put(next.edits, tid, t.edit);
    if (t.na) put(next.na, tid, t.na);
  }
  // the probe cache of this computer, for files under the chosen roots
  for (const [k, v] of Object.entries(S.dur_cache)) if (all.some((d) => sameOrInside(k, d))) next.dur_cache[k] = v;
  next.active = next.libraries.length ? next.libraries[Math.min(Math.max(0, Number(p.doc.active) || 0), next.libraries.length - 1)].id : null;
  // settings: the portable ones from the file; this computer's paths stay unless asked for
  const fs_ = p.doc.settings || {};
  const st: any = {};
  if (typeof fs_.auto_move === "boolean") st.auto_move = fs_.auto_move;
  if (core.REFRESH_CHOICES.includes(fs_.refresh_min)) st.refresh_min = fs_.refresh_min;
  if (typeof fs_.like_on_add === "boolean") st.like_on_add = fs_.like_on_add;
  if (typeof fs_.aiff_auto === "boolean") st.aiff_auto = fs_.aiff_auto;
  if (fs_.bandcamp === false) st.bandcamp = false;
  if (core.BANDCAMP_DAYS.includes(fs_.bandcamp_days)) st.bandcamp_days = fs_.bandcamp_days;
  if (fs_.sc_open === "discover" || fs_.sc_open === "browser") st.sc_open = fs_.sc_open;
  if (S.settings?.do_all) st.do_all = S.settings.do_all;
  if (S.inbox_dir) next.inbox_dir = S.inbox_dir;
  if (data.machine === true && isObj(p.doc.machine)) {
    const m = p.doc.machine;
    const isDir = (d: any) => { try { return isStr(d) && path.isAbsolute(d) && fs.statSync(d).isDirectory(); } catch { return false; } };
    if (isDir(m.inbox_dir)) { next.inbox_dir = path.resolve(m.inbox_dir); report.machine_used = true; }
    if (isObj(m.do_all)) {
      const d: any = {};
      for (const k of ["on", "close_apps", "press_start", "include_pending"]) if (typeof m.do_all[k] === "boolean") d[k] = m.do_all[k];
      for (const k of ["pn_app", "mik_app", "mik_db", "rb_xml"]) if (isStr(m.do_all[k]) && path.isAbsolute(m.do_all[k]) && fs.existsSync(m.do_all[k])) d[k] = m.do_all[k];
      st.do_all = d; report.machine_used = true;
    }
  }
  next.settings = st;
  if (core.DEVICES[p.doc.device]) next.device = p.doc.device;
  const state: AppState = core.withDefaults(next);

  if (!core.canSave()) throw fail("store_blocked", "DJ HQ can't save right now, so nothing was imported");
  try { report.backups = backupCurrent(); }
  catch (e: any) {
    throw fail("config_backup_failed", `DJ HQ couldn't save a copy of the current data before importing, so nothing was changed (${e?.message || e})`, { error: String(e?.message || e) });
  }
  const theme = p.doc.prefs?.theme;
  const prevPrefs = core.getPrefs();
  const setTheme = theme === "system" || theme === "light" || theme === "dark";
  const themeBack = () => { if (setTheme) { try { core.setPrefs({ theme: prevPrefs.theme }); } catch {} } };
  let undo: () => void;
  try {
    if (setTheme) core.setPrefs({ theme });
    undo = core.replaceState(state);
  } catch (e) { themeBack(); throw e; }
  PLANS.delete(p.id);
  let view: any;
  try { view = await core.buildView(); }
  catch (e: any) {
    undo();
    themeBack();
    throw fail("config_view_failed", `the imported data couldn't be shown, so the data from before is back in place (${e?.message || e})`, { error: String(e?.message || e) });
  }
  // the report names where each playlist's files live now: the collection's roots
  for (const rep of report.libraries) { rep.dir = all[0] || ""; rep.dirs = all; }
  view.import_report = report;
  return view;
}
