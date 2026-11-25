/** DJ HQ store: the durable copy of core's in-memory STATE and of the UI preferences, in one
 *  SQLite database (djhq.db in the data folder). core keeps working on STATE as a plain object;
 *  a save turns it into rows (one per library, track, map entry and other top-level key, each
 *  value as JSON text), compares them with the rows the database holds (a string shadow kept
 *  in memory) and writes only the changed ones, in one transaction.
 *
 *  Rollback journal (not WAL), synchronous FULL and a real flush on macOS: djhq.db alone is
 *  complete after every commit, and a crash or power cut leaves the state of the last save.
 *  The database is opened in exclusive locking mode, so a second DJ HQ on the same data
 *  folder can't open it (db_in_use) and the OS lets go of the lock when the process ends.
 *
 *  The first start finds the state.json (and prefs.json) of older versions and imports them
 *  once, verified by reading them back inside the same transaction; the files are then
 *  renamed (never deleted). Every SQL statement of the app is in this file. */
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import type { DatabaseSync, StatementSync } from "node:sqlite";

/** node:sqlite says it is experimental when loaded (Node 22-24): that one warning is dropped,
 *  every other one goes through. */
function loadSqlite(): typeof DatabaseSync {
  const emit = process.emitWarning;
  process.emitWarning = function (w: any, ...a: any[]) {
    const type = typeof a[0] === "string" ? a[0] : a[0]?.type ?? w?.name;
    if (type === "ExperimentalWarning" && /sqlite/i.test(String(w?.message ?? w))) return;
    return (emit as any).call(process, w, ...a);
  } as any;
  try { return require("node:sqlite").DatabaseSync; }
  finally { process.emitWarning = emit; }
}
const Sqlite = loadSqlite();

export const DB_FILE = "djhq.db";
const SCHEMA_VERSION = 1;
const APP_ID = 1145717841;   // "DJHQ"
const APP_VERSION: string = (() => { try { return require("../package.json").version || "0"; } catch { return "0"; } })();

/** the last version that kept its data in state.json */
const PRE_DB_VERSION = "1.7.0";

/** STATE's id-keyed maps: one row per own key. dur_cache and zip_cache are caches (safe to empty). */
const MAPS = ["assigned", "by_hand", "overrides", "edits", "found", "na", "acquired", "dur_cache", "zip_cache"];
/** the tables a save diffs, in the order rows are built */
const TABLES = ["kv", "libraries", "tracks", ...MAPS];

/** test hooks (DJHQ_TEST_*): never in the packaged app */
const testHook = (name: string): string | undefined => __dirname.includes("app.asar") ? undefined : process.env[name];

type Rows = Map<string, Map<string, string>>;
/** move: delete and insert again, so the row goes to the end of its table (key order) */
type Op = { t: string; k: string; v: string | null; move?: boolean };
/** from: a second file the notice names (state_db_replaced: the state.json loaded instead) */
export interface Problem { code: string; file: string; from?: string; }
export interface OpenResult { state: any; problem: Problem | null; blocked: boolean; }

let DIR = "";
let db: DatabaseSync | null = null;
/** nothing is written this session (see open) */
let blocked = true;
let shadow: Rows = emptyRows();
let prefs: Record<string, unknown> = {};
let prefsShadow = new Map<string, string>();
/** the preferences could not be imported: kept in memory only this session */
let prefsHeld = false;
let commits = 0;
const stmts = new Map<string, StatementSync>();

export const dbPath = () => path.join(DIR, DB_FILE);
export const canSave = () => !!db && !blocked;

function emptyRows(): Rows { return new Map(TABLES.map((t) => [t, new Map<string, string>()])); }
const isPlain = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
/** an own property, also for the key "__proto__" */
function put(o: any, k: string, v: unknown) {
  if (k === "__proto__") Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  else o[k] = v;
}
function q(sql: string): StatementSync {
  let s = stmts.get(sql);
  if (!s) { s = db!.prepare(sql); stmts.set(sql, s); }
  return s;
}
const code = (e: any) => (Number(e?.errcode) || 0) & 0xff;
const stampNow = () => new Date().toISOString().replace(/[:.]/g, "-");
const fail = (kind: string, msg: string) => Object.assign(new Error(msg), { store: kind });

// ---------------- the codec: STATE <-> rows ----------------

