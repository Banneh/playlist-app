/** DJ HQ core: state, SoundCloud (playlist fetch, track search), file scan +
 *  fuzzy matching, where-to-get-it links, rekordbox tagging, player-compat
 *  conversion, the Downloads inbox and the rekordbox XML export. All file
 *  rewrites go through ffmpeg with an audio-MD5 (tags) or duration (converts)
 *  verification, converts back up the untouched original first, and every
 *  action returns the full view (buildView) the UI renders. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { buildId3v23, appendId3ToWav } from "./id3";
import { listEntries, extractEntry, ZipEntry } from "./zip";

const AUDIO_EXT = [".wav", ".mp3", ".aiff", ".aif", ".flac", ".m4a", ".ogg"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface Device { label: string; wavBits: number; srs: number[]; flac: boolean; }
export const DEVICES: Record<string, Device> = {
  "xdj-700":  { label: "XDJ-700 / XDJ-1000 / CDJ-2000NXS", wavBits: 16,
                srs: [44100, 48000], flac: false },
  "nxs2":     { label: "CDJ-2000NXS2 / XDJ-XZ", wavBits: 24,
                srs: [44100, 48000, 88200, 96000], flac: true },
  "cdj-3000": { label: "CDJ-3000", wavBits: 24,
                srs: [44100, 48000, 88200, 96000], flac: true },
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

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      let code = 0;
      if (err) code = typeof (err as any).code === "number" ? (err as any).code : 1;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

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
export interface Library {
  /** the main music folder: new downloads are moved here */
  id: string; dir: string; url: string; playlist: Playlist | null;
  /** further folders that belong to this library (see libDirs) */
  dirs?: string[];
  /** also scan the folders inside each library folder (off by default) */
  subfolders?: boolean;
  /** tracks added after this (ms) are NEW; set by "Mark all as seen" */
  seen_mark?: number;
  /** file-arrival tracking has been initialised for this library (files present then aren't "new") */
  acq_init?: boolean;
}

// dur_cache entry: [size, mtime, duration, [codec, sr, bits], [artist, title, genre]]
type CacheEntry = [number, number, number, [string, number, number], [string, string, string]];

export interface AppState {
  libraries: Library[];
  active: string | null;
  dur_cache: Record<string, any[]>;
  overrides: Record<string, string>;
  edits: Record<string, { artist: string; title: string }>;
  /** manual file assignment: track id -> file name ("" = forced no file) */
  assigned: Record<string, string>;
  /** SoundCloud track picked for a local file that isn't in the playlist, keyed "x:" + path */
  found: Record<string, Found>;
  /** "not available now": track id -> the links it had when marked; cleared when they change */
  na: Record<string, { sig: string; at: number }>;
  /** folder watched for fresh downloads; default ~/Downloads */
  inbox_dir?: string;
  /** user settings (see getSettings) */
  settings?: { auto_move?: boolean; refresh_min?: number };
  /** probe results for audio inside zips in the downloads folder: "<zip path>|<entry>|<size>" -> [dur, fmt, tags] */
  zip_cache?: Record<string, [number, [string, number, number], [string, string, string]]>;
  /** "<lib id>:<track id>" -> ms when a file for the track first turned up (0 = predates tracking) */
  acquired: Record<string, number>;
  client_id: string | null;
  device: string;
}

let DATA_DIR = "";
let CAN_PICK = false;
let CAN_REVEAL = false;
export let STATE: AppState;

export function init(dataDir: string, canPick: boolean, canReveal = false): void {
  DATA_DIR = dataDir;
  CAN_PICK = canPick;
  CAN_REVEAL = canReveal;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  STATE = loadState();
}

const statePath = () => path.join(DATA_DIR, "state.json");

function loadState(): AppState {
  try {
    const st = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    st.assigned = st.assigned || {}; // older state files predate manual matching
    st.found = st.found || {};
    st.na = st.na || {};
    st.acquired = st.acquired || {};
    st.settings = st.settings || {};
    st.zip_cache = st.zip_cache || {};
    return st;
  } catch {
    return { libraries: [], active: null, dur_cache: {}, overrides: {},
             edits: {}, assigned: {}, found: {}, na: {}, acquired: {}, client_id: null, device: "xdj-700" };
  }
}
export function saveState(): void {
  fs.writeFileSync(statePath(), JSON.stringify(STATE));
}

const REFRESH_CHOICES = [5, 15, 30, 60, 120];
/** What the Settings page shows and edits. inbox_dir is kept top-level for older state files. */
export function getSettings(): any {
  const s = STATE.settings || (STATE.settings = {});
  return {
    inbox_dir: inboxDir(), inbox_default: path.join(os.homedir(), "Downloads"), inbox_custom: !!STATE.inbox_dir,
    auto_move: !!s.auto_move, refresh_min: REFRESH_CHOICES.includes(s.refresh_min || 0) ? s.refresh_min : 15,
    data_dir: DATA_DIR,
  };
}
/** POST /api/settings {inbox_dir?: string|null ("" or null = back to ~/Downloads), auto_move?: boolean, refresh_min?: number} */
export async function setSettings(data: any): Promise<any> {
  const s = STATE.settings || (STATE.settings = {});
  if ("inbox_dir" in data) {
    const d = String(data.inbox_dir || "").trim();
    if (!d) delete STATE.inbox_dir;
    else {
      if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error("that folder doesn't exist");
      STATE.inbox_dir = path.resolve(d);
    }
  }
  if ("auto_move" in data) s.auto_move = !!data.auto_move;
  if ("refresh_min" in data) {
    const n = Number(data.refresh_min);
    if (!REFRESH_CHOICES.includes(n)) throw new Error("refresh interval must be one of " + REFRESH_CHOICES.join(", ") + " minutes");
    s.refresh_min = n;
  }
  saveState();
  return buildView();
}
/** Folders the UI may stream audio from (preview): every library folder and the downloads folder. */
export function allowedDirs(): string[] {
  return [...STATE.libraries.flatMap((l) => libDirs(l).map((d) => path.resolve(d))), path.resolve(inboxDir())];
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

function libName(lib: Library): string {
  return lib.playlist?.title || path.basename(lib.dir.replace(/\/+$/, "")) || lib.id;
}

/** Every folder of a library: the main one first, then the extra ones in the order they were added. */
export function libDirs(lib: Library): string[] {
  return [lib.dir, ...(lib.dirs || [])];
}
/** The key an extra folder's files carry: "<folder name>/<relative path>" (the main
 *  folder's files are keyed by their relative path alone, so old state stays valid).
 *  An extra folder named like another one, or like a subfolder of the main folder
 *  while subfolders are scanned, gets " (2)", " (3)" … so keys stay unambiguous. */
function dirPrefixes(lib: Library): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  if (lib.subfolders) {
    try {
      for (const e of fs.readdirSync(lib.dir, { withFileTypes: true }))
        if (e.isDirectory() && !e.name.startsWith(".")) used.add(e.name);
    } catch {}
  }
  libDirs(lib).forEach((d, i) => {
    if (i === 0) { out.set(d, ""); return; }
    const base = path.basename(d.replace(/[\/\\]+$/, "")) || "folder";
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
    used.add(name);
    out.set(d, name + "/");
  });
  return out;
}
/** Absolute path of a library file key (the inverse of the keys scanLocal hands out). */
function libPath(lib: Library, key: string): string {
  for (const [d, prefix] of dirPrefixes(lib))
    if (prefix && key.startsWith(prefix)) return path.join(d, ...key.slice(prefix.length).split("/"));
  return path.join(lib.dir, ...key.split("/"));
}

