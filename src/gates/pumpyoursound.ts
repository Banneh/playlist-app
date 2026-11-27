/** pumpyoursound.com — `https://pumpyoursound.com/f/<user>/<slug>/<id>`.
 *
 *  The connect button calls `SC.connect()`, which opens the consent popup; the SDK posts the result
 *  back to the opener, so the popup is driven, not the main window. The server stores the token and
 *  hands it back at `/?do=mySoundcloudAccessToken`. The download lands on a 10 s interstitial that
 *  forwards to the host's file. */
import { req, saveFile, sleep } from "./http";
import { diffActions, snapshot } from "./soundcloud";
import type { GateAdapter, WalkContext, WalkResult } from "./types";

const BASE = "https://pumpyoursound.com";

const adapter: GateAdapter = {
  id: "pumpyoursound",
  hosts: /(^|\.)pumpyoursound\.com$/i,

  match(u) {
    return /(^|\.)pumpyoursound\.com$/i.test(u.hostname) && /^\/f\//.test(u.pathname);
  },

  async walk(ctx: WalkContext): Promise<WalkResult> {
    const fangateId = new URL(ctx.url).pathname.split("/").filter(Boolean).pop() || "";
    if (!fangateId) throw new Error("no fangate id");
    const before = await snapshot(ctx.session);
    ctx.log(`gate ${fangateId}`);

    const connect = async (): Promise<string> => {
      ctx.window.load(ctx.url);
      await sleep(2500);
      await ctx.window.js(`document.querySelector('.sn-connect-with-soundcloud')?.click()`).catch(() => {});

      // The consent happens in the popup the button opened.
      let popup: Electron.BrowserWindow | null = null;
      for (let i = 0; i < 40 && !popup; i++) {
        await sleep(700);
        popup = ctx.window.popups.find((w) => !w.isDestroyed() && /secure\.soundcloud\.com/.test(w.webContents.getURL())) || null;
      }
      if (!popup) throw new Error("no consent popup");
      await ctx.window.consentPopup(popup, (u) => /pumpyoursound\.com/.test(u), ctx.signal);
      await sleep(3000);
      return ctx.window.js<string>(`fetch('/?do=mySoundcloudAccessToken').then((r) => r.text())`).catch(() => "");
    };

    // A dead SoundCloud session makes the consent popup bounce straight back without a token.
    let tok = await connect();
    if (!tok && (await ctx.window.signIn())) tok = await connect();
    if (!tok) throw new Error("no access token");
    ctx.log("token");

    const hit = async (p: string) => {
      const r = await ctx.window.js<string>(`fetch(${JSON.stringify(p)}, { headers: { 'x-requested-with': 'XMLHttpRequest' }, redirect: 'follow' })
        .then(async (r) => r.status + ' ' + (await r.text()).slice(0, 120))`).catch((e) => "0 " + String(e));
      ctx.log(`step ${p.split("?")[0]} ${r.slice(0, 100)}`);
    };
    await hit(`/auth/soundcloud-events/?fangateId=${fangateId}&accessToken=${encodeURIComponent(tok)}`);
    await hit(`/auth/sc-comment/?fangateId=${fangateId}&text=${encodeURIComponent(ctx.comment)}&accessToken=${encodeURIComponent(tok)}`);
    await hit(`/auth/facebook-like/?fangateId=${fangateId}`);

    ctx.window.load(ctx.url);
    await sleep(2000);

    const dl = await ctx.window.js<{ status: number; url: string }>(`fetch(${JSON.stringify(ctx.url)}, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '_do=freeDownloadForm-submit', redirect: 'follow',
    }).then(async (r) => ({ status: r.status, url: r.url }))`);
    ctx.log(`download ${dl.status} ${dl.url.slice(0, 100)}`);

    const link = (dl.url.match(/downloadLink=([^&]+)/) || [])[1];
    const target = link ? decodeURIComponent(link) : "";
    if (!target) throw new Error("no download target");
    const driveId = (target.match(/\/d\/([\w-]{10,})/) || [])[1];
    const url = driveId ? `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t` : target;

    const name = (dl.url.match(/name=([^&]+)/) ? decodeURIComponent(dl.url.match(/name=([^&]+)/)![1]) : fangateId).replace(/[^\w.()\[\] -]+/g, "_");
    const file = await saveFile(url, { referer: ctx.url }, name);
    const performed = diffActions(before, await snapshot(ctx.session));
    return { ...file, performed };
  },
};

export default adapter;
