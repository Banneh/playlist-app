/** "Do everything": one job that takes this run's downloads through the whole chain:
 *  move them into the library, tag them, Platinum Notes (normalise), Mixed In Key (key),
 *  then add them with their keys to the user's rekordbox XML, and report.
 *
 *  The job runs outside the server's request queue: waiting for Platinum Notes or
 *  Mixed In Key takes minutes, and the queue would hold every other call that long.
 *  Only short file operations go through the queue, one file at a time (a move, a tag
 *  write, the XML merge), so a cancel never leaves a half-moved or half-tagged file.
 *  The job lives in <data>/pipeline.json, saved on every change: it survives a closed
 *  dialog and a restart (a job that was running at startup comes back "interrupted",
 *  to be resumed or dismissed). One job at a time.
 *
 *  Completion of the outside apps' work is read from the files themselves: a file is
 *  done with Platinum Notes when it carries its mark, and with Mixed In Key when it has
 *  a key tag (both settled for one poll). Platinum Notes' run log backs that up: it
 *  tells a file it skipped (already processed) from one it failed, and whether the run
 *  is over, which decides whether the app may be asked to quit. Verified with Platinum
 *  Notes 10.5 and Mixed In Key 11.2.6 on macOS, with WAV and MP3 files (M4A, AIFF and
 *  FLAC follow the code's reading, not a live run). Every wait still offers "Mark as done"
 *  and "Skip this step" as a way on, and has no timeout. */
import * as fs from "fs";
import * as path from "path";
import * as core from "./core";
import { readKeyInfo } from "./id3";
import { AppId, ExtApps, PnMode, PressResult, QuitResult, samePathKey, UiAccess } from "./extapps";
import { checkXmlFile, mergeIntoFile, OWNED_PLAYLIST, XmlWrite } from "./rbxml";

/** Everything this module says to the user, by code. {name} is filled from the
 *  message's vars. The UI may show its own (translated) text for a code instead. */
export const TEXT: Record<string, string> = {
  // what keeps the chain from starting (also Settings → do_all_missing)
  do_all_off: "Do everything is switched off in Settings.",
  pn_app_missing: "Choose where Platinum Notes is installed.",
  pn_app_not_found: "Platinum Notes is no longer where it was set up: {path}.",
  mik_app_missing: "Choose where Mixed In Key is installed.",
  mik_app_not_found: "Mixed In Key is no longer where it was set up: {path}.",
  rb_xml_missing: "Choose the rekordbox XML file rekordbox imports from.",
  rb_xml_not_found: "The rekordbox XML file isn't there: {path}.",
  rb_xml_not_writable: "DJ HQ isn't allowed to change the rekordbox XML file: {path}.",
  rb_xml_is_export: "That is the file DJ HQ's own Export XML rewrites each time, so what Do everything adds there would be lost. In rekordbox, export your collection to another file (File > Export Collection in xml format), set that file as the rekordbox xml Imported Library, and choose it here.",
  pn_mode_unchecked: "DJ HQ hasn't checked Platinum Notes' output setting yet. Open Configure to check it.",
  pn_mode_wrong: "Platinum Notes is not set to “Replace original files”. Set it there, then check again.",
  pn_mode_unknown: "DJ HQ can't read Platinum Notes' output setting on this computer. Make sure it is set to “Replace original files”, then confirm that in Configure.",
  mik_db_missing: "Mixed In Key's database isn't set. It is only used for a file that ends up without a key tag.",
  mik_db_not_found: "Mixed In Key's database isn't where it was set up: {path}.",
  no_library: "Add a library with a playlist first.",
  job_active: "Another Do everything run is still open. Finish, resume or dismiss it first.",
  nothing_to_do: "There is nothing to process: no matching downloads, and no library files waiting.",
  library_changed: "The library this run started in is no longer the active one. Switch back to it, then try again.",
  library_away: "The library folder isn't available: {path}. Connect the drive it is on, or find the folder, then try again.",
  bad_request: "That request isn't understood.",
  step_changed: "That step isn't the current one any more.",
  not_now: "That can't be done right now.",
  // app paths
  app_not_bundle: "Choose the app itself (a file ending in .app).",
  app_not_exe: "Choose the program file (ending in .exe).",
  app_not_found: "There is no app at {path}.",
  app_on_installer: "That copy is on the installer disk image. Drag the app into Applications first, then choose it there.",
  app_unreadable: "DJ HQ can't read that app's details.",
  app_wrong: "That isn't {app}.",
  platform_unsupported: "Do everything works on macOS and Windows only.",
  // steps and waits
  step_move: "Move into the library",
  step_tag: "Write tags",
  step_pn: "Platinum Notes",
  step_mik: "Mixed In Key",
  step_xml: "Add to rekordbox",
  step_finish: "Report",
  pn_press_start: "Platinum Notes is open with the files (no window? click its icon in the Dock). Press “Start Processing” there; DJ HQ notices by itself when it has finished ({done} of {total} done).",
  pn_pressing: "DJ HQ is pressing “Start Processing” in Platinum Notes for you ({done} of {total} done).",
  pn_processing: "DJ HQ pressed “Start Processing” in Platinum Notes. It notices by itself when the files are done ({done} of {total} done).",
  mik_analysing: "Mixed In Key is analysing the files. DJ HQ notices by itself when they have their keys ({done} of {total} done).",
  app_open_failed: "{app} couldn't be opened with the files: {error}",
  app_still_open: "{app} didn't close (a dialog may be open there), so DJ HQ left it open. Close it yourself when you're ready.",
  app_still_processing: "{app} may still be processing, so DJ HQ left it open. Close it yourself once it has finished.",
  app_left_open: "{app} was already open, so DJ HQ left it open.",
  pn_app_invalid: "Platinum Notes can't be used: {error}",
  mik_app_invalid: "Mixed In Key can't be used: {error}",
  // per file
  in_library: "Already in the library.",
  move_failed: "Couldn't move it: {error}",
  file_gone: "The file is no longer in the library.",
  already_tagged: "Tags already right.",
  tag_failed: "Couldn't write the tags: {error}",
  already_processed: "Platinum Notes has processed it before.",
  pn_unsupported_format: "Platinum Notes doesn't take this file type.",
  pn_file_failed: "Platinum Notes reports it couldn't process this file.",
  pn_left_as_is: "Platinum Notes left this file as it is: it has most likely processed it before. DJ HQ can't read its mark in this file type.",
  retagged: "Files whose artist, title or genre were lost in Platinum Notes and Mixed In Key, written again by DJ HQ: {n}.",
  retag_failed: "Couldn't write the tags again after Platinum Notes and Mixed In Key ({file}): {error}. Write tags on Prepare for player can do it later.",
  retag_failed_all: "Couldn't write the tags again after Platinum Notes and Mixed In Key: {error}. Write tags on Prepare for player can do it later.",
  pn_no_mark: "Platinum Notes reports it processed this file, but the file doesn't carry its mark. Check that it is set to “Replace original files”.",
  mik_unsupported_format: "Mixed In Key doesn't take this file type.",
  has_key: "Already has a key.",
  marked_done: "Marked as done by you.",
  step_skipped: "Skipped by you.",
  blocked: "Not run, because an earlier step failed for this file.",
  key_from_db: "The key ({key}) came from Mixed In Key's database; the file itself has no key tag.",
  no_key: "No key found, in the file or in Mixed In Key's database.",
  mik_db_unavailable: "Mixed In Key's database couldn't be read for keys: {error}",
  rb_xml_failed: "Couldn't update the rekordbox XML: {error}",
  rb_xml_unreadable: "DJ HQ can't read the rekordbox XML file: {path}.",
  rb_xml_not_rekordbox: "That file isn't a rekordbox XML collection: {path}.",
  rb_xml_malformed: "The rekordbox XML file is damaged, so DJ HQ left it alone: {error}",
  rb_xml_changed: "The rekordbox XML changed while DJ HQ was adding to it (rekordbox or Mixed In Key may have saved it), so nothing was written. Try again.",
  rb_xml_check_failed: "DJ HQ's check of the merged rekordbox XML failed, so nothing was written: {error}",
  rb_xml_name_taken: "The rekordbox XML has a folder named “DJ HQ” at the top level. Rename it in rekordbox, export again, then retry.",
  rb_xml_not_utf8: "The rekordbox XML file has text that isn't stored as UTF-8, so DJ HQ left it alone: {path}. Export it again from rekordbox.",
  rb_xml_in_use: "Another program had the rekordbox XML file open, so nothing was written. Try again in a moment.",
  rb_added: "Added to the rekordbox XML.",
  rb_updated: "Its key in the rekordbox XML was updated ({from} → {to}).",
  rb_listed: "Already in the rekordbox XML; it is in the {playlist} playlist.",
  // job
  interrupted: "DJ HQ was closed while this run was going. Resume it, or dismiss it.",
  cancelled: "Cancelled. Files already moved or tagged stay that way.",
  job_failed: "The run stopped: {error}",
  xml_written: "Updated {file}. Tracks added: {added}. Keys set: {updated}. Tracks in the {playlist} playlist: {entries}. The previous version was saved as {backup}.",
  xml_unchanged: "The rekordbox XML already had everything; it wasn't changed.",
  // what to do in rekordbox afterwards
  rb_untick_key: "In rekordbox, open Preferences > Analysis > Track Analysis Setting and untick KEY, so rekordbox doesn't replace these keys with its own.",
  rb_refresh: "In rekordbox's sidebar, click the refresh icon next to “rekordbox xml”.",
  rb_import: "Open rekordbox xml > Playlists > {playlist}, select all its tracks, right-click and choose Import To Collection.",
  rb_xml_is_import: "This must be the file set in rekordbox under Preferences > Advanced > Database > rekordbox xml (Imported Library); otherwise rekordbox won't see the new tracks.",
};

