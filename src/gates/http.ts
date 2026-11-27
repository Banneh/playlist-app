/** Plain HTTP for the gate adapters: a real Chromium user agent (several gates 403 a bare Node
 *  one) and a download that streams into the downloads folder under the server's own name. */
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as core from "../core";
import { trace } from "./trace";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const REQ_TIMEOUT_MS = 30000;
const FILE_TIMEOUT_MS = 10 * 60 * 1000;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A request with the browser UA and a timeout. `redirect: "manual"` is used where the 302 target
 *  is the OAuth URL and must not be followed from Node. */
export async function req(url: string, init: RequestInit = {}, timeoutMs = REQ_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();
  const method = init.method || "GET";
  trace(`${method} ${url.slice(0, 160)}`);
  try {
    const r = await fetch(url, {
      ...init,
      redirect: init.redirect ?? "follow",
      headers: { "user-agent": UA, ...(init.headers as Record<string, string> | undefined) },
      signal: ac.signal,
    });
    trace(`${method} ${r.status} ${r.headers.get("content-type") || ""} ${Date.now() - t0}ms ${url.slice(0, 100)}`);
    return r;
  } catch (e: any) {
    trace(`${method} FAILED ${e?.name || e} ${Date.now() - t0}ms ${url.slice(0, 100)}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** A JSON POST with the browser UA; the parsed body is null when the answer is not JSON. */
export async function jpost<T = any>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string; json: T | null }> {
  const r = await req(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: T | null = null;
  try { json = JSON.parse(text) as T; } catch {}
  return { status: r.status, text, json };
}

/** A name in the downloads folder that is not taken yet ("track.mp3" → "track (2).mp3"). */
function freeName(dir: string, name: string): string {
  const ext = path.extname(name), base = path.basename(name, ext) || "download";
  let p = path.join(dir, base + ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

const safe = (s: string) => s.replace(/[/\\:*?"<>|]+/g, "-").trim() || "download";

/** Stream a signed URL into the downloads folder and report where it landed. `prefer` keeps the
 *  caller's own name (the gate's file name) instead of the storage key in the header. */
export async function saveFile(url: string, headers: Record<string, string>, fallback: string, prefer = false): Promise<{ filePath: string; bytes: number; mime: string }> {
  const dir = core.inboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const res = await req(url, { headers }, FILE_TIMEOUT_MS);
  if (!res.ok || !res.body) throw new Error("file HTTP " + res.status);
  const cd = res.headers.get("content-disposition") || "";
  let named = "";
  try { named = decodeURIComponent((cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1] || ""); } catch {}
  // a header carrying raw UTF-8 bytes arrives latin-1 decoded ("BÃ–RSCHT")
  if (/[\u0080-\u00ff]/.test(named)) {
    const fixed = Buffer.from(named, "latin1").toString("utf8");
    if (fixed && !fixed.includes("\ufffd")) named = fixed;
  }
  const target = freeName(dir, safe((prefer && fallback) || named || fallback || "download"));
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(target));
  const bytes = fs.statSync(target).size;
  if (!bytes) throw new Error("empty file");
  return { filePath: target, bytes, mime: mimeOf(res.headers.get("content-type"), target) };
}

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".aif": "audio/aiff", ".aiff": "audio/aiff",
  ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".zip": "application/zip",
};

/** The server's type, or one from the file name when it only says octet-stream. */
function mimeOf(type: string | null, file: string): string {
  if (type && !/^application\/octet-stream$/i.test(type)) return type;
  return MIME[path.extname(file).toLowerCase()] || type || "application/octet-stream";
}

/** The `{…}` object that starts at the first `{` after `marker`, brace-matched (RSC payloads are
 *  escaped and not valid JSON as they stand). */
export function braceObject(text: string, marker: string, unescape = true): any {
  const i = text.indexOf(marker);
  if (i < 0) throw new Error("no " + marker + " in page");
  const raw = unescape ? text.slice(i + marker.length).replace(/\\"/g, '"') : text.slice(i + marker.length);
  const start = raw.indexOf("{");
  let depth = 0, end = -1;
  for (let k = start; k < raw.length; k++) {
    if (raw[k] === "{") depth++;
    else if (raw[k] === "}" && --depth === 0) { end = k + 1; break; }
  }
  if (start < 0 || end < 0) throw new Error("unbalanced " + marker);
  return JSON.parse(raw.slice(start, end));
}
