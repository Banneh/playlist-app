/** managerone.io — `https://managerone.io/g/<slug>`.
 *
 *  Same shape as gatekit: a session id from `/api/unlock/session`, the SoundCloud step started with
 *  the comment, social steps confirmed with `/api/unlock/complete-step` after the target was opened.
 *  The gate id is not in the URL, it comes out of the escaped RSC payload. */
import { jpost, req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://managerone.io";

interface Step {
  id: string;
  type: string;
  targets?: Array<{ url?: string; action?: string }>;
}

const adapter: GateAdapter = {
  id: "managerone",
  hosts: /(^|\.)managerone\.io$/i,

  match(u) {
    return /(^|\.)managerone\.io$/i.test(u.hostname) && /^\/g\/[^/]+$/.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const slug = new URL(ctx.url).pathname.split("/").filter(Boolean).pop() || "";
    const before = await snapshot(ctx.session);
    const H = { origin: BASE, referer: ctx.url };

    const page = await (await req(ctx.url, { headers: { referer: BASE } })).text();
    const gateId = (page.replace(/\\"/g, '"').match(/"gate":\{"id":"([^"]+)"/) || [])[1];
    if (!gateId) throw new Error("no gate id");
    const steps: Step[] = JSON.parse((page.replace(/\\"/g, '"').match(/"steps":(\[[\s\S]*?\]),"soundCloud/) || [])[1] || "[]");
    ctx.log(`gate ${gateId}, steps: ${steps.map((s) => s.type).join(",")}`);

    const s = await jpost<{ id?: string; error?: string }>(`${BASE}/api/unlock/session`, { gateId }, H);
    const sid = s.json?.id;
    if (!sid) throw new Error(`session ${s.status} ${s.json?.error || ""}`);

    // the OAuth callback matches the session by cookie, so the start has to run on the gate's own
    // origin inside the walk window, not from Node
    ctx.window.load(ctx.url);
    await sleep(2500);
    const inPage = <T,>(code: string) => ctx.window.js<T>(code);
    const post = (path: string, body: unknown) => inPage<{ status: number; json: any }>(`(async () => {
      const r = await fetch(${JSON.stringify(BASE + path)}, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} });
      return { status: r.status, json: await r.json().catch(() => null) };
    })()`);

    const complete = async (stepId: string, payload?: Record<string, string>) => {
      const r = await post("/api/unlock/complete-step", { sessionId: sid, stepId, payload });
      ctx.log(`complete ${stepId} ${r.status} ${JSON.stringify(r.json).slice(0, 80)}`);
      return r.status < 300;
    };

    for (const step of steps) {
      if (step.type === "SOUNDCLOUD_CONNECT") {
        const st = await post("/api/oauth/soundcloud/start", { gateSlug: slug, stepId: step.id, comment: ctx.comment, sessionId: sid });
        if (!st.json?.url) { ctx.log(`oauth ${st.status} ${st.json?.error || ""}`); continue; }
        const landed = await ctx.window.consent(st.json.url, (u) => u.startsWith(BASE) && !u.includes("/api/oauth/"), ctx.signal);
        ctx.log(`landed ${landed.slice(0, 90)}`);
        await sleep(1500);
        await complete(step.id);
      } else if (step.type === "EMAIL_CAPTURE") {
        await complete(step.id, { email: ctx.email, comment: ctx.comment });
      } else {
        // social / external: the server only wants the target opened, then the step confirmed. The
        // confirm has to run on the gate's origin, so the window goes back to the gate first.
        const url = (step.targets || []).map((t) => t.url).find(Boolean);
        if (url) {
          ctx.window.load(url);
          await sleep(3000);
          ctx.window.load(ctx.url);
          await sleep(2500);
        }
        await complete(step.id);
      }
    }

    const dl = await post("/api/unlock/download", { sessionId: sid });
    const files: Array<{ name?: string; url: string }> = dl.json?.files || [];
    if (!files.length) throw new Error(`no files ${dl.status} ${dl.json?.error || ""}`);

    let first: { filePath: string; bytes: number; mime: string } | null = null;
    for (const f of files) {
      const url = f.url.startsWith("/") ? BASE + f.url : f.url;
      const file = await saveFile(url, { referer: ctx.url }, (f.name || slug).replace(/[^\w.-]+/g, "_"), true);
      ctx.log(`saved ${file.filePath} ${file.bytes}`);
      first = first || file;
    }
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...first!, performed };
  },
};

export default adapter;
