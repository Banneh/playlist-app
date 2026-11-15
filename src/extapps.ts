/** The outside apps of the "Do everything" chain (Platinum Notes, Mixed In Key) and
 *  the files around them, behind one small interface with a macOS and a Windows
 *  implementation. Nothing here writes to another app's data: detection reads
 *  bundles, preferences and settings files; the Mixed In Key database is only ever
 *  opened read-only (immutable). Launching and quitting are the only actions, and
 *  quitting is graceful only: an app that won't close is left open, never killed.
 *
 *  Tests swap the whole implementation: with DJHQ_FAKE_APPS=<path to a JS module>
 *  the headless server loads that module instead (it exports an object, or a
 *  function returning one, with the ExtApps methods). That variable is for tests
 *  only; the packaged app ignores it. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile, spawn } from "child_process";

export type AppId = "pn" | "mik";
export interface AppCandidate { path: string; version: string; }
export type QuitResult = "closed" | "busy" | "failed";
/** "replace": Platinum Notes overwrites the originals (keeps its own backup), the only
 *  verified mode; "other": it writes copies somewhere; "unknown": can't be read here. */
export type PnMode = "replace" | "other" | "unknown";
export interface XmlSuggestion { path: string; source: "rekordbox" | "mik"; exists: boolean; }
export interface DbCheck { ok: boolean; songs?: number; code?: string; }
export interface Validation { ok: boolean; version?: string; code?: string; }

export interface ExtApps {
  platform: string;
  /** installed copies, highest version first */
  detect(app: AppId): Promise<AppCandidate[]>;
  /** is this path that app (the right bundle / exe)? */
  validate(app: AppId, appPath: string): Promise<Validation>;
  /** null: couldn't tell (the check failed or timed out); callers then never quit the app */
  isRunning(app: AppId, appPath: string): Promise<boolean | null>;
  /** hand the files to the app (starting it when it isn't running) */
  openWithFiles(app: AppId, appPath: string, files: string[]): Promise<void>;
  /** ask the app to quit; "busy" = still running afterwards (a dialog is up) */
  quit(app: AppId, appPath: string): Promise<QuitResult>;
  readPnOutputMode(): Promise<PnMode>;
  /** Mixed In Key's collection database(s), newest first */
  findMikDb(): Promise<string[]>;
  /** does the database open, and how many songs does it hold */
  checkMikDb(db: string): Promise<DbCheck>;
  /** keys Mixed In Key stored for these files (path -> key), read-only; null when this
   *  platform's database can't be read for keys */
  readMikKeys(db: string, files: string[]): Promise<Map<string, string> | null>;
  /** the rekordbox XML rekordbox imports from, then the one Mixed In Key writes to */
  suggestRekordboxXml(): Promise<XmlSuggestion[]>;
  /** where Platinum Notes writes one log per run; null when unknown */
  pnLogDir(): string | null;
  /** file extensions each app accepts (lower case, with the dot) */
  accepts(app: AppId): string[];
}

// ---------------- shared helpers ----------------

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        let code = 0;
        if (err) code = typeof (err as any).code === "number" ? (err as any).code : 1;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
    } catch (e: any) {
      resolve({ code: 1, stdout: "", stderr: String(e?.message || e) });
    }
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "11.2.6" > "10.5" > "" */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number), pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const listDir = (d: string) => { try { return fs.readdirSync(d); } catch { return [] as string[]; } };

/** "~/x", "file:///x" and "file://localhost/x" as a plain path */
export function plainPath(raw: string): string {
  let s = String(raw || "").trim();
  if (/^file:/i.test(s)) {
    s = s.replace(/^file:(\/\/localhost)?/i, "").replace(/^\/\/(?=\/)/, "");
    try { s = decodeURIComponent(s); } catch { /* keep as is */ }
    if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);
  }
  if (s === "~" || s.startsWith("~/") || s.startsWith("~\\")) s = path.join(os.homedir(), s.slice(2));
  return s;
}

const isSqlite = (p: string) => {
  let fd = -1;
  try {
    fd = fs.openSync(p, "r");
    const b = Buffer.alloc(16);
    fs.readSync(fd, b, 0, 16, 0);
    return b.toString("latin1") === "SQLite format 3\0";
  } catch { return false; }
  finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
};