/** A key SQLite keeps exactly as text: well-formed (an unpaired surrogate comes back as U+FFFD)
 *  and without NUL (Node 22 cuts it there). Any other key, and one that starts with the mark,
 *  is stored as the mark plus its JSON, which escapes both. */
const KEY_MARK = "\u0001";
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const plainKey = (k: string) => !LONE.test(k) && !k.includes("\0") && !k.startsWith(KEY_MARK);
const encKey = (k: string) => plainKey(k) ? k : KEY_MARK + JSON.stringify(k);
const decKey = (s: string): string => s.startsWith(KEY_MARK) ? JSON.parse(s.slice(1)) : s;
/** an array index: JS lists these keys first, in numeric order, whatever the row order */
const isIndex = (k: string) => /^(0|[1-9]\d{0,9})$/.test(k) && Number(k) < 4294967295;

/** STATE as rows, keyed per table. Library rows are "<pos>\n<1 if its tracks are rows>\n<json>"
 *  (the playlist keeps a null in place of its tracks), track rows are keyed "<library key>\n<pos>".
 *  A library's key is its id; one without a usable id (none, not a string, not a plain key, a
 *  second library with the same id) gets "~<pos>". A map, or `libraries`, that isn't an object
 *  (an array) stays a kv row as it is. Other keys go through encKey. A hole in an array is
 *  written as null, as JSON did. The order of a map's keys is the row order (see diff); the
 *  order of the top-level keys is not kept (kv rows, then the maps, then libraries). */
function rows(st: any): Rows {
  const out = emptyRows();
  const kv = out.get("kv")!;
  for (const k of Object.keys(st)) {
    const v = st[k];
    if (k === "libraries" ? Array.isArray(v) : MAPS.includes(k) && isPlain(v)) continue;
    const s = JSON.stringify(v);
    if (s !== undefined) kv.set(encKey(k), s);
  }
  for (const m of MAPS) {
    if (!isPlain(st[m])) continue;
    const t = out.get(m)!, o = st[m];
    for (const k of Object.keys(o)) { const s = JSON.stringify(o[k]); if (s !== undefined) t.set(encKey(k), s); }
  }
  if (Array.isArray(st.libraries)) {
    const libs: any[] = st.libraries, n = libs.length, keys: string[] = [], used = new Set<string>();
    for (let i = 0; i < n; i++) {
      const l = libs[i], id = l && typeof l === "object" ? l.id : undefined;
      if (typeof id === "string" && id && plainKey(id) && !id.startsWith("~") && !id.includes("\n") && !used.has(id)) { keys[i] = id; used.add(id); }
    }
    for (let i = 0; i < n; i++) if (keys[i] === undefined) { let k = "~" + i; while (used.has(k)) k += "~"; keys[i] = k; used.add(k); }
    const lt = out.get("libraries")!, tt = out.get("tracks")!;
    for (let i = 0; i < n; i++) {
      const l = libs[i];
      const split = isPlain(l) && isPlain(l.playlist) && Array.isArray(l.playlist.tracks);
      const data = split ? JSON.stringify({ ...l, playlist: { ...l.playlist, tracks: null } }) : JSON.stringify(l) ?? "null";
      lt.set(keys[i], `${i}\n${split ? 1 : 0}\n${data}`);
      if (split) { const ts: any[] = l.playlist.tracks; for (let j = 0; j < ts.length; j++) tt.set(`${keys[i]}\n${j}`, JSON.stringify(ts[j]) ?? "null"); }
    }
  }
  return out;
}

/** What the database holds, in the form rows() builds. */
function readRows(): Rows {
  const out = emptyRows();
  for (const t of ["kv", ...MAPS]) {
    const m = out.get(t)!;
    for (const r of q(`SELECT key, value FROM ${t} ORDER BY rowid`).all() as any[]) m.set(String(r.key), String(r.value));
  }
  const lt = out.get("libraries")!, tt = out.get("tracks")!;
  for (const r of q("SELECT id, pos, tracks_in_rows, data FROM libraries ORDER BY pos, rowid").all() as any[])
    lt.set(String(r.id), `${Number(r.pos)}\n${r.tracks_in_rows ? 1 : 0}\n${String(r.data)}`);
  for (const r of q("SELECT lib_id, pos, data FROM tracks ORDER BY lib_id, pos").all() as any[])
    tt.set(`${String(r.lib_id)}\n${Number(r.pos)}`, String(r.data));
  return out;
}

