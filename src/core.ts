/** DJ HQ core — TypeScript port of the Python app (playlist reconciliation,
 *  rekordbox tagging, player-compat conversion). All file rewrites go through
 *  ffmpeg with an audio-MD5 (tags) or duration (converts) verification, and
 *  converts back up the untouched original first. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { buildId3v23, appendId3ToWav } from "./id3";

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
}
export interface Playlist { title: string; url: string; tracks: PlTrack[]; }
export interface Library { id: string; dir: string; url: string; playlist: Playlist | null; }

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
  client_id: string | null;
  device: string;
}

let DATA_DIR = "";
let CAN_PICK = false;
export let STATE: AppState;

export function init(dataDir: string, canPick: boolean): void {
  DATA_DIR = dataDir;
  CAN_PICK = canPick;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  STATE = loadState();
}

const statePath = () => path.join(DATA_DIR, "state.json");

function loadState(): AppState {
  try {
    const st = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    st.assigned = st.assigned || {}; // older state files predate manual matching
    return st;
  } catch {
    return { libraries: [], active: null, dur_cache: {}, overrides: {},
             edits: {}, assigned: {}, client_id: null, device: "xdj-700" };
  }
}
export function saveState(): void {
  fs.writeFileSync(statePath(), JSON.stringify(STATE));
}

export function activeLib(): Library | null {
  const libs = STATE.libraries;
  if (!libs.length) return null;
  return libs.find((l) => l.id === STATE.active) || libs[0];
}

function libName(lib: Library): string {
  return lib.playlist?.title || path.basename(lib.dir.replace(/\/+$/, "")) || lib.id;
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

export async function fetchPlaylist(lib: Library): Promise<void> {
  const html = await httpGet(lib.url);
  const m = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);<\/script>/);
  if (!m) throw new Error("could not read playlist page (is the URL a public playlist?)");
  const pl = JSON.parse(m[1]).find((i: any) => i.hydratable === "playlist")?.data;
  if (!pl) throw new Error("no playlist found at this URL");
  const ids: number[] = pl.tracks.map((t: any) => t.id);
  if (!STATE.client_id) STATE.client_id = await scrapeClientId(html);
  let tracks: Record<number, any> = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for (let i = 0; i < ids.length; i += 40) {
        const batch = ids.slice(i, i + 40).join(",");
        const url = `https://api-v2.soundcloud.com/tracks?ids=${batch}&client_id=${STATE.client_id}`;
        for (const t of JSON.parse(await httpGet(url))) tracks[t.id] = t;
      }
      break;
    } catch (e: any) {
      if ((e.status === 401 || e.status === 403) && attempt === 0) {
        STATE.client_id = await scrapeClientId(html); // stale client_id -> rescrape once
        tracks = {};
      } else throw e;
    }
  }
  const out: PlTrack[] = [];
  for (const tid of ids) {
    const t = tracks[tid];
    if (!t) continue;
    out.push({
      id: tid,
      title: t.title || "",
      user: t.user?.username || "",
      pub_artist: t.publisher_metadata?.artist || null,
      dur: Math.floor((t.full_duration || t.duration || 0) / 1000),
      url: t.permalink_url || "",
      art: t.artwork_url || t.user?.avatar_url || "",
      buy_url: t.purchase_url || null,
      buy_title: t.purchase_title || null,
      sc_dl: !!(t.downloadable && t.has_downloads_left),
    });
  }
  lib.playlist = { title: pl.title || "Playlist", url: lib.url, tracks: out };
  saveState();
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

interface LocalFile { name: string; path: string; dur: number; fmt: [string, number, number]; tags: [string, string, string]; }

async function refreshCache(p: string): Promise<void> {
  const st = fs.statSync(p);
  const pr = await probe(p);
  STATE.dur_cache[p] = [st.size, Math.floor(st.mtimeMs / 1000), pr.dur, pr.fmt, pr.tags];
}

async function scanLocal(lib: Library): Promise<LocalFile[]> {
  const d = lib.dir;
  const cache = STATE.dur_cache;
  const files: LocalFile[] = [];
  const seen = new Set<string>();
  if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
    for (const f of fs.readdirSync(d).sort()) {
      if (f.startsWith(".") || !AUDIO_EXT.includes(path.extname(f).toLowerCase())) continue;
      if (/\.tmp\.[^.]+$/i.test(f)) continue; // in-flight rewrite by writeTags/convertAll
      const p = path.join(d, f);
      const st = fs.statSync(p);
      seen.add(p);
      const c = cache[p] as CacheEntry | undefined;
      if (!c || c[0] !== st.size || c[1] !== Math.floor(st.mtimeMs / 1000) || c.length < 5)
        await refreshCache(p);
      const e = cache[p] as CacheEntry;
      files.push({ name: f, path: p, dur: e[2], fmt: e[3], tags: e[4] });
    }
  }
  for (const k of Object.keys(cache))
    if (k.startsWith(d + path.sep) && !seen.has(k)) delete cache[k];
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

// ---------------- purchase / free-download links ----------------

/** Download-gate services: a link there is a free download whatever it's called. */
const FREE_GATES = /(^|\.)(hypeddit\.com|droploud\.com|downloadgater\.com|gaterush\.me|gatekit\.pro|toneden\.io)$/i;

