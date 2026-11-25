/** Adds DJ HQ's moved-in files to the rekordbox collection, straight into rekordbox's own
 *  database (master.db, SQLite encrypted with SQLCipher; the key is the publicly known one,
 *  kept obfuscated here like pyrekordbox keeps it). The insert mirrors pyrekordbox's
 *  add_content: one djmdContent row with the same fields a row created by rekordbox carries,
 *  plus the local update sequence number (agentRegistry.localUpdateCount), and nothing else.
 *  rekordbox analyses the track itself on its next start.
 *
 *  Safety rules, in order: the feature is off until switched on in Settings; writes happen
 *  only while rekordbox itself is not running (the rekordboxAgent background process does
 *  not count, as in pyrekordbox); before the first write of a session master.db (and its
 *  WAL) is copied to <data>/rekordbox-backups/, and the last few backups are kept; only
 *  additive inserts, never an update or delete of existing rows; the schema is checked
 *  before anything is written, so an unknown future rekordbox fails softly; and any failure
 *  leaves the paths in the pending queue, never blocks a move. Rekordbox 6 and 7 share the
 *  database format and key; rekordbox 5 does not and is not supported. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import * as core from "./core";

/** the known master.db key, XORed with a fixed pad (never written to disk or logs) */
const KEY_OB = "cHp6N0RXV14PVltMWFgNE0cDDQ5KAgQNQENVFlBXVlETElZQGVcHVgV1fyw3FwJXXVtWURVYCQgUQVNbV0ZdVQ==";
const KEY_PAD = "DJHQ collection rekordbox bridge pad 2026";
function dbKey(): string {
  const ob = Buffer.from(KEY_OB, "base64");
  const pad = Buffer.from(KEY_PAD, "utf8");
  const out = Buffer.alloc(ob.length);
  for (let i = 0; i < ob.length; i++) out[i] = ob[i] ^ pad[i % pad.length];
  return out.toString("utf8");
}

/** rekordbox's FileType values (pyrekordbox tables.FileType); other formats are skipped */
const FILE_TYPE: Record<string, number> = { ".mp3": 1, ".m4a": 4, ".flac": 5, ".wav": 11, ".aiff": 12, ".aif": 12 };

const BACKUP_KEEP = 5;
let LAST: { at: number; added: number; skipped: number; error?: string } | null = null;
let SWEEP_TIMER: NodeJS.Timeout | null = null;
let SWEEPING = false;
let BACKED_UP_SESSION = false;

/** the master.db of this computer's rekordbox 6 / 7 (DJHQ_RB_DB overrides it in tests;
 *  never in the packaged app) */
export function masterDbPath(): string {
  const test = !__dirname.includes("app.asar") && process.env.DJHQ_RB_DB;
  if (test) return test;
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Pioneer", "rekordbox", "master.db");
  return path.join(os.homedir(), "Library", "Pioneer", "rekordbox", "master.db");
}

/** the sqlcipher driver, loaded lazily: a missing or ABI-mismatched native module turns the
 *  feature off instead of crashing the app */
function loadDriver(): any | null {
  try { return require("better-sqlite3-multiple-ciphers"); } catch { return null; }
}

const rbSettings = () => {
  const s = core.STATE.settings || (core.STATE.settings = {});
  return (s as any).rekordbox || ((s as any).rekordbox = {});
};
export const isOn = (): boolean => !!rbSettings().on;
const pendingList = (): string[] => {
  const r = rbSettings();
  if (!Array.isArray(r.pending)) r.pending = [];
  return r.pending;
};

/** rekordbox (the main app, not rekordboxAgent) is running right now */
export function isRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("tasklist", ["/FI", "IMAGENAME eq rekordbox.exe", "/NH"], { timeout: 10000 }, (e, out) =>
        resolve(!e && /rekordbox\.exe/i.test(String(out))));
    } else {
      execFile("pgrep", ["-x", "rekordbox"], { timeout: 10000 }, (e, out) => resolve(!e && !!String(out).trim()));
    }
  });
}

/** Copy master.db (and its WAL / SHM, when rekordbox left one) to the backups, once per
 *  DJ HQ session before the first write; the last few backups are kept. */
