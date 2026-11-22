/** Cue points that sit one beat late. Mixed In Key writes its cue points into the rekordbox
 *  XML; for a track rekordbox had not analysed yet it counts the bars on its own, and they
 *  often land on the "2" of rekordbox's bar. Once rekordbox has analysed the track, its own
 *  beatgrid says where each bar starts: rekordbox keeps it in ANLZ0000.DAT files (one per
 *  track, with the file's name and every beat's time and number in the bar). A cue that
 *  sits on a beat numbered 2 is moved to the beat before it (the "1"); nothing else moves.
 *  The XML is edited in place as text, so everything but those Start (and End) values
 *  keeps its exact bytes. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { El, locationKey, parse, readXmlText, rewriteXmlFile } from "./rbxml";
import { platformApps } from "./extapps";

/** one beat of rekordbox's grid: its number in the bar (1 to 4), the tempo there, its time */
interface Beat { n: number; bpm: number; ms: number; }

const coded = (code: string, msg: string, vars?: Record<string, unknown>) => Object.assign(new Error(msg), { code, vars });

/** where rekordbox keeps its analysis files on this computer */
export function anlzDirs(): string[] {
  const base = process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Pioneer", "rekordbox")
    : path.join(os.homedir(), "Library", "Pioneer", "rekordbox");
  return [path.join(base, "share", "PIONEER", "USBANLZ")].filter((d) => fs.existsSync(d));
}

/** The audio file's name and the beatgrid from one ANLZ .DAT file (the PPTH and PQTZ
 *  sections; all numbers big-endian). null when it isn't one or has no grid. */
export function readAnlz(b: Buffer): { name: string; beats: Beat[] } | null {
  if (b.length < 12 || b.toString("latin1", 0, 4) !== "PMAI") return null;
  let name = "", beats: Beat[] | null = null;
  for (let p = b.readUInt32BE(4); p + 12 <= b.length;) {
    const tag = b.toString("latin1", p, p + 4), len = b.readUInt32BE(p + 8);
    if (len < 12 || p + len > b.length) break;
    if (tag === "PPTH" && len >= 16) {
      const n = Math.min(b.readUInt32BE(p + 12), len - 16);
      const raw = Buffer.from(b.subarray(p + 16, p + 16 + (n & ~1))).swap16().toString("utf16le").replace(/\0+$/, "");
      name = raw.split(/[\\/]/).pop() || "";
    } else if (tag === "PQTZ" && len >= 24) {
      const n = Math.min(b.readUInt32BE(p + 20), Math.floor((len - 24) / 8));
      beats = [];
      for (let i = 0; i < n; i++) {
        const o = p + 24 + i * 8;
        beats.push({ n: b.readUInt16BE(o), bpm: b.readUInt16BE(o + 2) / 100, ms: b.readUInt32BE(o + 4) });
      }
    }
    p += len;
  }
  return name && beats && beats.length ? { name, beats } : null;
}

const nameKey = (file: string) => (locationKey(file).split("/").pop() || "");

/** Every grid rekordbox has, by the audio file's name. Two analyses of one name that
 *  disagree are both left out (null): there is no telling which file they belong to. */
export function readGrids(dirs = anlzDirs()): Map<string, Beat[] | null> {
  const out = new Map<string, Beat[] | null>();
  const same = (a: Beat[], b: Beat[]) => a.length === b.length && a.every((x, i) => x.n === b[i].n && x.ms === b[i].ms);
  const walk = (d: string, depth: number) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4) walk(f, depth + 1); continue; }
      if (!/\.DAT$/i.test(e.name)) continue;
      let a: ReturnType<typeof readAnlz> = null;
      try { a = readAnlz(fs.readFileSync(f)); } catch { /* unreadable: as if not analysed */ }
      if (!a) continue;
      const k = nameKey(a.name), had = out.get(k);
      if (had === undefined) out.set(k, a.beats);
      else if (had && !same(had, a.beats)) out.set(k, null);
    }
  };
  for (const d of dirs) walk(d, 0);
  return out;
}

/** The beat a cue sits on: the nearest one, when the cue is within an eighth of a beat of it. */
function beatAt(beats: Beat[], ms: number): number {
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (beats[m].ms < ms) lo = m + 1; else hi = m; }
  const i = lo > 0 && Math.abs(beats[lo - 1].ms - ms) <= Math.abs(beats[lo].ms - ms) ? lo - 1 : lo;
  const len = beats[i].bpm > 0 ? 60000 / beats[i].bpm : 500;
  return Math.abs(beats[i].ms - ms) <= len / 8 ? i : -1;
}

export interface CueFixTrack { name: string; artist: string; moved: number; cues: number; }
export interface CueFixPlan {
  /** the new text; the same as the old one when nothing moves */
  text: string;
  tracks: CueFixTrack[];
  moved: number;
  /** tracks with cue points / of those, the ones rekordbox has a grid for */
  with_cues: number; analysed: number;
  /** tracks left out because two analyses carry their file name */
  unclear: number;
}

const find = (els: El[], name: string) => els.find((e) => e.name === name);

