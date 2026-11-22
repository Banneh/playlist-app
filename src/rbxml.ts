/** Merging tracks and their keys into the user's own rekordbox XML (the file rekordbox
 *  imports from), without rewriting the rest of it: the file is edited in place as
 *  text, so every existing TRACK (with its TEMPO and POSITION_MARK children) and every
 *  existing playlist keeps its exact bytes. What may change:
 *   - new TRACK elements at the end of COLLECTION, and its Entries count;
 *   - the Tonality of an existing track that is part of the batch, when it is empty
 *     or differs (the way mik_keys_to_rekordbox.py does it);
 *   - one playlist node DJ HQ owns ("DJ HQ", at ROOT level), replaced as a whole,
 *     and ROOT's Count.
 *  Every result is parsed again and compared against the original before it is
 *  written (verifyMerge); writing goes through a backup, a re-read and a rename. */
import * as fs from "fs";
import * as path from "path";

export const OWNED_PLAYLIST = "DJ HQ";

// ---------------- a tolerant, position-keeping XML reader ----------------

export interface El {
  name: string;
  /** offsets: `<` of the start tag, just past its `>`, start of the end tag (= tagEnd when
   *  self-closing), just past the end of the element */
  start: number; tagEnd: number; closeStart: number; end: number;
  selfClosing: boolean;
  attrs: Map<string, string>;
  children: El[];
}

const malformed = (why: string) => Object.assign(new Error("the rekordbox XML can't be read: " + why), { code: "rb_xml_malformed" });

export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'"
      : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
}
/** Characters XML 1.0 allows nowhere (lone surrogates included): one of them makes the
 *  whole file unreadable for rekordbox. */
const FORBIDDEN = /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const forbiddenCount = (s: string) => (s.match(FORBIDDEN) || []).length;
/** An attribute value: forbidden characters dropped, tab and line breaks as references
 *  (a parser would turn them into spaces otherwise). */
export const escapeAttr = (s: unknown) => String(s).replace(FORBIDDEN, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Each attribute of a start tag's text, with where it starts and where its quoted value
 *  sits (read in sequence, so text inside another value is never taken for an attribute). */
function attrSpans(tag: string): { name: string; from: number; at: number; end: number }[] {
  const re = new RegExp(ATTR.source, "g");
  const out: { name: string; from: number; at: number; end: number }[] = [];
  for (let a; (a = re.exec(tag));) {
    const end = a.index + a[0].length;
    out.push({ name: a[1], from: a.index, at: end - (a[2] ?? a[3] ?? "").length - 2, end });
  }
  return out;
}

function parseAttrs(raw: string): Map<string, string> {
  const m = new Map<string, string>();
  ATTR.lastIndex = 0;
  for (let a; (a = ATTR.exec(raw));) m.set(a[1], unescapeXml(a[2] ?? a[3] ?? ""));
  return m;
}

/** The element tree with offsets; throws rb_xml_malformed on unbalanced tags. */
export function parse(text: string): El[] {
  const top: El[] = [];
  const stack: El[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) break;
    if (text.startsWith("<?", lt)) { const e = text.indexOf("?>", lt + 2); if (e < 0) throw malformed("unfinished declaration"); i = e + 2; continue; }
    if (text.startsWith("<!--", lt)) { const e = text.indexOf("-->", lt + 4); if (e < 0) throw malformed("unfinished comment"); i = e + 3; continue; }
    if (text.startsWith("<![CDATA[", lt)) { const e = text.indexOf("]]>", lt + 9); if (e < 0) throw malformed("unfinished CDATA"); i = e + 3; continue; }
    if (text.startsWith("<!", lt)) { const e = text.indexOf(">", lt + 2); if (e < 0) throw malformed("unfinished declaration"); i = e + 1; continue; }
    // find the tag's end, skipping quoted attribute values
    let j = lt + 1, q = "";
    for (; j < n; j++) {
      const c = text[j];
      if (q) { if (c === q) q = ""; }
      else if (c === '"' || c === "'") q = c;
      else if (c === ">") break;
    }
    if (j >= n) throw malformed("unfinished tag");
    const inner = text.slice(lt + 1, j);
    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim();
      const el = stack.pop();
      if (!el || el.name !== name) throw malformed(`</${name}> does not close <${el ? el.name : "nothing"}>`);
      el.closeStart = lt; el.end = j + 1;
    } else {
      const self = inner.endsWith("/");
      const nm = /^[^\s/>]+/.exec(inner)?.[0];
      if (!nm) throw malformed("a tag without a name");
      const el: El = { name: nm, start: lt, tagEnd: j + 1, closeStart: j + 1, end: j + 1, selfClosing: self,
                       attrs: parseAttrs(inner.slice(nm.length, self ? -1 : undefined)), children: [] };
      (stack.length ? stack[stack.length - 1].children : top).push(el);
      if (!self) stack.push(el);
    }
    i = j + 1;
  }
  if (stack.length) throw malformed(`<${stack[stack.length - 1].name}> is never closed`);
  return top;
}

