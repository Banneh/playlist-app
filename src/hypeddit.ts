/** Automated Hypeddit free download.
 *
 *  The green Free DL button used to hand the gate page to the system browser. For a Hypeddit
 *  link the gate is now walked here instead, over plain HTTP — no window, nothing to see:
 *
 *    1. GET the gate page and read the fields its own script would post (csrf token, fan_gate_id,
 *       the file uid, wrndk, the step list, the external id).
 *    2. POST /verifyEmailAddress for the email step. The gate rejects "test@gmail.com"-style
 *       addresses with {"status":"F"} and accepts "first.last@gmail.com" ones, so a plausible
 *       name is invented and the step is retried with a NEW address until the gate says "T".
 *    3. POST /gate/download/ul — the same big postData the gate's own Download button sends.
 *       The answer carries a signed S3 URL; that is fetched and streamed into the downloads
 *       folder under the name the server gives it.
 *
 *  Every step is retried, because the gate is flaky in ways that are not worth reverse
 *  engineering: what matters is that a file comes out. */
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as core from "./core";
import * as dlstop from "./dlstop";

/** a plain Chrome UA: gates serve a different page to browsers they don't recognise */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/** how many invented addresses to burn on the email step before giving up */
const VERIFY_TRIES = 12;
/** how many times to re-post the download when the gate says "not yet" */
const DOWNLOAD_TRIES = 4;
/** per-request ceiling; the file itself gets its own, longer one */
const REQ_TIMEOUT_MS = 30000;
const FILE_TIMEOUT_MS = 10 * 60 * 1000;

const FIRST = ["alex", "sam", "chris", "dan", "luke", "mark", "paul", "tom", "jack", "ben", "nick", "ryan", "adam", "josh", "matt", "sean", "carl", "dean", "gary", "neil", "liam", "owen", "kyle", "joel", "ross", "craig", "simon", "peter"];
const LAST = ["baker", "clarke", "davies", "evans", "fisher", "grant", "hughes", "irwin", "jones", "kelly", "lewis", "morgan", "nolan", "owens", "price", "quinn", "reid", "stone", "turner", "ward", "bennett", "cooper", "doyle", "fraser", "hardy", "marsh", "palmer", "reeves"];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A plausible "real person" address — the gate's own check likes these. */
function makeEmail(): { email: string; name: string } {
  const f = pick(FIRST), l = pick(LAST);
  const local = Math.random() < 0.5 ? `${f}.${l}` : `${f}${l}`;
  const tail = Math.random() < 0.35 ? String(Math.floor(Math.random() * 90) + 10) : "";
  return { email: `${local}${tail}@gmail.com`, name: cap(f) };
}

/** Cookies for one walk of one gate. */
class Jar {
  private c = new Map<string, string>();
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
  absorb(res: Response) {
    const list: string[] = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    for (const raw of list) {
      const pair = raw.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) this.c.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
}

async function req(jar: Jar, url: string, opts: RequestInit = {}, timeout = REQ_TIMEOUT_MS): Promise<Response> {
  const res = await fetch(url, {
    redirect: "follow",
    ...opts,
    headers: { "user-agent": UA, cookie: jar.header(), ...((opts.headers as Record<string, string>) || {}) },
    signal: dlstop.fetchSignal(timeout),   // its time limit, and the Stop of Download all
  });
  jar.absorb(res);
  return res;
}

/** form body; arrays go out as key[]=… the way jQuery serialises them */
function form(data: Record<string, string | string[]>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) for (const one of v) p.append(`${k}[]`, one);
    else p.append(k, v);
  }
  return p.toString();
}

const attr = (html: string, name: string) => {
  const m =
    html.match(new RegExp(`name="${name}"[^>]*value=["']([^"']*)["']`)) ||
    html.match(new RegExp(`id="${name}"[^>]*value=["']([^"']*)["']`));
  return m ? m[1] : "";
};

/** Everything the gate's own Download button would read off the page. */
type Gate = {
  token: string; fanGateId: string; uid: string; wrndk: string; steps: string;
  externalId: string; duration: number; action: string;
};

function parseGate(html: string, url: string): Gate | null {
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) || [])[1] || "";
  const fanGateId = attr(html, "fan_gate_id");
  const uid = attr(html, "current_download_file_listner");
  if (!token || !fanGateId || !uid) return null;
  const duration = Number(attr(html, "duration")) || 180000;
  return {
    token,
    fanGateId,
    uid,
    wrndk: attr(html, "wrndk"),
    steps: attr(html, "nwSteps"),
    externalId: (html.match(/"externID":"([^"]+)"/) || [])[1] || "",
    duration,
    action: /linkGate/i.test(html) ? "LINK_GATE" : "DOWNLOAD",
  };
}