const fill = (code: string, vars: Record<string, unknown> = {}) =>
  (TEXT[code] || code).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
const APP_NAME: Record<AppId, string> = { pn: "Platinum Notes", mik: "Mixed In Key" };

// ---------------- the job ----------------

export type StepId = "move" | "tag" | "pn" | "mik" | "xml" | "finish";
type FileStep = Exclude<StepId, "finish">;
const STEPS: StepId[] = ["move", "tag", "pn", "mik", "xml", "finish"];
const FILE_STEPS: FileStep[] = ["move", "tag", "pn", "mik", "xml"];
export type ItemState = "pending" | "running" | "waiting" | "ok" | "skipped" | "failed";
export interface Msg { code: string; text: string; vars?: Record<string, unknown>; at?: number; }
export interface ItemStep { state: ItemState; code?: string; text?: string; vars?: Record<string, unknown>; }
export interface Item {
  n: number;
  /** "Artist – Title" */
  label: string;
  /** the download it came from (null: a library file the user also asked to process) */
  source: { file: string; zip: string | null } | null;
  /** library file key and path, once it is in the library */
  key: string | null; path: string | null;
  track_id: number | null;
  steps: Record<FileStep, ItemStep>;
  /** the name needs a look (Check names); listed in the report, never blocks */
  check_name?: boolean;
  /** the musical key used for rekordbox, and where it came from */
  tkey?: string | null; key_source?: "tag" | "mik_db" | null;
  /** the file as it was when Platinum Notes / Mixed In Key got it */
  before_pn?: { mtime: number; pn: boolean | null };
  before_mik?: { mtime: number; key: string | null };
  /** when the file was handed to Platinum Notes / Mixed In Key (not again while the app runs) */
  sent?: { pn?: number; mik?: number };
}
export interface StepRec {
  id: StepId;
  state: "pending" | "running" | "waiting" | "ok" | "skipped" | "failed";
  started?: number; finished?: number;
  /** while waiting: what the user is asked to do (pn_press_start, mik_analysing) */
  wait?: Msg | null;
  /** a failure of the step as a whole (not one file's) */
  error?: Msg | null;
  /** outside apps: was it running before, did DJ HQ start it, what quitting it gave */
  was_running?: boolean; launched?: boolean; quit?: QuitResult | "left_open" | "processing" | null;
  /** when files were last handed to the app; Platinum Notes' run log this step read (written after that) */
  sent_at?: number; log?: string | null;
  /** Platinum Notes: what pressing Start for the user gave (null: not tried); when DJ HQ
   *  clicked it (a press that then started no run is "not_found" again, with this set) */
  pressed?: PressResult | null; clicked?: number | null;
  /** xml: the merge result */
  xml?: { file: string; backup: string | null; added: number; updated: number; existing: number; entries: number } | null;
}
export interface Job {
  id: string; version: 1;
  created: number; updated: number; finished?: number;
  lib: string;
  status: "running" | "waiting" | "done" | "cancelled" | "interrupted" | "failed";
  /** the step being worked on (or where it stopped) */
  step: StepId | null;
  steps: StepRec[];
  items: Item[];
  messages: Msg[];
  options: { include_pending: boolean };
  report?: any;
}

interface Deps {
  apps: ExtApps; enqueue: <T>(fn: () => Promise<T>) => Promise<T>; dataDir: string; pollMs: number;
  /** Electron on macOS: is DJ HQ trusted for Accessibility (prompt: ask macOS to ask the user) */
  axTrusted?: (prompt: boolean) => boolean;
}
let DEPS: Deps;
let JOB: Job | null = null;
let RUNNING = false;
const control: { cancel: boolean; signal: { action: "mark_done" | "skip_step"; step: StepId } | null } = { cancel: false, signal: null };
/** the last press of Start in this session: "not_allowed" with Accessibility granted means
 *  macOS refused the Apple Events to System Events (the Automation consent) */
let LAST_PRESS: PressResult | null = null;
/** Platinum Notes begins its run log the moment Start is pressed: a press with no log after
 *  this long started nothing */
const PRESS_NO_RUN_MS = 15000;
let wakeFn: (() => void) | null = null;

const jobPath = () => path.join(DEPS.dataDir, "pipeline.json");
function save(): void {
  if (!JOB) { try { fs.unlinkSync(jobPath()); } catch { /* none */ } return; }
  JOB.updated = Date.now();
  try { core.writeFileAtomic(jobPath(), JSON.stringify(JOB, null, 1)); }
  catch (e: any) { console.error("pipeline.json could not be saved: " + e.message); }
}
function say(code: string, vars?: Record<string, unknown>): Msg {
  const m: Msg = { code, text: fill(code, vars), ...(vars ? { vars } : {}), at: Date.now() };
  if (JOB) { JOB.messages.push(m); if (JOB.messages.length > 200) JOB.messages.splice(0, JOB.messages.length - 200); }
  return m;
}
const msg = (code: string, vars?: Record<string, unknown>): Msg => ({ code, text: fill(code, vars), ...(vars ? { vars } : {}) });
const setItem = (it: Item, s: FileStep, state: ItemState, code?: string, vars?: Record<string, unknown>) => {
  it.steps[s] = { state, ...(code ? { code, text: fill(code, vars) } : {}), ...(vars ? { vars } : {}) };
};
const stepRec = (id: StepId) => JOB!.steps.find((s) => s.id === id)!;
const sleep = (ms: number) => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(t); if (wakeFn === done) wakeFn = null; resolve(); };
  const t = setTimeout(done, ms);
  wakeFn = done;
});
const wake = () => { if (wakeFn) wakeFn(); };
const errText = (e: any) => String(e?.message || e);
/** an error as the {error} of a message: its english text, plus its code and vars when it has one,
 *  so the ui can say the inner reason in its language too (not when it is the message's own code) */