/** A read-only query on an SQLite file that may be in use by its app: node's built-in
 *  sqlite (Node 22.5+, Electron 43's Node 24) with immutable=1, so nothing is locked
 *  or written (no -wal/-shm files appear); on macOS /usr/bin/sqlite3 the same way
 *  when the runtime has no node:sqlite. Rows come back as plain objects; blobs as
 *  Buffers (the sqlite3 fallback needs them selected as hex(...) AS <name>_hex). */
async function sqliteRows(db: string, sql: string): Promise<any[]> {
  const slashed = db.split(path.sep).join("/");
  const uri = "file:" + (/^[A-Za-z]:\//.test(slashed) ? "///" : "") + encodeURI(slashed).replace(/\?/g, "%3F").replace(/#/g, "%23") + "?immutable=1";
  let mod: any = null;
  try {
    // node 22 prints a one-time ExperimentalWarning here; harmless
    mod = require("node:sqlite");
  } catch { mod = null; }
  if (mod && mod.DatabaseSync) {
    const conn = new mod.DatabaseSync(uri, { readOnly: true });
    try {
      return conn.prepare(sql).all().map((r: any) => {
        const o: any = {};
        for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? Buffer.from(v) : v;
        return o;
      });
    } finally { conn.close(); }
  }
  if (process.platform !== "darwin" || !fs.existsSync("/usr/bin/sqlite3")) throw new Error("no SQLite reader in this runtime");
  const r = await run("/usr/bin/sqlite3", ["-readonly", "-json", uri, sql], 60000);
  if (r.code !== 0) throw new Error("sqlite3: " + r.stderr.slice(0, 200));
  const rows = r.stdout.trim() ? JSON.parse(r.stdout) : [];
  return rows.map((o: any) => {
    for (const k of Object.keys(o)) if (k.endsWith("_hex") && typeof o[k] === "string") { o[k.slice(0, -4)] = Buffer.from(o[k], "hex"); delete o[k]; }
    return o;
  });
}

/** The path stored in a macOS bookmark blob (how Mixed In Key remembers a file):
 *  the path components (0x1004) under the volume path (0x2002). Same parser as the
 *  owner's mik_keys_to_rekordbox.py; null when the blob isn't one. */
export function bookmarkPath(buf: Buffer): string | null {
  try {
    if (!buf || buf.length < 48 || buf.toString("latin1", 0, 4) !== "book") return null;
    const hdr = buf.readUInt32LE(12);
    if (hdr < 16 || hdr >= buf.length) return null;
    let toc = buf.readUInt32LE(hdr) + hdr;
    const seen = new Set<number>();
    let parts: any = null, vol: any = null;
    const item = (off: number, depth = 0): any => {
      const p = off + hdr;
      const len = buf.readUInt32LE(p), typ = buf.readUInt32LE(p + 4);
      const body = buf.subarray(p + 8, p + 8 + len);
      const kind = typ & 0xffffff00;
      if (kind === 0x100) return body.toString("utf8");
      if (kind === 0x600 && depth < 2) {
        const a: any[] = [];
        for (let i = 0; i + 3 < body.length; i += 4) a.push(item(body.readUInt32LE(i), depth + 1));
        return a;
      }
      return null;
    };
    while (toc && !seen.has(toc) && toc + 20 <= buf.length) {
      seen.add(toc);
      if (buf.readUInt32LE(toc + 4) !== 0xfffffffe) break;
      const next = buf.readUInt32LE(toc + 12), count = buf.readUInt32LE(toc + 16);
      for (let i = 0; i < count; i++) {
        const rec = toc + 20 + 12 * i;
        if (rec + 12 > buf.length) break;
        const key = buf.readUInt32LE(rec), off = buf.readUInt32LE(rec + 4);
        if (key === 0x1004) parts = item(off);
        if (key === 0x2002) vol = item(off);
      }
      toc = next ? next + hdr : 0;
    }
    if (!Array.isArray(parts) || !parts.length || !parts.every((x) => typeof x === "string")) return null;
    const p = "/" + parts.join("/");
    return typeof vol === "string" && vol !== "/" && !p.startsWith(vol) ? path.posix.join(vol, p) : p;
  } catch {
    return null;
  }
}

/** How paths are compared across apps: NFC (macOS file names are often stored
 *  decomposed), case-folded, forward slashes. */
export const samePathKey = (p: string) => p.replace(/\\/g, "/").normalize("NFC").toLowerCase();

// ---------------- macOS ----------------

const BUNDLE: Record<AppId, string> = { pn: "com.mixedinkey.PlatinumNotes", mik: "com.mixedinkey.application" };
const APP_GLOB: Record<AppId, RegExp> = { pn: /^Platinum Notes.*\.app$/i, mik: /^Mixed In Key.*\.app$/i };
// document types from each app's Info.plist (Platinum Notes lists no FLAC)
const ACCEPTS: Record<AppId, string[]> = {
  pn: [".wav", ".mp3", ".aif", ".aiff", ".m4a"],
  mik: [".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac"],
};

async function bundleInfo(appPath: string): Promise<{ id: string; version: string } | null> {
  const plist = path.join(appPath, "Contents", "Info.plist");
  if (!isFile(plist)) return null;
  const r = await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist], 5000);
  if (r.code !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    return { id: String(j.CFBundleIdentifier || ""), version: String(j.CFBundleShortVersionString || j.CFBundleVersion || "") };
  } catch { return null; }
}

