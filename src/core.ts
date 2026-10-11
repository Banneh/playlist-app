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
  /** candidate links found in the description: [url, its line, the line above] */
  desc_links?: [string, string, string][];
  /** ms when this app first saw the track in the playlist; 0 = predates tracking */
  added?: number;
}
export interface Playlist { title: string; url: string; tracks: PlTrack[]; }
export interface Library {
  id: string; dir: string; url: string; playlist: Playlist | null;
  /** tracks added after this (ms) are NEW; set by "Mark all as seen" */
  seen_mark?: number;
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
    st.found = st.found || {};
    st.na = st.na || {};
    return st;
  } catch {
    return { libraries: [], active: null, dur_cache: {}, overrides: {},
             edits: {}, assigned: {}, found: {}, na: {}, client_id: null, device: "xdj-700" };
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
  // first-seen time per track: kept across fetches; tracks already in the
  // snapshot (or in a library's very first fetch) are not "new"
  const prevAdded = new Map<number, number>();
  for (const p of lib.playlist?.tracks || []) prevAdded.set(p.id, p.added || 0);
  const now = Date.now();
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
      desc_links: extractLinks(t.description || ""),
      added: !lib.playlist ? 0 : prevAdded.has(tid) ? prevAdded.get(tid)! : now,
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

/** Artist/title for a local file that isn't in the playlist: "Artist - Title.ext",
 *  overridden by an inline edit. */
function extraArtistTitle(f: LocalFile): [string, string] {
  const stem = f.name.replace(/\.[^.]+$/, "");
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
  // local files whose SoundCloud match has since been added to the playlist:
  // pin the file to that track (unless the track already has a manual file)
  const foundPrefix = "x:" + lib.dir + path.sep;
  for (const k of Object.keys(STATE.found)) {
    if (!k.startsWith(foundPrefix)) continue;
    const fname = path.basename(k.slice(2));
    if (!fmap.has(fname)) { delete STATE.found[k]; assignedDirty = true; continue; }
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
  const reavailable: string[] = [];
  let naDirty = false;
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
    return { n: i + 1, id: t.id, artist: a, title: ti, user: t.user,
             dur: fmtDur(t.dur), url: t.url, art: t.art,
             have, na, auto: !!m, file: m ? m[0] : null,
             score: m && m[1] >= 0 ? Math.min(1, m[1]) : null,
             manual_match: manual.has(t.id), links, lossy, upgrade,
             added: t.added || 0, is_new: (t.added || 0) > (lib.seen_mark || 0),
             tagged, incompat, override: o || null, edited: !!ed };
  });
  if (naDirty) saveState();
  const extras = files.filter((f) => !fileHit.has(f.name)).map((f) => {
    const [xa, xt] = extraArtistTitle(f);
    const fnd = STATE.found["x:" + f.path];
    return { name: f.name, incompat: compatReason(f.fmt, dev), dur: fmtDur(Math.round(f.dur)), lossy: LOSSY.test(f.fmt[0]),
             artist: xa, title: xt, edited: !!STATE.edits["x:" + f.path],
             tagged: isTagged(f, xa, xt, genre),
             found: fnd ? { ...fnd, dur: fmtDur(fnd.dur) } : null };
  });
  return {
    ...base, ready: true, playlist: pl.title, playlist_url: pl.url,
    genre, tracks: rows, extras,
    local_files: files.map((f) => ({ name: f.name, dur: fmtDur(Math.round(f.dur)) })),
    have: rows.filter((r) => r.have).length,
    missing: rows.filter((r) => !r.have && !r.na).length,
    na_count: rows.filter((r) => r.na).length,
    upgrades: rows.filter((r) => r.upgrade).length,
    reavailable,
    new_count: rows.filter((r) => r.is_new).length,
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
  const stem = f.name.replace(/\.[^.]+$/, "");
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
  const key = "x:" + path.join(lib.dir, data.file);
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

export async function markSeen(): Promise<any> {
  requireLib().seen_mark = Date.now();
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