function errVars(e: any, outer?: string): Record<string, unknown> {
  const code = typeof e?.code === "string" && /^[a-z][a-z0-9_]*$/.test(e.code) && e.code !== outer ? e.code : "";
  return { error: errText(e), ...(code ? { error_code: code, ...(e.vars ? { error_vars: e.vars } : {}) } : {}) };
}

/** Items whose turn it is at this step: not done there yet, and fine in every step before. */
function eligible(s: FileStep): Item[] {
  const i = FILE_STEPS.indexOf(s);
  return JOB!.items.filter((it) => ["pending", "running", "waiting"].includes(it.steps[s].state)
    && FILE_STEPS.slice(0, i).every((p) => it.steps[p].state === "ok" || it.steps[p].state === "skipped"));
}

/** A finished run: a file stopped by a failed step is "not run" in the steps after it, not "to do". */
function markBlocked(): void {
  for (const it of JOB!.items) {
    let stop = false;
    for (const s of FILE_STEPS) {
      if (stop && it.steps[s].state === "pending") setItem(it, s, "skipped", "blocked");
      if (it.steps[s].state === "failed") stop = true;
    }
  }
}

/** Runs the job; never rejects (a failure is in the job, or in the log when even that fails). */
const go = () => { drive().catch((e) => console.error("Do everything: " + errText(e))); };

/** A saved job this version can carry on: anything else (hand-edited, another version's,
 *  cut short) is dropped, never resumed blindly. */
function validJob(j: any): j is Job {
  return !!j && typeof j === "object" && j.version === 1 && typeof j.status === "string" && typeof j.lib === "string"
    && Array.isArray(j.messages) && Array.isArray(j.steps) && Array.isArray(j.items)
    && STEPS.every((id) => j.steps.some((st: any) => st && st.id === id && typeof st.state === "string"))
    && j.items.every((it: any) => it && typeof it === "object" && it.steps && typeof it.steps === "object"
      && FILE_STEPS.every((s) => it.steps[s] && typeof it.steps[s].state === "string"));
}

// ---------------- setup ----------------

export function init(deps: Deps): void {
  DEPS = deps;
  try {
    JOB = JSON.parse(fs.readFileSync(jobPath(), "utf8"));
    if (validJob(JOB)) {
      if (JOB.status === "running" || JOB.status === "waiting") {
        JOB.status = "interrupted";
        for (const it of JOB.items) for (const s of FILE_STEPS) if (it.steps[s].state === "running") it.steps[s].state = "pending";
        for (const st of JOB.steps) if (st.state === "running") st.state = "pending";
        say("interrupted");
        save();
      }
    } else JOB = null;
  } catch { JOB = null; }
  // refresh Platinum Notes' output mode in the background (the view only reads what was last seen)
  const d = core.doAllStatus().do_all;
  if (d.pn_app) deps.apps.readPnOutputMode().then((m) => deps.enqueue(async () => core.setPnMode(m))).catch(() => {});
}

/** Checks a do_all settings patch that can't be done cheaply in core (the app bundles). */
export async function checkSettingsPatch(p: any): Promise<void> {
  if (!p || typeof p !== "object") return;
  // every path the way patchDoAll stores it (quotes off, ~ expanded, absolute), so both
  // checks see the same one
  for (const f of ["pn_app", "mik_app", "mik_db", "rb_xml"]) if (f in p && p[f] != null) p[f] = core.typedPath(p[f]);
  for (const [field, app] of [["pn_app", "pn"], ["mik_app", "mik"]] as const) {
    const v = String(p[field] ?? "");
    if (!v) continue;
    const r = await DEPS.apps.validate(app, v);
    if (!r.ok) throw core.appError(r.code || "app_wrong", fill(r.code || "app_wrong", { path: v, app: APP_NAME[app] }), { field, path: v, app: APP_NAME[app] });
  }
}

/** POST /api/do-all/detect: what the setup wizard needs, found on this computer. Reads
 *  only (bundles, preferences, settings files, the database read-only); opens no app. */
export async function detect(): Promise<any> {
  const a = DEPS.apps;
  const d = core.doAllStatus().do_all;
  const [pn, mik, mode, dbs, xmls] = await Promise.all([
    a.detect("pn").catch(() => []), a.detect("mik").catch(() => []), a.readPnOutputMode().catch(() => "unknown" as PnMode),
    a.findMikDb().catch(() => []), a.suggestRekordboxXml().catch(() => [])]);
  const dbPath = d.mik_db || dbs[0] || "";
  const db = dbPath ? await a.checkMikDb(dbPath).catch(() => ({ ok: false, code: "mik_db_unreadable" })) : null;
  const cur = async (app: AppId, p: string) => p ? await a.validate(app, p).catch(() => ({ ok: false, code: "app_unreadable" })) : null;
  await DEPS.enqueue(async () => core.setPnMode(mode));
  return {
    platform: a.platform,
    apps: {
      pn: { candidates: pn, current: d.pn_app || null, current_check: await cur("pn", d.pn_app) },
      mik: { candidates: mik, current: d.mik_app || null, current_check: await cur("mik", d.mik_app) },
    },
    pn_mode: mode,
    mik_db: { candidates: dbs, path: dbPath || null, check: db },
    rb_xml: { suggestions: xmls, current: d.rb_xml || null, current_exists: !!d.rb_xml && fs.existsSync(d.rb_xml) },
    pn_log_dir: a.pnLogDir(),
    setup: core.doAllStatus(),
  };
}

/** POST /api/do-all/access {prompt?}: may DJ HQ press Start in Platinum Notes for the
 *  user (macOS). With prompt: ask macOS to ask the user (Electron's own prompt the first
 *  time), else open the matching list in System Settings. "unsupported" elsewhere. */
export async function accessibility(data: any): Promise<{ platform: string; state: UiAccess | "unsupported" }> {
  const a = DEPS.apps;
  if (!a.pressStart || !a.uiAccess) return { platform: a.platform, state: "unsupported" };
  const prompt = !!data?.prompt;
  let state: UiAccess;
  if (DEPS.axTrusted) {
    // the app's own flag first: the probe below would show macOS' Automation prompt,
    // which only a press of the button should do
    if (!DEPS.axTrusted(prompt)) return { platform: a.platform, state: "missing" };
    // without a probe, a press macOS refused since says what the flag can't
    state = prompt ? await a.uiAccess().catch(() => "unknown" as UiAccess) : LAST_PRESS === "not_allowed" ? "automation" : "granted";
    if (prompt && state === "granted") LAST_PRESS = null;
  } else {
    state = await a.uiAccess().catch(() => "unknown" as UiAccess);
    if (prompt && state === "missing" && a.openPrivacy) await a.openPrivacy("accessibility").catch(() => {});
  }
  if (prompt && state === "automation" && a.openPrivacy) await a.openPrivacy("automation").catch(() => {});
  return { platform: a.platform, state };
}

// ---------------- starting ----------------

