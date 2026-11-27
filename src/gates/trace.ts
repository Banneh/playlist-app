/** Step-by-step trace of a gate walk, for when a provider misbehaves.
 *
 *  Off by default: the walk already logs one line per step to the console. With developer mode on
 *  (`DJ_HQ_DEVELOPER_MODE`) every adapter also gets a file under `<userData>/gate-logs/`, and the
 *  shared layers — HTTP, the walk window, the SoundCloud calls — write into it, so a report shows
 *  what the hidden browser did without anyone having to reproduce it.
 *
 *  The sink is module-level because the shared layers have no `WalkContext`; `registry.walk` opens
 *  one for the duration of a walk and closes it in `finally`. */
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import * as core from "../core";

type Sink = (msg: string) => void;

let sink: Sink | null = null;
let file = "";

/** Whether a trace is being written right now. */
export const tracing = () => sink !== null;

/** Start a trace for one adapter. Returns the logger the walk uses; a no-op when developer mode is
 *  off, so callers never have to branch. */
export function open(adapterId: string): Sink {
  const console_ = (m: string) => console.log(`[gate:${adapterId}] ${m}`);
  if (!core.DEV_MODE) return console_;
  try {
    const dir = path.join(app.getPath("userData"), "gate-logs");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    file = path.join(dir, `${stamp}-${adapterId}.log`);
    fs.writeFileSync(file, `# ${adapterId} ${new Date().toISOString()}\n`);
    console.log(`[gate:${adapterId}] trace ${file}`);
  } catch {
    file = "";
  }
  const log: Sink = (m) => {
    console_(m);
    if (!file) return;
    try { fs.appendFileSync(file, `${new Date().toISOString()} ${m}\n`); } catch {}
  };
  sink = log;
  return log;
}

/** Stop the trace. */
export function close(): void {
  sink = null;
  file = "";
}

/** Write to the open trace, if any. Used by the shared layers. */
export function trace(msg: string): void {
  sink?.(msg);
}

/** The file being written, for the "where is it" line. */
export const traceFile = () => file;
