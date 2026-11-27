/** Step-by-step trace of a gate walk, for when a provider misbehaves.
 *
 *  Off by default: the walk already logs one line per step to the console. With developer mode on
 *  (`DJ_HQ_DEVELOPER_MODE`) every walk also gets its own file under `<userData>/gate-logs/`, and
 *  the shared layers (HTTP, the walk window, the SoundCloud calls) write into it, so a report shows
 *  what the hidden browser did without anyone having to reproduce it.
 *
 *  Each walk has its own file and its own logger. The shared layers have no `WalkContext`, so they
 *  find the logger of the walk they run in through AsyncLocalStorage: two walks at once each keep
 *  their own lines, and a file is never written over (a name that is taken gets " (2)" and so on). */
import * as fs from "fs";
import * as path from "path";
import { AsyncLocalStorage } from "async_hooks";
import { app } from "electron";
import * as core from "../core";

type Sink = (msg: string) => void;

const current = new AsyncLocalStorage<Sink>();

/** A new file for this walk, never one that is there already. "" when it can't be made. */
function newFile(adapterId: string): string {
  try {
    const dir = path.join(app.getPath("userData"), "gate-logs");
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 23);
    for (let i = 1; i < 100; i++) {
      const p = path.join(dir, `${stamp}-${adapterId}${i > 1 ? ` (${i})` : ""}.log`);
      try {
        fs.writeFileSync(p, `# ${adapterId} ${now.toISOString()}\n`, { flag: "wx" });
        return p;
      } catch (e: any) {
        if (e?.code !== "EEXIST") return "";
      }
    }
  } catch {}
  return "";
}

/** Run one walk with a trace. `fn` gets the logger the walk uses; without developer mode it only
 *  writes to the console, so callers never have to branch. */
export function withTrace<T>(adapterId: string, fn: (log: Sink) => Promise<T>): Promise<T> {
  const console_ = (m: string) => console.log(`[gate:${adapterId}] ${m}`);
  const file = core.DEV_MODE ? newFile(adapterId) : "";
  if (file) console_(`trace ${file}`);
  const log: Sink = (m) => {
    console_(m);
    if (!file) return;
    try { fs.appendFileSync(file, `${new Date().toISOString()} ${m}\n`); } catch {}
  };
  return current.run(log, () => fn(log));
}

/** Write to the trace of the walk this runs in, if any. Used by the shared layers. */
export function trace(msg: string): void {
  current.getStore()?.(msg);
}
