/** SoundCloud writes and undo.
 *
 *  `api-v2.soundcloud.com` writes from Node get 403 from DataDome, so they run inside a page on
 *  soundcloud.com via `executeJavaScript`. Reads (resolve, comments, reposts) work from Node with
 *  the `oauth_token` cookie and stay there.
 *
 *  Both sides use the app's own session partition, so the token the app already holds is the token
 *  used for verification and undo. */
import type { Session } from "electron";
import { req, sleep, UA } from "./http";
import type { WalkWindow } from "./oauth";
import type { WalkResult } from "./types";

const SC_HOME = "https://soundcloud.com/discover";

export async function scToken(ses: Session): Promise<string | null> {
  const c = await ses.cookies.get({ name: "oauth_token", domain: "soundcloud.com" });
  return c.find((x) => x.value)?.value || null;
}

/** Make sure the walk window sits on a loaded soundcloud.com page (the document is enough for a
 *  fetch; its load event can be many seconds later). */
async function ensurePage(w: WalkWindow): Promise<void> {
  const wc = w.webContents;
  const onSc = /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(wc.getURL());
  if (onSc && !wc.isLoadingMainFrame()) return;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(t); wc.removeListener("dom-ready", done); resolve(); };
    const t = setTimeout(done, 20000);
    wc.on("dom-ready", done);
    if (!onSc) w.load(SC_HOME);
  });
  await sleep(800);
}

/** One api-v2 write from inside the page. */
export async function scWrite(w: WalkWindow, method: string, apiPath: string, body?: unknown): Promise<{ status: number; text: string }> {
  const tok = await scToken(w.ses);
  if (!tok) throw new Error("sc_signed_out");
  await ensurePage(w);
  await sleep(1200);
  const js = `(async () => {
    const r = await fetch('https://api-v2.soundcloud.com/${apiPath}', {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { authorization: 'OAuth ' + ${JSON.stringify(tok)}, 'content-type': 'application/json' },
      ${body === undefined ? "" : `body: ${JSON.stringify(JSON.stringify(body))},`}
    });
    return r.status + ' ' + (await r.text()).slice(0, 300);
  })()`;
  const run = async () => {
    const out = await Promise.race([
      w.js<string>(js),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("sc_write_timeout")), 20000)),
    ]);
    const sp = out.indexOf(" ");
    const res = { status: Number(out.slice(0, sp)), text: out.slice(sp + 1) };
    w.log(`[sc] ${method} ${apiPath} ${res.status} ${res.text.slice(0, 80).replace(/\s+/g, " ")}`);
    return res;
  };
  // DataDome answers 403 with a captcha URL while the page's own scripts are still settling; a
  // second pass a few seconds later goes through. When it still refuses, the challenge is real:
  // show the window so the human can solve it, then retry.
  let r = await run();
  if (r.status === 403) {
    await sleep(3500);
    r = await run();
  }
  for (let i = 0; i < 2 && r.status === 403; i++) {
    const url = captchaUrl(r.text);
    if (!url) break;
    if (!(await solveCaptcha(w, url))) break;
    await ensurePage(w);
    await sleep(1200);
    r = await run();
  }
  // 401 means the token in the cookie is dead (they expire after a day). Nothing refreshes it on
  // its own, so the human has to sign in again.
  if (r.status === 401 && (await w.signIn(tok))) {
    await ensurePage(w);
    await sleep(1200);
    r = await run();
  }
  return r;
}

const CAPTCHA_TIMEOUT_MS = 3 * 60 * 1000;

/** The challenge URL out of a DataDome 403 body. The body is truncated, so it is matched, not
 *  parsed. */
