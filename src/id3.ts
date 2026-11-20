/** ID3v2 tags in the containers DJ HQ rewrites (WAV, AIFF, MP3): a reader for
 *  v2.3/v2.4 frames (the musical key Mixed In Key writes, Platinum Notes' marker),
 *  a v2.3 builder (UTF-16 frames — the only encoding rekordbox accepts in v2.3)
 *  that carries over the frames other apps wrote, and RIFF/AIFF chunk helpers.
 *  Only chunk headers and the tag itself are read, never the audio, and the
 *  readers return nothing rather than throw on a malformed file. */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

export interface Frame { id: string; data: Buffer; }
export interface Chunk { id: string; data: Buffer; }
interface ChunkPos { id: string; off: number; size: number; } // off = first data byte
interface TagHead { ver: number; flags: number; size: number; }
interface RawFrame { id: string; fmt: number; off: number; size: number; } // fmt = format flags byte
/** Bytes of the tag (offset 0 = the "ID3" header); shorter than asked at its end. */
type Src = (off: number, len: number) => Buffer;
interface Tag { head: TagHead; src: Src; }

const MAX_TAG = 64 * 1024 * 1024;   // larger tags (or chunks) are left alone
const PN_MARK = "PlatinumNotes";     // GEOB description Platinum Notes stamps into mp3/aiff

