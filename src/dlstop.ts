/** One Stop for every free download in flight (the Stop of Download all), and a time limit for the
 *  steps that can wait forever (a page that never finishes loading, a script on a page that went
 *  away, a gate that waits on a human nobody shows up for).
 *
 *  stopAll() aborts the current signal and hands out a fresh one, so a download started after a
 *  Stop runs as usual. Every walk listens with onStop() and closes its own hidden windows. */
import * as core from "./core";

let ac = new AbortController();
const hooks = new Set<() => void>();

export const stopped = () => core.appError("dl_stopped", "the download was stopped");
export const timedOut = () => core.appError("dl_timeout", "the download took too long and was given up");

/** the signal of the downloads running now; aborted by the next stopAll() */
export const signal = (): AbortSignal => ac.signal;

/** run `fn` on the next stopAll(); returns the function that takes it off again */
export function onStop(fn: () => void): () => void {
  hooks.add(fn);
  return () => { hooks.delete(fn); };
}

export function stopAll(): void {
  const old = ac;
  ac = new AbortController();
  old.abort(stopped());
  for (const fn of [...hooks]) { try { fn(); } catch { /* one walk's cleanup must not stop the rest */ } }
}

/** `p`, or a rejection with the signal's reason as soon as `sig` is aborted */
export function until<T>(p: Promise<T>, sig: AbortSignal): Promise<T> {
  if (sig.aborted) { p.catch(() => {}); return Promise.reject(sig.reason); }
  return new Promise<T>((resolve, reject) => {
    const off = () => sig.removeEventListener("abort", onAbort);
    const onAbort = () => { off(); reject(sig.reason); };
    sig.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { off(); resolve(v); }, (e) => { off(); reject(e); });
  });
}

/** a fetch signal: its own time limit, and the Stop */
export const fetchSignal = (ms: number): AbortSignal => AbortSignal.any([AbortSignal.timeout(ms), ac.signal]);

/** true for the error a Stop leaves behind */
export const isStop = (e: unknown): boolean => !!e && (e as { code?: string }).code === "dl_stopped";