/** A bundle path as compared with a running app's: the real path (no symlink), case-folded
 *  (the usual macOS disk ignores case, so a path typed in lower case is the same app). */
const bundleKey = (p: string) => {
  let r = path.resolve(p);
  try { r = fs.realpathSync.native(r); } catch { /* not there: as typed */ }
  return r.replace(/\/+$/, "").toLowerCase();
};

/** pids of running copies of the app at this path (lsappinfo: no permission needed);
 *  null when lsappinfo fails */
async function macPids(app: AppId, appPath: string): Promise<number[] | null> {
  const r = await run("/usr/bin/lsappinfo", ["list"], 5000);
  if (r.code !== 0) return null;
  const out: number[] = [];
  const want = bundleKey(appPath);
  // one block per app: ... "CFBundleIdentifier"="..." ... bundle path="..." ... pid = 123 ...
  for (const block of r.stdout.split(/\n(?=\s*\d+\) )/)) {
    if (!block.includes(`bundleID="${BUNDLE[app]}"`)) continue;
    const bp = /bundle path="([^"]*)"/.exec(block)?.[1];
    const pid = Number(/\bpid = (\d+)/.exec(block)?.[1]);
    if (!pid) continue;
    if (bp && bundleKey(bp) !== want) continue;
    out.push(pid);
  }
  return out;
}

