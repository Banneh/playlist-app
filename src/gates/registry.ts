/** The adapter registry: first match wins, ordered by measured frequency.
 *
 *  `main.ts` asks `match()`; on null it falls through to the Hypeddit walkers. `walk()` owns the
 *  shared pieces — the hidden window, the abort signal, the undo pass — so no adapter touches
 *  main.ts state. */
import { session, type Session } from "electron";
import * as core from "../core";
import { WalkWindow } from "./oauth";
import { undo } from "./soundcloud";
import { UA } from "./http";
import { GATE_PARTITION, SC_PARTITION, type GateAdapter, type WalkContext, type WalkResult } from "./types";
import droploud from "./droploud";
import downloadgater from "./downloadgater";
import gaterush from "./gaterush";
import fangate from "./fangate";
import toneden from "./toneden";
import gatekit from "./gatekit";
import powergate from "./powergate";
import pumpyoursound from "./pumpyoursound";
import beltergate from "./beltergate";
import managerone from "./managerone";

const ADAPTERS: GateAdapter[] = [droploud, downloadgater, gaterush, fangate, toneden, gatekit, powergate, pumpyoursound, beltergate, managerone];

export function match(url: URL): GateAdapter | null {
  const off = disabled();
  for (const a of ADAPTERS) {
    if (off.has(a.id)) continue;
    if (!a.hosts.test(url.hostname)) continue;
    try { if (a.match(url)) return a; } catch {}
  }
  return null;
}

/** Host patterns for the UI, so a link the app can fetch itself is not offered as a browser link. */
export const hostSources = () => ADAPTERS.map((a) => a.hosts.source);

/** Adapter ids switched off in Settings → Gates. */
function disabled(): Set<string> {
  const raw = core.getSettings().gate_off;
  return new Set(Array.isArray(raw) ? raw.map((x: string) => String(x).toLowerCase()) : []);
}

export const ids = () => ADAPTERS.map((a) => a.id);

/** Whether any adapter claims this URL, ignoring the switches (for the Settings list). */
export function claims(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  for (const a of ADAPTERS) { try { if (a.match(u)) return a.id; } catch {} }
  return null;
}

/** A walk is in flight: `window-all-closed` must not quit the app under it. */
let active = 0;
export const busy = () => active > 0;

/** Provider logins the user already made through the Hypeddit walker live in its partition. Copy
 *  them over once so a provider step stays hidden instead of asking for a login again. */
const PROVIDER_DOMAINS = [".spotify.com", ".instagram.com", ".facebook.com", ".google.com", ".x.com", ".twitter.com"];
async function seedProviderSessions(ses: Session): Promise<void> {
  const src = session.fromPartition("persist:hypeddit");
  for (const domain of PROVIDER_DOMAINS) {
    const have = new Set((await ses.cookies.get({ domain })).map((c) => c.name));
    for (const c of await src.cookies.get({ domain })) {
      if (have.has(c.name)) continue;
      await ses.cookies.set({
        url: `https://${domain.replace(/^\./, "")}${c.path || "/"}`,
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate,
      }).catch(() => {});
    }
  }
}

/** Copy the app's SoundCloud session into the gate session so the consent page renders without a
 *  login. `oauth_refresh_token` is deliberately left behind: SoundCloud rotates it on use, and a
 *  second holder would invalidate the app's copy. The `oauth_token` itself is always taken from the
 *  app, so a walk starts on the freshest one. */
async function seedSoundcloudSession(ses: Session): Promise<void> {
  const src = session.fromPartition(SC_PARTITION);
  const have = new Map((await ses.cookies.get({})).map((c) => [(c.domain || "") + (c.path || "/") + c.name, c]));
  for (const c of await src.cookies.get({})) {
    const domain = c.domain || "";
    const cpath = c.path || "/";
    if (!/(^|\.)soundcloud\.com$/i.test(domain)) continue;
    if (c.name === "oauth_refresh_token") continue;
    const old = have.get(domain + cpath + c.name);
    if (old && c.name !== "oauth_token" && old.value === c.value) continue;
    await ses.cookies.set({
      url: `https://${domain.replace(/^\./, "")}${cpath}`,
      name: c.name, value: c.value, domain, path: cpath,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate,
    }).catch(() => {});
  }
}

import * as trace from "./trace";

/** Walk one gate. Resolves with the saved file; throws when the gate hands out nothing. */
export function walk(adapter: GateAdapter, url: string, email: string): Promise<WalkResult> {
  return trace.withTrace(adapter.id, (log) => walkTraced(adapter, url, email, log));
}

async function walkTraced(adapter: GateAdapter, url: string, email: string, log: (m: string) => void): Promise<WalkResult> {
  const ses = session.fromPartition(GATE_PARTITION);
  // the same plain Chrome user agent the Discover view uses, or SoundCloud treats the walk as a
  // different client than the session it was seeded from
  ses.setUserAgent(ses.getUserAgent().replace(/ ?(Electron|dj-hq|DJ HQ)\/\S+/gi, ""));
  log(`walk ${url}`);
  await seedSoundcloudSession(ses).catch((e) => log("[seed] soundcloud failed: " + e));
  await seedProviderSessions(ses).catch((e) => log("[seed] providers failed: " + e));
  log(`[seed] ${(await ses.cookies.get({})).length} cookies in the gate partition`);
  const w = new WalkWindow(ses, log);
  const ac = new AbortController();
  const s = core.getSettings();
  const ctx: WalkContext = {
    url,
    email,
    comment: s.dl_comment || "fire",
    ua: UA,
    session: ses,
    window: w,
    log,
    signal: ac.signal,
    needAttention: (r) => w.needAttention(r),
  };
  active++;
  try {
    const res = await adapter.walk(ctx);
    log(`saved ${res.bytes} bytes ${res.mime}`);
    if (s.undo_after_download !== false && res.performed.length) {
      await undo(w, res.performed).catch((e) => log("[undo] failed: " + e));
    }
    return res;
  } catch (e: any) {
    log(`FAILED ${e?.message || e}`);
    throw e;
  } finally {
    active--;
    w.destroy();
  }
}