function backupMaster(): string {
  const src = masterDbPath();
  const dir = path.join(core.dataDir(), "rekordbox-backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(dir, `${stamp}-master.db`);
  fs.copyFileSync(src, dst);
  for (const sfx of ["-wal", "-shm"]) if (fs.existsSync(src + sfx)) fs.copyFileSync(src + sfx, dst + sfx);
  const all = fs.readdirSync(dir).filter((f) => /-master\.db$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP)))
    for (const sfx of ["", "-wal", "-shm"]) { try { fs.unlinkSync(path.join(dir, f + sfx)); } catch { /* gone */ } }
  return dst;
}
/** the newest backup in <data>/rekordbox-backups, if any */
export function latestBackup(): string | null {
  const dir = path.join(core.dataDir(), "rekordbox-backups");
  let all: string[] = [];
  try { all = fs.readdirSync(dir).filter((f) => /-master\.db$/.test(f)).sort(); } catch { return null; }
  return all.length ? path.join(dir, all[all.length - 1]) : null;
}
/** Put the newest backup back in place of master.db (rekordbox must not be running). */
export async function restoreBackup(): Promise<{ restored: string }> {
  const src = latestBackup();
  if (!src) throw core.appError("rb_no_backup", "there is no rekordbox backup to restore");
  if (await isRunning()) throw core.appError("rb_running", "close rekordbox first, then try again");
  const dst = masterDbPath();
  fs.copyFileSync(src, dst);
  for (const sfx of ["-wal", "-shm"]) {
    try { fs.unlinkSync(dst + sfx); } catch { /* none */ }
    if (fs.existsSync(src + sfx)) fs.copyFileSync(src + sfx, dst + sfx);
  }
  return { restored: path.basename(src) };
}

/** open master.db; throws rb_db_missing / rb_driver_missing / rb_db_unreadable */
function openDb(readonly: boolean): any {
  const Driver = loadDriver();
  if (!Driver) throw core.appError("rb_driver_missing", "the rekordbox database driver is not available in this build");
  const p = masterDbPath();
  if (!fs.existsSync(p)) throw core.appError("rb_db_missing", "no rekordbox database on this computer (is rekordbox 6 or 7 installed?)", { path: p });
  const db = new Driver(p, { readonly });
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma("legacy=4");
    db.pragma(`key='${dbKey()}'`);
    db.pragma("busy_timeout = 5000");
    db.prepare("SELECT count(*) FROM djmdContent").get();
  } catch (e: any) {
    try { db.close(); } catch { /* ignore */ }
    throw core.appError("rb_db_unreadable", "the rekordbox database could not be read (an unsupported rekordbox version?)", { error: String(e?.message || e) });
  }
  return db;
}

/** every column the insert writes must exist, so a future rekordbox that changed the
 *  schema is refused softly instead of getting a half-shaped row */
const NEEDED = ["ID", "UUID", "ContentLink", "DateCreated", "DeviceID", "FileNameL", "FileSize", "FileType", "FolderPath",
  "HotCueAutoLoad", "MasterDBID", "MasterSongID", "StockDate", "rb_file_id", "rb_local_usn", "created_at", "updated_at",
  "rb_data_status", "rb_local_data_status", "rb_local_deleted", "rb_local_synced"];
function checkSchema(db: any): void {
  const cols = new Set((db.prepare("PRAGMA table_info(djmdContent)").all() as any[]).map((c) => String(c.name)));
  const missing = NEEDED.filter((c) => !cols.has(c));
  if (missing.length) throw core.appError("rb_schema_changed", "this rekordbox version keeps its collection differently; DJ HQ leaves it alone", { missing: missing.join(", ") });
}