const darwin: ExtApps = {
  platform: "darwin",

  async detect(app) {
    const found = new Set<string>();
    for (const dir of ["/Applications", path.join(os.homedir(), "Applications")])
      for (const n of listDir(dir)) if (APP_GLOB[app].test(n)) found.add(path.join(dir, n));
    // Spotlight by bundle id finds a copy anywhere else (a renamed one, a subfolder)
    const r = await run("/usr/bin/mdfind", [`kMDItemCFBundleIdentifier == '${BUNDLE[app]}'`], 8000);
    if (r.code === 0) for (const l of r.stdout.split("\n")) if (l.trim().endsWith(".app")) found.add(l.trim());
    const out: AppCandidate[] = [];
    for (const p of found) {
      // a mounted installer image (/Volumes/Platinum Notes 10/…) is not an installed copy
      if (p.startsWith("/Volumes/")) continue;
      const v = await this.validate(app, p);
      if (v.ok) out.push({ path: p, version: v.version || "" });
    }
    return out.sort((a, b) => cmpVersion(b.version, a.version) || a.path.localeCompare(b.path));
  },

  async validate(app, appPath) {
    const p = String(appPath || "").replace(/\/+$/, "");
    if (!p.toLowerCase().endsWith(".app")) return { ok: false, code: "app_not_bundle" };
    if (!isDir(p)) return { ok: false, code: "app_not_found" };
    if (p.startsWith("/Volumes/") && /\/Volumes\/[^/]*(Platinum Notes|Mixed In Key)[^/]*\//i.test(p + "/"))
      return { ok: false, code: "app_on_installer" };
    const info = await bundleInfo(p);
    if (!info) return { ok: false, code: "app_unreadable" };
    if (info.id !== BUNDLE[app]) return { ok: false, code: "app_wrong" };
    return { ok: true, version: info.version };
  },

  async isRunning(app, appPath) {
    const pids = await macPids(app, appPath);
    return pids ? pids.length > 0 : null;
  },

  async openWithFiles(app, appPath, files) {
    // `open -a <bundle path>` hands the files over through the app's open-documents
    // handler (both apps implement application:openFiles:), launching it if needed.
    // UNVERIFIED against the real apps: whether they queue the files this way.
    // Mixed In Key analyses in the background (-g: it doesn't take the focus; verified in the
    // supervised test); Platinum Notes comes to the front, where the user presses Start
    const bg = app === "mik" ? ["-g"] : [];
    for (let i = 0; i < files.length; i += 200) {
      const r = await run("/usr/bin/open", [...bg, "-a", appPath, ...files.slice(i, i + 200)], 30000);
      if (r.code !== 0) throw Object.assign(new Error("open: " + (r.stderr.trim() || "exit " + r.code)), { code: "app_open_failed" });
    }
  },

  async quit(app, appPath) {
    if ((await this.isRunning(app, appPath)) === false) return "closed";
    // UNVERIFIED: NSRunningApplication.terminate through JXA is a polite quit request
    // (like Quit in the menu). Whether macOS asks for Automation consent for it from a
    // non-sandboxed app is untested. Time-boxed; never escalated to a forced quit: an app
    // with a dialog up (still processing, unsaved changes, an update) simply stays open.
    const js = `ObjC.import("AppKit");var a=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(${JSON.stringify(BUNDLE[app])});`
      + `var n=0;for(var i=0;i<a.count;i++){var x=a.objectAtIndex(i);`
      + `if(x.bundleURL&&x.bundleURL.path.js.toLowerCase()===${JSON.stringify(bundleKey(appPath))}){x.terminate;n++;}}n;`;
    const r = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", js], 10000);
    if (r.code !== 0) return "failed";
    for (let t = 0; t < 20; t++) {
      await sleep(500);
      if ((await this.isRunning(app, appPath)) === false) return "closed";
    }
    return "busy";
  },

  async readPnOutputMode() {
    // through the preferences daemon (the plist file on disk can lag behind it)
    const r = await run("/usr/bin/defaults", ["read", BUNDLE.pn, "output option"], 5000);
    if (r.code === 0) return r.stdout.trim() === "2" ? "replace" : "other";
    // no such key: the app's bundled default (0, next to the original) applies, unless
    // the app was never started here at all
    const dom = await run("/usr/bin/defaults", ["read", BUNDLE.pn], 5000);
    return dom.code === 0 ? "other" : "unknown";
  },

  async findMikDb() {
    const dir = path.join(os.homedir(), "Library", "Application Support", "Mixedinkey");
    // not recursive: a backups folder sits next to the live database
    const out = listDir(dir).filter((n) => /^Collection\d*\.mikdb$/i.test(n)).map((n) => path.join(dir, n)).filter(isSqlite);
    return out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  },

  async checkMikDb(db) {
    if (!isFile(db)) return { ok: false, code: "mik_db_not_found" };
    if (!isSqlite(db)) return { ok: false, code: "mik_db_not_sqlite" };
    try {
      const rows = await sqliteRows(db, "SELECT COUNT(*) AS n FROM ZSONG");
      return { ok: true, songs: Number(rows[0]?.n) || 0 };
    } catch {
      return { ok: false, code: "mik_db_unreadable" };
    }
  },

  async readMikKeys(db, files) {
    const want = new Map(files.map((f) => [samePathKey(f), f]));
    const rows = await sqliteRows(db, "SELECT ZKEY AS k, ZBOOKMARKDATA AS b, hex(ZBOOKMARKDATA) AS b2_hex FROM ZSONG WHERE ZKEY IS NOT NULL AND ZKEY <> ''");
    const out = new Map<string, string>();
    for (const r of rows) {
      const blob: Buffer | undefined = Buffer.isBuffer(r.b) ? r.b : Buffer.isBuffer(r.b2) ? r.b2 : undefined;
      const p = blob ? bookmarkPath(blob) : null;
      const f = p ? want.get(samePathKey(p)) : undefined;
      if (f && typeof r.k === "string") out.set(f, r.k.trim());
    }
    return out;
  },

  async suggestRekordboxXml() {
    const out: XmlSuggestion[] = [];
    const add = (p: string, source: XmlSuggestion["source"]) => {
      const q = plainPath(p);
      if (q && !out.some((s) => s.path === q)) out.push({ path: q, source, exists: isFile(q) });
    };
    const pioneer = path.join(os.homedir(), "Library", "Application Support", "Pioneer");
    // rekordbox 6 and 7 both keep their settings under rekordbox6
    for (const d of listDir(pioneer).filter((n) => /^rekordbox\d*$/i.test(n)).sort().reverse()) {
      const v = bridgeXml(path.join(pioneer, d, "rekordbox3.settings"));
      if (v) add(v, "rekordbox");
    }
    const r = await run("/usr/bin/defaults", ["read", BUNDLE.mik, "RekordboxFileUserSetLocationURL"], 5000);
    if (r.code === 0 && r.stdout.trim()) add(r.stdout.trim(), "mik");
    return out;
  },

  pnLogDir() {
    return path.join(os.homedir(), "Library", "Application Support", "Platinum Notes", "Logs");
  },

  accepts(app) { return ACCEPTS[app]; },
};

/** rekordbox's "Imported Library" (Preferences > Advanced > Database > rekordbox xml) */
function bridgeXml(settingsFile: string): string | null {
  try {
    const s = fs.readFileSync(settingsFile, "utf8");
    const m = /<VALUE\s+name="bridgeImportedLibraryFile"\s+val="([^"]*)"/.exec(s);
    const v = m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'") : "";
    return v.trim() || null;
  } catch { return null; }
}