/** What would move in this XML, and the text with it moved. */
export function planCueFix(text: string, grids: Map<string, Beat[] | null>): CueFixPlan {
  const root = find(parse(text), "DJ_PLAYLISTS");
  const coll = root && find(root.children, "COLLECTION");
  if (!root || !coll) throw coded("rb_xml_not_rekordbox", "that file isn't a rekordbox XML collection");
  const edits: { at: number; end: number; value: string }[] = [];
  const plan: CueFixPlan = { text, tracks: [], moved: 0, with_cues: 0, analysed: 0, unclear: 0 };
  for (const tr of coll.children) {
    if (tr.name !== "TRACK") continue;
    const cues = tr.children.filter((c) => c.name === "POSITION_MARK");
    if (!cues.length) continue;
    plan.with_cues++;
    const grid = grids.get(nameKey(tr.attrs.get("Location") || ""));
    if (grid === null) { plan.unclear++; continue; }
    if (!grid) continue;
    plan.analysed++;
    let moved = 0;
    for (const c of cues) {
      const start = Number(c.attrs.get("Start"));
      if (!Number.isFinite(start)) continue;
      const i = beatAt(grid, start * 1000);
      if (i < 0 || grid[i].n !== 2) continue;
      let toMs: number;
      if (i > 0) { if (grid[i - 1].n !== 1) continue; toMs = grid[i - 1].ms; }
      else {
        // the grid starts on this "2": its "1" is one beat earlier, at (or a hair before) the start of the file
        const len = grid[0].bpm > 0 ? 60000 / grid[0].bpm : 0;
        if (!len || grid[0].ms - len < -len / 8) continue;
        toMs = Math.max(0, grid[0].ms - len);
      }
      const to = toMs / 1000, by = to - start;
      const tag = text.slice(c.start, c.tagEnd);
      // the quoted values of Start and End as they stand in the file (a loop keeps its length)
      for (const m of tag.matchAll(/\s(Start|End)\s*=\s*"([^"]*)"/g)) {
        const v = Number(m[2]);
        if (m[1] === "End" && !(Number.isFinite(v) && v > start)) continue;
        const at = c.start + m.index! + m[0].length - 1 - m[2].length;
        edits.push({ at, end: at + m[2].length, value: (m[1] === "Start" ? to : Math.max(0, v + by)).toFixed(3) });
      }
      moved++;
    }
    if (moved) {
      plan.tracks.push({ name: tr.attrs.get("Name") || "", artist: tr.attrs.get("Artist") || "", moved, cues: cues.length });
      plan.moved += moved;
    }
  }
  if (edits.length) {
    edits.sort((a, b) => a.at - b.at);
    let out = "", from = 0;
    for (const e of edits) { out += text.slice(from, e.at) + e.value; from = e.end; }
    plan.text = out + text.slice(from);
  }
  return plan;
}

export interface CueFixResult extends Omit<CueFixPlan, "text"> { file: string; backup: string | null; applied: boolean; }

/** Look at the file (apply = false) or move the cues in it. The written text is planned
 *  again before it goes out: it must parse and have nothing left to move. */
export function cueFixFile(file: string, apply: boolean, dirs = anlzDirs()): CueFixResult {
  if (!dirs.length) throw coded("cue_no_rekordbox", "rekordbox's analysis files were not found on this computer");
  const grids = readGrids(dirs);
  if (!grids.size) throw coded("cue_no_rekordbox", "rekordbox's analysis files were not found on this computer");
  let plan: CueFixPlan | null = null;
  const make = (text: string) => {
    const p = planCueFix(text, grids);
    if (p.moved) {
      const again = planCueFix(p.text, grids);
      if (again.moved || again.with_cues !== p.with_cues)
        throw coded("rb_xml_check_failed", "the moved cue points did not check out", { error: "the moved cue points did not check out" });
    }
    return p;
  };
  if (!apply) {
    const x = readXmlText(file);
    plan = make(x.text);
    const { text: _t, ...rest } = plan;
    return { ...rest, file: x.file, backup: null, applied: false };
  }
  const w = rewriteXmlFile(file, (text) => { plan = make(text); return plan.moved ? plan.text : null; });
  const { text: _t, ...rest } = plan!;
  return { ...rest, file: w.file, backup: w.backup, applied: !!w.backup };
}

/** POST /api/cue-fix {apply?}: the rekordbox XML Mixed In Key writes its cue points to is
 *  the one set up for Do everything, else the one Mixed In Key or rekordbox names. */
export async function cueFixRoute(setFile: string, apply: boolean): Promise<CueFixResult> {
  let file = setFile && fs.existsSync(setFile) ? setFile : "";
  if (!file) {
    const found = (await platformApps().suggestRekordboxXml().catch(() => [])).filter((s) => s.exists);
    file = (found.find((s) => s.source === "mik") || found[0])?.path || "";
  }
  if (!file) throw coded("cue_no_xml", "no rekordbox XML file was found");
  try { return cueFixFile(file, apply); }
  catch (e: any) { if (e && !e.vars) e.vars = { path: file, error: String(e.message || e) }; throw e; }
}