/** What a run would do now, with what keeps it from starting (codes). */
async function plan(includePending: boolean) {
  return DEPS.enqueue(async () => {
    const lib = core.activeLib();
    if (!lib || !lib.playlist) return { lib: null, moves: [], pending: [] as core.BatchFile[], away: null };
    // an unplugged drive: nothing could be moved there
    if (core.folderTrouble(lib.dir)) return { lib: lib.id, moves: [], pending: [] as core.BatchFile[], away: lib.dir };
    const moves = await core.inboxMovePlan();
    let pending: core.BatchFile[] = [];
    if (includePending) {
      // not the downloads themselves, nor the file a download replaces (it goes to the backup folder)
      const names = new Set(moves.map((m) => path.basename(m.file)));
      const tracks = new Set(moves.map((m) => m.id));
      pending = (await core.batchInfo(await core.unprocessedFiles())).filter((f) => !names.has(f.key) && !(f.track_id != null && tracks.has(f.track_id)));
    }
    return { lib: lib.id, moves, pending, away: null as string | null };
  });
}

/** What keeps the rekordbox XML from taking the run's tracks, checked before anything
 *  is moved (a merge with a made-up track, in memory). */
function xmlBlocker(file: string): Msg | null {
  if (!file || !fs.existsSync(file)) return null;   // the setup gaps say that already
  try { checkXmlFile(file); return null; }
  catch (e: any) {
    const code = typeof e?.code === "string" && /^rb_xml_[a-z_]+$/.test(e.code) ? e.code : "rb_xml_failed";
    return msg(code, { ...errVars(e, code), path: file });
  }
}

function blockers(): string[] {
  const s = core.doAllStatus();
  const out: string[] = [];
  if (!s.do_all.on) out.push("do_all_off");
  out.push(...s.do_all_missing);
  if (JOB && (RUNNING || ["running", "waiting", "interrupted"].includes(JOB.status))) out.push("job_active");
  return out;
}

/** POST /api/do-all/start {preview?: true, include_pending?: boolean}. With preview: what
 *  would happen, changing nothing. Without: starts the job (refused with a code when
 *  something is missing) and returns the status. */
export async function start(data: any): Promise<any> {
  const d = core.doAllStatus().do_all;
  const includePending = "include_pending" in (data || {}) ? !!data.include_pending : d.include_pending;
  // Platinum Notes' output mode is read fresh every time (it can be changed in the app)
  if (d.pn_app) {
    const mode = await DEPS.apps.readPnOutputMode().catch(() => "unknown" as PnMode);
    await DEPS.enqueue(async () => core.setPnMode(mode));
  }
  const p = await plan(includePending);
  const block = blockers();
  // blockers that come with details
  const extra: Record<string, Msg> = {};
  if (!p.lib) block.push("no_library");
  if (p.away) { block.push("library_away"); extra.library_away = msg("library_away", { path: p.away }); }
  else if (p.lib && !p.moves.length && !p.pending.length) block.push("nothing_to_do");
  if (!block.some((c) => c.startsWith("rb_xml_"))) {
    const x = xmlBlocker(d.rb_xml);
    if (x) { block.push(x.code); extra[x.code] = x; }
  }
  if (data?.preview) {
    return {
      preview: true, include_pending: includePending,
      moves: p.moves.length, pending: p.pending.length,
      move_files: p.moves.map((m) => ({ file: m.file, zip: m.zip, id: m.id, label: `${m.artist} – ${m.title}`, action: m.action })),
      pending_files: p.pending.map((f) => ({ key: f.key, label: `${f.artist} – ${f.title}`, pn: f.pn, key_tag: f.tkey, check_name: f.check_name })),
      // which files each app takes (by extension), so the dialog can say how many go where
      accepts: { pn: DEPS.apps.accepts("pn"), mik: DEPS.apps.accepts("mik") },
      blockers: block.map((c) => extra[c] || msg(c)), setup: core.doAllStatus(),
    };
  }
  if (block.length) throw core.appError(block[0], extra[block[0]]?.text || fill(block[0]), { blockers: block, ...(extra[block[0]]?.vars || {}) });
  const pend = (): Record<FileStep, ItemStep> => ({ move: { state: "pending" }, tag: { state: "pending" }, pn: { state: "pending" }, mik: { state: "pending" }, xml: { state: "pending" } });
  const items: Item[] = [];
  for (const m of p.moves)
    items.push({ n: items.length + 1, label: `${m.artist} – ${m.title}`, source: { file: m.file, zip: m.zip }, key: null, path: null, track_id: m.id, steps: pend() });
  for (const f of p.pending) {
    const it: Item = { n: items.length + 1, label: `${f.artist} – ${f.title}`, source: null, key: f.key, path: f.path, track_id: f.track_id, steps: pend() };
    setItem(it, "move", "skipped", "in_library");
    items.push(it);
  }
  const now = Date.now();
  JOB = { id: now.toString(36), version: 1, created: now, updated: now, lib: p.lib!, status: "running", step: null,
          steps: STEPS.map((id) => ({ id, state: "pending" })), items, messages: [], options: { include_pending: includePending } };
  save();
  go();
  return status();
}

/** GET /api/do-all/status: the job as it is (never builds the view). */
export function status(): any {
  return { job: JOB, active: RUNNING, setup: core.doAllStatus() };
}

/** POST /api/do-all/control {action, step?}: cancel | mark_done | skip_step | retry_failed |
 *  resume | dismiss. mark_done and skip_step name the step they mean (a stale click on
 *  a step that has moved on is refused with step_changed). resume: an interrupted or
 *  cancelled run; retry_failed: every failed file (and a step that failed as a whole)
 *  again; skip_step on a stopped run: go on without that step. */
export async function controlJob(data: any): Promise<any> {
  const action = String(data?.action || "");
  const step = String(data?.step || "") as StepId;
  if (!JOB) throw core.appError("not_now", fill("not_now"));
  const cur = JOB.step ? stepRec(JOB.step) : null;
  switch (action) {
    case "cancel":
      if (RUNNING) { control.cancel = true; wake(); }
      else if (["interrupted", "failed"].includes(JOB.status)) { JOB.status = "cancelled"; say("cancelled"); buildReport(); save(); }
      else throw core.appError("not_now", fill("not_now"));
      break;
    case "mark_done": case "skip_step":
      if (!STEPS.includes(step) || JOB.step !== step) throw core.appError("step_changed", fill("step_changed"));
      if (RUNNING && cur && cur.state === "waiting") { control.signal = { action, step }; wake(); break; }
      if (!RUNNING && action === "skip_step" && cur && ["failed", "pending", "waiting"].includes(cur.state) && step !== "finish") {
        // a step that stopped the run (or was waiting when DJ HQ closed): skip it, go on
        for (const it of JOB.items) if (["pending", "running", "waiting", "failed"].includes(it.steps[step as FileStep].state)) setItem(it, step as FileStep, "skipped", "step_skipped");
        cur.state = "skipped"; cur.error = null; cur.wait = null; cur.finished = Date.now();
        save();
        // an app DJ HQ opened for this step is closed (or the user told) as after a wait
        if ((step === "pn" || step === "mik") && cur.launched && !cur.quit) await closeApp(step, cur);
        // what Mixed In Key finished meanwhile lost DJ HQ's names, as after a wait
        if (step === "mik") await retagAfterApps();
        go();
        break;
      }
      throw core.appError("not_now", fill("not_now"));
    case "retry_failed":
      if (RUNNING) throw core.appError("not_now", fill("not_now"));
      for (const it of JOB.items) for (const s of FILE_STEPS) if (it.steps[s].state === "failed" || it.steps[s].code === "blocked") {
        it.steps[s] = { state: "pending" };
        if (s === "pn") delete it.before_pn;
        if (s === "mik") delete it.before_mik;
        if ((s === "pn" || s === "mik") && it.sent) delete it.sent[s];
      }
      for (const st of JOB.steps) if (st.state === "failed") { st.state = "pending"; st.error = null; }
      save();
      go();
      break;
    case "resume":   // a failed run goes on with retry_failed (or skip_step) instead
      if (RUNNING || !["interrupted", "cancelled"].includes(JOB.status)) throw core.appError("not_now", fill("not_now"));
      go();
      break;
    case "dismiss":
      if (RUNNING) throw core.appError("not_now", fill("not_now"));
      JOB = null;
      save();
      break;
    default:
      throw core.appError("bad_request", fill("bad_request"));
  }
  return status();
}