function captchaUrl(text: string): string | null {
  const m = text.match(/https:\/\/geo\.captcha-delivery\.com\/captcha\/\?[^"\\\s]+/);
  return m ? m[0] : null;
}

/** Show the window on the challenge and wait for the human. The `datadome` cookie rotates every
 *  couple of seconds whether or not the challenge is passed, so the cookie alone proves nothing:
 *  the page is asked for a cheap api-v2 call and only a non-403 answer counts as solved. */
async function solveCaptcha(w: WalkWindow, url: string): Promise<boolean> {
  w.log("[captcha] challenge, showing the window");
  w.reveal();
  try {
    w.load(url);
    const deadline = Date.now() + CAPTCHA_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(1500);
      const at = w.win.isDestroyed() ? "" : w.win.webContents.getURL();
      if (!/captcha-delivery\.com/.test(at)) continue;
      const status = await w.js<number>(
        `fetch('https://api-v2.soundcloud.com/me', { credentials: 'include' }).then((r) => r.status).catch(() => 0)`,
      ).catch(() => 0);
      if (status && status !== 403) { w.log(`[captcha] solved (${status})`); return true; }
    }
    w.log("[captcha] not solved in time");
    return false;
  } finally {
    w.conceal();
  }
}

/** The numeric id of a track from its permalink URL. */
export async function scTrackId(ses: Session, trackUrl: string): Promise<number> {
  const tok = await scToken(ses);
  if (!tok) throw new Error("sc_signed_out");
  const r = await req(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(trackUrl)}`, {
    headers: { authorization: "OAuth " + tok },
  });
  const j = await r.json().catch(() => null) as { id?: number } | null;
  if (!j?.id) throw new Error("sc_resolve_failed");
  return j.id;
}

/** Take back what the walk left on the account. */
export async function undo(w: WalkWindow, performed: WalkResult["performed"]): Promise<void> {
  for (const a of performed) {
    const path =
      a.kind === "repost" ? `me/track_reposts/${a.id}`
      : a.kind === "like" ? `me/track_likes/${a.id}`
      : a.kind === "follow" ? `me/followings/${a.id}`
      : `tracks/${a.id}/comments/${(a as { commentId?: number }).commentId ?? ""}`;
    const r = await scWrite(w, "DELETE", path).catch((e) => ({ status: 0, text: String(e) }));
    w.log(`[undo] ${a.kind} ${a.id} → ${r.status}`);
    await sleep(300);
  }
}

/** The fan's own user id, for follow undo bookkeeping. */
export async function scMe(ses: Session): Promise<number | null> {
  const tok = await scToken(ses);
  if (!tok) return null;
  const r = await req("https://api-v2.soundcloud.com/me", { headers: { authorization: "OAuth " + tok, "user-agent": UA } });
  const j = await r.json().catch(() => null) as { id?: number } | null;
  return j?.id ?? null;
}

/** What the account carries right now. Gates that perform the actions server-side never tell us
 *  the ids, so the walk diffs this before and after instead. */
export interface ActionSnapshot {
  reposts: Set<number>;
  likes: Set<number>;
  followings: Set<number>;
}

async function ids(ses: Session, path: string): Promise<Set<number>> {
  const tok = await scToken(ses);
  if (!tok) return new Set();
  const r = await req(`https://api-v2.soundcloud.com/${path}`, { headers: { authorization: "OAuth " + tok } });
  const j = await r.json().catch(() => null) as { collection?: Array<{ id?: number; track?: { id?: number } }> } | null;
  const out = new Set<number>();
  for (const e of j?.collection || []) {
    const id = e.track?.id ?? e.id;
    if (id) out.add(id);
  }
  return out;
}

export async function snapshot(ses: Session): Promise<ActionSnapshot> {
  const me = await scMe(ses);
  if (!me) return { reposts: new Set(), likes: new Set(), followings: new Set() };
  const [reposts, likes, followings] = await Promise.all([
    ids(ses, `stream/users/${me}/reposts?limit=20`),
    ids(ses, `users/${me}/track_likes?limit=20`),
    ids(ses, `users/${me}/followings?limit=50`),
  ]);
  return { reposts, likes, followings };
}

/** The actions that appeared between the two snapshots. */
export function diffActions(before: ActionSnapshot, after: ActionSnapshot): WalkResult["performed"] {
  const out: WalkResult["performed"] = [];
  for (const id of after.reposts) if (!before.reposts.has(id)) out.push({ kind: "repost", id });
  for (const id of after.likes) if (!before.likes.has(id)) out.push({ kind: "like", id });
  for (const id of after.followings) if (!before.followings.has(id)) out.push({ kind: "follow", id });
  return out;
}

