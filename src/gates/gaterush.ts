/** gaterush.me — `https://gaterush.me/<slug>`.
 *
 *  The visit cookie from the gate page is what makes `/auth/soundcloud` work without a Gaterush
 *  account; without it the endpoint answers `302 /login` and looks like an artist wall.
 *
 *  The gate is a one-step-at-a-time wizard and every step has to be recorded or `/download` answers
 *  403 "Please complete the required steps". The steps are driven through the page's own controls
 *  rather than replayed: the SoundCloud step keeps an auth session id in `localStorage` and the
 *  callback posts its result back to the opener, so a hand-rolled popup never marks the step done. */
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
    const gate = parseGate(await page.text());
    const steps = (gate.steps || []).map((s: any) => s.id);
    ctx.log(`gate ${slug}, steps: ${steps.join(",")}`);

    // The visit cookie lives in the session, so the page has to be loaded in the window too.
    ctx.window.load(ctx.url);
    await sleep(2500);

    for (const id of steps) {
      if (id === "email") {
        const name = ctx.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        await ctx.window.js(`(() => {
          const n = document.querySelector('#nameInput'); if (n) n.value = ${JSON.stringify(name)};
          const e = document.querySelector('#emailInput'); if (e) e.value = ${JSON.stringify(ctx.email)};
          document.querySelector('[data-go]')?.click();
        })()`).catch(() => {});
        await sleep(2500);
      } else if (id === "soundcloud") {
        await ctx.window.js(`(() => {
          const c = document.querySelector('#commentInput'); if (c) c.value = ${JSON.stringify(ctx.comment)};
          document.querySelector('[data-go]')?.click();
        })()`).catch(() => {});
        // the page opens the consent popup itself and polls for the callback
        let popup: Electron.BrowserWindow | null = null;
        for (let i = 0; i < 40 && !popup; i++) {
          await sleep(700);
          popup = ctx.window.popups.find((w) => !w.isDestroyed() && /secure\.soundcloud\.com/.test(w.webContents.getURL())) || null;
        }
        if (!popup) throw new Error("no consent popup");
        await ctx.window.consentPopup(popup, (u) => u.includes("/callback/soundcloud"), ctx.signal);
        // the page's own poller advances the wizard once the callback has posted its result, so the
        // step leaving the DOM is the real signal that the server recorded it
        for (let i = 0; i < 60; i++) {
          await sleep(1000);
          if (!(await ctx.window.js<boolean>(`!!document.querySelector('#commentInput')`).catch(() => true))) break;
        }
        ctx.log("soundcloud step done");
        await sleep(2000);
      } else if (id === "instagram" || id === "spotify") {
        // the row's button opens the profile and turns into its own confirm
        const n = await ctx.window.js<number>(`document.querySelectorAll('.list-btn').length`).catch(() => 0);
        for (let i = 0; i < n; i++) {
          await ctx.window.js(`document.querySelectorAll('.list-btn')[${i}]?.click()`).catch(() => {});
          await sleep(2500);
          await ctx.window.js(`document.querySelectorAll('.list-btn')[${i}]?.click()`).catch(() => {});
          await sleep(1500);
        }
        ctx.log(`${id} ${n} account(s)`);
        await sleep(2000);
      }
    }

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