// ---------------- locations ----------------

/** Apple Music / streaming entries never match a file: no file: URL, no absolute path in
 *  it, or a /v4/catalog/ one. file://localhost/…, file:///… and file://… are local. */
const isStreaming = (loc: string) => {
  if (!/^file:/i.test(loc)) return true;
  const p = loc.replace(/^file:(\/\/localhost|\/\/)?/i, "");
  return !/^\/./.test(p) || /^\/v4\/catalog\//i.test(p);
};

/** A path or file://localhost URL as compared: decoded, NFC, case-folded, "/" separators. */
export function locationKey(locOrPath: string): string {
  let s = String(locOrPath || "");
  if (/^file:/i.test(s)) {
    s = s.replace(/^file:(\/\/localhost|\/\/)?/i, "");
    try { s = decodeURIComponent(s); } catch { s = s.replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))); }
  }
  s = s.replace(/\\/g, "/");
  if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);
  return s.normalize("NFC").toLowerCase();
}

interface LocStyle { lowerHex: boolean; raw: Set<string>; }
const SPECIAL = "!$&'()*+,;=@[]~";
const DEFAULT_RAW = "()!,+~";   // what rekordbox leaves unencoded; it writes %27 for ' and %26 for &

/** How the file's own Locations are percent-encoded, so new ones look the same. */
function locationStyle(locs: string[]): LocStyle {
  let lower = 0, upper = 0;
  const raw = new Set<string>();
  for (const ch of SPECIAL) {
    const enc = "%" + ch.charCodeAt(0).toString(16).padStart(2, "0");
    const isRaw = locs.some((l) => l.slice(16).includes(ch));
    const isEnc = locs.some((l) => l.toLowerCase().includes(enc));
    if (isRaw || (!isEnc && DEFAULT_RAW.includes(ch))) raw.add(ch);
  }
  for (const l of locs) for (const m of l.match(/%[0-9a-fA-F]{2}/g) || []) {
    if (/[a-f]/.test(m)) lower++;
    if (/[A-F]/.test(m)) upper++;
  }
  return { lowerHex: lower >= upper, raw };
}

function encodeLocation(p: string, st: LocStyle): string {
  let s = p.normalize("NFC").replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;   // C:/… -> /C:/…
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9\-._/:]/.test(ch) || st.raw.has(ch)) { out += ch; continue; }
    for (const b of Buffer.from(ch, "utf8")) {
      const h = b.toString(16).padStart(2, "0");
      out += "%" + (st.lowerHex ? h : h.toUpperCase());
    }
  }
  return "file://localhost" + out;
}

// ---------------- keys ----------------