// ---------------- running ----------------

async function drive(): Promise<void> {
  if (RUNNING || !JOB) return;
  RUNNING = true;
  control.cancel = false; control.signal = null;
  const job = JOB;
  job.status = "running";
  delete job.finished;
  save();
  try {
    for (const id of STEPS) {
      if (control.cancel) break;
      const st = stepRec(id);
      if (id !== "finish" && !eligible(id as FileStep).length) {
        // nothing (left) to do here: done before, or every file stopped at an earlier step
        if (st.state !== "ok" && st.state !== "skipped") { st.state = "ok"; st.wait = null; st.finished = st.finished || Date.now(); }
        continue;
      }
      job.step = id;
      st.started = st.started || Date.now();
      st.error = null;
      if (st.state !== "waiting") st.state = "running";
      save();
      if (id !== "finish" && job.lib !== core.activeLib()?.id) { failStep(st, "library_changed"); break; }
      if (id === "move") await stepMove(st);
      else if (id === "tag") await stepTag(st);
      else if (id === "pn") await stepApp("pn", st);
      else if (id === "mik") await stepApp("mik", st);
      else if (id === "xml") await stepXml(st);
      else { markBlocked(); buildReport(); st.state = "ok"; }
      if (control.cancel) break;
      if (st.state === "running") st.state = "ok";
      st.finished = Date.now();
      save();
      if ((st.state as string) === "failed") break;
    }
    if (control.cancel) {
      job.status = "cancelled";
      for (const st of job.steps) if (st.state === "running" || st.state === "waiting") { st.state = "pending"; st.wait = null; }
      for (const it of job.items) for (const s of FILE_STEPS) if (it.steps[s].state === "running" || it.steps[s].state === "waiting") it.steps[s].state = "pending";
      say("cancelled");
      buildReport();
    } else if (job.steps.some((s) => s.state === "failed")) {
      job.status = "failed";
      buildReport();
    } else {
      job.status = "done";
      job.finished = Date.now();
    }
  } catch (e: any) {
    job.status = "failed";
    try {
      const st = job.step ? stepRec(job.step) : null;
      if (st) { st.state = "failed"; st.error = msg("job_failed", errVars(e)); }
      say("job_failed", errVars(e));
      buildReport();
    } catch (e2: any) { console.error("Do everything: " + errText(e2)); }
  } finally {
    RUNNING = false;
    control.cancel = false; control.signal = null;
    if (JOB === job) save();
  }
}

function failStep(st: StepRec, code: string, vars?: Record<string, unknown>): void {
  st.state = "failed";
  st.error = say(code, vars);
}

/** One file operation in the queue, in the library the run started in: checked in the
 *  same queue turn, so a switch of library in between never sends a file to the other one. */
const inLib = <T>(fn: () => Promise<T>): Promise<T> => DEPS.enqueue(async () => {
  if (!JOB || core.activeLib()?.id !== JOB.lib) throw core.appError("library_changed", fill("library_changed"));
  return fn();
});
const libChanged = (e: any) => e?.code === "library_changed";

/** 1. Move the matched downloads into the library, one file per queue turn. */
async function stepMove(st: StepRec): Promise<void> {
  const lib = core.activeLib()!;
  for (const it of eligible("move")) {
    if (control.cancel) return;
    if (!it.source) { setItem(it, "move", "skipped", "in_library"); continue; }
    setItem(it, "move", "running");
    save();
    const name = path.basename(it.source.file);
    try {
      const r = await inLib(() => core.inboxMoveOne({ file: it.source!.file, id: it.track_id ?? undefined, zip: it.source!.zip || undefined }));
      it.key = r.key; it.path = r.path;
      setItem(it, "move", "ok");
    } catch (e: any) {
      if (libChanged(e)) { setItem(it, "move", "pending"); return failStep(st, "library_changed"); }
      // a move that went through before a restart (or auto-move took it first): the file is
      // in the library, and the download is gone, or (a zip, which stays) the file is pinned
      // to this track
      const dst = path.join(lib.dir, name);
      const src = path.join(core.getSettings().inbox_dir, it.source.zip || name);
      const pinned = it.track_id != null && core.STATE.assigned[String(it.track_id)] === name;
      if (fs.existsSync(dst) && (it.source.zip ? pinned : !fs.existsSync(src))) { it.key = name; it.path = dst; setItem(it, "move", "ok"); }
      else setItem(it, "move", "failed", "move_failed", { file: name, ...errVars(e) });
    }
    save();
  }
  st.state = "ok";
}

/** 2. Tag the batch (only files whose tags don't say the right names yet). */
async function stepTag(st: StepRec): Promise<void> {
  const todo = eligible("tag");
  let files: core.BatchFile[];
  try { files = await inLib(() => core.batchInfo(todo.map((i) => i.key!).filter(Boolean))); }
  catch (e: any) { if (libChanged(e)) return failStep(st, "library_changed"); throw e; }
  const info = new Map(files.map((f) => [f.key, f]));
  for (const it of todo) {
    if (control.cancel) return;
    const f = it.key ? info.get(it.key) : undefined;
    if (!f) { setItem(it, "tag", "failed", "file_gone"); continue; }
    it.path = f.path; it.check_name = f.check_name; it.track_id = it.track_id ?? f.track_id;
    it.label = `${f.artist} – ${f.title}`;
    if (f.tagged) { setItem(it, "tag", "skipped", "already_tagged"); continue; }
    setItem(it, "tag", "running");
    save();
    try {
      await inLib(() => core.tagFile(f.key, f.artist, f.title, f.genre));
      setItem(it, "tag", "ok");
    } catch (e: any) {
      if (libChanged(e)) { setItem(it, "tag", "pending"); return failStep(st, "library_changed"); }
      setItem(it, "tag", "failed", "tag_failed", errVars(e));
    }
    save();
  }
  st.state = "ok";
}

const ID3_TYPES = [".wav", ".mp3", ".aif", ".aiff"];   // where readKeyInfo finds the key
const mtimeOf = (p: string) => { try { return fs.statSync(p).mtimeMs; } catch { return -1; } };

/** Platinum Notes' newest run log of a run started after `since` (the hand-over): its file
 *  name starts with the run's UTC start time, in whole seconds ("2026-11-15T23:02:32Z Run
 *  1.log"; the run number is always 1), and the file itself was written after `since`.
 *  Gives each finished file's result by its input path and by file-name stem, and
 *  whether the run is over (the last line ends in "Processing finished"). A result with
 *  error = 1 and resultPath "<null>" is a file Platinum Notes didn't process: one that
 *  already carries its mark (it says "Already Processed"), or a real failure. */
