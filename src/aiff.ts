/** Update a rekordbox export after WAV files became AIFF files (Convert WAV files to AIFF, or by
 *  hand) and after a library's main folder moved (set_dir): a copy of the collection rekordbox
 *  exported (File > Export Collection in xml format) in which each such track points at its new
 *  file, with its cue points, beat grid and every other attribute kept byte for byte, so that
 *  importing its playlists in rekordbox brings the tracks back with their cues. Text based: only
 *  the Location, Kind and Size of a remapped track change, and a playlist's entries and name.
 *  The export is read, never written; the copy goes next to it as "<name> AIFF.xml". */
import * as fs from "fs";
import * as path from "path";
import { readXmlText, unescapeXml } from "./rbxml";
import { appError, collRoots, Library } from "./core";

const AUDIO = /\.(wav|mp3|aiff?|flac|m4a|ogg)$/i;
const KIND: Record<string, string> = { ".wav": "WAV File", ".mp3": "MP3 File", ".aiff": "AIFF File",
  ".aif": "AIFF File", ".flac": "FLAC File", ".m4a": "M4A File", ".ogg": "OGG File" };

export interface RemapReport {
  file: string; out: string | null; total: number; remapped: number; wav_to_aiff: number; folder_moved: number;
  missing: number; missing_names: string[]; dropped: number; cues: number; no_cues: number;
  playlists: { name: string; entries: number; moved: number }[];
  /** tracks whose new file is in the export already with cue points of its own: both entries kept,
   *  the playlists list the new one */
  own_cues: number;
  /** remapped tracks that no playlist lists (importing a playlist doesn't bring them in) */
  loose: number;
  /** what the new file's name and the changed playlists' names end with: "AIFF", or "moved" when no WAV became an AIFF */
  suffix: string;
  /** only own_cues tracks, and no playlist lists them: nothing would differ, so no file was written */
  own_cues_only?: boolean;
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp("\\s" + name + "=\"([^\"]*)\"").exec(tag);
  return m ? m[1] : null;
};
const setAttr = (tag: string, name: string, value: string): string => {
  const re = new RegExp("(\\s" + name + "=\")[^\"]*(\")");
  return re.test(tag) ? tag.replace(re, (_, a, b) => a + value + b) : tag;
};
/** the path a Location names ("file://localhost/Users/x/A%20B.wav" -> "/Users/x/A B.wav"), NFC; null for anything not a local file */
function locPath(loc: string): string | null {
  let s = unescapeXml(loc);
  if (!/^file:/i.test(s)) return null;
  s = s.replace(/^file:(\/\/localhost|\/\/)?/i, "");
  try { s = decodeURIComponent(s); } catch { return null; }
  if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);
  if (process.platform === "win32") s = s.replace(/\//g, "\\");
  return s.normalize("NFC");
}
/** rekordbox's way to write a path: file://localhost/ and each segment percent-encoded (' and * too) */
const encSeg = (s: string) => encodeURIComponent(s).replace(/'/g, "%27").replace(/\*/g, "%2A").replace(/%3A/gi, ":");
function toLoc(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return "file://localhost" + (parts[0] === "" ? "" : "/") + parts.map(encSeg).join("/");
}
/** a path compared as the file systems DJ HQ runs on do (macOS and Windows: case-insensitive) */
const fold = (p: string) => { const n = path.resolve(p).normalize("NFC"); return process.platform === "linux" ? n : n.toLowerCase(); };
const under = (p: string, dir: string) => { const a = fold(p), b = fold(dir); return a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };
/** the part of `p` below `dir` (under(p, dir) holds), as `p` spells it: by path segments, so a
 *  folder name the export writes in another letter case or Unicode form than DJ HQ stored still
 *  gives the file's own path (path.relative compares the strings as they are) */
const relUnder = (p: string, dir: string) => {
  const segs = (s: string) => path.resolve(s).normalize("NFC").split(path.sep).filter(Boolean);
  return segs(p).slice(segs(dir).length).join(path.sep);
};
const exists = (p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** Where a track of the export is now: the same relative path under the library's main folder
 *  when it is in one of the library's earlier main folders (moved_from), and then the one file of
 *  the same name with another audio extension when that path holds none (rule E). null: not a
 *  library file, or still where it was; "missing": nothing found for it. */
function whereNow(p: string, libs: Library[]): string | null | "missing" {
  let p2: string | null = null;
  for (const l of libs) {
    for (const old of [...(l.moved_from || [])].reverse())
      if (under(p, old)) { p2 = path.join(l.dir, relUnder(p, old)); break; }
    if (p2) break;
  }
  if (!p2) {
    const legacy = (l: Library) => [l.dir, ...(l.dirs || [])].filter(Boolean);
    if (!collRoots().some((r) => under(p, r.path)) && !libs.some((l) => legacy(l).some((d) => under(p, d)))) return null;
    p2 = p;
  }
  if (exists(p2)) return fold(p2) === fold(p) ? null : p2;
  const dir = path.dirname(p2), stem = path.basename(p2).replace(AUDIO, "").normalize("NFC").toLowerCase();
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { /* the folder isn't there */ }
  const c = names.filter((n) => AUDIO.test(n) && !/\.tmp\.[^.]+$/i.test(n) && n.replace(AUDIO, "").normalize("NFC").toLowerCase() === stem && exists(path.join(dir, n)));
  if (c.length === 1) { const q = path.join(dir, c[0]); return fold(q) === fold(p) ? null : q; }
  return exists(p) ? null : "missing";
}

/** The new Location: the original text kept where it can be (an extension change touches only
 *  the end; a folder change keeps the file's own segments as rekordbox wrote them), checked by
 *  decoding it back. */
function newLocation(loc: string, p: string, p2: string): string {
  const back = (l: string) => locPath(l) === p2.normalize("NFC");
  const e1 = path.extname(p), e2 = path.extname(p2);
  if (path.dirname(p) === path.dirname(p2) && path.basename(p, e1) === path.basename(p2, e2) && loc.endsWith(e1)) {
    const l = loc.slice(0, loc.length - e1.length) + e2;
    if (back(l)) return l;
  }
  // folder change: the file's own segment as rekordbox wrote it, the new folder encoded
  const tail = loc.slice(loc.lastIndexOf("/") + 1);
  const t2 = path.basename(p, e1) === path.basename(p2, e2) && tail.endsWith(e1) ? tail.slice(0, tail.length - e1.length) + e2 : encSeg(path.basename(p2));
  const l = toLoc(path.dirname(p2)) + "/" + t2;
  if (back(l)) return l;
  return toLoc(p2);
}

/** Write "<export> AIFF.xml" (" (2)", " (3)" … when taken) next to the export: see the top of the file. */
export function remapExport(file: string, libs: Library[]): RemapReport {
  const x = readXmlText(file);
  const real = x.file;
  const text = x.text;
  let bom = false;
  try { const fd = fs.openSync(real, "r"); const b = Buffer.alloc(3); fs.readSync(fd, b, 0, 3, 0); fs.closeSync(fd); bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf; } catch { /* read above */ }
  const notRb = () => appError("rb_export_not_rekordbox", "this file is not a collection exported from rekordbox");
  if (!/<DJ_PLAYLISTS[\s>]/.test(text)) throw notRb();
  const open = /<COLLECTION\b[^>]*?(\/?)>/.exec(text);
  if (!open) throw notRb();
  const rep: RemapReport = { file: real, out: null, total: 0, remapped: 0, wav_to_aiff: 0, folder_moved: 0, missing: 0,
    missing_names: [], dropped: 0, cues: 0, no_cues: 0, playlists: [], own_cues: 0, loose: 0, suffix: "" };
  if (open[1] === "/") return rep;   // an empty collection
  const cStart = open.index + open[0].length;
  const cEnd = text.indexOf("</COLLECTION>", cStart);
  if (cEnd < 0) throw notRb();
  const body = text.slice(cStart, cEnd);
  const TRACK = /<TRACK\b[^>]*?(?:\/>|>[\s\S]*?<\/TRACK>)/g;
  interface T { start: number; end: number; text: string; id: string; loc: string; p: string | null; }
  const tracks: T[] = [];
  for (let m; (m = TRACK.exec(body));) {
    const head = /^<TRACK\b[^>]*>/.exec(m[0])![0];
    const loc = attr(head, "Location") || "";
    tracks.push({ start: m.index, end: m.index + m[0].length, text: m[0], id: attr(head, "TrackID") || "", loc, p: loc ? locPath(loc) : null });
  }
  rep.total = tracks.length;
  const byPath = new Map<string, T>();
  for (const t of tracks) if (t.p) byPath.set(fold(t.p), t);
  // plan: each library track that is somewhere else now
  const changes = new Map<T, string>();   // track -> its new text
  const drop = new Set<T>();
  const idMap = new Map<string, string>();      // TrackID of a dropped entry -> the remapped track's
  const locMap = new Map<string, string>();     // old Location -> new (playlists keyed by Location)
  const claimed = new Set<string>();
  const remappedIds = new Set<string>();
  const remappedT: { id: string; loc: string }[] = [];
  let aiffy = false;   // a WAV became an AIFF (the new file's and playlists' suffix says " AIFF", else " moved")
  for (const t of tracks) {
    if (!t.p || drop.has(t)) continue;
    const now = whereNow(t.p, libs);
    if (now === null) continue;
    if (now === "missing") { rep.missing++; if (rep.missing_names.length < 8) rep.missing_names.push(path.basename(t.p)); continue; }
    if (claimed.has(fold(now))) { rep.missing++; if (rep.missing_names.length < 8) rep.missing_names.push(path.basename(t.p)); continue; }
    claimed.add(fold(now));
    const dup = byPath.get(fold(now));
    // an entry at the new path that has cue points of its own (the user set them in rekordbox):
    // both entries stay as they are, and the playlists list the AIFF entry in place of the old one
    if (dup && dup !== t && /<POSITION_MARK\b/.test(dup.text)) {
      idMap.set(t.id, dup.id);
      locMap.set(t.loc, dup.loc);
      rep.own_cues++;
      if (/\.(wav|flac|m4a|ogg|mp3)$/i.test(t.p) && /\.aiff?$/i.test(now)) aiffy = true;
      continue;
    }
    // an entry at the new path already (rekordbox added the AIFF without cues): left out, its spelling used
    let loc: string;
    if (dup && dup !== t) {
      drop.add(dup); changes.delete(dup);
      idMap.set(dup.id, t.id);
      loc = dup.loc;
    } else loc = newLocation(t.loc, t.p, now);
    const head = /^<TRACK\b[^>]*>/.exec(t.text)![0];
    let h2 = setAttr(head, "Location", loc);
    const kind = KIND[path.extname(now).toLowerCase()];
    if (kind && attr(head, "Kind") !== null) h2 = setAttr(h2, "Kind", kind);
    try { if (attr(head, "Size") !== null) h2 = setAttr(h2, "Size", String(fs.statSync(now).size)); } catch { /* checked above */ }
    changes.set(t, h2 + t.text.slice(head.length));
    locMap.set(t.loc, loc);
    if (dup && dup !== t) locMap.set(dup.loc, loc);
    remappedIds.add(t.id);
    remappedT.push({ id: t.id, loc });
    rep.remapped++;
    if (/\.(wav|flac|m4a|ogg|mp3)$/i.test(t.p) && /\.aiff?$/i.test(now)) { rep.wav_to_aiff++; aiffy = true; }
    if (fold(path.dirname(now)) !== fold(path.dirname(t.p))) rep.folder_moved++;
    const n = (t.text.match(/<POSITION_MARK\b/g) || []).length;
    rep.cues += n;
    if (!n) rep.no_cues++;
  }
  rep.dropped = drop.size;
  if (!rep.remapped && !rep.own_cues) return rep;   // nothing to update: no file is written
  const suffix = aiffy ? " AIFF" : " moved";
  rep.suffix = suffix.trim();
  // the collection, spliced: untouched tracks and everything between them keep their bytes
  let out = "", at = 0;
  for (const t of tracks) {
    if (drop.has(t)) {
      // the entry and the white space before it
      let s0 = t.start;
      while (s0 > at && /[ \t\r\n]/.test(body[s0 - 1])) s0--;
      out += body.slice(at, s0); at = t.end; continue;
    }
    const c = changes.get(t);
    if (c) { out += body.slice(at, t.start) + c; at = t.end; }
  }
  out += body.slice(at);
  const left = tracks.length - drop.size;
  const head = text.slice(0, open.index) + open[0].replace(/(\sEntries=")\d*(")/, (_, a, b) => a + left + b);
  // playlists: keys of dropped entries become the remapped track's (no doubles); a playlist that
  // holds a remapped track gets " AIFF" in its name, so importing it makes a new one next to the old
  const rest = text.slice(cEnd);
  const PL = /<NODE\b[^>]*\sType="1"[^>]*?(?:\/>|>([\s\S]*?)<\/NODE>)/g;
  const refIds = new Set<string>(), refLocs = new Set<string>();   // what the playlists list, after the mapping
  const rest2 = rest.replace(PL, (node: string, inner: string | undefined) => {
    if (inner === undefined) return node;
    const openTag = /^<NODE\b[^>]*>/.exec(node)![0];
    const byLoc = attr(openTag, "KeyType") === "1";
    const keyOf = (k: string) => byLoc ? (locMap.get(k) || k) : (idMap.get(k) || k);
    const isMoved = (k: string) => byLoc ? !!locMap.get(k) : remappedIds.has(k) || idMap.has(k);
    const ENTRY = /(\s*)<TRACK\s+Key="([^"]*)"\s*\/>/g;
    const keys = [...inner.matchAll(ENTRY)].map((m) => m[2]);
    for (const k of keys) (byLoc ? refLocs : refIds).add(keyOf(k));
    if (!keys.some((k) => isMoved(k) || keyOf(k) !== k)) return node;
    const present = new Set(keys.filter((k) => keyOf(k) === k));
    const seen = new Set<string>();
    let entries = 0, moved = 0;
    const inner2 = inner.replace(ENTRY, (m, ws: string, k: string) => {
      const k2 = keyOf(k);
      // a key that only became this track by the mapping, while the track is listed itself: dropped
      if (k2 !== k && (present.has(k2) || seen.has(k2))) return "";
      seen.add(k2);
      entries++;
      if (isMoved(k)) moved++;
      return k2 === k ? m : `${ws}<TRACK Key="${k2.replace(/"/g, "&quot;")}"/>`;
    });
    const name = unescapeXml(attr(openTag, "Name") || "");
    const name2 = moved ? name + suffix : name;
    let o2 = openTag.replace(/(\sEntries=")\d*(")/, (_, a, b) => a + entries + b);
    if (moved) o2 = setAttr(o2, "Name", (attr(openTag, "Name") || "") + suffix);
    rep.playlists.push({ name: name2, entries, moved });
    return o2 + inner2 + node.slice(openTag.length + inner.length);
  });
  // remapped tracks no playlist lists: importing a playlist doesn't bring them in (All Tracks does)
  rep.loose = remappedT.filter((t) => !refIds.has(t.id) && !refLocs.has(t.loc)).length;
  if (!rep.remapped && !rep.playlists.some((p) => p.moved)) { rep.own_cues_only = true; return rep; }   // nothing would differ
  const next = head + text.slice(open.index + open[0].length, cStart) + out + rest2;
  rep.out = writeNext(real, suffix, (bom ? "﻿" : "") + next);
  return rep;
}