const CAM_MINOR: Record<number, number> = { 1: 8, 2: 3, 3: 10, 4: 5, 5: 0, 6: 7, 7: 2, 8: 9, 9: 4, 10: 11, 11: 6, 12: 1 };
const CAM_MAJOR: Record<number, number> = { 1: 11, 2: 6, 3: 1, 4: 8, 5: 3, 6: 10, 7: 5, 8: 0, 9: 7, 10: 2, 11: 9, 12: 4 };
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MINOR_NAMES = ["Cm", "Dbm", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "Abm", "Am", "Bbm", "Bm"];
const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const RE_CAMELOT = /^0?(1[0-2]|[1-9])\s*([AB])$/i;
const RE_CAMELOT_PREFIX = /^0?(1[0-2]|[1-9])([AB])\b/i;
const RE_OPENKEY = /^(1[0-2]|[1-9])\s*([dm])$/i;
const RE_CLASSICAL = /^([A-G])\s*(#|b|sharp|flat)?\s*(m|min|minor|maj|major)?$/i;

/** [pitch class, minor] of a key in Camelot ("8A"), Open Key ("1m") or classical ("Am") */
export function parseKey(v: string): [number, boolean] | null {
  const s = String(v || "").trim().replace(/\u266f/g, "#").replace(/\u266d/g, "b");
  if (!s || s.length > 24) return null;
  let m = RE_CAMELOT.exec(s) || RE_CAMELOT_PREFIX.exec(s);
  if (m) { const n = Number(m[1]); return m[2].toUpperCase() === "A" ? [CAM_MINOR[n], true] : [CAM_MAJOR[n], false]; }
  m = RE_OPENKEY.exec(s);
  if (m) { const cam = (Number(m[1]) + 6) % 12 + 1; return m[2].toLowerCase() === "m" ? [CAM_MINOR[cam], true] : [CAM_MAJOR[cam], false]; }
  m = RE_CLASSICAL.exec(s);
  if (m) {
    let pc = NOTE[m[1].toUpperCase()];
    const acc = (m[2] || "").toLowerCase();
    if (acc === "#" || acc === "sharp") pc++; else if (acc === "b" || acc === "flat") pc--;
    return [((pc % 12) + 12) % 12, ["m", "min", "minor"].includes((m[3] || "").toLowerCase())];
  }
  return null;
}
const classify = (v: string) => RE_CAMELOT.test(v.trim()) ? "camelot" : RE_OPENKEY.test(v.trim()) ? "openkey" : parseKey(v) ? "classical" : null;

/** Keys written the way the file already writes them: Camelot or classical, zero-padded
 *  or not, the same spelling of each classical key (mik_keys_to_rekordbox.py's make_formatter). */
function keyFormatter(existing: string[]): (k: string) => string | null {
  const vals = existing.map((v) => v.trim()).filter(Boolean);
  const kinds = { camelot: 0, classical: 0 };
  for (const v of vals) { const c = classify(v); if (c === "camelot") kinds.camelot++; else if (c === "classical") kinds.classical++; }
  // no keys in the file yet: keep what the tag says (Mixed In Key: Camelot) as it is
  if (!vals.length) return (k) => (parseKey(k) ? k.trim() : null);
  const style = kinds.camelot >= kinds.classical ? "camelot" : "classical";
  const pad = vals.some((v) => classify(v) === "camelot" && v.startsWith("0"));
  const spelling = new Map<string, Map<string, number>>();
  for (const v of vals) if (classify(v) === "classical") {
    const pk = String(parseKey(v));
    const m = spelling.get(pk) || new Map<string, number>();
    m.set(v, (m.get(v) || 0) + 1);
    spelling.set(pk, m);
  }
  return (k) => {
    const key = parseKey(k);
    if (!key) return null;
    const [pc, minor] = key;
    if (style === "camelot") {
      const tbl = minor ? CAM_MINOR : CAM_MAJOR;
      const n = Number(Object.keys(tbl).find((x) => tbl[Number(x)] === pc));
      return (pad ? String(n).padStart(2, "0") : String(n)) + (minor ? "A" : "B");
    }
    const sp = spelling.get(String(key));
    if (sp && sp.size) return [...sp.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return (minor ? MINOR_NAMES : MAJOR_NAMES)[pc];
  };
}

// ---------------- merge ----------------

export interface RbTrackIn { path: string; name: string; artist: string; genre: string; size: number; totalTime: number; key: string | null; }
export interface MergeResult {
  text: string;
  /** false: the file already says all of this (nothing to write) */
  changed: boolean;
  added: { path: string; id: string }[];
  /** existing tracks whose Tonality was set or changed */
  updated: { path: string; id: string; from: string; to: string }[];
  /** existing tracks left as they are (only listed in the playlist) */
  existing: { path: string; id: string }[];
  /** the owned playlist: this run's tracks plus earlier runs' that are still in the collection */
  playlist: { name: string; entries: number };
}

const KIND: Record<string, string> = { ".wav": "WAV File", ".mp3": "MP3 File", ".aiff": "AIFF File", ".aif": "AIFF File",
  ".flac": "FLAC File", ".m4a": "M4A File", ".ogg": "OGG File" };

/** The whitespace between two siblings when it is only whitespace, else a fallback. */
const gap = (text: string, from: number, to: number, fallback: string) => {
  const g = text.slice(from, to);
  return /^\s*$/.test(g) ? g : fallback;
};
const indentOf = (text: string, at: number) => /[ \t]*$/.exec(text.slice(text.lastIndexOf("\n", at - 1) + 1, at))?.[0] ?? "";

/** Set (or add) one attribute inside a start tag's text, leaving everything else as is. */
function setAttr(tag: string, name: string, value: string): string {
  const a = attrSpans(tag).find((x) => x.name === name);
  if (a) return tag.slice(0, a.at) + `"${escapeAttr(value)}"` + tag.slice(a.end);
  return tag.replace(/(\s*\/?>)$/, ` ${name}="${escapeAttr(value)}"$1`);
}
/** A start tag's text without one attribute (for comparing the rest). */
function withoutAttr(tag: string, name: string): string {
  const a = attrSpans(tag).find((x) => x.name === name);
  return a ? tag.slice(0, a.from).replace(/\s+$/, "") + tag.slice(a.end) : tag;   // with the space before it
}

/** Merge tracks into a rekordbox XML document (text in, text out). `today` is DateAdded
 *  (YYYY-MM-DD). Throws an error with a code when the file isn't usable. */
export function mergeXml(text: string, tracks: RbTrackIn[], today: string): MergeResult {
  const top = parse(text);
  const root = top.find((e) => e.name === "DJ_PLAYLISTS");
  if (!root || root.selfClosing) throw Object.assign(new Error("that file isn't a rekordbox XML collection"), { code: "rb_xml_not_rekordbox" });
  const coll = root.children.find((e) => e.name === "COLLECTION");
  if (!coll) throw Object.assign(new Error("the rekordbox XML has no collection"), { code: "rb_xml_not_rekordbox" });
  const trackEls = coll.children.filter((e) => e.name === "TRACK");
  const selfStyle = (text.match(/" \/>/g) || []).length >= (text.match(/"\/>/g) || []).length ? " />" : "/>";
  const NL = text.includes("\r\n") ? "\r\n" : "\n";   // new lines end the way the file's lines do

  const byLoc = new Map<string, El>();
  const ids = new Set<string>();
  const localLocs: string[] = [];
  let maxId = 0;
  for (const t of trackEls) {
    const id = t.attrs.get("TrackID") || "";
    ids.add(id);
    if (/^\d+$/.test(id)) maxId = Math.max(maxId, Number(id));
    const loc = t.attrs.get("Location") || "";
    if (!loc || isStreaming(loc)) continue;   // Apple Music / streaming entries never match a file
    localLocs.push(loc);
    const k = locationKey(loc);
    if (!byLoc.has(k)) byLoc.set(k, t);
  }
  const fmt = keyFormatter(trackEls.map((t) => t.attrs.get("Tonality") || ""));
  const style = locationStyle(localLocs);

  type Splice = { at: number; del: number; ins: string };
  const edits: Splice[] = [];
  const res: MergeResult = { text, changed: false, added: [], updated: [], existing: [], playlist: { name: OWNED_PLAYLIST, entries: 0 } };
  const runIds: string[] = [];
  const newLines: string[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    const k = locationKey(t.path);
    if (seen.has(k)) continue;
    seen.add(k);
    const key = t.key ? fmt(t.key) : null;
    const el = byLoc.get(k);
    if (el) {
      const id = el.attrs.get("TrackID") || "";
      if (id) runIds.push(id);   // a track without an id can't be listed in a playlist (KeyType 0)
      const cur = el.attrs.get("Tonality") || "";
      if (key && cur !== key) {
        edits.push({ at: el.start, del: el.tagEnd - el.start, ins: setAttr(text.slice(el.start, el.tagEnd), "Tonality", key) });
        res.updated.push({ path: t.path, id, from: cur, to: key });
      } else res.existing.push({ path: t.path, id });
      continue;
    }
    let n = maxId + 1;
    while (ids.has(String(n))) n++;
    maxId = n;
    const id = String(n);
    ids.add(id);
    runIds.push(id);
    const attrs: [string, string | number][] = [["TrackID", id], ["Name", t.name], ["Artist", t.artist], ["Genre", t.genre],
      ["Kind", KIND[path.extname(t.path).toLowerCase()] || "Audio File"], ["Size", Math.round(t.size)],
      ["TotalTime", Math.round(t.totalTime)], ["DateAdded", today], ["Location", encodeLocation(t.path, style)]];
    if (key) attrs.push(["Tonality", key]);
    newLines.push(`<TRACK ${attrs.map(([a, v]) => `${a}="${escapeAttr(v)}"`).join(" ")}${selfStyle}`);
    res.added.push({ path: t.path, id });
  }

  // new tracks go after the last TRACK, spaced like it
  if (newLines.length) {
    const ci = indentOf(text, coll.start);
    if (coll.selfClosing) {
      const nl = NL + ci + "    ";
      const open = setAttr(text.slice(coll.start, coll.tagEnd).replace(/\s*\/>$/, ">"), "Entries", String(trackEls.length + newLines.length));
      edits.push({ at: coll.start, del: coll.end - coll.start, ins: open + newLines.map((l) => nl + l).join("") + NL + ci + "</COLLECTION>" });
    } else {
      const last = trackEls[trackEls.length - 1];
      const prevEnd = trackEls.length >= 2 ? trackEls[trackEls.length - 2].end : coll.tagEnd;
      const sep = last ? gap(text, prevEnd, last.start, NL + ci + "    ") : NL + ci + "    ";
      const at = last ? last.end : coll.tagEnd;
      let ins = newLines.map((l) => sep + l).join("");
      if (!last && !/\n/.test(text.slice(coll.tagEnd, coll.closeStart))) ins += NL + ci;
      edits.push({ at, del: 0, ins });
      edits.push({ at: coll.start, del: coll.tagEnd - coll.start,
                   ins: setAttr(text.slice(coll.start, coll.tagEnd), "Entries", String(trackEls.length + newLines.length)) });
    }
  } else if (coll.attrs.get("Entries") !== String(trackEls.length)) {
    edits.push({ at: coll.start, del: coll.tagEnd - coll.start, ins: setAttr(text.slice(coll.start, coll.tagEnd), "Entries", String(trackEls.length)) });
  }

  // the owned playlist: earlier runs' tracks still in the collection, then this run's
  const lists = root.children.find((e) => e.name === "PLAYLISTS");
  const rootNode = lists?.children.find((e) => e.name === "NODE" && e.attrs.get("Type") === "0");
  const owned = (rootNode?.children || []).filter((e) => e.name === "NODE" && e.attrs.get("Name") === OWNED_PLAYLIST);
  if (owned.some((e) => e.attrs.get("Type") !== "1"))
    throw Object.assign(new Error(`the rekordbox XML has a folder named "${OWNED_PLAYLIST}"`), { code: "rb_xml_name_taken" });
  const entries: string[] = [];
  const inColl = new Set([...ids]);
  for (const o of owned) {
    const byLocKey = o.attrs.get("KeyType") === "1";
    for (const c of o.children) if (c.name === "TRACK") {
      const kv = c.attrs.get("Key") || "";
      const id = byLocKey ? byLoc.get(locationKey(kv))?.attrs.get("TrackID") || "" : kv;
      if (id && inColl.has(id) && !entries.includes(id)) entries.push(id);
    }
  }
  for (const id of runIds) if (!entries.includes(id)) entries.push(id);
  res.playlist.entries = entries.length;

  if (entries.length) {
    // spacing copied from an existing playlist that has tracks, if there is one
    const sample = (rootNode?.children || []).find((e) => e.name === "NODE" && e.children.some((c) => c.name === "TRACK"));
    const nodeIndent = rootNode ? (rootNode.children.length ? indentOf(text, rootNode.children[0].start) : indentOf(text, rootNode.start) + "    ")
      : indentOf(text, coll.start) + "        ";
    const firstT = sample?.children.find((c) => c.name === "TRACK");
    const lastT = sample ? [...sample.children].reverse().find((c) => c.name === "TRACK") : undefined;
    const entrySep = sample && firstT ? gap(text, sample.tagEnd, firstT.start, NL + nodeIndent + "    ") : NL + nodeIndent + "    ";
    const closeSep = sample && lastT ? gap(text, lastT.end, sample.closeStart, NL + nodeIndent) : NL + nodeIndent;
    const node = `<NODE Name="${escapeAttr(OWNED_PLAYLIST)}" Type="1" KeyType="0" Entries="${entries.length}">`
      + entries.map((id) => `${entrySep}<TRACK Key="${escapeAttr(id)}"${selfStyle}`).join("") + `${closeSep}</NODE>`;
    if (owned.length) {
      // replace the first, drop any duplicates (with the whitespace before them)
      edits.push({ at: owned[0].start, del: owned[0].end - owned[0].start, ins: node });
      const kids = rootNode!.children;
      for (const o of owned.slice(1)) {
        const i = kids.indexOf(o);
        const from = i > 0 ? kids[i - 1].end : rootNode!.tagEnd;
        const ws = /^\s*$/.test(text.slice(from, o.start)) ? from : o.start;
        edits.push({ at: ws, del: o.end - ws, ins: "" });
      }
    } else if (rootNode && !rootNode.selfClosing) {
      // first in ROOT, right after its start tag: the only line that changes is ROOT's own
      // (Count), whatever the formatting of the playlists after it
      const first = rootNode.children[0];
      const sep = first ? gap(text, rootNode.tagEnd, first.start, NL + nodeIndent) : NL + nodeIndent;
      let ins = sep + node;
      if (!first && !/\n/.test(text.slice(rootNode.tagEnd, rootNode.closeStart))) ins += NL + indentOf(text, rootNode.start);
      edits.push({ at: rootNode.tagEnd, del: 0, ins });
    } else if (rootNode) {
      const ri = indentOf(text, rootNode.start);
      const open = setAttr(text.slice(rootNode.start, rootNode.tagEnd).replace(/\s*\/>$/, ">"), "Count", "1");
      edits.push({ at: rootNode.start, del: rootNode.end - rootNode.start, ins: open + NL + nodeIndent + node + NL + ri + "</NODE>" });
    } else {
      const ci = indentOf(text, coll.start);
      const tree = `<NODE Type="0" Name="ROOT" Count="1">${NL}${ci}        ${node}${NL}${ci}    </NODE>`;
      if (lists && !lists.selfClosing) edits.push({ at: lists.tagEnd, del: 0, ins: NL + ci + "    " + tree });
      else if (lists) edits.push({ at: lists.start, del: lists.end - lists.start, ins: `<PLAYLISTS>${NL}${ci}    ${tree}${NL}${ci}</PLAYLISTS>` });
      else edits.push({ at: coll.end, del: 0, ins: `${NL}${ci}<PLAYLISTS>${NL}${ci}    ${tree}${NL}${ci}</PLAYLISTS>` });
    }
    if (rootNode) {
      const count = rootNode.children.filter((e) => e.name === "NODE").length - Math.max(0, owned.length - 1) + (owned.length ? 0 : 1);
      if (rootNode.attrs.get("Count") !== String(count) || !rootNode.attrs.has("Count"))
        edits.push({ at: rootNode.start, del: rootNode.tagEnd - rootNode.start, ins: setAttr(text.slice(rootNode.start, rootNode.tagEnd), "Count", String(count)) });
    }
  }

  // apply front to back in one pass (a large collection is never copied once per edit); an
  // attribute edit on a self-closing ROOT/COLLECTION was folded into its replacement:
  // at one offset an insertion goes first, then the larger replacement, the smaller is dropped
  edits.sort((a, b) => a.at - b.at || (a.del === 0 ? -1 : 0) - (b.del === 0 ? -1 : 0) || b.del - a.del);
  const parts: string[] = [];
  let pos = 0;
  for (const e of edits) {
    if (e.at < pos) continue;   // overlapping (covered by a whole-element replacement)
    parts.push(text.slice(pos, e.at), e.ins);
    pos = e.at + e.del;
  }
  parts.push(text.slice(pos));
  const out = parts.join("");
  res.text = out;
  res.changed = out !== text;
  if (res.changed) verifyMerge(text, out, res, top);
  return res;
}

/** Re-read the merged text and make sure only what mergeXml means to change changed:
 *  it parses, COLLECTION Entries and ROOT Count are right, every existing TRACK is
 *  byte-for-byte the same (Tonality aside for the updated ones), every other playlist
 *  node is unchanged, the text before the collection is unchanged, there is exactly
 *  one owned playlist. Throws rb_xml_check_failed otherwise (nothing is written). */
export function verifyMerge(before: string, after: string, res: MergeResult, parsedBefore?: El[]): void {
  const fail = (why: string) => { throw Object.assign(new Error("the merged rekordbox XML failed a check (" + why + "); nothing was written"), { code: "rb_xml_check_failed" }); };
  let a: El[], b: El[];
  try { a = parsedBefore || parse(before); b = parse(after); } catch (e: any) { return fail(e.message); }
  if (forbiddenCount(after) > forbiddenCount(before)) return fail("a character XML doesn't allow");
  const ra = a.find((e) => e.name === "DJ_PLAYLISTS")!, rb = b.find((e) => e.name === "DJ_PLAYLISTS");
  if (!rb) return fail("no DJ_PLAYLISTS");
  const ca = ra.children.find((e) => e.name === "COLLECTION")!, cb = rb.children.find((e) => e.name === "COLLECTION");
  if (!cb) return fail("no COLLECTION");
  // the text before the collection, without a PLAYLISTS section that comes first (checked below)
  const head = (r: El, c: El, t: string) => {
    const pl = r.children.find((e) => e.name === "PLAYLISTS");
    return pl && pl.end <= c.start ? t.slice(0, pl.start) + t.slice(pl.end, c.start) : t.slice(0, c.start);
  };
  if (head(ra, ca, before) !== head(rb, cb, after)) return fail("the file's start changed");
  const ta = ca.children.filter((e) => e.name === "TRACK"), tb = cb.children.filter((e) => e.name === "TRACK");
  if (cb.attrs.get("Entries") !== String(tb.length)) return fail("Entries");
  if (tb.length !== ta.length + res.added.length) return fail("track count");
  const updated = new Map(res.updated.map((u) => [u.id, u.to]));
  // an updated track: the same bytes once Tonality is left out of its start tag, and the new key in it
  const noTonality = (t: string, el: El) => withoutAttr(t.slice(el.start, el.tagEnd), "Tonality") + t.slice(el.tagEnd, el.end);
  for (let i = 0; i < ta.length; i++) {
    const x = before.slice(ta[i].start, ta[i].end), y = after.slice(tb[i].start, tb[i].end);
    if (x === y) continue;
    const to = updated.get(ta[i].attrs.get("TrackID") || "");
    if (to === undefined || noTonality(before, ta[i]) !== noTonality(after, tb[i]) || tb[i].attrs.get("Tonality") !== to) return fail("an existing track changed");
  }
  // ids the file had are left as they are (even duplicates); the new ones are unique
  const ids = new Set<string>(ta.map((t) => t.attrs.get("TrackID") || ""));
  for (const t of tb.slice(ta.length)) {
    const id = t.attrs.get("TrackID") || "";
    if (!id || ids.has(id)) return fail("duplicate TrackID " + id);
    ids.add(id);
  }
  const nodes = (r: El) => r.children.find((e) => e.name === "PLAYLISTS")?.children.find((e) => e.name === "NODE" && e.attrs.get("Type") === "0");
  const na = nodes(ra), nb = nodes(rb);
  if (!nb) return fail("no ROOT playlist folder");
  const kb = nb.children.filter((e) => e.name === "NODE");
  if (nb.attrs.get("Count") !== String(kb.length)) return fail("ROOT Count");
  if (kb.filter((e) => e.attrs.get("Name") === OWNED_PLAYLIST).length !== 1) return fail("owned playlist");
  const others = (r: El | undefined, t: string) => (r?.children || []).filter((e) => e.name === "NODE" && e.attrs.get("Name") !== OWNED_PLAYLIST).map((e) => t.slice(e.start, e.end));
  if (JSON.stringify(others(na, before)) !== JSON.stringify(others(nb, after))) return fail("another playlist changed");
  const own = kb.find((e) => e.attrs.get("Name") === OWNED_PLAYLIST)!;
  const keys = own.children.filter((e) => e.name === "TRACK").map((e) => e.attrs.get("Key") || "");
  if (own.attrs.get("Entries") !== String(keys.length) || keys.some((k) => !k || !ids.has(k))) return fail("owned playlist entries");
}

// ---------------- reading and writing the file ----------------

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface XmlWrite extends MergeResult { file: string; backup: string | null; }

/** The file as text: the path a symlink points to (the rename below must replace the
 *  real file, not the link), its bytes, the text without a BOM. Refused when the bytes
 *  aren't valid UTF-8: decoding would quietly change them, and every existing track must
 *  keep its exact bytes. */
function readXml(file: string): { file: string; bytes: Buffer; text: string; bom: boolean; st: fs.Stats } {
  let real: string, bytes: Buffer, st: fs.Stats;
  try { real = fs.realpathSync(file); st = fs.statSync(real); bytes = fs.readFileSync(real); }
  catch (e: any) {
    throw Object.assign(new Error("the rekordbox XML isn't there: " + file), { code: e?.code === "ENOENT" ? "rb_xml_not_found" : "rb_xml_unreadable" });
  }
  let text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes))
    throw Object.assign(new Error("the rekordbox XML has bytes that aren't UTF-8, so DJ HQ left it alone: " + file), { code: "rb_xml_not_utf8" });
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);   // kept out of the merge, written back below
  return { file: real, bytes, text, bom, st };
}