/** A name in the downloads folder that is not taken yet ("track.mp3" → "track (2).mp3"). */
function freeName(dir: string, name: string): string {
  const ext = path.extname(name), base = path.basename(name, ext) || "download";
  let p = path.join(dir, base + ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const safe = (s: string) => s.replace(/[/\\:*?"<>|]/g, "-").trim() || "download";

/** Stream a signed URL into the downloads folder and return where it landed. */
async function saveFile(jar: Jar, url: string, dir: string): Promise<string> {
  const res = await req(jar, url, {}, FILE_TIMEOUT_MS);
  if (!res.ok || !res.body) throw new Error("file HTTP " + res.status);
  const cd = res.headers.get("content-disposition") || "";
  const named = unesc(decodeURIComponent((cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1] || ""));
  const fromUrl = decodeURIComponent((url.split("?")[0].split("/").pop() || "").replace(/^\w{6}_/, ""));
  const target = freeName(dir, safe(named || fromUrl || "download"));
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(target));
  return target;
}

/** Walk a Hypeddit gate and bring the file into the downloads folder. Resolves with the saved
 *  path, or null when the link is not a gate the walker understands (the caller then falls back
 *  to opening the page in the browser). */
export async function freeDownload(url: string, email: string): Promise<{ file: string | null }> {
  if (!core.isHypeddit(url)) throw core.appError("not_hypeddit", "not a Hypeddit link");
  const jar = new Jar();
  const dir = core.inboxDir();
  fs.mkdirSync(dir, { recursive: true });

  let page = await req(jar, url);
  let html = await page.text();
  let gate = parseGate(html, page.url);
  if (!gate) return { file: null };

  const post = (target: string, data: Record<string, string | string[]>) =>
    req(jar, target, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "x-csrf-token": gate!.token,
        origin: "https://hypeddit.com",
        referer: page.url,
      },
      body: form(data),
    });

  // 1. the email step. The address from Settings first (it is the user's own, so the artist gets
  //    a real one), then invented plausible ones — the gate turns down "test@gmail.com"-style
  //    addresses, and which ones it likes is not worth reverse engineering.
  const candidates: { email: string; name: string }[] = [];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) candidates.push({ email, name: cap(email.split("@")[0].split(/[._-]/)[0]) });
  for (let i = 0; i < VERIFY_TRIES; i++) candidates.push(makeEmail());

  let accepted: { email: string; name: string } | null = null;
  for (const c of candidates) {
    const r = await post("https://hypeddit.com/verifyEmailAddress", {
      validateEmailAddress: c.email,
      fan_gate_id: gate.fanGateId,
      email_name: c.name,
      adcode: "",
      hypesource: "",
    });
    const body = await r.text();
    let status = "";
    try { status = JSON.parse(body).status; } catch {}
    if (status === "T") { accepted = c; break; }
    await sleep(250);
  }
  if (!accepted) throw core.appError("gate_email", "the gate would not take an email address");

  // 2. the download. The gate answers {"download_status":false} when it wants the social steps
  //    done, so it is re-posted a few times, then once more claiming the steps were skipped.
  const payload = (skippable: boolean): Record<string, string | string[]> => ({
    file: encodeURIComponent(gate!.uid),
    download_visit: "true",
    profile_downloads: "true",
    time: String(Math.floor(Math.random() * gate!.duration)),
    sc_comment_text: "",
    yt_comment_text: "",
    page: "nonsingle",
    is_skippable: skippable ? "1" : "0",
    steps: gate!.steps,
    email: accepted!.email,
    download_action: gate!.action,
    wrndk: gate!.wrndk,
    is_mobile: "",
    external_id: gate!.externalId,
    hypesource: "",
    adcode: "",
    lifetime_fan_spotify: "",
    lifetime_fan_deezer: "",
    lifetime_fan_apple: "",
    gvf: "0",
    fan_gate_id: gate!.fanGateId,
    _token: gate!.token,
    ...(skippable && gate!.steps ? { skip_gate_steps: gate!.steps.split(",") } : {}),
  });

  let answer: { URL?: string; download_status?: boolean; custom_redirection_url?: string } = {};
  for (let i = 0; i < DOWNLOAD_TRIES; i++) {
    const r = await post("https://hypeddit.com/gate/download/ul", payload(i >= DOWNLOAD_TRIES / 2));
    const body = await r.text();
    try { answer = JSON.parse(body); } catch {}
    if (answer.URL) break;
    await sleep(400);
  }

  // 3. the file. A hypeddit URL means the gate wants another page first (a smart link, a second
  //    gate): walk that one too, once.
  let target = answer.URL || answer.custom_redirection_url || "";
  if (!target) return { file: null };
  if (core.isHypeddit(target)) {
    const next = await req(jar, target);
    const nextHtml = await next.text();
    const nextGate = parseGate(nextHtml, next.url);
    if (nextGate) {
      gate = nextGate;
      page = next;
      html = nextHtml;
      const r = await post("https://hypeddit.com/gate/download/ul", payload(false));
      const body = await r.text();
      try { answer = JSON.parse(body); } catch {}
      target = answer.URL || answer.custom_redirection_url || "";
      if (!target) return { file: null };
    }
  }
  return { file: await saveFile(jar, target, dir) };
}
