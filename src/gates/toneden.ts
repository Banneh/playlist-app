/** toneden.io — `https://www.toneden.io/<artist>/post/<slug>`.
 *
 *  ToneDen creates its own fan account through SoundCloud OAuth; the SoundCloud session alone is
 *  not enough. The gate is opened per platform and `soundcloud` is the one that counts — `{email}`
 *  alone answers 200 with `is_gate_open:false`. Nothing is performed on the account, so there is
 *  nothing to undo. */
import { req, saveFile, sleep } from "./http";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://www.toneden.io";

const adapter: GateAdapter = {
  id: "toneden",
  hosts: /(^|\.)toneden\.io$/i,

  match(u) {
    return /(^|\.)toneden\.io$/i.test(u.hostname) && /^\/[^/]+\/post\//.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const parts = new URL(ctx.url).pathname.split("/").filter(Boolean);
    const [author, , slug] = parts;
    const meta = await (await req(`${BASE}/api/v1/posts?author_username=${encodeURIComponent(author)}&link_path=${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })).json().catch(() => null) as { post?: { id?: string; download_display_url?: string } } | null;
    const id = meta?.post?.id;
    if (!id) throw new Error("no post");
    ctx.log(`post ${id}`);

    ctx.window.load(ctx.url);
    await sleep(1500);
    let me = await ctx.window.js<{ user?: { id?: number } } | null>(`fetch('/api/v1/users/me').then(r=>r.json()).catch(()=>null)`).catch(() => null);

    if (!me?.user) {
      ctx.log("logging in with SoundCloud");
      const landed = await ctx.window.consent(`${BASE}/auth/soundcloud`, (u) => u.startsWith(BASE) && !u.includes("/auth/"), ctx.signal);
      ctx.log(`landed ${landed.slice(0, 90)}`);
      await sleep(2500);
      ctx.window.load(ctx.url);
      await sleep(1500);
      me = await ctx.window.js<{ user?: { id?: number } } | null>(`fetch('/api/v1/users/me').then(r=>r.json()).catch(()=>null)`).catch(() => null);
    }
    const uid = me?.user?.id;
    if (!uid) throw new Error("no fan account");

    let downloadUrl = "";
    for (const platform of ["custom-url-visit", "soundcloud"]) {
      const r = await ctx.window.js<string>(`fetch('/api/v1/attachments/${id}/unlock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_opted_in: false, platform: ${JSON.stringify(platform)}, optedOutFanID: ${uid} }),
      }).then(async (x) => x.status + ' ' + (await x.text()).slice(0, 300))`).catch((e) => "0 " + String(e));
      ctx.log(`unlock ${platform} ${r.slice(0, 120)}`);
      const m = r.match(/"download_url":"([^"]+)"/);
      if (m) downloadUrl = m[1];
      await sleep(1000);
    }
    if (!downloadUrl) throw new Error("gate not open");

    const name = String(meta?.post?.download_display_url || slug).replace(/[^\w.-]+/g, "_");
    const file = await saveFile(downloadUrl, { referer: ctx.url }, name);
    return { ...file, performed: [] };
  },
};

export default adapter;