/** Would a merge into this file work? Reads it and merges one made-up track in memory
 *  (nothing is written), so a file DJ HQ can't work with is refused before the run,
 *  not after the audio was processed. Throws the merge's coded error. */
export function checkXmlFile(file: string): void {
  const x = readXml(file);
  mergeXml(x.text, [{ path: "/DJ HQ check/check.wav", name: "check", artist: "check", genre: "", size: 0, totalTime: 0, key: "8A" }], today());
}

type XmlRead = ReturnType<typeof readXml>;

/** Put `next` in the file's place: read it again (refuse if it changed meanwhile), copy it
 *  to <file>.backup-YYYYMMDD-HHMMSS next to it, write a temp file beside it and rename
 *  that over the original. Returns the backup's path. */
function swapIn({ file, bytes, bom, st }: XmlRead, next: string): string {
  const changed = () => Object.assign(new Error("the rekordbox XML changed while DJ HQ was merging into it; nothing was written"), { code: "rb_xml_changed" });
  const again = (() => { try { return fs.readFileSync(file); } catch { return null; } })();
  const st2 = (() => { try { return fs.statSync(file); } catch { return null; } })();
  if (!again || !st2 || !again.equals(bytes) || st2.mtimeMs !== st.mtimeMs) throw changed();
  let backup = `${file}.backup-${stamp()}`;
  for (let i = 2; fs.existsSync(backup); i++) backup = `${file}.backup-${stamp()}-${i}`;
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const tmp = `${file}.djhq-tmp`;
  const fd = fs.openSync(tmp, "w", st.mode & 0o777);
  try {
    fs.writeFileSync(fd, (bom ? "\ufeff" : "") + next, "utf8");
    try { fs.fsyncSync(fd); } catch { /* ignore */ }
  } finally { fs.closeSync(fd); }
  // nothing was changed after all: no temp file and no extra backup are left behind
  const undo = () => { for (const f of [tmp, backup]) try { fs.unlinkSync(f); } catch { /* ignore */ } };
  // last look right before the swap
  const st3 = (() => { try { return fs.statSync(file); } catch { return null; } })();
  if (!st3 || st3.mtimeMs !== st.mtimeMs || st3.size !== st.size) { undo(); throw changed(); }
  try { fs.renameSync(tmp, file); }
  catch (e: any) {
    // Windows refuses while something holds the file open (rekordbox, a virus scanner,
    // a sync client): wait a moment and try once more, like writeFileAtomic
    const busy = e?.code === "EPERM" || e?.code === "EBUSY" || e?.code === "EACCES";
    try {
      if (!busy) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      fs.renameSync(tmp, file);
    } catch (e2: any) {
      undo();
      throw Object.assign(new Error("the rekordbox XML is in use by another program; nothing was written (" + (e2?.code || e2?.message || e2) + ")"), { code: "rb_xml_in_use" });
    }
  }
  return backup;
}

