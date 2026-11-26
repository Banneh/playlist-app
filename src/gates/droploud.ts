/** droploud.com — `https://droploud.com/track/<uuid>` or `/gate/<uuid>`.
 *
 *  The repost is the only SoundCloud action the gate really checks, and it is not live: it needs
 *  the explicit `verify-repost` call, otherwise the download stays 403. `sc_follow` and `sc_like`
 *  are reported true unconditionally and `sc_comment` is attestation only. */
import * as crypto from "crypto";
import { braceObject, jpost, req, saveFile, sleep } from "./http";
import { scTrackId, scWrite } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const API = "https://api.droploud.com/api";
const H = { origin: "https://droploud.com" };

const adapter: GateAdapter = {
  id: "droploud",
  hosts: /(^|\.)droploud\.com$/i,

  match(u) {
    return /(^|\.)droploud\.com$/i.test(u.hostname) && /^\/(track|gate)\//.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const uuid = new URL(ctx.url).pathname.split("/").filter(Boolean).pop() || "";
    const html = await (await req(ctx.url)).text();
    const data = braceObject(html, "gateData");
    const trackId: string = data.track?.id || uuid;
    const steps: Array<{ id: string; type: string; url?: string }> = data.steps || [];
    ctx.log(`gate ${trackId}, steps: ${steps.map((s) => s.id).join(",")}`);

    let sid: string = crypto.randomUUID();
    const st = await jpost(`${API}/soundcloud/gate-status`, { track_id: trackId, session_id: sid }, H);
    ctx.log(`status ${st.status} ${st.text.slice(0, 120)}`);

    if (!st.json?.connected) {
      // The connect endpoint sets the PKCE nonce cookie, so it has to be loaded in the window
      // (a Node fetch would leave the cookie behind).
      const connectUrl = `${API}/soundcloud/connect?track_id=${trackId}&session_id=${sid}&disclose_droploud=0`;
      const landed = await ctx.window.consent(connectUrl, (u: string) => u.includes(`/track/${trackId}`) || u.includes("sc_connected=true"), ctx.signal);
      ctx.log(`landed ${landed.slice(0, 110)}`);
      const got = landed.includes("sid=") ? new URL(landed).searchParams.get("sid") : null;
      if (got) sid = got;
      ctx.log(`connected, sid ${sid.slice(0, 8)}`);
    }

    const performed: WalkResult["performed"] = [];
    if (steps.some((s) => s.type === "soundcloud_repost") && data.track?.soundcloud_url) {
      const scId = await scTrackId(ctx.session, data.track.soundcloud_url);
      const r = await scWrite(ctx.window, "PUT", `me/track_reposts/${scId}`);
      ctx.log(`repost ${scId} → ${r.status} ${r.text.slice(0, 120)}`);
      if (r.status < 300) performed.push({ kind: "repost", id: scId });
      await sleep(2500);
      for (let i = 0; i < 4; i++) {
        const v = await jpost(`${API}/soundcloud/verify-repost`, { track_id: trackId, session_id: sid, fresh: true, verify_trigger: "click" }, H);
        ctx.log(`verify-repost ${v.status} ${v.text.slice(0, 100)}`);
        if (v.text.includes('"found":true')) break;
        await sleep(4000);
      }
    }

    for (const step of steps) {
      if (step.type === "soundcloud_repost") continue;
      let value = "x";
      let extra: Record<string, unknown> = {};
      if (step.type === "email") { value = ctx.email; extra = { consent: true }; }
      else if (step.type === "soundcloud_comment") value = ctx.comment;
      else if (step.url) value = step.url;
      const r = await jpost(`${API}/gate/${trackId}/step`, { session_id: sid, step: step.id, value, ...extra }, H);
      ctx.log(`step ${step.id} ${r.status} ${r.text.slice(0, 80)}`);
    }

    const dl = await jpost<{ download_url?: string }>(`${API}/gate/${trackId}/download`, { session_id: sid }, H);
    ctx.log(`download ${dl.status} ${dl.text.slice(0, 120)}`);
    if (!dl.json?.download_url) throw new Error("no download url");

    const name = String(data.track?.title || "download").replace(/[^\w.-]+/g, "_").slice(0, 80) + ".mp3";
    const file = await saveFile(dl.json.download_url, {}, name);
    return { ...file, performed };
  },
};

export default adapter;
