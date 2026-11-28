/** Free downloads that need no page: a public Google Drive or Dropbox file, a plain link to an
 *  audio file, and SoundCloud's own download button (with the session of the Discover page).
 *  The file is streamed into the downloads folder under the name the server gives it. */
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as core from "./core";
import * as dlstop from "./dlstop";

const FILE_TIMEOUT_MS = 15 * 60 * 1000;
const AUDIO_OR_ZIP = /\.(wav|mp3|aiff?|flac|m4a|ogg|zip)$/i;
const EXT_OF: [RegExp, string][] = [
  [/wav/i, ".wav"], [/aiff/i, ".aiff"], [/flac/i, ".flac"], [/mpeg|mp3/i, ".mp3"], [/mp4|m4a|aac/i, ".m4a"], [/ogg/i, ".ogg"], [/zip/i, ".zip"],
];

/** The address the file itself comes from, for a link core.directKind knows. */
export function fileUrl(raw: string): string {
  const u = new URL(raw);
  switch (core.directKind(raw)) {
    case "drive": {
      const id = core.driveFileId(raw), key = u.searchParams.get("resourcekey");
      return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t${key ? "&resourcekey=" + encodeURIComponent(key) : ""}`;
    }
    case "dropbox": u.searchParams.set("dl", "1"); return u.toString();
    case "file": return u.toString();
    default: throw core.appError("bad_request", "not a direct download link");
  }
}

/** A name in the downloads folder that is not taken yet ("track.mp3", "track (2).mp3"). */
function freeName(dir: string, name: string): string {
  const ext = path.extname(name), base = path.basename(name, ext) || "download";
  let p = path.join(dir, base + ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** Content-Disposition's file name: filename*= first, then filename= (latin1 bytes that are really UTF-8 put right) */
export function dispositionName(cd: string): string {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd);
  if (star) return decode(star[1].trim().replace(/^"|"$/g, ""));
  const m = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(cd);
  const s = (m ? m[1] ?? m[2] : "").trim().replace(/\\(.)/g, "$1");
  const utf = Buffer.from(s, "latin1").toString("utf8");
  return /[^\x00-\xff]/.test(s) || utf.includes("�") ? s : utf;
}
export function safeName(s: string): string {
  const n = s.replace(/[\x00-\x1f/\\:*?"<>|]/g, "-").replace(/^\.+/, "").trim();
  const ext = path.extname(n);
  return ext ? path.basename(n, ext).slice(0, 180) + ext : n.slice(0, 180);
}

/** Stream a file into the downloads folder. Null when the answer is a page (a private or deleted
 *  file, a download limit) or not audio or a zip: the caller opens the link in the browser then.
 *  `name` (without extension) is used when the server names no file. */
export async function save(url: string, name: string): Promise<string | null> {
  const abort = dlstop.fetchSignal(FILE_TIMEOUT_MS);   // its time limit, and the Stop of Download all
  const res = await fetch(url, { headers: { "User-Agent": core.UA }, redirect: "follow", signal: abort });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !res.body || /text\/html|json/i.test(type)) { await res.body?.cancel().catch(() => {}); return null; }
  let file = safeName(dispositionName(res.headers.get("content-disposition") || ""));
  if (!file) {
    const fromUrl = safeName(decode(new URL(res.url || url).pathname.split("/").pop() || ""));
    const ext = AUDIO_OR_ZIP.exec(fromUrl)?.[0] || EXT_OF.find(([re]) => re.test(type))?.[1] || "";
    file = safeName(name || fromUrl.replace(AUDIO_OR_ZIP, "")) + ext;
  }
  if (!AUDIO_OR_ZIP.test(file)) { await res.body.cancel().catch(() => {}); return null; }
  const dir = core.inboxDir();
  fs.mkdirSync(dir, { recursive: true });
  // under a name the Downloads page doesn't look at until the file is complete
  const tmp = freeName(dir, `${file}.djhq-part`);
  try {
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(tmp, { flags: "wx" }));
    const want = Number(res.headers.get("content-length")) || 0;
    if (want && !res.headers.get("content-encoding") && fs.statSync(tmp).size !== want) throw core.appError("dl_cut_off", "the download was cut off");
    const target = freeName(dir, file);
    fs.renameSync(tmp, target);
    return target;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* not there */ }
    throw e;
  }
}

/** Download one of a track's own links (nothing else the request names). `token`: the SoundCloud
 *  session, asked for only when the link is SoundCloud's download button. */
export async function download(id: unknown, url: string, token: () => Promise<string | null>): Promise<{ file: string | null }> {
  const l = core.knownLink(String(id), url);
  if (!l || !l.link.direct) throw core.appError("bad_request", "not a direct download link of that track");
  if (l.link.direct !== "soundcloud") return { file: await save(fileUrl(url), l.name) };
  const tk = await token();
  if (!tk) throw core.appError("sc_sign_in_first", "sign in to SoundCloud on the Discover page first");
  return { file: await save(await core.scDownloadUrl(tk, l.id, l.url), l.name) };
}