function requireLib(): Library {
  const lib = activeLib();
  if (!lib) throw new Error("add a library first (＋ button in the header)");
  return lib;
}

// ---------------- soundcloud ----------------

async function httpGet(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) {
    const e: any = new Error(`HTTP ${r.status} fetching ${url.split("?")[0]}`);
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
  throw new Error("could not scrape a SoundCloud client_id");
}

/** "https://soundcloud.com/<user>/likes" -> "<user>", else null */
export function likesUser(url: string): string | null {
  const m = String(url || "").trim().match(/^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^\/?#]+)\/likes\/?(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

/** api-v2 call that rescrapes the client_id once when it has gone stale. */
async function withClientId<T>(html: string, fn: () => Promise<T>): Promise<T> {
  if (!STATE.client_id) STATE.client_id = await scrapeClientId(html);
  try { return await fn(); }
  catch (e: any) {
    if (e.status !== 401 && e.status !== 403) throw e;
    STATE.client_id = await scrapeClientId(html);
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

export async function fetchPlaylist(lib: Library): Promise<void> {
  const likes = likesUser(lib.url);
  const html = await httpGet(lib.url);
  const m = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);<\/script>/);
  if (!m) throw new Error(likes ? "could not read the likes page (is the profile public?)" : "could not read playlist page (is the URL a public playlist?)");
  const hyd = JSON.parse(m[1]);
  let ids: number[], title: string;
  if (likes) {
    const user = hyd.find((i: any) => i.hydratable === "user")?.data;
    if (!user || typeof user.id !== "number") throw new Error("no SoundCloud user found at this URL");
    ids = await withClientId(html, () => fetchLikeIds(user.id));
    if (!ids.length) throw new Error("no public likes found (are your likes public?)");
    title = `${user.username || likes}'s likes`;
  } else {
    const pl = hyd.find((i: any) => i.hydratable === "playlist")?.data;
    if (!pl) throw new Error("no playlist found at this URL");
    ids = pl.tracks.map((t: any) => t.id);
    title = pl.title || "Playlist";
  }
  const tracks: Record<number, any> = await withClientId(html, async () => {
    const got: Record<number, any> = {};
    for (let i = 0; i < ids.length; i += 40) {
      const batch = ids.slice(i, i + 40).join(",");
      const url = `https://api-v2.soundcloud.com/tracks?ids=${batch}&client_id=${STATE.client_id}`;
      for (const t of JSON.parse(await httpGet(url))) got[t.id] = t;
    }
    return got;
  });
  // first-seen time per track: kept across fetches; tracks already in the
  // snapshot (or in a library's very first fetch) are not "new"
  const prevAdded = new Map<number, number>();
  for (const p of lib.playlist?.tracks || []) prevAdded.set(p.id, p.added || 0);
  const now = Date.now();
  const out: PlTrack[] = [];
  for (const tid of ids) {
    const t = tracks[tid];
    if (!t) continue;
    out.push(trackFromApi(t, !lib.playlist ? 0 : prevAdded.has(tid) ? prevAdded.get(tid)! : now));
  }
  lib.playlist = { title, url: lib.url, tracks: out };
  saveState();
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
// is never written to state.json. Writes go through the same api-v2 the web player uses.

export interface ScUser { id: number; username: string; permalink: string; avatar: string; }
/** a track the embedded player reports, resolved against SoundCloud */
export interface ScNow { url: string; id: number; title: string; user: string; dur: number; art: string; }

const SC_ORIGIN = { Origin: "https://soundcloud.com", Referer: "https://soundcloud.com/" };

/** Signed-in calls go through the embedded SoundCloud page when one is available: SoundCloud's
 *  bot protection (DataDome) only accepts writes that carry a real browser's fingerprint and
 *  cookies. The transport runs fetch() inside that page and returns status + body text. */
export type ScTransport = (method: string, url: string, headers: Record<string, string>, body?: string) => Promise<{ status: number; body: string }>;
let scTransport: ScTransport | null = null;
export function setScTransport(t: ScTransport | null): void { scTransport = t; }

async function ensureClientId(): Promise<string> {
  if (!STATE.client_id) {
    const page = activeLib()?.url || "https://soundcloud.com/discover";
    STATE.client_id = await scrapeClientId(await httpGet(page));
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
      if (status === 0) throw new Error("SoundCloud page could not send the request: " + txt);
    } else {
      const r = await fetch(url, { method, headers: { ...headers, "User-Agent": UA, ...SC_ORIGIN }, body: payload });
      status = r.status; txt = await r.text();
    }
    if (status >= 200 && status < 300) return txt ? JSON.parse(txt) : {};
    if ((status === 401 || status === 403) && attempt === 0 && !token) { STATE.client_id = null; continue; }
    const where = `${method} ${pathAndQuery.split("?")[0]}`;
    const detail = txt.replace(/\s+/g, " ").trim().slice(0, 160);
    console.error(`soundcloud ${status} on ${where}: ${txt.slice(0, 600)}`);
    if (status === 401) throw new Error("SoundCloud signed you out — sign in again on the Discover page");
    if (status === 403) throw new Error(`SoundCloud refused this (403 on ${where})${detail ? ": " + detail : ""}`);
    if (status === 404) throw new Error(`SoundCloud could not find that (${where})`);
    throw new Error(`SoundCloud answered ${status} on ${where}${detail ? ": " + detail : ""}`);
  }
}

const meCache = new Map<string, ScUser>();
/** The signed-in user behind a session token (cached per token). */
export async function scMe(token: string): Promise<ScUser> {
  const hit = meCache.get(token);
  if (hit) return hit;
  const u = await scFetch("GET", "me", token);
  if (!u || typeof u.id !== "number") throw new Error("not signed in");
  const me: ScUser = { id: u.id, username: u.username || u.permalink || "", permalink: u.permalink || "", avatar: u.avatar_url || "" };
  meCache.clear(); meCache.set(token, me);
  return me;
}

const resolveCache = new Map<string, any>();
/** resolve a soundcloud.com URL to its api-v2 object (track / playlist / user); cached */
async function scResolve(url: string): Promise<any> {
  const key = url.split(/[?#]/)[0].replace(/\/+$/, "");
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
export async function scCanWrite(token: string): Promise<{ ok: boolean; why?: string; likes: boolean }> {
  const lib = activeLib();
  if (!lib) return { ok: false, why: "no library", likes: false };
  const me = await scMe(token);
  const likes = likesUser(lib.url);
  if (likes) {
    if (likes.toLowerCase() !== me.permalink.toLowerCase())
      return { ok: false, likes: true, why: `This library follows ${likes}'s likes, but you are signed in as ${me.username}.` };
    return { ok: true, likes: true };
  }
  const pl = await scResolve(lib.url);
  if (!pl || pl.kind !== "playlist") return { ok: false, likes: false, why: "The library's playlist could not be found on SoundCloud." };
  if (pl.user_id !== me.id)
    return { ok: false, likes: false, why: `This playlist belongs to ${pl.user?.username || "someone else"}; you can only add to your own playlists.` };
  return { ok: true, likes: false };
}

/** Add (or remove) a track to the active library's playlist or likes as the signed-in
 *  user, then patch the snapshot so the UI shows it right away; the next refresh
 *  reconciles with SoundCloud. */
export async function scSetInPlaylist(token: string, url: string, add: boolean): Promise<any> {
  const lib = requireLib();
  if (!lib.playlist) throw new Error("fetch the playlist first");
  const can = await scCanWrite(token);
  if (!can.ok) throw new Error(can.why || "cannot write to this playlist");
  const t = await scResolve(url);
  if (!t || t.kind !== "track") throw new Error("that is not a SoundCloud track");
  const tid = Number(t.id);
  const me = await scMe(token);
  const have = lib.playlist.tracks.some((x) => x.id === tid);
  if (can.likes) {
    if (add && !have) await scFetch("PUT", `users/${me.id}/track_likes/${tid}`, token);
    if (!add && have) await scFetch("DELETE", `users/${me.id}/track_likes/${tid}`, token);
  } else {
    // the playlist update takes the whole track list: take SoundCloud's current one, not our snapshot
    resolveCache.delete(lib.url.split(/[?#]/)[0].replace(/\/+$/, ""));
    const pl = await scResolve(lib.url);
    const ids: number[] = (pl.tracks || []).map((x: any) => Number(x.id)).filter((n: number) => n > 0);
    const next = add ? (ids.includes(tid) ? ids : [...ids, tid]) : ids.filter((n) => n !== tid);
    if (next.length !== ids.length)   // the web player's own shape: plain ids, whole list
      await scFetch("PUT", `playlists/${pl.id}`, token, { playlist: { tracks: next } });
    resolveCache.delete(lib.url.split(/[?#]/)[0].replace(/\/+$/, ""));
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
  return view;
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
      "stream=codec_name,sample_rate,bits_per_sample:stream_tags=artist,title,genre:format=duration:format_tags=artist,title,genre",
      "-of", "json", p], 30000);
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] || {};
    const tags = { ...(j.format?.tags || {}), ...(s.tags || {}) };
    return {
      dur: parseFloat(j.format?.duration || "0") || 0,
      fmt: [s.codec_name || "", parseInt(s.sample_rate || "0", 10) || 0, s.bits_per_sample || 0],
      tags: [lookupTag(tags, "artist"), lookupTag(tags, "title"), lookupTag(tags, "genre")],
    };
  } catch {
    return empty;
  }
}

export function compatReason(fmt: [string, number, number], devKey: string): string | null {
  const [codec, sr, bits] = fmt;
  const d = DEVICES[devKey];
  if (codec.startsWith("pcm")) {
    if (bits && bits > d.wavBits) return `${bits}-bit`;
    if (sr && !d.srs.includes(sr)) return `${sr / 1000} kHz`;
    return null;
  }
  if (codec === "mp3" || codec === "aac")
    return !sr || [32000, 44100, 48000].includes(sr) ? null : `${sr / 1000} kHz`;
  if (codec === "flac" && d.flac) return null;
  return (codec || "unknown").toUpperCase() + " unsupported";
}

/** name: the key the UI and state use (relative to its library folder, "/"-separated,
 *  prefixed with the folder name for extra folders); base: the file name alone. */
interface LocalFile { name: string; base: string; path: string; dur: number; fmt: [string, number, number]; tags: [string, string, string]; }

async function refreshCache(p: string): Promise<void> {
  const st = fs.statSync(p);
  const pr = await probe(p);
  STATE.dur_cache[p] = [st.size, Math.floor(st.mtimeMs / 1000), pr.dur, pr.fmt, pr.tags];
}

/** Every audio file of a library: all its folders, with their subfolders when the
 *  library asks for that. Keys (name) are unique across folders; a path that is
 *  reachable twice (nested folders) is listed once. */
async function scanLocal(lib: Library): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  const seenPath = new Set<string>(), seenKey = new Set<string>();
  for (const [d, prefix] of dirPrefixes(lib)) {
    for (const f of await scanFolder(d, !!lib.subfolders)) {
      const key = prefix + f.name;
      if (seenPath.has(f.path) || seenKey.has(key)) continue;
      seenPath.add(f.path); seenKey.add(key);
      out.push({ ...f, name: key });
    }
  }
  return out;
}

/** Audio files inside a folder (and, with `recursive`, its subfolders), probed once
 *  and cached by size+mtime. Names are relative to the folder, "/"-separated. */
async function scanFolder(d: string, recursive = false): Promise<LocalFile[]> {
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
      if (/\.tmp\.[^.]+$/i.test(f)) continue; // in-flight rewrite by writeTags/convertAll
      const st = fs.statSync(p);
      seen.add(p);
      const c = cache[p] as CacheEntry | undefined;
      if (!c || c[0] !== st.size || c[1] !== Math.floor(st.mtimeMs / 1000) || c.length < 5)
        await refreshCache(p);
      const en = cache[p] as CacheEntry;
      files.push({ name: rel + f, base: f, path: p, dur: en[2], fmt: en[3], tags: en[4] });
    }
  };
  if (fs.existsSync(d) && fs.statSync(d).isDirectory()) await walk(d, "");
  const under = (k: string) => recursive ? k.startsWith(d + path.sep) : path.dirname(k) === d;
  for (const k of Object.keys(cache))
    if (under(k) && !seen.has(k)) delete cache[k];
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

function cleanTitle(s: string): string {
  return s.replace(
    /\s*[\[\(](free\s*(dl|download)[^\]\)]*|crs\d+|[^\]\)]*follower special[^\]\)]*)[\]\)]/gi,
    "").trim();
}