function pnLog(since: number): { name: string; finished: boolean; results: Map<string, { ok: boolean }> } | null {
  const dir = DEPS.apps.pnLogDir();
  if (!dir) return null;
  let best: { name: string; t: number } | null = null;
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  for (const n of names) {
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\b.*\.log$/.exec(n);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (t < since - 1000 || (best && t <= best.t)) continue;   // the name's time is cut to the second
    if (mtimeOf(path.join(dir, n)) < since) continue;
    best = { name: n, t };
  }
  if (!best) return null;
  let text = "";
  try { text = fs.readFileSync(path.join(dir, best.name), "utf8"); } catch { return null; }
  const results = new Map<string, { ok: boolean }>();
  const re = /Finished File '(.*)' \{([\s\S]*?)\n\}/g;
  for (let m; (m = re.exec(text));) {
    const field = (k: string) => new RegExp("^\\s*" + k + ' = "?(.*?)"?;\\s*$', "m").exec(m![2])?.[1] ?? "";
    const result = field("resultPath"), error = field("error");
    const r = { ok: !!result && result !== "<null>" && (error === "" || error === "0") };
    results.set(stemKey(m[1]), r);
    const input = field("path");
    if (input) results.set(samePathKey(input), r);
  }
  return { name: best.name, finished: /Processing finished\s*$/.test(text.trimEnd()), results };
}
const stemKey = (name: string) => samePathKey(path.basename(name).replace(/\.[^.]+$/, ""));

/** 3./4. Hand the batch to Platinum Notes or Mixed In Key, wait for the files to show
 *  the result, quit the app if this step started it. */
async function stepApp(app: AppId, st: StepRec): Promise<void> {
  const s: FileStep = app;
  const a = DEPS.apps;
  const set = core.doAllStatus().do_all;
  const appPath = app === "pn" ? set.pn_app : set.mik_app;
  const v: { ok: boolean; code?: string; err?: any } = await a.validate(app, appPath).catch((e) => ({ ok: false, err: e }));
  if (!v.ok && v.err) return failStep(st, app + "_app_invalid", errVars(v.err));
  if (!v.ok) {
    const code = v.code || "app_wrong", vars = { path: appPath, app: APP_NAME[app] };
    return failStep(st, app + "_app_invalid", { error: fill(code, vars), error_code: code, error_vars: vars });
  }
  if (app === "pn") {
    const mode = await a.readPnOutputMode().catch(() => "unknown" as PnMode);
    await DEPS.enqueue(async () => core.setPnMode(mode));
    if (mode === "other") return failStep(st, "pn_mode_wrong");
    if (mode === "unknown" && !set.pn_replace_confirmed) return failStep(st, "pn_mode_unknown");
  }
  // who goes: supported types, not done before
  const batch: Item[] = [];
  for (const it of eligible(s)) {
    if (!it.path || !fs.existsSync(it.path)) { setItem(it, s, "failed", "file_gone"); continue; }
    if (!a.accepts(app).includes(path.extname(it.path).toLowerCase())) { setItem(it, s, "skipped", app + "_unsupported_format"); continue; }
    const k = readKeyInfo(it.path);
    if (app === "pn") {
      if (!it.before_pn && k.pn === true) { setItem(it, s, "skipped", "already_processed"); continue; }
      it.before_pn = it.before_pn || { mtime: mtimeOf(it.path), pn: k.pn };
    } else {
      // a key already there: done at once (Mixed In Key doesn't rewrite a file it knows,
      // so there would be nothing to wait for)
      if (!it.before_mik && k.key) { setItem(it, s, "skipped", "has_key"); it.tkey = k.key; it.key_source = "tag"; continue; }
      it.before_mik = it.before_mik || { mtime: mtimeOf(it.path), key: k.key };
    }
    batch.push(it);
  }
  // FLAC/M4A carry no key DJ HQ can read, and Mixed In Key doesn't rewrite a file it knows:
  // one that has a key in its database is done at once, like a file with a key tag
  if (app === "mik") {
    const fresh = batch.filter((it) => !ID3_TYPES.includes(path.extname(it.path!).toLowerCase()) && !it.sent?.mik);
    const db = core.doAllStatus().do_all.mik_db;
    if (fresh.length && db) {
      let known = new Map<string, string>();
      try { known = (await a.readMikKeys(db, fresh.map((it) => it.path!))) || new Map(); } catch {}
      for (const it of fresh) {
        const k = known.get(it.path!);
        if (!k) continue;
        setItem(it, s, "skipped", "key_from_db", { key: k }); it.tkey = k; it.key_source = "mik_db";
        batch.splice(batch.indexOf(it), 1);
      }
    }
  }
  save();
  if (batch.length) await waitForApp(app, st, appPath, batch);
  if (control.cancel || (st.state as string) === "failed") return;
  if (app === "mik") { await keysAfterMik(batch); await retagAfterApps(); }
  if (st.state === "running" || st.state === "waiting") st.state = "ok";
}

/** Is this file done by the app? `last` holds the previous poll's mtime: a file still
 *  being written isn't done until its mtime holds still for one poll. */
function fileDone(app: AppId, it: Item, last: Map<number, number>): boolean {
  const m = mtimeOf(it.path!);
  const settled = last.get(it.n) === m;
  last.set(it.n, m);
  if (m < 0 || !settled) return false;
  return doneCheck(app, it, m);
}
/** The same without waiting for the file to settle: for files the app had before DJ HQ
 *  looked away (closed, cancelled), when the app may have finished them meanwhile. */
function doneNow(app: AppId, it: Item): boolean {
  const m = mtimeOf(it.path!);
  return m >= 0 && doneCheck(app, it, m);
}
function doneCheck(app: AppId, it: Item, m: number): boolean {
  const k = readKeyInfo(it.path!);
  if (app === "pn") {
    // the mark is the signal (Platinum Notes writes it into every file it processed,
    // tagged or not); formats where it can't be read (m4a) count by the changed file
    return k.pn === null ? m !== it.before_pn!.mtime : k.pn === true;
  }
  // FLAC/M4A: DJ HQ reads no key from these (no ID3), so the rewritten file has to do;
  // the key then comes from Mixed In Key's database
  if (!ID3_TYPES.includes(path.extname(it.path!).toLowerCase())) return m !== it.before_mik!.mtime;
  return !!k.key;
}