const uuid4 = () => (require("crypto") as typeof import("crypto")).randomUUID();
/** a random 28-bit id (>= 100) unused in the column, as pyrekordbox generates them */
function unusedId(db: any, column: "ID" | "rb_file_id"): number {
  const crypto = require("crypto") as typeof import("crypto");
  for (let i = 0; i < 1000000; i++) {
    const id = crypto.randomBytes(4).readUInt32BE(0) >>> 4;
    if (id < 100) continue;
    const hit = db.prepare(`SELECT 1 FROM djmdContent WHERE ${column} = ? LIMIT 1`).get(String(id));
    if (!hit) return id;
  }
  throw core.appError("rb_id_failed", "could not find a free id in the rekordbox database");
}
/** "2026-11-26 21:04:05.123 +00:00", as rekordbox writes its timestamps */
function rbNow(): string {
  const d = new Date();
  const z = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}.${z(d.getUTCMilliseconds(), 3)} +00:00`;
}
/** today's local date, as rekordbox stamps DateCreated / StockDate */
const rbToday = () => { const d = new Date(); const z = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

export interface AddResult { added: string[]; skipped: string[]; errors: { path: string; error: string }[]; }

/** Add the files to the rekordbox collection (additive inserts only). Exported for tests;
 *  everything else goes through sweep(), which checks that rekordbox is not running and
 *  makes the backup first. */
export function addPaths(paths: string[]): AddResult {
  const out: AddResult = { added: [], skipped: [], errors: [] };
  const db = openDb(false);
  try {
    checkSchema(db);
    const device = db.prepare("SELECT ID, MasterDBID FROM djmdDevice LIMIT 1").get() as any;
    if (!device) throw core.appError("rb_db_unreadable", "the rekordbox database holds no device row");
    const link = db.prepare("SELECT rb_local_usn FROM djmdMenuItems WHERE Name = 'TRACK' LIMIT 1").get() as any;
    const tx = db.transaction((p: string) => {
      const usnRow = db.prepare("SELECT int_1 FROM agentRegistry WHERE registry_id = 'localUpdateCount'").get() as any;
      const usn = usnRow ? Number(usnRow.int_1) + 1 : null;
      const id = unusedId(db, "ID"), fileId = unusedId(db, "rb_file_id");
      db.prepare(`INSERT INTO djmdContent (ID, UUID, ContentLink, DateCreated, DeviceID, FileNameL, FileSize, FileType, FolderPath,
          HotCueAutoLoad, MasterDBID, MasterSongID, StockDate, rb_file_id, rb_local_usn, created_at, updated_at,
          rb_data_status, rb_local_data_status, rb_local_deleted, rb_local_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)`)
        .run(String(id), uuid4(), link ? Number(link.rb_local_usn) : null, rbToday(), String(device.ID),
          path.basename(p), fs.statSync(p).size, FILE_TYPE[path.extname(p).toLowerCase()], p,
          "on", String(device.MasterDBID), String(id), rbToday(), String(fileId), usn, rbNow(), rbNow());
      if (usn !== null) db.prepare("UPDATE agentRegistry SET int_1 = ? WHERE registry_id = 'localUpdateCount'").run(usn);
    });
    for (const p of paths) {
      try {
        if (!FILE_TYPE[path.extname(p).toLowerCase()]) { out.skipped.push(p); continue; }   // a format rekordbox has no type for (OGG)
        if (!fs.existsSync(p)) { out.skipped.push(p); continue; }
        const have = db.prepare("SELECT 1 FROM djmdContent WHERE FolderPath = ? LIMIT 1").get(p);
        if (have) { out.skipped.push(p); continue; }
        tx(p);
        out.added.push(p);
      } catch (e: any) {
        out.errors.push({ path: p, error: String(e?.message || e) });
      }
    }
  } finally { try { db.close(); } catch { /* ignore */ } }
  return out;
}

/** A file DJ HQ just moved into the collection: queued, and written out as soon as
 *  rekordbox is closed (right away when it already is). Never throws into the move. */
export function queueAdd(p: string): void {
  if (!isOn()) return;
  const pending = pendingList();
  if (!pending.includes(p)) { pending.push(p); core.saveState(); }
  scheduleSweep();
}
function scheduleSweep(): void {
  if (SWEEP_TIMER) return;
  SWEEP_TIMER = setTimeout(() => { SWEEP_TIMER = null; sweep().catch(() => { /* reported in LAST */ }); }, 2000);
  SWEEP_TIMER.unref?.();
}

/** Write the pending files into the rekordbox collection when that is possible right now
 *  (feature on, database there, rekordbox closed). `manual` also throws the reason. */
export async function sweep(manual = false): Promise<AddResult | null> {
  if (SWEEPING) return null;
  if (!isOn()) { if (manual) throw core.appError("rb_off", "switch the rekordbox connection on first (Settings > Integrations)"); return null; }
  const pending = pendingList();
  if (!pending.length) return { added: [], skipped: [], errors: [] };
  SWEEPING = true;
  try {
    if (await isRunning()) {
      if (manual) throw core.appError("rb_running", "close rekordbox first, then try again");
      return null;   // the queue waits; the next move or a manual Add now tries again
    }
    if (!BACKED_UP_SESSION) { backupMaster(); BACKED_UP_SESSION = true; }
    const r = addPaths([...pending]);
    const done = new Set([...r.added, ...r.skipped]);
    rbSettings().pending = pending.filter((p) => !done.has(p));
    core.saveState();
    LAST = { at: Date.now(), added: r.added.length, skipped: r.skipped.length, ...(r.errors.length ? { error: r.errors[0].error } : {}) };
    return r;
  } catch (e: any) {
    LAST = { at: Date.now(), added: 0, skipped: 0, error: String(e?.message || e) };
    if (manual) throw e;
    return null;
  } finally { SWEEPING = false; }
}

/** GET-ish status for the Settings card. */
export async function status(): Promise<any> {
  const driver = !!loadDriver();
  const dbp = masterDbPath();
  const found = driver && fs.existsSync(dbp);
  return {
    on: isOn(),
    driver,
    db_found: fs.existsSync(dbp),
    db_path: dbp,
    running: found ? await isRunning() : false,
    pending: pendingList().length,
    backup: latestBackup() ? path.basename(latestBackup()!) : null,
    last: LAST,
  };
}

/** POST /api/rekordbox: {op: "status"} · {op: "set", on} · {op: "flush"} · {op: "restore"} */
export async function op(data: any): Promise<any> {
  const what = String(data?.op || "status");
  if (what === "status") return status();
  if (what === "set") {
    rbSettings().on = !!data.on;
    if (!data.on) delete rbSettings().on;
    core.saveState();
    if (data.on) scheduleSweep();
    return status();
  }
  if (what === "flush") {
    const r = await sweep(true);
    return { ...(await status()), result: r };
  }
  if (what === "restore") {
    const r = await restoreBackup();
    return { ...(await status()), ...r };
  }
  throw core.appError("bad_request", "unknown rekordbox op");
}

/** Wire the module in: core calls the hook for every file a move put in place. */
export function init(): void {
  core.setRbHook((p) => queueAdd(p));
  if (isOn() && pendingList().length) scheduleSweep();
}