function artistTitle(t: PlTrack): [string, string] {
  const title = cleanTitle(t.title);
  const i = title.indexOf(" - ");
  if (i >= 0) return [title.slice(0, i).trim(), title.slice(i + 3).trim()];
  return [(t.pub_artist || t.user || "").trim(), title];
}

const looseEq = (a: string, b: string) => norm(a) === norm(b);

/** Artist/title for a local file that isn't in the playlist: "Artist - Title.ext",
 *  overridden by an inline edit. */
function extraArtistTitle(f: LocalFile): [string, string] {
  const stem = f.base.replace(/\.[^.]+$/, "");
  const i = stem.indexOf(" - ");
  let [a, t] = i >= 0 ? [stem.slice(0, i).trim(), stem.slice(i + 3).trim()] : ["", stem];
  const ed = STATE.edits["x:" + f.path];
  if (ed) { a = ed.artist || a; t = ed.title || t; }
  return [a, t];
}

// ---------------- purchase / free-download links ----------------

/** Download gates and file hosts: a link there is a free download whatever it's called. */
const FREE_HOSTS = /(^|\.)(hypeddit\.com|droploud\.com|downloadgater\.com|gaterush\.me|gatekit\.pro|toneden\.io|drive\.google\.com|dropbox\.com|wetransfer\.com|we\.tl|mega\.nz|mediafire\.com|1drv\.ms)$/i;
/** Shops, and smart links that fan out to shops/streaming. */
const SHOP_HOSTS = /(^|\.)(bandcamp\.com|beatport\.com|junodownload\.com|traxsource\.com|lnk\.to|ffm\.to|fanlink\.to|bfan\.link|hyperfollow\.com|push\.fm|smarturl\.it|lnk\.site|ditto\.fm|orcd\.co|found\.ee|li\.sten\.to|songwhip\.com|song\.link|album\.link|linkfire\.com|lnkfi\.re)$/i;
/** Socials, streaming, profile hubs: never where you get the file. */
const NOISE_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|youtu\.be|spotify\.com|apple\.com|deezer\.com|tidal\.com|soundcloud\.com|snd\.sc|linktr\.ee|linksr\.io|lnk\.bio|beacons\.ai|ra\.co|discord\.gg|discord\.com|t\.me|telegram\.me|patreon\.com|mixcloud\.com|twitch\.tv|threads\.net|managerone\.io|amazon\.com|shazam\.com)$/i;
const FREE_WORDS = /\bfree\b|\bdl\b|download|gratis/i;
const BUY_WORDS = /\bbuy|purchase|pre-?order|out now|available|support|shop|stream/i;

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

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
      const host = m[2].toLowerCase();
      if (NOISE_HOSTS.test(host)) continue;
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