// ---------------- Windows (UNTESTED) ----------------
// Nothing below has run on a Windows PC with these apps. The paths come from a
// third-party Mixed In Key automator and uninstaller listings (see the research
// notes); whether the exes accept files on the command line is unknown. Every
// method degrades to "not found" / "unknown" instead of throwing, so the wizard can
// fall back to asking the user.

const WIN_EXE: Record<AppId, RegExp> = { pn: /^platinum ?notes.*\.exe$/i, mik: /^mixed ?in ?key.*\.exe$/i };
// the cached installers (Package Cache: MixedInKeySetup.exe), uninstallers and updaters aren't the app
const WIN_NOT_APP = /setup|install|unins|update/i;
const winExe = (app: AppId, name: string) => WIN_EXE[app].test(name) && !WIN_NOT_APP.test(name);

function winRoots(): string[] {
  const e = process.env;
  const local = e.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return [path.join(local, "Programs", "Mixed In Key"), path.join(local, "Programs"),
          ...(e.ProgramFiles ? [path.join(e.ProgramFiles, "Mixed In Key"), path.join(e.ProgramFiles, "Mixed In Key LLC")] : []),
          ...(e["ProgramFiles(x86)"] ? [path.join(e["ProgramFiles(x86)"]!, "Mixed In Key LLC")] : [])];
}

/** null when tasklist fails or times out */
async function winPids(appPath: string): Promise<number[] | null> {
  const exe = path.win32.basename(appPath);
  const r = await run("tasklist", ["/FI", `IMAGENAME eq ${exe}`, "/FO", "CSV", "/NH"], 8000);
  if (r.code !== 0) return null;
  // "MixedInKey.exe","1234","Console","1","123,456 K"; "INFO: No tasks ..." when none
  const out: number[] = [];
  for (const l of r.stdout.split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)"/.exec(l.trim());
    if (m && m[1].toLowerCase() === exe.toLowerCase()) out.push(Number(m[2]));
  }
  return out;
}