/** "<export><suffix>.xml" (" (2)", " (3)" … when taken) next to the export, never over it or
 *  anything else, written through "<that name>.djhq-tmp" that is removed whatever goes wrong. A
 *  temp of that name left by an earlier run that was cut off (a crash, a full disk) is removed
 *  when it is older than ten minutes, otherwise the next name is used. */
function writeNext(real: string, suffix: string, content: string): string {
  const dir = path.dirname(real), base = path.basename(real).replace(/\.xml$/i, "");
  const stale = (p: string) => { try { return Date.now() - fs.statSync(p).mtimeMs > 10 * 60 * 1000; } catch { return false; } };
  const taken = (p: string) => {
    if (fs.existsSync(p) || fold(p) === fold(real)) return true;
    const t = p + ".djhq-tmp";
    if (fs.existsSync(t) && stale(t)) try { fs.unlinkSync(t); } catch { /* ignore */ }
    return fs.existsSync(t);
  };
  let dst = path.join(dir, base + suffix + ".xml");
  for (let i = 2; taken(dst); i++) dst = path.join(dir, `${base}${suffix} (${i}).xml`);
  const tmp = dst + ".djhq-tmp";
  let made = false;
  try {
    const fd = fs.openSync(tmp, "wx");
    made = true;
    try {
      fs.writeFileSync(fd, content, "utf8");
      try { fs.fsyncSync(fd); } catch { /* ignore */ }
    } finally { fs.closeSync(fd); }
    if (fs.existsSync(dst)) throw appError("rb_export_taken", "a file of that name turned up meanwhile");
    fs.renameSync(tmp, dst);
    made = false;
    return dst;
  } catch (e: any) {
    if (made) try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    if (e?.code === "rb_export_taken") throw e;
    const why = String(e?.code || e?.message || e);
    if (why === "EACCES" || why === "EPERM" || why === "EROFS")
      throw appError("rb_write_denied", "DJ HQ may not write in the export's folder; move the export to a folder you can write to", { dir });
    if (why === "ENOSPC" || why === "EDQUOT") throw appError("rb_write_full", "the disk of the export's folder is full", { dir });
    throw appError("rb_write_failed", `the new file could not be written next to the export (${why})`, { error: why, dir });
  }
}