/** Preference within a kind: Bandcamp over other shops over smart links; a
 *  free download known to be lossless over unknown over known MP3. */
function linkRank(l: BuyLink): number {
  if (l.kind === "buy")
    return BANDCAMP.test(l.host) ? 3 : /(^|\.)(beatport|junodownload|traxsource)\.com$/i.test(l.host) ? 2 : 1;
  return l.fmt === "MP3" ? 0 : l.fmt ? 2 : 1;
}

/** Where to get the track, at most one buy and one free link: the uploader's
 *  purchase button, links found in the description, then SoundCloud's own
 *  download button; within a kind the better-ranked link wins. Buy sorts
 *  first: shops sell lossless files, free downloads are often MP3. */
export function trackLinks(t: PlTrack): BuyLink[] {
  const out: BuyLink[] = [];
  const add = (url: string, kind: "free" | "buy", title: string, host: string) => {
    if (out.some((o) => o.url === url)) return;
    const l: BuyLink = { url, kind, label: kind === "free" ? "Free DL" : "Buy", title, host, fmt: fmtHint(title, host) };
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
  if (t.sc_dl && t.url) add(t.url, "free", "Download on SoundCloud", "soundcloud.com");
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "buy" ? -1 : 1));
}

const linksSig = (ls: BuyLink[]) => ls.map((l) => l.url).sort().join("|");
const LOSSY = /^(mp3|aac|vorbis|opus|wma)/;