/** Change the file through `fn` (the text in, the new text out, or null for no change),
 *  with the same care as a merge. Returns the backup's path, or null when nothing changed. */
export function rewriteXmlFile(chosen: string, fn: (text: string) => string | null): { file: string; backup: string | null } {
  const x = readXml(chosen);
  const next = fn(x.text);
  if (next == null || next === x.text) return { file: x.file, backup: null };
  return { file: x.file, backup: swapIn(x, next) };
}
/** The file's text (no BOM) and the real path, for a look without writing. */
export function readXmlText(chosen: string): { file: string; text: string } {
  const x = readXml(chosen);
  return { file: x.file, text: x.text };
}

/** Merge into the file: read it, merge, and only when something changes: read it again
 *  (refuse if it changed meanwhile: rekordbox or Mixed In Key may have written it), copy
 *  it to <file>.backup-YYYYMMDD-HHMMSS next to it, write a temp file beside it and
 *  rename that over the original (a symlink's target is the file changed). */
export function mergeIntoFile(chosen: string, tracks: RbTrackIn[]): XmlWrite {
  const x = readXml(chosen);
  const res = mergeXml(x.text, tracks, today());
  if (!res.changed) return { ...res, file: x.file, backup: null };
  return { ...res, file: x.file, backup: swapIn(x, res.text) };
}
