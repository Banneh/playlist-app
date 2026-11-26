/** gatekit.pro — `https://gatekit.pro/<slug>` or `/g/<slug>`.
 *
 *  The session token from `/api/unlock/session` has to go as `x-session` on every later call and
 *  expires fast, so it is minted and used in one pass. The comment rides along with the OAuth
 *  start. */
import { jpost, req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://gatekit.pro";

const adapter: GateAdapter = {
  id: "gatekit",
  hosts: /(^|\.)gatekit\.pro$/i,

  match(u) {
    return /(^|\.)gatekit\.pro$/i.test(u.hostname) && u.pathname.split("/").filter(Boolean).length === 1;
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const slug = new URL(ctx.url).pathname.replace(/^\/g\//, "/").split("/").filter(Boolean).pop() || "";
    const before = await snapshot(ctx.session);
    const H = { origin: BASE, referer: ctx.url };

    const s = await jpost<{ sessionToken?: string }>(`${BASE}/api/unlock/session`, { slug }, H);
    const tok = s.json?.sessionToken || "";
    if (!tok) throw new Error("no session token");
    const X = { ...H, "x-session": tok };

    const cfg = await (await req(`${BASE}/api/gates/${encodeURIComponent(slug)}/public`, { headers: { "x-session": tok } })).json().catch(() => null) as { gate?: { title?: string; steps?: Array<{ id: string; type: string; config?: { url?: string; urls?: string[] } }> } } | null;
    const steps = cfg?.gate?.steps || [];
    ctx.log(`gate ${cfg?.gate?.title || slug}, steps: ${steps.map((x) => x.type).join(",")}`);

    for (const step of steps) {
      if (step.type === "SOUNDCLOUD_CONNECT") {
        const st = await jpost<{ url?: string; error?: string }>(`${BASE}/api/oauth/soundcloud/start`, { sessionToken: tok, stepId: step.id, comment: ctx.comment }, X);
        if (!st.json?.url) { ctx.log(`oauth ${st.status} ${st.json?.error || ""}`); continue; }
        const landed = await ctx.window.consent(st.json.url, (u) => u.startsWith(BASE) && !u.includes("/api/oauth/"), ctx.signal);
        ctx.log(`landed ${landed.slice(0, 90)}`);
        await sleep(2000);
      } else if (step.type === "EMAIL") {
        const r = await jpost(`${BASE}/api/unlock/email`, { sessionToken: tok, stepId: step.id, email: ctx.email, consent: true }, X);
        ctx.log(`email ${r.status} ${r.text.slice(0, 100)}`);
      } else if (step.type === "SPOTIFY_LINK" || step.type === "INSTAGRAM" || step.type === "ACTION_LINK" || step.type === "LINK") {
        // server-observed redirect: register the open, let the dwell elapse, then confirm. The server
        // answers 425 with the remaining wait, so the confirm is retried on its own clock.
        const urls = step.config?.urls?.length ? step.config.urls : step.config?.url ? [step.config.url] : [""];
        for (let i = 0; i < urls.length; i++) {
          const open = await req(`${BASE}/api/unlock/action-link/${step.id}?i=${i}&st=${encodeURIComponent(tok)}`, { headers: { "x-session": tok }, redirect: "manual" });
          ctx.log(`link ${step.type} ${i} ${open.status} ${open.headers.get("location") || ""}`);
          let wait = 6500;
          for (let n = 0; n < 8; n++) {
            await sleep(wait);
            const c = await jpost<{ waitMs?: number; error?: string }>(`${BASE}/api/unlock/action-link/confirm`, { sessionToken: tok, stepId: step.id, i }, X);
            if (c.status < 300) { ctx.log(`link ${i} confirmed`); break; }
            wait = Math.min(Number(c.json?.waitMs) || 1500, 8000);
            if (n === 7) ctx.log(`link ${i} not confirmed: ${c.json?.error || c.status}`);
          }
        }
      } else if (step.type === "EXTERNAL_LINK") {
        // plain visit: the server only needs the redirect to be opened
        ctx.window.load(`${BASE}/api/unlock/link/${step.id}?st=${encodeURIComponent(tok)}`);
        await sleep(2500);
      } else {
        ctx.log(`unhandled step ${step.type} ${step.id}`);
      }
    }

    const state = await (await req(`${BASE}/api/unlock/state`, { headers: { "x-session": tok } })).json().catch(() => null) as { progress?: { reasons?: unknown } } | null;
    ctx.log(`state ${JSON.stringify(state?.progress?.reasons || state).slice(0, 160)}`);

    const dl = await jpost<{ files?: Array<{ name?: string; url: string }> }>(`${BASE}/api/unlock/download`, { sessionToken: tok }, X);
    const files = dl.json?.files || [];
    if (!files.length) throw new Error("no files");

    let first: { filePath: string; bytes: number; mime: string } | null = null;
    for (const f of files) {
      const url = f.url.startsWith("/") ? BASE + f.url : f.url;
      const file = await saveFile(url, { referer: ctx.url }, (f.name || slug).replace(/[^\w.-]+/g, "_"));
      ctx.log(`saved ${file.filePath} ${file.bytes}`);
      first = first || file;
    }
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...first!, performed };
  },
};

export default adapter;