/** Rows back into a state object (before defaults). Throws on a row that isn't JSON. */
function fromRows(r: Rows): any {
  const st: any = {};
  for (const [k, v] of r.get("kv")!) put(st, decKey(k), JSON.parse(v));
  for (const m of MAPS) {
    if (Object.prototype.hasOwnProperty.call(st, m)) continue;   // kept as it was (not an object)
    const o: any = {};
    for (const [k, v] of r.get(m)!) put(o, decKey(k), JSON.parse(v));
    st[m] = o;
  }
  if (!Object.prototype.hasOwnProperty.call(st, "libraries")) {
    const tracks = new Map<string, [number, string][]>();
    for (const [k, v] of r.get("tracks")!) {
      const i = k.lastIndexOf("\n"), lib = k.slice(0, i);
      (tracks.get(lib) || tracks.set(lib, []).get(lib)!).push([Number(k.slice(i + 1)), v]);
    }
    const libs: [number, any][] = [];
    for (const [k, v] of r.get("libraries")!) {
      const a = v.indexOf("\n"), b = v.indexOf("\n", a + 1);
      const l = JSON.parse(v.slice(b + 1));
      if (v.slice(a + 1, b) === "1") {
        if (!isPlain(l) || !isPlain(l.playlist)) throw fail("unreadable", "a library row is damaged");
        l.playlist.tracks = (tracks.get(k) || []).sort((x, y) => x[0] - y[0]).map((x) => JSON.parse(x[1]));
      }
      libs.push([Number(v.slice(0, a)), l]);
    }
    st.libraries = libs.sort((x, y) => x[0] - y[0]).map((x) => x[1]);   // stable: equal positions keep row order
  }
  return st;
}

// ---------------- writing ----------------

/** The keys of a map that must move to keep its order: a map reads back in row (rowid) order,
 *  and an upsert keeps a row's place. From the first key that isn't where the rows have it,
 *  every key already there is written again at the end (array indexes aside: JS orders them). */
function moved(c: Map<string, string>, s: Map<string, string>): Set<string> {
  const out = new Set<string>();
  const order: string[] = [];
  for (const k of c.keys()) if (!isIndex(k)) order.push(k);
  let i = 0;
  for (const k of s.keys()) {
    if (!c.has(k) || isIndex(k)) continue;
    if (order[i] !== k) break;
    i++;
  }
  for (let j = i; j < order.length; j++) if (s.has(order[j])) out.add(order[j]);
  return out;
}

function diff(next: Rows, prev: Rows): Op[] {
  const ops: Op[] = [];
  for (const t of TABLES) {
    const c = next.get(t)!, s = prev.get(t)!;
    const mv = MAPS.includes(t) ? moved(c, s) : null;
    for (const [k, v] of c) {
      if (mv?.has(k)) ops.push({ t, k, v, move: true });
      else if (s.get(k) !== v) ops.push({ t, k, v });
    }
    for (const k of s.keys()) if (!c.has(k)) ops.push({ t, k, v: null });
  }
  // a library before its tracks; a library removed last (its tracks go by the diff, the cascade is a net)
  const rank = (o: Op) => o.t === "libraries" ? (o.v === null ? 2 : 0) : 1;
  return ops.sort((a, b) => rank(a) - rank(b));
}