const win32: ExtApps = {
  platform: "win32",

  async detect(app) {
    const out: AppCandidate[] = [];
    const seen = new Set<string>();
    const look = (dir: string, depth: number) => {
      if (depth < 0) return;
      for (const n of listDir(dir)) {
        const p = path.join(dir, n);
        if (winExe(app, n) && isFile(p) && !seen.has(p.toLowerCase())) {
          seen.add(p.toLowerCase());
          // the version is in the folder name ("Mixed In Key 11", "Platinum Notes 10")
          out.push({ path: p, version: /(\d+(?:\.\d+)*)\s*$/.exec(path.basename(dir))?.[1] || "" });
        } else if (depth > 0 && /mixed ?in ?key|platinum ?notes/i.test(n) && isDir(p)) look(p, depth - 1);
      }
    };
    for (const r of winRoots()) look(r, 2);
    return out.sort((a, b) => cmpVersion(b.version, a.version));
  },

  async validate(app, appPath) {
    const p = String(appPath || "");
    if (!p.toLowerCase().endsWith(".exe")) return { ok: false, code: "app_not_exe" };
    if (!isFile(p)) return { ok: false, code: "app_not_found" };
    if (!winExe(app, path.win32.basename(p))) return { ok: false, code: "app_wrong" };
    return { ok: true, version: /(\d+(?:\.\d+)*)\s*$/.exec(path.win32.basename(path.win32.dirname(p)))?.[1] || "" };
  },

  async isRunning(_app, appPath) {
    const pids = await winPids(appPath);
    return pids ? pids.length > 0 : null;
  },

  async openWithFiles(_app, appPath, files) {
    // UNTESTED: passing files as arguments; a second launch with more files may or may
    // not reach the running instance. Batches stay well under the ~32,000-character
    // command line limit.
    const batches: string[][] = [];
    let cur: string[] = [], len = appPath.length;
    for (const f of files) {
      if (cur.length && len + f.length + 3 > 24000) { batches.push(cur); cur = []; len = appPath.length; }
      cur.push(f); len += f.length + 3;
    }
    if (cur.length) batches.push(cur);
    for (const b of batches) {
      await new Promise<void>((resolve, reject) => {
        try {
          const c = spawn(appPath, b, { detached: true, stdio: "ignore", windowsHide: false });
          c.on("error", (e) => reject(Object.assign(e, { code: "app_open_failed" })));
          c.unref();
          setTimeout(resolve, 1500);
        } catch (e: any) { reject(Object.assign(e, { code: "app_open_failed" })); }
      });
    }
  },

  async quit(app, appPath) {
    const pids = await winPids(appPath);
    if (!pids) return "failed";   // can't tell which copy is running: never sent a close
    if (!pids.length) return "closed";
    // UNTESTED: taskkill without /F asks the window to close (like its close button);
    // never forced.
    const r = await run("taskkill", pids.flatMap((p) => ["/PID", String(p)]), 10000);
    if (r.code !== 0 && !/success/i.test(r.stdout)) return "failed";
    for (let t = 0; t < 20; t++) {
      await sleep(500);
      if ((await this.isRunning(app, appPath)) === false) return "closed";
    }
    return "busy";
  },

  async readPnOutputMode() {
    return "unknown"; // where Platinum Notes 10 keeps this setting on Windows is not known
  },

  async findMikDb() {
    const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Mixed In Key", "Mixed In Key");
    return listDir(base).sort((a, b) => cmpVersion(b, a)).map((v) => path.join(base, v, "MIKStore.db")).filter(isSqlite);
  },

  async checkMikDb(db) {
    if (!isFile(db)) return { ok: false, code: "mik_db_not_found" };
    if (!isSqlite(db)) return { ok: false, code: "mik_db_not_sqlite" };
    try {
      const rows = await sqliteRows(db, "SELECT COUNT(*) AS n FROM Song");
      return { ok: true, songs: Number(rows[0]?.n) || 0 };
    } catch {
      return { ok: false, code: "mik_db_unreadable" };
    }
  },

  async readMikKeys() {
    return null; // the key column of MIKStore.db is not known yet
  },

  async suggestRekordboxXml() {
    const out: XmlSuggestion[] = [];
    const pioneer = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Pioneer");
    for (const d of listDir(pioneer).filter((n) => /^rekordbox\d*$/i.test(n)).sort().reverse()) {
      const v = bridgeXml(path.join(pioneer, d, "rekordbox3.settings"));
      if (v) { const q = plainPath(v); if (!out.some((s) => s.path === q)) out.push({ path: q, source: "rekordbox", exists: isFile(q) }); }
    }
    return out;
  },

  pnLogDir() { return null; },

  accepts(app) { return ACCEPTS[app]; },
};

// ---------------- anything else ----------------

const unsupported: ExtApps = {
  platform: process.platform,
  async detect() { return []; },
  async validate() { return { ok: false, code: "platform_unsupported" }; },
  async isRunning() { return false; },
  async openWithFiles() { throw Object.assign(new Error("not supported on this system"), { code: "platform_unsupported" }); },
  async quit() { return "failed"; },
  async readPnOutputMode() { return "unknown"; },
  async findMikDb() { return []; },
  async checkMikDb() { return { ok: false, code: "platform_unsupported" }; },
  async readMikKeys() { return null; },
  async suggestRekordboxXml() { return []; },
  pnLogDir() { return null; },
  accepts(app) { return ACCEPTS[app]; },
};

/** The implementation for this computer. `allowFake`: honour DJHQ_FAKE_APPS (tests). */
export function platformApps(allowFake = true): ExtApps {
  const fake = process.env.DJHQ_FAKE_APPS;
  if (fake && allowFake) {
    const m = require(path.resolve(fake));
    const impl = typeof m === "function" ? m() : typeof m?.default === "function" ? m.default() : m?.default || m;
    console.log("DJ HQ: using the test stand-ins for Platinum Notes and Mixed In Key from " + fake);
    return impl as ExtApps;
  }
  return process.platform === "darwin" ? darwin : process.platform === "win32" ? win32 : unsupported;
}
