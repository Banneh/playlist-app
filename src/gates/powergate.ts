/** powergate.me — `https://www.powergate.me/g/<slug>`.
 *
 *  The gate id is a cuid inside the escaped RSC payload, not in the URL. `/api/gate-attempt` and
 *  `/api/unlock` must run in-page: the SoundCloud link is a session cookie, not a bearer token, and
 *  from Node they answer 400 "Sign in with SoundCloud" / 500. */
import { req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://www.powergate.me";

const adapter: GateAdapter = {
  id: "powergate",
  hosts: /(^|\.)powergate\.me$/i,

  match(u) {
    return /(^|\.)powergate\.me$/i.test(u.hostname) && /^\/g\//.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const before = await snapshot(ctx.session);
    const html = await (await req(ctx.url)).text();
    const gateId = (html.match(/\\?"gate\\?":\{\\?"id\\?":\\?"([a-z0-9]+)\\?"/) || [])[1] || "";
    const slug = (html.match(/\\?"slug\\?":\\?"([^"\\]+)\\?"/) || [])[1] || new URL(ctx.url).pathname.split("/").pop() || "";
    const reqs = [...html.matchAll(/\\?"platform\\?":\\?"([A-Z_]+)\\?"\}/g)].map((m) => m[1]);
    ctx.log(`gate ${gateId} ${slug}, requirements: ${reqs.join(",")}`);
    if (!gateId) throw new Error("no gate id");

    const post = async (p: string, body: unknown) => {
      const out = await ctx.window.js<{ status: number; text: string }>(`fetch(${JSON.stringify(p)}, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))},
      }).then(async (r) => ({ status: r.status, text: await r.text() }))`);
      let json: any = {};
      try { json = JSON.parse(out.text); } catch {}
      return { status: out.status, json };
    };

    ctx.window.load(ctx.url);
    await sleep(1500);
    const attempt = await post("/api/gate-attempt", { gateId });
    ctx.log(`attempt ${attempt.status} ${attempt.json.id || ""}`);

    const landed = await ctx.window.consent(`${BASE}/api/soundcloud/authorize?returnUrl=${encodeURIComponent(ctx.url)}`, (u) => u.includes("scConnected=1"), ctx.signal);
    ctx.log(`landed ${landed.slice(0, 90)}`);
    await sleep(2500);
    ctx.window.load(ctx.url);
    await sleep(1500);

    let downloadUrl = "";
    for (const platform of reqs) {
      const body = platform === "SPOTIFY_FOLLOW" || platform === "INSTAGRAM_FOLLOW" ? { gateId, platform } : { gateId, platform, comment: ctx.comment };
      const r = await post("/api/unlock", body);
      ctx.log(`unlock ${platform} ${r.status} ${JSON.stringify(r.json).slice(0, 140)}`);
      if (r.json.downloadUrl) downloadUrl = r.json.downloadUrl;
      if (r.json.needsReauth) ctx.log("needs reauth");
    }

    await post("/api/unlock/complete", { gateId, attemptId: attempt.json.id, steps: reqs });
    if (!downloadUrl) throw new Error("no download url");

    const file = await saveFile(downloadUrl.startsWith("/") ? BASE + downloadUrl : downloadUrl, { referer: ctx.url }, slug + ".mp3");
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...file, performed };
  },
};

export default adapter;