async function waitForApp(app: AppId, st: StepRec, appPath: string, batch: Item[]): Promise<void> {
  const a = DEPS.apps;
  const s: FileStep = app;
  // null: the check failed or timed out. Taken as running: an app the user may have open
  // is never quit, and files it may hold are not sent again
  const probe = await a.isRunning(app, appPath).catch(() => null);
  const running = probe !== false;
  // files the app finished while DJ HQ wasn't watching are not handed over again
  for (const it of batch) if (it.sent?.[app] && it.steps[s].state !== "ok" && doneNow(app, it)) setItem(it, s, "ok");
  const open = batch.filter((it) => it.steps[s].state !== "ok");
  // after a resume the app may still hold the files it was given: only new ones go then;
  // an app that isn't running (any more) gets the rest
  const send = running ? open.filter((it) => !it.sent?.[app]) : open;
  // whether DJ HQ started the app is decided again at every hand-over: an app the user
  // opened in between (to look at a failed file, say) is theirs, and stays open
  if (send.length || probe !== true) { st.was_running = running; st.launched = false; }
  for (let i = 0; i < send.length; i += 200) {
    const part = send.slice(i, i + 200);
    try {
      await a.openWithFiles(app, appPath, part.map((it) => it.path!));
    } catch (e: any) {
      save();
      return failStep(st, "app_open_failed", { app: APP_NAME[app], ...errVars(e, "app_open_failed") });
    }
    // recorded per delivered batch: a later batch that fails leaves these as they are
    if (probe === false) st.launched = true;
    const now = Date.now();
    for (const it of part) it.sent = { ...(it.sent || {}), [app]: now };
    st.sent_at = now;
    st.pressed = null; st.clicked = null;
    save();
  }
  const since = st.sent_at || st.started || Date.now();
  for (const it of open) setItem(it, s, "waiting");
  st.state = "waiting";
  JOB!.status = "waiting";
  // Platinum Notes waits for its Start button. Pressed for the user only when asked to
  // (Settings), in a copy DJ HQ just started with these files (one the user had open may
  // hold other files of theirs); anything in the way leaves it to the user
  const pressing = app === "pn" && send.length > 0 && probe === false && core.doAllStatus().do_all.press_start && !!a.pressStart;
  // A press runs beside the wait, never in its way: Mark as done, Skip and Cancel are seen at
  // once, and stop a press that hasn't clicked yet (a click after them would start a run the
  // user just turned down, or one DJ HQ then asks to quit)
  let pressEnd = false;
  const stopPress = () => pressEnd || control.cancel || (!!control.signal && control.signal.step === app);
  let pressing_: Promise<void> | null = null;
  let pressedAt = 0, clickedAt = 0, pressedChanged = false;
  const press = (opts: { ms: number; quiet?: boolean }) => {
    pressing_ = (async () => {
      let r: PressResult;
      if (DEPS.axTrusted && !DEPS.axTrusted(false)) r = "not_allowed";
      else {
        r = await a.pressStart!(appPath, send.map((it) => it.path!), { ...opts, stop: stopPress }).catch(() => "failed" as PressResult);
        if (r === "pressed" || r === "not_allowed") LAST_PRESS = r;
      }
      if (r === "stopped") return;
      st.pressed = r; pressedAt = Date.now(); pressedChanged = true;
      if (r === "pressed") st.clicked = clickedAt = Date.now();
    })().finally(() => { pressing_ = null; });
  };
  const codeNow = () => app === "mik" ? "mik_analysing" : pressing_ && !st.pressed ? "pn_pressing" : st.pressed === "pressed" ? "pn_processing" : "pn_press_start";
  if (pressing) press({ ms: 30000 });
  let waitCode = codeNow();
  st.wait = msg(waitCode, { done: 0, total: batch.length });
  save();
  const last = new Map<number, number>();
  let signal: typeof control.signal = null;
  for (;;) {
    if (control.cancel) break;
    if (control.signal && control.signal.step === app) { signal = control.signal; control.signal = null; pressEnd = true; }
    let changed = false;
    const log = app === "pn" ? pnLog(since) : null;
    if (log && st.log !== log.name) { st.log = log.name; changed = true; }
    // Start was pressed, but no run began (its log is made the moment it starts): a dialog
    // or sheet may be in the way. The user is asked to look, and DJ HQ doesn't click again
    if (pressing && !log && st.pressed === "pressed" && clickedAt && Date.now() - clickedAt > PRESS_NO_RUN_MS) {
      st.pressed = "not_found"; changed = true;
    }
    // the button couldn't be pressed yet (no window: the screen was locked, say): try
    // again now and then, quietly, until a run has begun (its log), by whoever
    if (pressing && !pressing_ && !clickedAt && !log && st.pressed && st.pressed !== "pressed" && st.pressed !== "not_allowed" && Date.now() - pressedAt > 10000)
      press({ ms: 0, quiet: true });
    if (pressedChanged) { pressedChanged = false; changed = true; }
    if (codeNow() !== waitCode) { waitCode = codeNow(); changed = true; }
    for (const it of batch) {
      if (it.steps[s].state !== "waiting") continue;
      if (fileDone(app, it, last)) { setItem(it, s, "ok"); changed = true; continue; }
      // the run is over: what Platinum Notes says about a file it didn't mark
      const r = log?.finished ? log.results.get(samePathKey(it.path!)) || log.results.get(stemKey(it.path!)) : undefined;
      if (!r) continue;
      if (doneNow(app, it)) setItem(it, s, "ok", r.ok ? undefined : "already_processed");
      // a format whose mark DJ HQ can't read (m4a), left untouched: most likely one it had
      // processed before ("Already Processed"), which can't be told apart from a failure
      else if (!r.ok && readKeyInfo(it.path!).pn === null) setItem(it, s, "skipped", "pn_left_as_is");
      else setItem(it, s, "failed", r.ok ? "pn_no_mark" : "pn_file_failed");
      changed = true;
    }
    const left = batch.filter((it) => it.steps[s].state === "waiting");
    if (signal) {
      for (const it of left) {
        if (signal.action === "skip_step") setItem(it, s, "skipped", "step_skipped");
        else setItem(it, s, "ok", "marked_done");
      }
      break;
    }
    if (!left.length) break;
    const done = batch.length - left.length;
    if (changed || st.wait?.vars?.done !== done) { st.wait = msg(waitCode, { done, total: batch.length }); save(); }
    await sleep(DEPS.pollMs);
  }
  pressEnd = true;
  if (pressing_) await pressing_;   // stops before its click, within a moment
  st.wait = null;
  if (control.cancel) return;   // the app is left as it is: it may still be working on the files
  JOB!.status = "running";
  if (signal?.action === "skip_step") st.state = "skipped";
  save();
  // every file done: Platinum Notes writes the end of its log a moment later; a step the
  // user ended may leave it in the middle of a run, which nothing waits for
  await closeApp(app, st, signal ? 0 : 30000);
}

/** Is Platinum Notes idle after this step: no run started since the hand-over (no log;
 *  the log is begun when Start is pressed), its newest log says "Processing finished",
 *  or the app is gone. Waits up to `ms` for that. True where no log can be read
 *  (Windows): there the files alone decide. */
async function pnIdle(st: StepRec, appPath: string, ms: number): Promise<boolean> {
  if (!DEPS.apps.pnLogDir()) return true;
  // DJ HQ pressed Start: the run's log may not be there yet, so no log isn't idle at once
  const until = Date.now() + ms, logUntil = Date.now() + (st.pressed === "pressed" ? PRESS_NO_RUN_MS : 0);
  for (;;) {
    const log = pnLog(st.sent_at || st.started || 0);
    if (!log && Date.now() < logUntil) { await new Promise((r) => setTimeout(r, Math.min(DEPS.pollMs, 1000))); continue; }
    if (!log || log.finished) return true;
    if ((await DEPS.apps.isRunning("pn", appPath).catch(() => null)) === false) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, Math.min(DEPS.pollMs, 1000)));
  }
}

/** Close the app after its step, but only if this run started it; or say it was left open.
 *  Platinum Notes is only asked once its run is over (`waitMs` for that): asked while
 *  it processes, it puts up a "really quit?" dialog and goes on. */
async function closeApp(app: AppId, st: StepRec, waitMs = 0): Promise<void> {
  const set = core.doAllStatus().do_all;
  const appPath = app === "pn" ? set.pn_app : set.mik_app;
  if (st.launched && set.close_apps) {
    if (app === "pn" && !(await pnIdle(st, appPath, waitMs))) { st.quit = "processing"; say("app_still_processing", { app: APP_NAME[app] }); }
    else {
      st.quit = await DEPS.apps.quit(app, appPath).catch(() => "failed" as QuitResult);
      if (st.quit !== "closed") say("app_still_open", { app: APP_NAME[app] });
    }
  } else if (st.was_running) { st.quit = "left_open"; say("app_left_open", { app: APP_NAME[app] }); }
  save();
}

