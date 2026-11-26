/** beltergate.com — `https://beltergate.com/gate?id=<gateId>`.
 *
 *  The one-tap route (`/api/fan/soundcloud/start`) has no Turnstile and no profile scraping, so
 *  beltergate never escalates for a captcha. A gate with `comment:true` rejects the start unless the
 *  comment is in the query; the email goes in only when the gate asks for one. The download token
 *  arrives as the `dl=` parameter of the callback redirect. */
import { req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://beltergate.com";

const adapter: GateAdapter = {
  id: "beltergate",
  hosts: /(^|\.)beltergate\.com$/i,

  match(u) {
    return /(^|\.)beltergate\.com$/i.test(u.hostname) && u.pathname === "/gate";
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const gateId = new URL(ctx.url).searchParams.get("id") || "";
    if (!gateId) throw new Error("no gate id");
    const before = await snapshot(ctx.session);

    const cfg = await (await req(`${BASE}/api/gate?id=${encodeURIComponent(gateId)}`)).json().catch(() => null) as { gate?: { title?: string; comment?: boolean; emailStep?: string } } | null;
    const g = cfg?.gate || {};
    ctx.log(`gate ${gateId} ${g.title || ""} comment:${g.comment} email:${g.emailStep}`);

    const q = new URLSearchParams({ gate: gateId });
    if (g.comment) q.set("comment", ctx.comment);
    if (g.emailStep === "required" || g.emailStep === "optional") q.set("email", ctx.email);

    const landed = await ctx.window.consent(`${BASE}/api/fan/soundcloud/start?${q}`, (u) => u.includes("dl="), ctx.signal);
    ctx.log(`landed ${landed.slice(0, 100)}`);
    await sleep(3000);

    let token = landed ? new URL(landed).searchParams.get("dl") || "" : "";
    if (!token) {
      token = await ctx.window.js<string>(`(() => {
        const a = document.querySelector('#btn-download');
        const m = a && a.getAttribute('href') && a.getAttribute('href').match(/token=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : '';
      })()`).catch(() => "");
    }
    if (!token) throw new Error("no download token");

    const file = await saveFile(`${BASE}/api/download?token=${encodeURIComponent(token)}`, { referer: ctx.url }, gateId + ".mp3");
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...file, performed };
  },
};

export default adapter;