export interface BuyLink { url: string; kind: "free" | "buy"; label: string; title: string; host: string; }

/** Where to get the track: the uploader's purchase link (classified as a free
 *  download or a shop by its title/host), else SoundCloud's own download button. */
export function buyLink(t: PlTrack): BuyLink | null {
  const title = (t.buy_title || "").trim();
  if (t.buy_url && /^https?:\/\//i.test(t.buy_url)) {
    let host = "";
    try { host = new URL(t.buy_url).hostname.replace(/^www\./, ""); } catch { /* fall through */ }
    if (host) {
      const free = /free|\bdl\b|download|gratis/i.test(title) || FREE_GATES.test(host);
      return { url: t.buy_url, kind: free ? "free" : "buy",
               label: free ? "Free DL" : "Buy", title, host };
    }
  }
  if (t.sc_dl && t.url)
    return { url: t.url, kind: "free", label: "Free DL", title: "Download on SoundCloud", host: "soundcloud.com" };
  return null;
}

function isTagged(f: LocalFile, artist: string, title: string, genre: string): boolean {
  return looseEq(f.tags[0], artist) && looseEq(f.tags[1], title) && looseEq(f.tags[2], genre);
}

// ---------------- tagging & conversion ----------------

async function audioMd5(p: string): Promise<string> {
  const r = await run(FFMPEG, ["-v", "error", "-i", p, "-map", "0:a", "-f", "md5", "-"], 120000);
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
    if ((await audioMd5(tmp)) !== md5) throw new Error("audio changed during rewrite, aborted");
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

function restorableCount(lib: Library | null): number {
  // backups that differ (size/mtime) from the current library copy
  if (!lib) return 0;
  const bdir = backupDir(lib);
  if (!fs.existsSync(bdir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(bdir)) {
    const src = path.join(bdir, f);
    if (!fs.statSync(src).isFile()) continue;
    try {
      const b = fs.statSync(src), c = fs.statSync(path.join(lib.dir, f));
      if (b.size !== c.size || Math.abs(b.mtimeMs - c.mtimeMs) > 1000) n++;
    } catch {
      n++;
    }
  }
  return n;
}

const fmtDur = (d: number) => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;

export async function buildView(): Promise<any> {
  const lib = activeLib();
  let dev = STATE.device || "xdj-700";
  if (!DEVICES[dev]) dev = "xdj-700";
  const base: any = {
    libraries: STATE.libraries.map((l) => ({ id: l.id, name: libName(l), dir: l.dir })),
    active: lib ? lib.id : null,
    device: dev,
    devices: Object.entries(DEVICES).map(([id, d]) => ({ id, label: d.label })),
    backups: restorableCount(lib),
    backup_dir: lib ? backupDir(lib) : null,
    can_pick: CAN_PICK,
  };
  if (!lib || !lib.playlist) return { ...base, ready: false };
  const files = await scanLocal(lib);
  const pl = lib.playlist;
  const genre = pl.title || "Trance";
  const fmap = new Map(files.map((f) => [f.name, f]));
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
      let s = Math.max(sim(f.name, t.title), sim(f.name, `${t.user} ${t.title}`));
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
  const rows = pl.tracks.map((t, i) => {
    let [a, ti] = artistTitle(t);
    const ed = STATE.edits[String(t.id)];
    if (ed) { a = ed.artist || a; ti = ed.title || ti; }
    const m = matched.get(t.id);
    let have = !!m;
    const o = STATE.overrides[String(t.id)];
    if (o === "have" || o === "missing") have = o === "have";
    let tagged: boolean | null = null, incompat: string | null = null;
    if (m) {
      const f = fmap.get(m[0])!;
      tagged = isTagged(f, a, ti, genre);
      incompat = compatReason(f.fmt, dev);
    }
    return { n: i + 1, id: t.id, artist: a, title: ti, user: t.user,
             dur: fmtDur(t.dur), url: t.url, art: t.art,
             have, auto: !!m, file: m ? m[0] : null,
             score: m && m[1] >= 0 ? Math.min(1, m[1]) : null,
             manual_match: manual.has(t.id), buy: buyLink(t),
             tagged, incompat, override: o || null, edited: !!ed };
  });
  const extras = files.filter((f) => !fileHit.has(f.name)).map((f) => {
    const stem = f.name.replace(/\.[^.]+$/, "");
    const i = stem.indexOf(" - ");
    let [xa, xt] = i >= 0 ? [stem.slice(0, i).trim(), stem.slice(i + 3).trim()] : ["", stem];
    const ed = STATE.edits["x:" + f.path];
    if (ed) { xa = ed.artist || xa; xt = ed.title || xt; }
    return { name: f.name, incompat: compatReason(f.fmt, dev),
             artist: xa, title: xt, edited: !!ed, tagged: isTagged(f, xa, xt, genre) };
  });
  return {
    ...base, ready: true, playlist: pl.title, playlist_url: pl.url,
    genre, tracks: rows, extras,
    local_files: files.map((f) => ({ name: f.name, dur: fmtDur(Math.round(f.dur)) })),
    have: rows.filter((r) => r.have).length,
    missing: rows.filter((r) => !r.have).length,
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
      await writeTags(path.join(lib.dir, fname), artist, title, genre);
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
      fs.mkdirSync(bdir, { recursive: true });
      const bpath = path.join(bdir, f.name);
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
  const bdir = backupDir(lib);
  let done = 0;
  const errors: string[] = [];
  if (fs.existsSync(bdir)) {
    for (const f of fs.readdirSync(bdir).sort()) {
      const src = path.join(bdir, f);
      if (!fs.statSync(src).isFile()) continue;
      try {
        copyPreservingTimes(src, path.join(lib.dir, f));
        done++;
      } catch (e: any) {
        errors.push(`${f}: ${e.message}`);
      }
    }
  }
  const view = await buildView();
  view.restore_report = { done, errors };
  return view;
}

export async function libraryOp(data: any): Promise<any> {
  const op = data.op;
  const libs = STATE.libraries;
  if (op === "add") {
    const d = (data.dir || "").trim().replace(/^~(?=$|\/)/, os.homedir());
    const url = (data.url || "").trim();
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory())
      throw new Error(`folder not found: ${d}`);
    if (!url.startsWith("http")) throw new Error("please give a full SoundCloud playlist URL");
    if (libs.some((l) => fs.realpathSync(l.dir) === fs.realpathSync(d)))
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
  if (status === "have" || status === "missing") STATE.overrides[tid] = status;
  else delete STATE.overrides[tid];
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
  }
  saveState();
  return buildView();
}

export async function setEdit(data: any): Promise<any> {
  const key = data.file ? "x:" + path.join(requireLib().dir, data.file) : String(data.id);
  const a = (data.artist || "").trim(), ti = (data.title || "").trim();
  if (a || ti) STATE.edits[key] = { artist: a, title: ti };
  else delete STATE.edits[key];
  saveState();
  return buildView();
}
