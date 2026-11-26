/** fangate.eu — `https://www.fangate.eu/tracks/<slug>`.
 *
 *  Both providers are mandatory (`skippable:false`): SoundCloud alone leaves the download at
 *  400 "steps not completed". This is the one gate that always needs a Spotify session, so it
 *  escalates `provider_login` when Spotify has none. Instagram is a plain visit step, no login. */
import * as crypto from "crypto";
import { jpost, req, saveFile } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const API = "https://api.fangate.eu/api";
const H = { origin: "https://www.fangate.eu" };

const adapter: GateAdapter = {
  id: "fangate",
  hosts: /(^|\.)fangate\.eu$/i,

  match(u) {
    return /(^|\.)fangate\.eu$/i.test(u.hostname) && /^\/tracks\//.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const slug = new URL(ctx.url).pathname.split("/").filter(Boolean).pop() || "";
    const visitor = crypto.randomUUID();
    const before = await snapshot(ctx.session);

    const gate = await (await req(`${API}/download_gates/public/?slug=${encodeURIComponent(slug)}`)).json().catch(() => null) as { title?: string } | null;
    ctx.log(`gate ${slug} ${gate?.title || ""}`);

    const created = await jpost<{ uid?: string; steps?: Array<{ key: string; type: string }> }>(`${API}/download_sessions/`, { download_gate_slug: slug, visitor_id: visitor, user_agent: ctx.ua }, H);
    const uid = created.json?.uid;
    if (!uid) throw new Error("no session uid");
    ctx.log(`session ${created.status} steps: ${(created.json?.steps || []).map((s) => s.key).join(",")}`);

    await jpost(`${API}/download_sessions/${uid}/visit/`, { fingerprint: visitor, user_agent: ctx.ua, visitor_id: visitor, lang: "en-US" }, H);

    for (const provider of ["soundcloud", "spotify"]) {
      const r = await req(`${API}/download_sessions/${uid}/oauth_redirect_uri/?oauth_provider=${provider}`);
      const authUrl = ((await r.json().catch(() => null)) as { url?: string } | null)?.url || "";
      if (!authUrl) throw new Error("no " + provider + " authorize url");
      const landed = await ctx.window.consent(authUrl, (u) => u.includes(`/oauth/${provider}`), ctx.signal);
      const q = landed ? new URL(landed).searchParams : new URLSearchParams();
      const conf = await jpost(`${API}/download_sessions/${uid}/oauth_confirm/`, { oauth_provider: provider, code: q.get("code"), state: q.get("state") }, H);
      ctx.log(`confirm ${provider} ${conf.status} ${conf.text.slice(0, 120)}`);
    }

    const cm = await jpost(`${API}/download_sessions/${uid}/soundcloud_comment/`, { comment: ctx.comment }, H);
    ctx.log(`comment ${cm.status}`);

    // Visit steps are keyed "<type>:<id>"; the bare type is accepted but marks nothing.
    for (const step of (created.json?.steps || []).filter((s) => s.type === "visit")) {
      const r = await jpost(`${API}/download_sessions/${uid}/log_action/`, { action: step.key }, H);
      ctx.log(`action ${step.key} ${r.status}`);
    }

    const link = await (await req(`${API}/download_sessions/${uid}/download_link/`)).json().catch(() => null) as { url?: string; download_link?: string } | null;
    const url = link?.url || link?.download_link;
    if (!url) throw new Error("no download link");

    const file = await saveFile(url, { referer: ctx.url }, slug + ".mp3");
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...file, performed };
  },
};

export default adapter;