/** only upserts and deletes: INSERT OR REPLACE on libraries would delete the row, and the cascade its tracks */
function applyOps(ops: Op[]): void {
  for (const { t, k, v, move } of ops) {
    if (move) q(`DELETE FROM ${t} WHERE key = ?`).run(k);
    if (t === "libraries") {
      if (v === null) { q("DELETE FROM libraries WHERE id = ?").run(k); continue; }
      const a = v.indexOf("\n"), b = v.indexOf("\n", a + 1);
      q("INSERT INTO libraries (id, pos, tracks_in_rows, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET pos = excluded.pos, tracks_in_rows = excluded.tracks_in_rows, data = excluded.data")
        .run(k, Number(v.slice(0, a)), Number(v.slice(a + 1, b)), v.slice(b + 1));
    } else if (t === "tracks") {
      const i = k.lastIndexOf("\n"), lib = k.slice(0, i), pos = Number(k.slice(i + 1));
      if (v === null) { q("DELETE FROM tracks WHERE lib_id = ? AND pos = ?").run(lib, pos); continue; }
      const id = JSON.parse(v)?.id;
      q("INSERT INTO tracks (lib_id, pos, track_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(lib_id, pos) DO UPDATE SET track_id = excluded.track_id, data = excluded.data")
        .run(lib, pos, Number.isSafeInteger(id) ? id : null, v);
    } else if (v === null) q(`DELETE FROM ${t} WHERE key = ?`).run(k);
    else q(`INSERT INTO ${t} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);
  }
}
function advance(target: Rows, ops: Op[]): void {
  for (const { t, k, v, move } of ops) { const m = target.get(t)!; if (v === null || move) m.delete(k); if (v !== null) m.set(k, v); }
}

/** One transaction; rolled back on any error. Never spans an await. */
function tx<T>(fn: () => T, isSave = false): T {
  db!.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    if (isSave && Number(testHook("DJHQ_TEST_FAIL_COMMIT")) === ++commits)
      throw Object.assign(new Error("test: the commit failed"), { code: "test_commit" });
    db!.exec("COMMIT");
    return r;
  } catch (e) {
    try { db!.exec("ROLLBACK"); } catch {}   // a failed COMMIT may have rolled back already
    throw e;
  }
}

/** Write what changed since the last save; returns the number of rows written or deleted.
 *  A failed write throws and leaves the shadow as it was, so the next save tries it again. */
export function save(state: any): number {
  if (!canSave()) throw new Error("DJ HQ can't save right now");
  const next = rows(state);
  const ops = diff(next, shadow);
  if (!ops.length) return 0;
  tx(() => applyOps(ops), true);
  advance(shadow, ops);
  return ops.length;
}

// ---------------- preferences (the former prefs.json) ----------------

export const getPrefs = (): Record<string, unknown> => ({ ...prefs });
/** Merge a patch into the preferences (undefined deletes a key). While nothing may be saved,
 *  only the copy in memory changes (the theme still switches for the session). */
export function setPrefs(patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prefs };
  for (const k of Object.keys(patch)) { if (patch[k] === undefined) delete next[k]; else put(next, k, patch[k]); }
  if (canSave() && !prefsHeld) writePrefs(next, true);
  prefs = next;
  return getPrefs();
}
function prefRows(p: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of Object.keys(p)) { const s = JSON.stringify(p[k]); if (s !== undefined) m.set(encKey(k), s); }
  return m;
}
/** the changed preference rows; inside a transaction of its own unless own is false */
function writePrefs(next: Record<string, unknown>, own: boolean): void {
  const m = prefRows(next), ops: [string, string | null][] = [];
  for (const [k, v] of m) if (prefsShadow.get(k) !== v) ops.push([k, v]);
  for (const k of prefsShadow.keys()) if (!m.has(k)) ops.push([k, null]);
  if (!ops.length) return;
  const run = () => { for (const [k, v] of ops)
    v === null ? q("DELETE FROM prefs WHERE key = ?").run(k)
      : q("INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v); };
  if (own) tx(run); else run();
  for (const [k, v] of ops) v === null ? prefsShadow.delete(k) : prefsShadow.set(k, v);
}
function readPrefs(): { map: Map<string, string>; obj: Record<string, unknown> } {
  const map = new Map<string, string>(), obj: Record<string, unknown> = {};
  for (const r of q("SELECT key, value FROM prefs ORDER BY rowid").all() as any[]) {
    map.set(String(r.key), String(r.value));
    put(obj, decKey(String(r.key)), JSON.parse(String(r.value)));
  }
  return { map, obj };
}

// ---------------- meta, schema ----------------

function metaGet(k: string): string | undefined {
  const r = q("SELECT value FROM meta WHERE key = ?").get(k) as any;
  return r ? String(r.value) : undefined;
}
const metaSet = (k: string, v: string) =>
  q("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v);

function v0to1(d: DatabaseSync): void {
  d.exec(`
    PRAGMA application_id = ${APP_ID};
    CREATE TABLE meta      (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- about the database itself
    CREATE TABLE kv        (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- the other top-level keys of the state
    CREATE TABLE prefs     (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- the former prefs.json
    CREATE TABLE libraries (id TEXT PRIMARY KEY, pos INTEGER NOT NULL,
                            tracks_in_rows INTEGER NOT NULL DEFAULT 0,    -- 1: playlist.tracks are the rows of tracks
                            data TEXT NOT NULL);
    CREATE TABLE tracks    (lib_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                            pos INTEGER NOT NULL, track_id INTEGER, data TEXT NOT NULL,
                            PRIMARY KEY (lib_id, pos)) WITHOUT ROWID;
    CREATE INDEX tracks_track_id ON tracks(track_id);
    CREATE TABLE assigned  (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- track id -> file key
    CREATE TABLE by_hand   (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- track id -> true
    CREATE TABLE overrides (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- track id -> have | missing
    CREATE TABLE edits     (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- track id | "x:" + path
    CREATE TABLE found     (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- "x:" + path
    CREATE TABLE na        (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- track id
    CREATE TABLE acquired  (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- "<lib id>:<track id>"
    CREATE TABLE dur_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- absolute path (a cache)
    CREATE TABLE zip_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- "<zip>|<entry>|<size>" (a cache)
  `);
  const now = new Date().toISOString();
  for (const [k, v] of [["compat_version", "1"], ["created_at", now], ["created_by", APP_VERSION], ["last_app_version", APP_VERSION]])
    d.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(k, v);
}
/** MIGRATIONS[v] takes the schema from version v to v + 1. A step older apps can still read and
 *  write leaves meta.compat_version alone; a breaking one raises it. */
const MIGRATIONS: ((d: DatabaseSync) => void)[] = [v0to1];

const pragma = (d: DatabaseSync, name: string): any => { const r = d.prepare(`PRAGMA ${name}`).get() as any; return r ? Object.values(r)[0] : undefined; };

/** Open djhq.db, take the lock, check it is ours and whole, bring the schema up to date.
 *  newer: written by a newer version that says this one must not write to it. */
function connect(file: string): { newer: boolean } {
  const d = new Sqlite(file);
  db = d;
  stmts.clear();
  d.exec("PRAGMA busy_timeout = 2000");   // a restart while the old process still closes
  d.exec("PRAGMA locking_mode = EXCLUSIVE");
  try { d.exec("BEGIN EXCLUSIVE"); d.exec("COMMIT"); }   // takes the lock now and keeps it
  catch (e: any) {
    if (code(e) === 5 || code(e) === 6) throw Object.assign(new Error("another DJ HQ is using this data folder"), { code: "db_in_use" });
    throw e;
  }
  const qc = d.prepare("PRAGMA quick_check").all() as any[];
  if (qc.length !== 1 || Object.values(qc[0])[0] !== "ok") throw fail("unreadable", "the database failed its check");
  const appId = Number(pragma(d, "application_id")), uv = Number(pragma(d, "user_version"));
  const tables = Number((d.prepare("SELECT count(*) AS n FROM sqlite_schema").get() as any).n);
  if (appId !== APP_ID && !(appId === 0 && tables === 0)) throw fail("unreadable", "this database isn't DJ HQ's");
  let compat = Infinity;
  if (uv > SCHEMA_VERSION) { try { compat = Number(metaGet("compat_version")) || Infinity; } catch {} }
  const newer = uv > SCHEMA_VERSION && compat > SCHEMA_VERSION;
  if (!newer) {
    // not for a newer database: switching it out of its journal mode would be a write
    const jm = String(pragma(d, "journal_mode = DELETE")).toLowerCase();
    if (jm !== "delete") throw new Error("the database can't use its journal (" + jm + ")");
  }
  d.exec("PRAGMA synchronous = FULL; PRAGMA fullfsync = ON; PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF");
  if (newer) return { newer };
  if (uv >= 1 && uv < SCHEMA_VERSION) snapshotBeforeUpgrade(uv);
  for (let v = uv; v < SCHEMA_VERSION; v++) {
    d.exec("BEGIN IMMEDIATE");
    try { MIGRATIONS[v](d); d.exec(`PRAGMA user_version = ${v + 1}`); d.exec("COMMIT"); }
    catch (e) { try { d.exec("ROLLBACK"); } catch {} throw e; }
  }
  stmts.clear();   // statements prepared before the schema changed
  return { newer };
}

/** backups/<stamp>-before-upgrade-v<old>.djhq.db; the last 3 are kept */
function snapshotBeforeUpgrade(old: number): void {
  const dir = path.join(DIR, "backups");
  fs.mkdirSync(dir, { recursive: true });
  snapshot(path.join(dir, `${stampNow()}-before-upgrade-v${old}.djhq.db`));
  const re = /-before-upgrade-v\d+\.djhq\.db$/;
  const all = fs.readdirSync(dir).filter((f) => re.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 3))) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
}

function closeQuiet(): void {
  if (db) { try { db.close(); } catch {} }
  db = null;
  stmts.clear();
}

/** A damaged database (and its journal, WAL) renamed to djhq.db.unreadable-<time>(-journal),
 *  so the pair stays usable for recovery tools. The journal goes first: a journal left next to
 *  a new djhq.db would be played back into it. null when it couldn't be moved. */
function moveAside(file: string): string | null {
  const aside = `${file}.unreadable-${stampNow()}`;
  const moved: [string, string][] = [];
  try {
    for (const sfx of ["-journal", "-wal", "-shm"])
      if (fs.existsSync(file + sfx)) { fs.renameSync(file + sfx, aside + sfx); moved.push([file + sfx, aside + sfx]); }
    fs.renameSync(file, aside);
    return aside;
  } catch {
    for (const [a, b] of moved) { try { fs.renameSync(b, a); } catch {} }
    return null;
  }
}

/** Read a JSON file that should hold an object: the object, "missing", or "unreadable". */
function readJsonObject(p: string): { obj: any; text: string } | "missing" | "unreadable" {
  let text: string;
  try { text = fs.readFileSync(p, "utf8"); }
  catch (e: any) { return e?.code === "ENOENT" ? "missing" : "unreadable"; }
  try { const obj = JSON.parse(text); return isPlain(obj) ? { obj, text } : "unreadable"; }
  catch { return "unreadable"; }
}

// ---------------- opening ----------------

/** Open (or create) the database and load the state, importing state.json / prefs.json of an
 *  older version once. Never throws but for db_in_use (another DJ HQ has the folder): every
 *  other failure comes back as a problem, with blocked set when nothing may be saved. */
export function open(dataDir: string, withDefaults: (st: any) => any): OpenResult {
  DIR = dataDir;
  closeQuiet();
  blocked = true; prefsHeld = false; shadow = emptyRows(); prefs = {}; prefsShadow = new Map(); commits = 0;
  const file = dbPath(), stateFile = path.join(DIR, "state.json"), prefsFile = path.join(DIR, "prefs.json");
  const filePrefs = () => { const r = readJsonObject(prefsFile); return typeof r === "object" ? r.obj : {}; };
  let existed = false;
  try { existed = fs.statSync(file).size > 0; } catch {}
  let problem: Problem | null = null;

  /** the database can't be used at all: the state.json it would have imported, in memory, or nothing */
  const unusable = (e: any): OpenResult => {
    closeQuiet();
    console.error(`DJ HQ can't open its database ${file}: ${e?.message || e}`);
    prefs = filePrefs();
    const s = existed ? "missing" : readJsonObject(stateFile);
    if (typeof s === "object")
      return { state: withDefaults(s.obj), problem: { code: "state_import_failed", file: stateFile }, blocked: true };
    if (s === "unreadable")   // not moved either: the folder can't be written
      return { state: withDefaults({}), problem: { code: "state_unreadable_kept", file: stateFile }, blocked: true };
    return { state: withDefaults({}), problem: { code: "state_store_failed", file }, blocked: true };
  };

  // everything read here, so a damaged row is found before anything is written
  let newer = false, meta: { state?: string; prefs?: string } = {}, p0 = { map: new Map<string, string>(), obj: {} as Record<string, unknown> };
  const attempt = () => {
    newer = connect(file).newer;
    if (newer) return;
    try {
      shadow = readRows(); fromRows(shadow);
      p0 = readPrefs();
      meta = { state: metaGet("imported_state"), prefs: metaGet("imported_prefs") };
    } catch (e: any) {
      // a table missing, a row that isn't JSON: damaged (the disk failing, or full, is not)
      if ([5, 6, 8, 10, 13, 14].includes(code(e))) throw e;
      throw fail("unreadable", e?.message || String(e));
    }
  };
  try { attempt(); }
  catch (e: any) {
    closeQuiet();
    if (e?.code === "db_in_use") throw e;
    const damaged = e?.store === "unreadable" || code(e) === 11 || code(e) === 26 || e instanceof SyntaxError;
    if (!damaged) return unusable(e);
    const aside = moveAside(file);
    console.error(`${file} could not be read (${e?.message || e}); ${aside ? "moved to " + aside : "left in place, not saving over it"}`);
    if (!aside) {
      prefs = filePrefs();
      return { state: withDefaults({}), problem: { code: "state_unreadable_kept", file }, blocked: true };
    }
    problem = { code: "state_unreadable", file: aside };
    existed = false;
    shadow = emptyRows();
    try { attempt(); }
    catch (e2: any) { closeQuiet(); if (e2?.code === "db_in_use") throw e2; return unusable(e2); }
  }

  if (newer) {
    // never migrated, never written, never moved aside: show what loads, save nothing
    let st: any = {};
    try { st = fromRows(readRows()); } catch {}
    try { prefs = readPrefs().obj; } catch {}
    console.error(`${file} was saved by a newer version of DJ HQ; nothing is saved this session`);
    return { state: withDefaults(st), problem: { code: "state_newer", file }, blocked: true };
  }

  // the one-time import of an older version's files
  let stateDoc: { obj: any; text: string } | null = null;
  if (!meta.state && shadow.get("libraries")!.size === 0) {
    const s = readJsonObject(stateFile);
    if (s === "unreadable") {
      // as before the database: kept untouched, and the app starts fresh
      const aside = `${stateFile}.unreadable-${stampNow()}`;
      let moved = false;
      try { fs.renameSync(stateFile, aside); moved = true; } catch {}
      console.error(`state.json could not be read; ${moved ? "moved to " + aside : "left in place, not saving over it"}`);
      if (!moved) {
        prefs = p0.obj;   // nothing is written this session, the preferences neither
        return { state: withDefaults(fromRows(shadow)), problem: problem || { code: "state_unreadable_kept", file: stateFile }, blocked: true };
      }
      problem = problem || { code: "state_unreadable", file: aside };
    } else if (s !== "missing") stateDoc = s;
  } else if (fs.existsSync(stateFile)) {
    // the database wins. A state.json written after the import (or after the database was
    // made) comes from somewhere else: an older DJ HQ run again, a raw export put back. It is
    // left as it is, and the UI says it isn't used and how to use it.
    let since = NaN;
    try { since = Date.parse(meta.state ? JSON.parse(meta.state).at : metaGet("created_at") ?? ""); } catch {}
    let mtime = NaN;
    try { mtime = fs.statSync(stateFile).mtimeMs; } catch {}
    if (!(mtime <= since)) {
      problem = problem || { code: "state_json_ignored", file: stateFile };
      console.error(`${stateFile} is newer than ${file} and is not used: djhq.db already holds DJ HQ's data`);
    } else console.log("state.json is left as it is: djhq.db already holds DJ HQ's data");
  }
  let prefsDoc: Record<string, unknown> | null = null;
  if (!meta.prefs && p0.map.size === 0) {
    const pr = readJsonObject(prefsFile);
    if (typeof pr === "object") prefsDoc = pr.obj;   // an unreadable prefs.json is ignored and left, as before
  }
  prefsShadow = p0.map;

  if (stateDoc || prefsDoc) {
    const t = stampNow();
    const stateTo = `${stateFile}.imported-${t}`, prefsTo = `${prefsFile}.imported-${t}`;
    let ops: Op[] = [];
    try {
      tx(() => {
        if (stateDoc) {
          // compared with what the older version would have written itself
          const expected = JSON.parse(JSON.stringify(withDefaults(JSON.parse(stateDoc.text))));
          ops = diff(rows(withDefaults(stateDoc.obj)), shadow);
          applyOps(ops);
          metaSet("imported_state", JSON.stringify({ file: path.basename(stateTo), at: new Date().toISOString() }));
          const loaded = withDefaults(fromRows(readRows()));
          if (!util.isDeepStrictEqual(loaded, expected) || testHook("DJHQ_TEST_FAIL_IMPORT"))
            throw new Error("the imported data didn't read back the same");
        }
        if (prefsDoc) {
          writePrefs(prefsDoc, false);
          metaSet("imported_prefs", JSON.stringify({ file: path.basename(prefsTo), at: new Date().toISOString() }));
          if (!util.isDeepStrictEqual(readPrefs().obj, JSON.parse(JSON.stringify(prefsDoc))))
            throw new Error("the imported preferences didn't read back the same");
        }
      });
    } catch (e: any) {
      // rolled back: the files stay where they are, and the next start tries again
      prefsShadow = p0.map;
      console.error(`DJ HQ couldn't move its saved data into ${file}: ${e?.message || e}`);
      if (stateDoc) {
        prefs = prefsDoc || p0.obj;
        return { state: withDefaults(JSON.parse(stateDoc.text)), problem: { code: "state_import_failed", file: stateFile }, blocked: true };
      }
      prefsHeld = true;   // only the preferences failed: they are used from memory this session
    }
    if (!prefsHeld) {
      advance(shadow, ops);
      // committed: the files are never imported again, whether the renames work or not
      if (stateDoc) {
        try { fs.renameSync(stateFile, stateTo); } catch (e: any) { console.error(`state.json was imported but couldn't be renamed: ${e?.message || e}`); }
        try {
          fs.writeFileSync(path.join(DIR, "state.json.README.txt"),
            `This DJ HQ keeps its data in ${DB_FILE} in this folder; older versions (1.7 and\n` +
            `before) kept it in state.json. ${path.basename(stateTo)} is that data\n` +
            `as it was when it was moved into ${DB_FILE}.\n\n` +
            `To use an older DJ HQ again: while DJ HQ is still running, save a current copy\n` +
            `with Settings > Export raw data (JSON); quit DJ HQ; put that file here as\n` +
            `state.json (or rename ${path.basename(stateTo)} back to state.json, which\n` +
            `is the older data) and rename ${path.basename(prefsTo)} (if there is one)\n` +
            `back to prefs.json for the appearance settings.\n\n` +
            `To come forward again afterwards: quit DJ HQ, move ${DB_FILE} out of this folder\n` +
            `and start the newer DJ HQ, which moves state.json into a new database. Until\n` +
            `then it keeps using ${DB_FILE} and says that state.json is not used.\n`);
        } catch {}
        console.log(`state.json was moved into ${DB_FILE} (the file is kept as ${path.basename(stateTo)})`);
        // the database was moved aside and a state.json found next to it was loaded instead:
        // it may be older than the last changes, so the notice names both files
        if (problem?.code === "state_unreadable") problem = { code: "state_db_replaced", file: problem.file, from: stateTo };
      }
      if (prefsDoc) { try { fs.renameSync(prefsFile, prefsTo); } catch {} }
    }
  }

  shadow = readRows();
  const state = withDefaults(fromRows(shadow));
  if (prefsHeld) prefs = prefsDoc || {};
  else { const pr = readPrefs(); prefs = pr.obj; prefsShadow = pr.map; }
  // one real write now: a database that can be read but not written (a read-only file or
  // folder) is found at launch, not by the first save
  try {
    tx(() => {
      metaSet("opened_at", new Date().toISOString());
      // What's new: the version whose changes were seen last. Missing the first time: the version
      // that used this database before (PRE_DB_VERSION for an imported state.json, which names
      // none); a new database starts at the running version, so a new user gets no list.
      if (prefs.newsSeen === undefined && !prefsHeld) {
        const next = { ...prefs, newsSeen: (stateDoc ? PRE_DB_VERSION : existed && metaGet("last_app_version")) || APP_VERSION };
        writePrefs(next, false);
        prefs = next;
      }
      if (metaGet("last_app_version") !== APP_VERSION) metaSet("last_app_version", APP_VERSION);
    });
  } catch (e: any) {
    console.error(`DJ HQ can't write to its database ${file}: ${e?.message || e}; nothing is saved this session`);
    prefsHeld = true;
    return { state, problem: { code: "state_store_failed", file }, blocked: true };
  }
  blocked = false;
  return { state, problem, blocked: false };
}

/** A consistent copy of the whole database (state and preferences) in one new file. */
export function snapshot(dst: string): void {
  if (!db) throw new Error("the database isn't open");
  db.prepare("VACUUM INTO ?").run(dst);
  const fd = fs.openSync(dst, "r+");
  try { fs.fsyncSync(fd); } catch {} finally { fs.closeSync(fd); }
}

/** Release the lock (every commit is durable by itself). Safe to call more than once.
 *  In exclusive locking mode SQLite keeps the journal file between transactions (its header
 *  zeroed, so it is never played back); one that a killed process left behind is not removed
 *  by a later session. One write in normal locking mode makes SQLite delete it itself (never
 *  removed by hand: SQLite may hold it open). */
export function close(): void {
  if (db && !blocked && fs.existsSync(dbPath() + "-journal")) {
    try {
      db.exec("PRAGMA locking_mode = NORMAL");
      tx(() => metaSet("closed_at", new Date().toISOString()));   // a real change: an unchanged row writes nothing
    } catch {}
  }
  closeQuiet();
  blocked = true;
}
