/** downloadgater.com — `https://downloadgater.com/g/<slug>`.
 *
 *  The server performs and checks the actions itself; the comment goes in with the start call. The
 *  session token in the callback fragment is not the download token — passing it straight to
 *  `/api/download` gives 403 `expired_unlock`, so it has to be exchanged through `/continue`. */
import { jpost, req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://downloadgater.com";
const H = { origin: BASE };

const adapter: GateAdapter = {
  id: "downloadgater",
  hosts: /(^|\.)downloadgater\.com$/i,

  match(u) {
    return /(^|\.)downloadgater\.com$/i.test(u.hostname) && /^\/g\//.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const slug = new URL(ctx.url).pathname.split("/").filter(Boolean).pop() || "";
    const before = await snapshot(ctx.session);

    const start = await jpost<{ authorizationUrl?: string }>(`${BASE}/api/soundcloud/start`, { linkId: slug, soundCloudComment: ctx.comment }, H);
    const authUrl = start.json?.authorizationUrl || "";
    if (!authUrl) throw new Error("no authorizationUrl");
    ctx.log(`start ${start.status}`);

    const landed = await ctx.window.consent(authUrl, (u) => /[?&#](?:unlock|soundcloud_session)=/.test(u), ctx.signal);
    const token = (landed.match(/[?&#](?:unlock|soundcloud_session)=([^&#]+)/) || [])[1] || "";
    if (!token) throw new Error("no session token in callback");
    ctx.log("callback token");

    let unlock = "";
    for (let i = 0; i < 8; i++) {
      const c = await jpost<{ pending?: boolean; unlockToken?: string }>(`${BASE}/api/soundcloud/continue`, { linkId: slug, token }, H);
      ctx.log(`continue ${c.status} ${c.text.slice(0, 120)}`);
      if (c.json?.unlockToken) { unlock = c.json.unlockToken; break; }
      if (c.json && c.json.pending === false) break;
      await sleep(1500);
    }
    if (!unlock) throw new Error("no unlock token");

    const file = await saveFile(`${BASE}/api/download/${slug}?soundcloudToken=${encodeURIComponent(unlock)}`, { referer: ctx.url }, slug + ".wav");
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...file, performed };
  },
};

export default adapter;