function isTagged(f: LocalFile, artist: string, title: string, genre: string): boolean {
  return looseEq(f.tags[0], artist) && looseEq(f.tags[1], title) && looseEq(f.tags[2], genre);
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

/** Rewrite the file with new tags, bit-perfect audio (MD5-verified). WAV gets a
 *  RIFF INFO chunk (from ffmpeg) plus an ID3v2.3/UTF-16 `id3 ` chunk (rekordbox
 *  ignores anything else); mp3/aiff get ID3v2.3; flac/m4a/ogg native tags. */
async function writeTags(p: string, artist: string, title: string, genre: string): Promise<void> {
  const ext = path.extname(p).toLowerCase();
  const md5 = await audioMd5(p);
  if (!md5) throw new Error("could not checksum audio");
  const tmp = p + ".tmp" + ext;
  const args = ["-y", "-v", "error", "-i", p];
  if (ext === ".wav") {
    args.push("-map", "0:a", "-c", "copy", "-map_metadata", "-1",
      ...metaArgs(artist, title, genre), "-fflags", "+bitexact", "-flags:a", "+bitexact");
  } else {
    args.push("-map", "0", "-c", "copy", ...metaArgs(artist, title, genre));
    if (ext === ".mp3") args.push("-id3v2_version", "3");
    if (ext === ".aiff" || ext === ".aif") args.push("-write_id3v2", "1", "-id3v2_version", "3");
  }
  args.push(tmp);
  const r = await run(FFMPEG, args, 300000);
  try {
    if (r.code !== 0) throw new Error("ffmpeg: " + r.stderr.slice(0, 200));
    if ((await audioMd5(tmp)) !== md5) throw new Error("audio data would change, left untouched");
    if (ext === ".wav") appendId3ToWav(tmp, buildId3v23(artist, title, genre));
  } catch (e) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw e;
  }
  fs.renameSync(tmp, p);
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

/** Backups that could go back into the library: [key, backup path, library path];
 *  a backup whose folder is gone (removed from the library, deleted) is left out. */
function restorable(lib: Library): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const [key, src] of backupEntries(lib)) {
    const dst = libPath(lib, key);
    if (fs.existsSync(path.dirname(dst))) out.push([key, src, dst]);
  }
  return out;
}