/** A WAV that went through Platinum Notes and then Mixed In Key comes out with only Mixed
 *  In Key's tags: its title (the file name) and key, without DJ HQ's artist and genre
 *  (seen in the live test; MP3s and a WAV that skipped Platinum Notes keep them). So
 *  after Mixed In Key the names are written again wherever they no longer say the right
 *  thing; the key, Mixed In Key's data and Platinum Notes' mark stay. A failure is only
 *  reported: the file still goes on, and Write tags on Prepare can do it later. */
async function retagAfterApps(): Promise<void> {
  // a file the user stopped waiting for (Mark as done, Skip) while Mixed In Key stays open
  // may still be written by it: left alone
  const mikOpen = stepRec("mik").quit !== "closed";
  const done = JOB!.items.filter((it) => it.key && it.steps.mik.state !== "failed" && it.steps.mik.state !== "pending"
    && !(mikOpen && (it.steps.mik.code === "marked_done" || it.steps.mik.code === "step_skipped"))
    && (it.steps.pn.state === "ok" || it.steps.mik.state === "ok"));
  if (!done.length) return;
  let n = 0;
  try {
    const files = await inLib(() => core.batchInfo(done.map((it) => it.key!)));
    for (const f of files) {
      if (control.cancel) return;
      if (f.tagged) continue;
      try { await inLib(() => core.tagFile(f.key, f.artist, f.title, f.genre)); n++; }
      catch (e: any) { say("retag_failed", { file: f.key, ...errVars(e) }); }
    }
  } catch (e: any) { say("retag_failed_all", errVars(e)); }
  if (n) say("retagged", { n });
  save();
}

/** After Mixed In Key: the key each file carries; for a file without a key tag, the
 *  one Mixed In Key keeps in its database (read-only), when there is one. */
async function keysAfterMik(batch: Item[]): Promise<void> {
  const noKey: Item[] = [];
  for (const it of JOB!.items) {
    if (!it.path || it.steps.mik.state === "failed" || it.steps.mik.state === "pending") continue;
    if (!batch.includes(it) && it.tkey !== undefined) continue;
    const k = readKeyInfo(it.path).key;
    if (k) { it.tkey = k; it.key_source = "tag"; } else noKey.push(it);
  }
  if (!noKey.length) return;
  const db = core.doAllStatus().do_all.mik_db;
  let found = new Map<string, string>();
  if (db) {
    try { found = (await DEPS.apps.readMikKeys(db, noKey.map((i) => i.path!))) || new Map(); }
    catch (e: any) { say("mik_db_unavailable", errVars(e, "mik_db_unavailable")); }
  }
  for (const it of noKey) {
    const k = found.get(it.path!);
    if (k) { it.tkey = k; it.key_source = "mik_db"; it.steps.mik = { ...it.steps.mik, code: "key_from_db", text: fill("key_from_db", { key: k }), vars: { key: k } }; }
    else { it.tkey = null; it.key_source = null; it.steps.mik = { ...it.steps.mik, code: "no_key", text: fill("no_key") }; }
  }
  save();
}

/** 5. Merge the batch into the user's rekordbox XML, in one queue turn. */
async function stepXml(st: StepRec): Promise<void> {
  const file = core.doAllStatus().do_all.rb_xml;
  const todo = eligible("xml");
  if (!file) { for (const it of todo) setItem(it, "xml", "failed", "rb_xml_missing"); return failStep(st, "rb_xml_missing"); }
  if (!todo.length) { st.state = "ok"; return; }
  for (const it of todo) setItem(it, "xml", "running");
  save();
  let w: XmlWrite;
  try {
    w = await inLib(async () => {
      const info = new Map((await core.batchInfo(todo.map((i) => i.key!).filter(Boolean))).map((f) => [f.key, f]));
      const tracks = [];
      for (const it of todo) {
        const f = it.key ? info.get(it.key) : undefined;
        if (!f) { setItem(it, "xml", "failed", "file_gone"); continue; }
        const key = readKeyInfo(f.path).key || it.tkey || null;   // the tag wins; the database only fills a gap
        tracks.push({ path: f.path, name: f.title, artist: f.artist, genre: f.genre, size: f.size, totalTime: f.dur, key });
      }
      return mergeIntoFile(file, tracks);
    });
  } catch (e: any) {
    if (libChanged(e)) { for (const it of todo) if (it.steps.xml.state === "running") setItem(it, "xml", "pending"); return failStep(st, "library_changed"); }
    const code = typeof e?.code === "string" && /^rb_xml_[a-z_]+$/.test(e.code) ? e.code : "rb_xml_failed";
    for (const it of todo) if (it.steps.xml.state === "running") setItem(it, "xml", "failed", code, { ...errVars(e, code), path: file });
    return failStep(st, code, { ...errVars(e, code), path: file });
  }
  const byPath = new Map<string, { code: string; vars?: Record<string, unknown> }>();
  for (const x of w.added) byPath.set(x.path, { code: "rb_added" });
  for (const x of w.updated) byPath.set(x.path, { code: "rb_updated", vars: { from: x.from || "–", to: x.to } });
  for (const x of w.existing) byPath.set(x.path, { code: "rb_listed", vars: { playlist: OWNED_PLAYLIST } });
  for (const it of todo) if (it.steps.xml.state === "running") {
    const r = it.path ? byPath.get(it.path) : undefined;
    setItem(it, "xml", "ok", r?.code, r?.vars);
  }
  st.xml = { file: w.file, backup: w.backup, added: w.added.length, updated: w.updated.length, existing: w.existing.length, entries: w.playlist.entries };
  if (w.changed) say("xml_written", { added: w.added.length, file: w.file, updated: w.updated.length, playlist: OWNED_PLAYLIST, entries: w.playlist.entries, backup: w.backup });
  else say("xml_unchanged");
  st.state = "ok";
}

/** 6. The report: per step counts, failed files with reasons, names to check, files
 *  without a key, the XML result, what happened to the apps, the rekordbox steps. */
function buildReport(): void {
  const job = JOB!;
  const counts: Record<string, Record<ItemState, number>> = {};
  for (const s of FILE_STEPS) {
    const c: Record<ItemState, number> = { pending: 0, running: 0, waiting: 0, ok: 0, skipped: 0, failed: 0 };
    for (const it of job.items) c[it.steps[s].state]++;
    counts[s] = c;
  }
  const failed: any[] = [];
  for (const it of job.items) for (const s of FILE_STEPS)
    if (it.steps[s].state === "failed") failed.push({ n: it.n, label: it.label, file: it.key || it.source?.file || "", step: s, code: it.steps[s].code || "", text: it.steps[s].text || "" });
  const xml = stepRec("xml").xml || null;
  job.report = {
    counts, failed,
    check_names: job.items.filter((it) => it.check_name).map((it) => ({ n: it.n, label: it.label, file: it.key })),
    no_key: job.items.filter((it) => it.steps.mik.code === "no_key").map((it) => ({ n: it.n, label: it.label, file: it.key })),
    key_from_db: job.items.filter((it) => it.key_source === "mik_db").map((it) => ({ n: it.n, label: it.label, file: it.key, key: it.tkey })),
    xml,
    apps: { pn: stepRec("pn").quit || null, mik: stepRec("mik").quit || null },
    rekordbox_steps: xml ? ["rb_untick_key", "rb_refresh", "rb_import"].map((c) => msg(c, { playlist: OWNED_PLAYLIST })) : [],
  };
}
