/** gaterush.me — `https://gaterush.me/<slug>`.
 *
 *  The visit cookie from the gate page is what makes `/auth/soundcloud` work without a Gaterush
 *  account; without it the endpoint answers `302 /login` and looks like an artist wall. The comment
 *  has to be saved before the popup. The server performs like, repost and every follow. */
import { req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://gaterush.me";

const adapter: GateAdapter = {
  id: "gaterush",
  hosts: /(^|\.)gaterush\.me$/i,

  match(u) {
    return /(^|\.)gaterush\.me$/i.test(u.hostname) && u.pathname.split("/").filter(Boolean).length === 1;
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const slug = new URL(ctx.url).pathname.split("/").filter(Boolean).pop() || "";
    const before = await snapshot(ctx.session);

    const page = await req(ctx.url);
    const html = await page.text();
    const csrf = (html.match(/csrf-token" content="([^"]+)"/) || [])[1] || "";
    const gate = parseGate(html);
    ctx.log(`gate ${slug}, steps: ${(gate.steps || []).map((s: any) => s.id).join(",")}`);

    // The visit cookie lives in the session, so the page has to be loaded in the window too.
    ctx.window.load(ctx.url);
    await sleep(1500);
    const saved = await ctx.window.js<string>(`fetch('/save-comment/${slug}', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-CSRF-Token': ${JSON.stringify(csrf)} },
      body: new URLSearchParams({ commentText: ${JSON.stringify(ctx.comment)}, _csrf: ${JSON.stringify(csrf)} }),
    }).then((r) => r.status)`).catch(() => "0");
    ctx.log(`comment ${saved}`);

    const authUrl = gate.authUrl || `${BASE}/auth/soundcloud?slug=${slug}`;
    const landed = await ctx.window.consent(authUrl, (u) => u.includes("/callback/soundcloud"), ctx.signal);
    ctx.log(`landed ${landed.slice(0, 90)}`);
    await sleep(5000);

    const jar = (await ctx.session.cookies.get({ domain: "gaterush.me" })).map((c) => `${c.name}=${c.value}`).join("; ");
    const file = await saveFile(`${BASE}/download/${slug}`, { cookie: jar, referer: ctx.url }, slug + ".mp3");
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...file, performed };
  },
};

/** `window.__GATE__` is a JS object literal with unquoted keys, not JSON. */
function parseGate(html: string): { steps?: Array<{ id: string }>; authUrl?: string } {
  const i = html.indexOf("window.__GATE__ = ");
  if (i < 0) return {};
  const src = html.slice(i + 18);
  let depth = 0, end = -1;
  for (let k = 0; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) { end = k + 1; break; }
  }
  if (end < 0) return {};
  try { return new Function("return " + src.slice(0, end))(); } catch { return {}; }
}

export default adapter;
