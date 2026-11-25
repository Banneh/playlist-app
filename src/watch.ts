/** Watches the collection's roots so the in-memory index (core.scanCollection) stays fresh
 *  without a walk on every view: while every root is watched, a view reuses the index and a
 *  change under any root only marks it dirty for the next scan. Watching is an optimisation,
 *  never a source of truth: whenever a root cannot be watched (an unplugged drive, a platform
 *  without recursive fs.watch), core is told and every view scans as before. A sync pass runs
 *  at start, after every collection change (the server calls sync()) and on a slow interval,
 *  so roots that appear, disappear or remount are picked up by themselves. */
import * as fs from "fs";
import * as core from "./core";

const RECURSIVE_OK = process.platform === "darwin" || process.platform === "win32";
const SYNC_MS = 15000;

const watchers = new Map<string, fs.FSWatcher>();
let timer: NodeJS.Timeout | null = null;
let started = false;

function closeOne(dir: string): void {
  const w = watchers.get(dir);
  if (w) { try { w.close(); } catch { /* already gone */ } watchers.delete(dir); }
}

/** Bring the watcher set in line with the collection's roots. */
export function sync(): void {
  const want = new Map(core.collRoots().map((r) => [r.path, !!r.subfolders]));
  for (const dir of [...watchers.keys()]) if (!want.has(dir)) closeOne(dir);
  let all = RECURSIVE_OK;
  for (const [dir, subfolders] of want) {
    if (watchers.has(dir)) continue;
    if (!RECURSIVE_OK && subfolders) { all = false; continue; }   // Linux: no recursive fs.watch
    try {
      const w = fs.watch(dir, { recursive: RECURSIVE_OK && subfolders }, () => core.collDirty());
      w.on("error", () => { closeOne(dir); core.setWatching(false); core.collDirty(); });
      watchers.set(dir, w);
    } catch {
      all = false;   // the folder is away (or can't be watched): views scan as before
    }
  }
  for (const dir of want.keys()) if (!watchers.has(dir)) all = false;
  core.setWatching(all && want.size > 0);
}

/** Start watching: a sync now, then a slow self-healing resync. Safe to call once. */
export function start(): void {
  if (started) return;
  started = true;
  sync();
  timer = setInterval(sync, SYNC_MS);
  timer.unref?.();
  process.on("exit", stop);
}

export function stop(): void {
  if (timer) { clearInterval(timer); timer = null; }
  for (const dir of [...watchers.keys()]) closeOne(dir);
  core.setWatching(false);
  started = false;
}