function restorableCount(lib: Library | null): number {
  // backups that differ (size/mtime) from the current library copy
  if (!lib) return 0;
  let n = 0;
  for (const [, src, dst] of restorable(lib)) {
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

export async function buildView(libArg?: Library): Promise<any> {
  const lib = libArg || activeLib();
  let dev = STATE.device || "xdj-700";
  if (!DEVICES[dev]) dev = "xdj-700";
  const base: any = {
    libraries: STATE.libraries.map((l) => ({ id: l.id, name: libName(l), dir: l.dir, dirs: libDirs(l), subfolders: !!l.subfolders })),
    active: lib ? lib.id : null,
    device: dev,
    devices: Object.entries(DEVICES).map(([id, d]) => ({ id, label: d.label })),
    backups: restorableCount(lib),
    backup_dir: lib ? backupDir(lib) : null,
    can_pick: CAN_PICK,
    can_reveal: CAN_REVEAL,
    settings: getSettings(),
    backup_bytes: backupBytes(lib),
  };
  if (!lib || !lib.playlist) return { ...base, ready: false };
  const files = await scanLocal(lib);
  const pl = lib.playlist;
  const genre = pl.title || "Trance";
  const fmap = new Map(files.map((f) => [f.name, f]));
  const byPath = new Map(files.map((f) => [f.path, f]));
  // manual assignments win over auto-matching; drop entries whose file vanished
  const trackIds = new Set(pl.tracks.map((t) => t.id));
  let assignedDirty = false;
  for (const k of Object.keys(STATE.assigned)) {
    const fname = STATE.assigned[k];
    if (!trackIds.has(Number(k)) || (fname !== "" && !fmap.has(fname))) {
      delete STATE.assigned[k];
      assignedDirty = true;
    }
  }
  // local files whose SoundCloud match has since been added to the playlist:
  // pin the file to that track (unless the track already has a manual file)
  const foundPrefixes = libDirs(lib).map((d) => "x:" + d + path.sep);
  for (const k of Object.keys(STATE.found)) {
    if (!foundPrefixes.some((pre) => k.startsWith(pre))) continue;
    const ff = byPath.get(k.slice(2));
    if (!ff) { delete STATE.found[k]; assignedDirty = true; continue; }
    const fname = ff.name;
    const tid = String(STATE.found[k].id);
    if (!trackIds.has(Number(tid))) continue;
    if (!STATE.assigned[tid] || !fmap.has(STATE.assigned[tid])) {
      for (const a of Object.keys(STATE.assigned)) if (STATE.assigned[a] === fname) delete STATE.assigned[a];
      STATE.assigned[tid] = fname;
      delete STATE.overrides[tid];
    }
    delete STATE.found[k];
    assignedDirty = true;
  }
  if (assignedDirty) saveState();
  const manual = new Map<number, string>(); // track id -> file name ("" = no file)
  const manualFiles = new Set<string>();
  for (const [k, fname] of Object.entries(STATE.assigned)) {
    manual.set(Number(k), fname);
    if (fname) manualFiles.add(fname);
  }
  const matched = new Map<number, [string, number]>(); // score -1 = manual
  const fileHit = new Set<string>();
  for (const f of files) {
    if (manualFiles.has(f.name)) { fileHit.add(f.name); continue; }
    let best: PlTrack | null = null, bestS = 0;
    for (const t of pl.tracks) {
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
    if (fname) matched.set(tid, [fname, -1]);
  const reavailable: string[] = [];
  let naDirty = false;
  const now = Date.now();
  const rows = pl.tracks.map((t, i) => {
    let [a, ti] = artistTitle(t);
    const ed = STATE.edits[String(t.id)];
    if (ed) { a = ed.artist || a; ti = ed.title || ti; }
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
        if (!have) reavailable.push(`${a} – ${ti}`);
      } else na = true;
    }
    let tagged: boolean | null = null, incompat: string | null = null, lossy = false;
    if (m) {
      const f = fmap.get(m[0])!;
      tagged = isTagged(f, a, ti, genre);
      incompat = compatReason(f.fmt, dev);
      lossy = LOSSY.test(f.fmt[0]);
    }
    const upgrade = have && lossy && links.some((l) => l.kind === "buy" && !!l.fmt && l.fmt !== "MP3");
    // when did a file for this track first turn up? (NEW FILE until marked seen)
    const ak = `${lib.id}:${t.id}`;
    if (m) {
      if (!(ak in STATE.acquired)) { STATE.acquired[ak] = lib.acq_init ? now : 0; naDirty = true; }
    } else if (ak in STATE.acquired) { delete STATE.acquired[ak]; naDirty = true; }
    const acquired = m ? STATE.acquired[ak] : 0;
    return { n: i + 1, id: t.id, artist: a, title: ti, user: t.user,
             dur: fmtDur(t.dur), url: t.url, art: t.art,
             have, na, auto: !!m, file: m ? m[0] : null, path: m ? fmap.get(m[0])!.path : null,
             score: m && m[1] >= 0 ? Math.min(1, m[1]) : null,
             manual_match: manual.has(t.id), links, lossy, upgrade,
             added: t.added || 0, is_new: (t.added || 0) > (lib.seen_mark || 0),
             acquired, is_new_file: acquired > (lib.seen_mark || 0),
             tagged, incompat, override: o || null, edited: !!ed };
  });
  if (!lib.acq_init) { lib.acq_init = true; naDirty = true; } // first pass stamped existing files with 0
  if (naDirty) saveState();
  const extras = files.filter((f) => !fileHit.has(f.name)).map((f) => {
    const [xa, xt] = extraArtistTitle(f);
    const fnd = STATE.found["x:" + f.path];
    return { name: f.name, path: f.path, incompat: compatReason(f.fmt, dev), dur: fmtDur(Math.round(f.dur)), lossy: LOSSY.test(f.fmt[0]),
             artist: xa, title: xt, edited: !!STATE.edits["x:" + f.path],
             tagged: isTagged(f, xa, xt, genre),
             found: fnd ? { ...fnd, dur: fmtDur(fnd.dur) } : null };
  });
  return {
    ...base, ready: true, playlist: pl.title, playlist_url: pl.url,
    genre, tracks: rows, extras,
    local_files: files.map((f) => ({ name: f.name, path: f.path, dur: fmtDur(Math.round(f.dur)) })),
    have: rows.filter((r) => r.have).length,
    missing: rows.filter((r) => !r.have && !r.na).length,
    na_count: rows.filter((r) => r.na).length,
    upgrades: rows.filter((r) => r.upgrade).length,
    reavailable,
    new_count: rows.filter((r) => r.is_new || r.is_new_file).length,
    new_tracks: rows.filter((r) => r.is_new).length,
    new_files: rows.filter((r) => r.is_new_file).length,
    seen_mark: lib.seen_mark || 0,
    untagged: rows.filter((r) => r.tagged === false).length
            + extras.filter((e) => e.tagged === false).length,
    incompatible: files.filter((f) => compatReason(f.fmt, dev)).length,
    local_count: files.length,
  };
}

// ---------------- actions ----------------

export async function tagAll(): Promise<any> {
  const lib = requireLib();
  let view = await buildView();
  const genre = view.genre || "Trance";
  let done = 0;
  const errors: string[] = [];
  const todo: [string, string, string][] = [];
  for (const r of view.tracks || [])
    if (r.file && r.tagged === false) todo.push([r.file, r.artist, r.title]);
  for (const e of view.extras || [])
    if (e.tagged === false) todo.push([e.name, e.artist, e.title]);
  for (const [fname, artist, title] of todo) {
    try {
      await writeTags(libPath(lib, fname), artist, title, genre);
      done++;
    } catch (e: any) {
      errors.push(`${fname}: ${e.message}`);
    }
  }
  view = await buildView();
  view.tag_report = { done, errors };
  return view;
}

export async function convertAll(): Promise<any> {
  // Convert every incompatible local PCM file in place (same path & duration ->
  // rekordbox keeps hot cues / grid / analysis). Originals backed up first.
  const lib = requireLib();
  const devKey = DEVICES[STATE.device] ? STATE.device : "xdj-700";
  const dev = DEVICES[devKey];
  const bdir = backupDir(lib);
  let done = 0;
  const errors: string[] = [];
  for (const f of await scanLocal(lib)) {
    if (!compatReason(f.fmt, devKey)) continue;
    const [codec, sr, bits] = f.fmt;
    const ext = path.extname(f.name).toLowerCase();
    if (!codec.startsWith("pcm") || ![".wav", ".aiff", ".aif"].includes(ext)) {
      errors.push(`${f.name}: ${codec || "unknown"} needs a manual convert (extension ` +
                  "would change and rekordbox would lose cues)");
      continue;
    }
    const tmp = f.path + ".tmp" + ext;
    try {
      const bpath = path.join(bdir, ...f.name.split("/"));
      fs.mkdirSync(path.dirname(bpath), { recursive: true });
      if (!fs.existsSync(bpath)) copyPreservingTimes(f.path, bpath);
      const [artist, title, genre] = f.tags;
      const newSr = dev.srs.includes(sr) ? sr : sr % 48000 === 0 ? 48000 : 44100;
      const newBits = Math.min(bits || 16, dev.wavBits);
      const isAiff = ext === ".aiff" || ext === ".aif";
      const acodec = `pcm_s${newBits <= 16 ? 16 : 24}${isAiff ? "be" : "le"}`;
      const args = ["-y", "-v", "error", "-i", f.path, "-map", "0:a",
                    "-c:a", acodec, "-ar", String(newSr), "-map_metadata", "-1",
                    ...metaArgs(artist, title, genre)];
      if (isAiff) args.push("-write_id3v2", "1", "-id3v2_version", "3");
      args.push(tmp);
      const r = await run(FFMPEG, args, 600000);
      if (r.code !== 0) throw new Error("ffmpeg: " + r.stderr.slice(0, 200));
      if (Math.abs((await probeDuration(tmp)) - f.dur) > 0.5)
        throw new Error("duration changed after convert, aborted");
      if (!isAiff && (artist || title || genre))
        appendId3ToWav(tmp, buildId3v23(artist, title, genre)); // rekordbox reads this
      fs.renameSync(tmp, f.path);
      await refreshCache(f.path);
      done++;
    } catch (e: any) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      errors.push(`${f.name}: ${e.message}`);
    }
  }
  saveState();
  const view = await buildView();
  view.convert_report = { done, errors, backup_dir: bdir };
  return view;
}

export async function restoreAll(): Promise<any> {
  // Copy backed-up originals back into the library folder (backups are kept).
  const lib = requireLib();
  let done = 0;
  const errors: string[] = [];
  for (const [key, src, dst] of restorable(lib)) {
    try {
      copyPreservingTimes(src, dst);
      done++;
    } catch (e: any) {
      errors.push(`${key}: ${e.message}`);
    }
  }
  const view = await buildView();
  view.restore_report = { done, errors };
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
  const view = await buildView();
  view.clean_report = { freed_bytes: freed, files };
  return view;
}

const sameDir = (a: string, b: string) => {
  try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return path.resolve(a) === path.resolve(b); }
};
const insideDir = (inner: string, outer: string) => {
  const rel = path.relative(path.resolve(outer), path.resolve(inner));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
/** A folder given by the user (typed or picked): "~" expanded, must exist. */
function userDir(raw: any): string {
  const d = String(raw || "").trim().replace(/^~(?=$|\/)/, os.homedir());
  if (!d) throw new Error("no folder given");
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error(`folder not found: ${d}`);
  return path.resolve(d);
}

/** POST /api/library: {op: "add", dir, url} · {op: "select", id} · {op: "remove", id}
 *  · {op: "add_folder", dir, id?} · {op: "remove_folder", dir, id?} · {op: "subfolders", on, id?}
 *  (the folder ops act on the active library unless `id` says otherwise). */
export async function libraryOp(data: any): Promise<any> {
  const op = data.op;
  const libs = STATE.libraries;
  const target = (): Library => {
    const lib = data.id ? libs.find((l) => l.id === data.id) : activeLib();
    if (!lib) throw new Error("library not found");
    return lib;
  };
  if (op === "add") {
    const d = userDir(data.dir);
    const url = (data.url || "").trim();
    if (!url.startsWith("http")) throw new Error("please give a full SoundCloud playlist or likes URL");
    if (libs.some((l) => libDirs(l).some((x) => sameDir(x, d))))
      throw new Error("this folder is already a library");
    const nid = "lib" + (Math.max(0, ...libs
      .filter((l) => /^lib\d+$/.test(l.id)).map((l) => parseInt(l.id.slice(3), 10))) + 1);
    const lib: Library = { id: nid, dir: d, url, playlist: null };
    libs.push(lib);
    STATE.active = nid;
    await fetchPlaylist(lib); // throws on bad URL / no internet; lib stays for retry
  } else if (op === "select") {
    if (libs.some((l) => l.id === data.id)) STATE.active = data.id;
  } else if (op === "remove") {
    if (libs.length <= 1) throw new Error("cannot remove the last library");
    STATE.libraries = libs.filter((l) => l.id !== data.id);
    if (STATE.active === data.id) STATE.active = STATE.libraries[0].id;
  } else if (op === "add_folder") {
    const lib = target();
    const d = userDir(data.dir);
    for (const x of libDirs(lib)) {
      if (sameDir(x, d)) throw new Error("this folder is already part of the library");
      if (insideDir(d, x)) throw new Error(`${d} is inside ${x}, which is already part of the library — turn on "Include subfolders" instead`);
      if (insideDir(x, d)) throw new Error(`${x} is inside ${d}; a library folder cannot contain another one`);
    }
    for (const other of libs)
      if (other !== lib && libDirs(other).some((x) => sameDir(x, d)))
        throw new Error(`this folder already belongs to the library “${libName(other)}”`);
    lib.dirs = [...(lib.dirs || []), d];
  } else if (op === "remove_folder") {
    const lib = target();
    const d = String(data.dir || "");
    if (sameDir(lib.dir, d)) throw new Error("the main folder cannot be removed; remove the library instead");
    const before = (lib.dirs || []).length;
    lib.dirs = (lib.dirs || []).filter((x) => !sameDir(x, d));
    if (lib.dirs.length === before) throw new Error("that folder is not part of the library");
    if (!lib.dirs.length) delete lib.dirs;
    for (const k of Object.keys(STATE.dur_cache)) if (k.startsWith(d + path.sep)) delete STATE.dur_cache[k];
  } else if (op === "subfolders") {
    const lib = target();
    if (data.on) lib.subfolders = true; else delete lib.subfolders;
  } else {
    throw new Error("unknown library op");
  }
  saveState();
  return buildView();
}

export async function refresh(): Promise<any> {
  await fetchPlaylist(requireLib());
  return buildView();
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
    delete STATE.assigned[tid];
  } else {
    if (file) // a file belongs to at most one track
      for (const k of Object.keys(STATE.assigned))
        if (k !== tid && STATE.assigned[k] === file) delete STATE.assigned[k];
    STATE.assigned[tid] = file;
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
    if (!STATE.client_id) { STATE.client_id = await scrapeClientId(await httpGet(lib.url)); saveState(); }
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
  if (!f) throw new Error("file not found in the library folder");
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

export async function findAll(): Promise<any> {
  const lib = requireLib();
  let view = await buildView();
  const fmap = new Map((await scanLocal(lib)).map((f) => [f.name, f]));
  let found = 0, in_playlist = 0, unsure = 0, none = 0;
  const errors: string[] = [];
  for (const e of view.extras || []) {
    if (e.found) continue;
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
    }
  }
  saveState();
  view = await buildView();
  view.find_report = { found, in_playlist, unsure, none, errors };
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

const inboxDir = () => STATE.inbox_dir || path.join(os.homedir(), "Downloads");


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
async function scanInboxZips(dir: string): Promise<{ files: InboxFile[]; errors: string[] }> {
  const files: InboxFile[] = [], errors: string[] = [];
  const cache = STATE.zip_cache || (STATE.zip_cache = {});
  const live = new Set<string>();
  const tmpDir = path.join(DATA_DIR, "tmp");
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.startsWith(".") || path.extname(f).toLowerCase() !== ".zip") continue;
    const zp = path.join(dir, f);
    let entries: ZipEntry[];
    try { entries = listEntries(zp).filter(zipEntryAudio); }
    catch (e: any) { errors.push(`${f}: ${e.message}`); continue; }
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
        } catch (err: any) { errors.push(`${f}: ${err.message}`); continue; }   // extractEntry names the entry itself
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
  return { files, errors };
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
export async function inboxView(): Promise<any> {
  const lib = requireLib();
  const dir = inboxDir();
  const base = { dir, exists: fs.existsSync(dir), items: [] as any[], others: 0, already: 0,
                 moved: [] as string[], move_errors: [] as string[], zip_errors: [] as string[] };
  if (!base.exists || !lib.playlist) return base;
  const view = await buildView();
  const rows = new Map<number, any>(view.tracks.map((r: any) => [r.id, r]));
  const libNames = new Set((await scanLocal(lib)).map((f) => f.base));
  const plain: InboxFile[] = (await scanFolder(dir)).map((f) => ({ ...f, matchNames: [f.name] }));
  const zips = await scanInboxZips(dir);
  base.zip_errors = zips.errors;
  for (const f of [...plain, ...zips.files]) {
    if (libNames.has(f.name)) { base.already++; continue; } // copied in already
    const [t, score] = bestTrackNames(f.matchNames, f.dur, lib.playlist.tracks);
    const row = t && rows.get(t.id);
    if (!t || !row || score < 0.6) { base.others++; continue; }
    const lossy = LOSSY.test(f.fmt[0]);
    let action: "move" | "upgrade" | null = null;
    if (!row.have) action = "move";
    else if (row.lossy && !lossy) action = "upgrade";
    if (!action) { base.already++; continue; } // we already hold an equal or better file
    base.items.push({ name: f.name, zip: f.zip || null, dur: fmtDur(Math.round(f.dur)), dur_diff: Math.round(f.dur - t.dur), lossy,
                      id: t.id, n: row.n, artist: row.artist, title: row.title, score: Math.min(1, score),
                      action, cur_file: row.file });
  }
  // auto-move: exact matches (same name, same length) of tracks we don't have yet
  if (STATE.settings?.auto_move && base.items.length && !libDirs(lib).some((d) => sameDir(d, dir))) {
    const movedTracks = new Set<number>();
    const keep: any[] = [];
    for (const it of base.items) {
      const exact = it.action === "move" && it.score >= 0.999 && Math.abs(it.dur_diff) <= 2 && !movedTracks.has(it.id);
      if (!exact) { keep.push(it); continue; }
      try { await inboxMove({ file: it.name, id: it.id, zip: it.zip }); base.moved.push(it.name); movedTracks.add(it.id); }
      catch (e: any) { base.move_errors.push(`${it.name}: ${e.message}`); keep.push(it); }
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
}

/** Move one inbox file (or one entry of a zip in the inbox) into the library and
 *  pin it to its track. When the track already has a (lossy) file, that file goes
 *  to originals/<lib>/replaced/. Zips stay where they are. */
export async function inboxMove(data: any): Promise<any> {
  const lib = requireLib();
  const name = path.basename(String(data.file || ""));
  const zip = data.zip ? path.basename(String(data.zip)) : "";
  if (!name) throw new Error("no file given");
  const dst = path.join(lib.dir, name);
  if (fs.existsSync(dst)) throw new Error(`${name}: a file with this name is already in the library`);
  const tid = String(data.id);
  if (!lib.playlist?.tracks.some((t) => String(t.id) === tid)) throw new Error("track is not in the playlist");
  const src = path.join(inboxDir(), zip || name);
  if (!fs.existsSync(src)) throw new Error(`${zip || name}: no longer in the downloads folder`);
  // stage the new file first (a failed extraction must not touch the library)
  let staged: string | null = null;
  if (zip) {
    const entry = listEntries(src).filter(zipEntryAudio).find((e) => path.posix.basename(e.name) === name);
    if (!entry) throw new Error(`${name}: not found inside ${zip}`);
    staged = dst.replace(/(\.[^.]+)$/, ".tmp$1");   // the folder scan ignores *.tmp.<ext>
    extractEntry(src, entry, staged);
  }
  const row = (await buildView()).tracks.find((r: any) => String(r.id) === tid);
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
  }
  for (const a of Object.keys(STATE.assigned)) if (STATE.assigned[a] === name) delete STATE.assigned[a];
  STATE.assigned[tid] = name;
  delete STATE.overrides[tid];
  delete STATE.na[tid];
  saveState();
  return buildView();
}

export async function inboxMoveAll(): Promise<any> {
  const scan = await inboxView();
  let done = scan.moved.length;   // auto-move may have handled some already
  const errors: string[] = [...scan.move_errors];
  for (const it of scan.items) {
    try { await inboxMove({ file: it.name, id: it.id, zip: it.zip }); done++; }
    catch (e: any) { errors.push(e.message); }
  }
  const view = await buildView();
  view.inbox_report = { done, errors };
  return view;
}

export async function markSeen(): Promise<any> {
  requireLib().seen_mark = Date.now();
  saveState();
  return buildView();
}

export async function setEdit(data: any): Promise<any> {
  const key = data.file ? "x:" + libPath(requireLib(), String(data.file)) : String(data.id);
  const a = (data.artist || "").trim(), ti = (data.title || "").trim();
  if (a || ti) STATE.edits[key] = { artist: a, title: ti };
  else delete STATE.edits[key];
  saveState();
  return buildView();
}