function syncsafe(n: number): Buffer {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

const unsyncsafe = (b: Buffer, at: number) => (b[at] << 21) | (b[at + 1] << 14) | (b[at + 2] << 7) | b[at + 3];

/** Undo ID3 unsynchronisation: every 0xFF 0x00 pair was 0xFF. */
function deunsync(b: Buffer): Buffer {
  const out = Buffer.alloc(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function readAt(fd: number, off: number, len: number): Buffer {
  const b = Buffer.alloc(Math.max(0, len));
  const n = len > 0 ? fs.readSync(fd, b, 0, len, off) : 0;
  return n < len ? b.subarray(0, n) : b;
}

// ---------------- containers ----------------

const isChunkId = (b: Buffer) => b.length >= 4 && [0, 1, 2, 3].every((i) => b[i] >= 0x20 && b[i] <= 0x7e);

/** The chunks of a RIFF/WAVE or FORM/AIFF(-C) file; null for anything else
 *  (RF64 included: files over 4 GB are out of scope). */
function walkChunks(fd: number): { be: boolean; chunks: ChunkPos[] } | null {
  const size = fs.fstatSync(fd).size;
  const h = readAt(fd, 0, 12);
  if (h.length < 12) return null;
  const magic = h.toString("latin1", 0, 4), form = h.toString("latin1", 8, 12);
  const be = magic === "FORM";
  if (!(magic === "RIFF" && form === "WAVE") && !(be && (form === "AIFF" || form === "AIFC"))) return null;
  const chunkSize = (c: Buffer) => be ? c.readUInt32BE(4) : c.readUInt32LE(4);
  // a chunk header at `at` whose data ends inside the file
  const whole = (at: number) => { const c = readAt(fd, at, 8); return c.length === 8 && isChunkId(c) && at + 8 + chunkSize(c) <= size; };
  // past the container's own size (an ID3v1 block appended to a WAV, say) only whole
  // chunks count: some writers append one without updating that size. A size of 0 or
  // one larger than the file (streamed, truncated) says nothing.
  const decl = 8 + chunkSize(h);
  const end = decl > 12 && decl <= size ? decl : size;
  const chunks: ChunkPos[] = [];
  let off = 12;
  while (off + 8 <= size) {
    const c = readAt(fd, off, 8);
    if (!isChunkId(c)) break;
    const n = chunkSize(c);
    if (off >= end && !whole(off)) break;
    chunks.push({ id: c.toString("latin1", 0, 4), off: off + 8, size: Math.min(n, size - off - 8) });
    let next = off + 8 + n + (n % 2);
    // odd chunks are followed by a pad byte (zero), which some writers forget
    if (n % 2 && !whole(next) && whole(next - 1)) next--;
    off = next;
  }
  return { be, chunks };
}

function tagHead(b: Buffer): TagHead | null {
  if (b.length < 10 || b.toString("latin1", 0, 3) !== "ID3") return null;
  if (b[3] < 2 || b[3] > 4 || ((b[6] | b[7] | b[8] | b[9]) & 0x80)) return null;
  return { ver: b[3], flags: b[5], size: unsyncsafe(b, 6) };
}

/** The ID3v2 tag of an open file: the `id3 `/`ID3 ` chunk of a WAV or AIFF (the
 *  last one if there are several), or the tag at the start of anything else (MP3). */
function openTag(fd: number, riff: ReturnType<typeof walkChunks>): Tag | null {
  let start = 0, room = fs.fstatSync(fd).size;
  if (riff) {
    const c = riff.chunks.filter((x) => x.id.toLowerCase() === "id3 ").pop();
    if (!c) return null;
    start = c.off; room = c.size;
  }
  const head = tagHead(readAt(fd, start, 10));
  if (!head || head.size > MAX_TAG) return null;
  const len = Math.min(10 + head.size, room);
  if (len < 10) return null;
  if (head.ver <= 3 && head.flags & 0x80) {
    // v2.2/v2.3 unsynchronise the whole tag: read it at once and undo that
    const b = Buffer.concat([readAt(fd, start, 10), deunsync(readAt(fd, start + 10, len - 10))]);
    head.size = b.length - 10;
    return { head, src: (o, n) => b.subarray(o, o + n) };
  }
  head.size = len - 10;
  return { head, src: (o, n) => readAt(fd, start + o, Math.min(n, len - o)) };
}

// ---------------- frames ----------------

const isFrameId = (b: Buffer) => b.length >= 4 && /^[A-Z0-9]{4}$/.test(b.toString("latin1", 0, 4));

/** Frame headers of a tag, in order. v2.2's are three-letter ids ("TKE") with no flags. */
function* rawFrames(t: Tag): Generator<RawFrame> {
  const { head, src } = t;
  const end = 10 + head.size;
  let off = 10;
  if (head.ver === 2) {
    if (head.flags & 0x40) return; // compressed: no scheme was ever defined
    while (off + 6 <= end) {
      const fh = src(off, 6);
      if (fh.length < 6 || !/^[A-Z0-9]{3}$/.test(fh.toString("latin1", 0, 3))) return;
      const size = fh.readUIntBE(3, 3);
      if (off + 6 + size > end) return;
      yield { id: fh.toString("latin1", 0, 3), fmt: 0, off: off + 6, size };
      off += 6 + size;
    }
    return;
  }
  if (head.flags & 0x40) { // extended header
    const e = src(10, 4);
    if (e.length < 4) return;
    off += head.ver === 4 ? unsyncsafe(e, 0) : 4 + e.readUInt32BE(0);
  }
  const okAt = (at: number) => at === end || (at < end && (src(at, 1)[0] === 0 || isFrameId(src(at, 4))));
  while (off + 10 <= end) {
    const fh = src(off, 10);
    if (fh.length < 10 || !isFrameId(fh)) return; // padding (or garbage) from here on
    let size = fh.readUInt32BE(4);
    // v2.4 sizes are synchsafe; some writers (old iTunes) put plain ones there anyway
    if (head.ver === 4 && !((fh[4] | fh[5] | fh[6] | fh[7]) & 0x80)) {
      const ss = unsyncsafe(fh, 4);
      if (ss === size || okAt(off + 10 + ss) || !okAt(off + 10 + size)) size = ss;
    }
    if (off + 10 + size > end) return;
    yield { id: fh.toString("latin1", 0, 4), fmt: fh[9], off: off + 10, size };
    off += 10 + size;
  }
}

/** A frame's content, without its flag extras, decompressed and de-unsynchronised;
 *  null when it cannot be read (encrypted, broken). `limit` caps a plain read. */
function frameData(t: Tag, f: RawFrame, limit = Infinity): Buffer | null {
  const v4 = t.head.ver === 4;
  let skip = 0, zip: boolean, unsync = false;
  if (v4) {
    if (f.fmt & 0x04) return null; // encrypted
    if (f.fmt & 0x40) skip += 1;   // group id
    if (f.fmt & 0x01) skip += 4;   // data length indicator
    zip = !!(f.fmt & 0x08);
    unsync = !!(f.fmt & 0x02 || t.head.flags & 0x80);
  } else {
    if (f.fmt & 0x40) return null;
    zip = !!(f.fmt & 0x80);
    if (zip) skip += 4;            // decompressed size
    if (f.fmt & 0x20) skip += 1;
  }
  if (skip > f.size) return null;
  const whole = zip || unsync;
  let b = t.src(f.off + skip, whole ? f.size - skip : Math.min(f.size - skip, limit));
  try {
    if (unsync) b = deunsync(b);
    if (zip) b = zlib.inflateSync(b);
  } catch {
    return null;
  }
  return b;
}

/** Split off one string in the given ID3 text encoding: [text, the bytes after its terminator]. */
function takeString(enc: number, b: Buffer): [string, Buffer] {
  const wide = enc === 1 || enc === 2;
  let end = -1;
  if (wide) {
    for (let i = 0; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) { end = i; break; }
  } else end = b.indexOf(0);
  const raw = end < 0 ? b : b.subarray(0, end);
  const rest = end < 0 ? Buffer.alloc(0) : b.subarray(end + (wide ? 2 : 1));
  return [decode(enc, raw), rest];
}

function decode(enc: number, b: Buffer): string {
  if (enc === 0) return b.toString("latin1");
  if (enc === 3) return b.toString("utf8");
  let le = enc === 1;
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) { le = true; b = b.subarray(2); }
  else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) { le = false; b = b.subarray(2); }
  b = b.subarray(0, b.length & ~1);
  if (!le) { const s = Buffer.from(b); s.swap16(); b = s; }
  return b.toString("utf16le");
}

/** All strings of a text frame body (encoding byte first). */
function textValues(b: Buffer): string[] {
  const enc = b[0];
  if (enc > 3) return [];
  const out: string[] = [];
  let rest = b.subarray(1);
  while (rest.length) {
    const [s, r] = takeString(enc, rest);
    out.push(s);
    rest = r;
  }
  return out;
}

/** The description of a GEOB frame (encoding, mime type, file name, description, data). */
function geobDescription(b: Buffer): string {
  if (!b.length || b[0] > 3) return "";
  const enc = b[0];
  const mimeEnd = b.indexOf(0, 1);
  if (mimeEnd < 0) return "";
  const [, rest] = takeString(enc, b.subarray(mimeEnd + 1));
  return takeString(enc, rest)[0];
}

export interface KeyInfo {
  /** TKEY as written (Mixed In Key: Camelot like "5A"); null when the file has none */
  key: string | null;
  /** processed by Platinum Notes: WAV `PLTN` chunk, mp3/aiff "PlatinumNotes" GEOB
   *  frame; null when the format can't tell (FLAC, M4A, OGG) or the file can't be read */
  pn: boolean | null;
  /** WAV only: artist and title of its RIFF LIST/INFO chunk (IART, INAM), the tags
   *  rekordbox reads in a WAV; null when the file has no INFO chunk. Undefined for
   *  anything that isn't a WAV. */
  info?: { artist: string; title: string } | null;
  /** WAV only: artist and title of its ID3 chunk (TPE1, TIT2), "" each when it has none.
   *  ffprobe hides these whenever the file also has an INFO chunk, so a name kept only
   *  there would otherwise go unseen (and be written over). */
  id3?: { artist: string; title: string };
}

/** IART / INAM of a WAV's LIST/INFO chunk (the last one, as with the ID3 chunk);
 *  null when there is none. Values are taken as UTF-8 (ffmpeg writes them so). */
function readInfo(fd: number, riff: NonNullable<ReturnType<typeof walkChunks>>): { artist: string; title: string } | null {
  let out: { artist: string; title: string } | null = null;
  for (const c of riff.chunks) {
    if (c.id !== "LIST" || c.size < 4 || c.size > MAX_TAG) continue;
    const b = readAt(fd, c.off, c.size);
    if (b.toString("latin1", 0, 4) !== "INFO") continue;
    const r = { artist: "", title: "" };
    for (let off = 4; off + 8 <= b.length;) {
      const id = b.toString("latin1", off, off + 4), n = b.readUInt32LE(off + 4);
      const v = b.subarray(off + 8, Math.min(b.length, off + 8 + n)).toString("utf8").replace(/\0+$/, "").trim();
      if (id === "IART") r.artist = v;
      else if (id === "INAM") r.title = v;
      off += 8 + n + (n % 2);
    }
    out = r;
  }
  return out;
}

/** The musical key and Platinum Notes marker of a file (and a WAV's INFO and ID3 names), straight from its tags.
 *  (ffprobe can't be used for this: it ignores a WAV's ID3 chunk when the file
 *  also has a RIFF INFO chunk, which DJ HQ and Mixed In Key both write.) */
export function readKeyInfo(p: string): KeyInfo {
  let fd = -1;
  try {
    fd = fs.openSync(p, "r");
    const riff = walkChunks(fd);
    const t = openTag(fd, riff);
    let key: string | null = null, mark = false;
    const names = { artist: "", title: "" };
    if (t) for (const f of rawFrames(t)) {
      if (f.id === "TPE1" || f.id === "TP1" || f.id === "TIT2" || f.id === "TT2") {
        const b = frameData(t, f, 2048), v = b && b.length ? (textValues(b)[0] || "").trim() : "";
        if (f.id[1] === "P") names.artist = names.artist || v; else names.title = names.title || v;
        continue;
      }
      if ((f.id === "TKEY" || f.id === "TKE") && key === null) {
        const b = frameData(t, f, 256);
        if (b && b.length) key = (textValues(b)[0] || "").trim() || null;
      } else if (f.id === "GEOB" && !mark) {
        const b = frameData(t, f, 512);
        mark = !!b && geobDescription(b) === PN_MARK;
      }
    }
    const pn = riff ? riff.chunks.some((c) => c.id === "PLTN") || mark
      : path.extname(p).toLowerCase() === ".mp3" ? mark : null;
    return riff && !riff.be ? { key, pn, info: readInfo(fd, riff), id3: names } : { key, pn };
  } catch {
    return { key: null, pn: null };
  } finally {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

// ---------------- writing ----------------

function frame(id: string, data: Buffer): Buffer {
  // v2.3 frame size is a plain uint32be; flags left clear
  const head = Buffer.alloc(10);
  head.write(id, 0, "latin1");
  head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data]);
}

/** A string in encoding 0x01 (UTF-16 with BOM), with or without its terminator. */
const utf16 = (s: string, term = true) =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le"), term ? Buffer.from([0, 0]) : Buffer.alloc(0)]);

const textFrame = (id: string, text: string) => frame(id, Buffer.concat([Buffer.from([0x01]), utf16(text)]));

// v2.4 frames a v2.3 reader doesn't know (TDRC is turned into TYER)
const V24_ONLY = new Set(["ASPI", "EQU2", "RVA2", "SEIS", "SIGN", "TDEN", "TDOR", "TDRC", "TDRL",
  "TDTG", "TIPL", "TMCL", "TMOO", "TPRO", "TSOA", "TSOP", "TSOT", "TSST"]);
// frames that hold no text-encoding byte: their bytes mean the same in v2.3
const NO_ENCODING = /^(W(?!XXX)[A-Z0-9]{3}|PRIV|UFID|POPM|PCNT|MCDI|ETCO|MLLT|SYTC|RVRB|RBUF|AENC|LINK|POSS|ENCR|GRID|SEEK)$/;
// text frames outside the T namespace (iTunes grouping / movement)
const TEXT_LIKE = new Set(["GRP1", "MVNM", "MVIN"]);

/** A v2.4 frame in v2.3 form: text in encodings v2.3 lacks (UTF-8, UTF-16BE) is
 *  re-encoded as UTF-16, multiple values joined with "/". Frames whose layout we
 *  don't know are only kept when they hold no text, so nothing is written wrong. */
function toV23(id: string, b: Buffer): Frame | null {
  if (id === "TDRC") {
    const y = (textValues(b)[0] || "").slice(0, 4);
    return /^\d{4}$/.test(y) ? { id: "TYER", data: Buffer.concat([Buffer.from([0x01]), utf16(y)]) } : null;
  }
  if (V24_ONLY.has(id)) return null;
  if (NO_ENCODING.test(id)) return { id, data: b };
  if (!b.length || b[0] > 3) return null;
  const enc = b[0], legacy = enc <= 1;
  const body = b.subarray(1);
  if ((id[0] === "T" && id !== "TXXX") || TEXT_LIKE.has(id)) {
    // empty values are only stray terminators ("5A\0\0"), not values to join
    const vals = textValues(b).filter((s) => s);
    if (legacy && vals.length <= 1) return { id, data: b };
    return { id, data: Buffer.concat([Buffer.from([0x01]), utf16(vals.join("/"))]) };
  }
  if (legacy) return ["TXXX", "WXXX", "COMM", "USLT", "GEOB", "APIC"].includes(id) ? { id, data: b } : null;
  const one = Buffer.from([0x01]);
  if (id === "TXXX") {
    const [desc, rest] = takeString(enc, body);
    const vals = textValues(Buffer.concat([Buffer.from([enc]), rest])).filter((s) => s);
    return { id, data: Buffer.concat([one, utf16(desc), utf16(vals.join("/"))]) };
  }
  if (id === "WXXX") {
    const [desc, url] = takeString(enc, body);
    return { id, data: Buffer.concat([one, utf16(desc), url]) };
  }
  if (id === "COMM" || id === "USLT") {
    if (body.length < 3) return null;
    const [desc, rest] = takeString(enc, body.subarray(3));
    const [text] = takeString(enc, rest);
    return { id, data: Buffer.concat([one, body.subarray(0, 3), utf16(desc), utf16(text, false)]) };
  }
  const mimeEnd = body.indexOf(0);
  if (mimeEnd < 0) return null;
  const mime = body.subarray(0, mimeEnd + 1);
  if (id === "GEOB") {
    const [file, r1] = takeString(enc, body.subarray(mimeEnd + 1));
    const [desc, data] = takeString(enc, r1);
    return { id, data: Buffer.concat([one, mime, utf16(file), utf16(desc), data]) };
  }
  if (id === "APIC") {
    if (body.length < mimeEnd + 2) return null;
    const [desc, data] = takeString(enc, body.subarray(mimeEnd + 2));
    return { id, data: Buffer.concat([one, mime, body.subarray(mimeEnd + 1, mimeEnd + 2), utf16(desc), data]) };
  }
  return null; // has a text encoding we can't convert without knowing its layout
}

/** The frames of a file's existing ID3v2.3/2.4 tag (WAV/AIFF chunk or MP3 header),
 *  in v2.3 form, minus the ids in `drop`. Whatever can't be read is skipped; an
 *  unreadable or v2.2 tag gives [] (see id3Version). */
export function carriedFrames(p: string, drop: string[]): Frame[] {
  let fd = -1;
  try {
    fd = fs.openSync(p, "r");
    const t = openTag(fd, walkChunks(fd));
    if (!t || t.head.ver < 3) return [];
    const out: Frame[] = [];
    for (const f of rawFrames(t)) {
      if (drop.includes(f.id)) continue;
      const b = frameData(t, f);
      if (!b) continue;
      const fr = t.head.ver === 3 ? { id: f.id, data: b } : toV23(f.id, b);
      if (fr) out.push(fr);
    }
    return out;
  } catch {
    return [];
  } finally {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/** The version of a file's ID3v2 tag (2, 3 or 4); 0 when it has none DJ HQ can read.
 *  Only a v2.3/v2.4 tag can be carried over frame by frame (carriedFrames). */
export function id3Version(p: string): number {
  let fd = -1;
  try {
    fd = fs.openSync(p, "r");
    return openTag(fd, walkChunks(fd))?.head.ver || 0;
  } catch {
    return 0;
  } finally {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/** An ID3v2.3 tag: title, artist and genre (when given) followed by `keep`. */
export function buildId3v23(artist: string, title: string, genre: string, keep: Frame[] = []): Buffer {
  const frames: Buffer[] = [];
  if (title) frames.push(textFrame("TIT2", title));
  if (artist) frames.push(textFrame("TPE1", artist));
  if (genre) frames.push(textFrame("TCON", genre));
  for (const f of keep) frames.push(frame(f.id, f.data));
  const body = Buffer.concat(frames);
  if (body.length >= 1 << 28) throw Object.assign(new Error("tag too large"), { code: "tag_too_large" });
  return Buffer.concat([
    Buffer.from("ID3", "latin1"),
    Buffer.from([0x03, 0x00, 0x00]),
    syncsafe(body.length),
    body,
  ]);
}

// Chunks an ffmpeg rewrite regenerates (format, audio, tags) or that would contradict
// the new ID3 title and artist (AIFF NAME/AUTH); padding (FLLR/JUNK) only aligned the
// old layout. Everything else is carried, PLTN (Platinum Notes' "processed"
// marker), bext, iXML, AIFF annotation and copyright and unknown chunks included.
const REGENERATED = new Set(["fmt ", "data", "fact", "id3 ", "ID3 ", "COMM", "SSND", "FVER",
  "NAME", "AUTH", "COMT", "FLLR", "JUNK", "junk", "PAD ", "pad "]);
// Chunks that describe the samples themselves (peak levels): stale once they change.
const SAMPLE_STATS = new Set(["PEAK", "levl"]);
// Chunks that point at sample positions (cues, loops, markers, bext's time
// reference): stale when the sample rate changes.
const POSITIONED = new Set(["cue ", "smpl", "inst", "plst", "bext", "MARK", "INST"]);

/** The RIFF/AIFF chunks of `p` worth keeping when ffmpeg rewrites it, in order.
 *  `samples`: the rewrite keeps the samples bit-identical (a tag write);
 *  `rate`: it keeps the sample rate (sample positions still point at the same audio). */
export function carriedChunks(p: string, samples: boolean, rate: boolean): Chunk[] {
  let fd = -1;
  try {
    fd = fs.openSync(p, "r");
    const riff = walkChunks(fd);
    const out: Chunk[] = [];
    for (const c of riff ? riff.chunks : []) {
      if (REGENERATED.has(c.id) || c.id.toLowerCase() === "id3 " || c.size > MAX_TAG) continue;
      if (!samples && SAMPLE_STATS.has(c.id)) continue;
      const data = readAt(fd, c.off, c.size);
      if (c.id === "LIST") {
        const kind = data.toString("latin1", 0, 4);
        if (kind === "INFO") continue; // ffmpeg writes a fresh one from the new tags
        if (kind === "adtl" && !rate) continue; // cue labels
      } else if (!rate && POSITIONED.has(c.id)) continue;
      out.push({ id: c.id, data });
    }
    return out;
  } catch {
    return [];
  } finally {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/** Append chunks to a RIFF/WAVE or FORM/AIFF file and patch the container size.
 *  Throws (leaving the file unusable, so callers only do this to a temp file)
 *  when the result would not fit the format's 4 GB limit. */
export function appendChunks(p: string, chunks: Chunk[]): void {
  const fd = fs.openSync(p, "r+");
  try {
    const magic = readAt(fd, 0, 4).toString("latin1");
    if (magic !== "RIFF" && magic !== "FORM") throw Object.assign(new Error("not a WAV/AIFF file"), { code: "not_wav_aiff" });
    const be = magic === "FORM";
    let size = fs.fstatSync(fd).size;
    const parts: Buffer[] = size % 2 ? [Buffer.from([0])] : [];
    for (const c of chunks) {
      const head = Buffer.alloc(8);
      head.write(c.id, 0, "latin1");
      if (be) head.writeUInt32BE(c.data.length, 4); else head.writeUInt32LE(c.data.length, 4);
      parts.push(head, c.data);
      if (c.data.length % 2) parts.push(Buffer.from([0]));
    }
    const add = Buffer.concat(parts);
    if (size + add.length - 8 > 0xffffffff) throw Object.assign(new Error("file too large for its format (4 GB)"), { code: "file_too_large" });
    fs.writeSync(fd, add, 0, add.length, size);
    size += add.length;
    const head = Buffer.alloc(4);
    if (be) head.writeUInt32BE(size - 8, 0); else head.writeUInt32LE(size - 8, 0);
    fs.writeSync(fd, head, 0, 4, 4);
  } finally {
    fs.closeSync(fd);
  }
}

/** Put an ID3v2 tag in front of an MP3 that has none (ffmpeg output written with
 *  -id3v2_version 0). Goes through `<p>.part`, renamed over `p` at the end. */
export function prependTag(p: string, tag: Buffer): void {
  const part = p + ".part";
  const src = fs.openSync(p, "r");
  let dst = -1;
  try {
    dst = fs.openSync(part, "w");
    fs.writeSync(dst, tag);
    const buf = Buffer.alloc(4 * 1024 * 1024);
    for (let n; (n = fs.readSync(src, buf, 0, buf.length, null)) > 0;) fs.writeSync(dst, buf, 0, n);
  } catch (e) {
    if (dst >= 0) { fs.closeSync(dst); dst = -1; }
    try { fs.unlinkSync(part); } catch { /* ignore */ }
    throw e;
  } finally {
    fs.closeSync(src);
    if (dst >= 0) fs.closeSync(dst);
  }
  fs.renameSync(part, p);
}
