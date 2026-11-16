/** DJ HQ HTTP server: serves web/index.html and the JSON API documented in
 *  README.md ("HTTP API"). Runs inside the Electron main process, or
 *  standalone: `node dist/server.js`. Mutating requests are queued so file
 *  operations never overlap. The saved data is in djhq.db in the data folder (see store.ts). */
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as core from "./core";
import * as config from "./config";
import * as pipeline from "./pipeline";
import { platformApps } from "./extapps";

export interface ServerOpts {
  dataDir: string;
  port: number;
  pickFolder?: () => Promise<string | null>;
  /** choose one file: an app (pn_app / mik_app: the .app bundle on macOS, the .exe on
   *  Windows), Mixed In Key's database (mik_db) or a rekordbox XML (rb_xml) (Electron only) */
  pickFile?: (kind: PickKind) => Promise<string | null>;
  /** ask where to save a file (a save dialog) and write `text` there; null when cancelled (Electron only).
   *  kind: a configuration (default) or the raw data (state.json) */
  saveFile?: (defaultName: string, text: string, kind?: "config" | "raw") => Promise<string | null>;
  /** show a file in the OS file manager (Electron only) */
  reveal?: (p: string) => void;
  /** macOS desktop app: is it trusted for Accessibility (Do everything's "Press Start for me").
   *  prompt: ask macOS to ask the user, or open the list in System Settings (Electron only) */
  axTrusted?: (prompt: boolean) => boolean;
  /** true inside the packaged desktop app (enables the download link in update notices) */
  packaged?: boolean;
  /** the embedded SoundCloud view behind the Discover page (Electron only) */
  sc?: ScView;
}

/** config: a configuration file to import (asked for by the import route itself, not /api/pick-file) */
export type PickKind = "pn_app" | "mik_app" | "mik_db" | "rb_xml" | "config";
const PICK_KINDS: PickKind[] = ["pn_app", "mik_app", "mik_db", "rb_xml"];

/** An error as JSON: the message, plus its stable code (and vars) when it has one. */
const errBody = (e: any) => ({ error: String(e?.message || e),
  ...(typeof e?.code === "string" && /^[a-z][a-z0-9_]*$/.test(e.code) ? { code: e.code } : {}),
  ...(e?.vars && typeof e.vars === "object" ? { vars: e.vars } : {}) });

export interface ScRect { x: number; y: number; width: number; height: number; }
export interface ScView {
  /** attach the view to the window at these window coordinates (loads SoundCloud the first time);
   *  with a url that page is opened, and with play the track on it is started */
  show(rect: ScRect, url?: string, play?: boolean): Promise<void>;
  hide(): void;
  setBounds(rect: ScRect): void;
  navigate(url: string, play?: boolean): void;
  back(): void;
  /** drive the SoundCloud player bar: "toggle" (play/pause), "pause", "next", "prev", "seek" by n seconds or "seekto" second n */
  player(action: string, n?: number): Promise<{ ok: boolean; at?: number; of?: number }>;
  /** the track the SoundCloud player bar is showing, straight from the page */
  nowPlaying(): Promise<{ url: string; title: string; artist: string; playing: boolean; at: number; of: number } | null>;
  /** the track a list asked to play last and whether SoundCloud started it; null when none was asked for */
  starting(): { url: string; state: "starting" | "playing" | "failed" | "gone" } | null;
  /** true while SoundCloud's bot check (a DataDome captcha) is up in the view; false when there is no view */
  captcha(): Promise<boolean>;
  /** the page the view is on ("" before the first load) */
  url(): string;
  /** the session's oauth_token cookie, null when nobody is signed in */
  token(): Promise<string | null>;
  /** forget the SoundCloud session (cookies + storage) */
  signOut(): Promise<void>;
  /** run an api-v2 request inside the SoundCloud page (see core.ScTransport) */
  api: core.ScTransport;
}

export function startServer(opts: ServerOpts): Promise<http.Server> {
  core.init(opts.dataDir, !!opts.pickFolder, !!opts.reveal);
  core.setScTransport(opts.sc ? opts.sc.api : null);

  // file-mutating actions run one at a time
  let queue: Promise<any> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const r = queue.then(() => fn());
    queue = r.catch(() => {});
    return r;
  }

  // "Do everything": a job that runs outside the queue and only queues its file
  // operations. DJHQ_FAKE_APPS (tests) swaps the outside apps for stand-ins; the
  // packaged app never does.
  pipeline.init({ apps: platformApps(!opts.packaged), enqueue, dataDir: opts.dataDir, axTrusted: opts.axTrusted,
                  pollMs: opts.packaged ? 3000 : Math.max(200, Number(process.env.DJHQ_PIPE_POLL_MS) || 3000) });

  // UI preferences (theme, "tour seen", dismissed update) are kept in the database with the
  // rest: the window's origin changes with the port, so browser storage would forget them.
  const readPrefs = (): Record<string, unknown> => core.getPrefs();
  // the configuration file saved last (Show in folder may reveal it, nothing else the request names)
  let savedConfig = "";
  // the export can carry a private playlist link: only this computer's own pages may download it
  const localHost = (req: http.IncomingMessage) => /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(req.headers.host || ""));
  const webDir = path.join(__dirname, "..", "web");
  const indexPath = path.join(webDir, "index.html");
  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".woff2": "font/woff2", ".json": "application/json; charset=utf-8",
  };

  // Discover page: the embedded SoundCloud view and the signed-in user's actions.
  // Status calls are not queued (they poll); add/remove touch the saved data, so they are.
  const rect = (d: any): ScRect => ({ x: Math.round(+d.x || 0), y: Math.round(+d.y || 0), width: Math.max(0, Math.round(+d.width || 0)), height: Math.max(0, Math.round(+d.height || 0)) });
  let nowCache: { url: string; now: core.ScNow | null } = { url: "", now: null };
  async function scRoute(action: string, data: any): Promise<any> {
    const sc = opts.sc;
    if (!sc) return { available: false };
    switch (action) {
      case "show":   await sc.show(rect(data), data.url ? String(data.url) : undefined, !!data.play); return { ok: true };
      case "hide":   sc.hide(); return { ok: true };
      case "bounds": sc.setBounds(rect(data)); return { ok: true };
      case "nav": {
        if (data.action === "back") sc.back();
        else if (data.action === "signin") sc.navigate("https://soundcloud.com/signin");
        else if (data.action === "home") sc.navigate("https://soundcloud.com/discover");
        else if (data.action === "playlist") { const l = core.activeLib(); if (l) sc.navigate(l.url); }
        else if (typeof data.url === "string" && /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(data.url)) {
          if (data.play && await sc.captcha()) throw new Error(core.SC_CAPTCHA);   // the track would never start: say why at once
          sc.navigate(data.url, !!data.play);
        }
        return { ok: true };
      }
      case "player": {   // {action: toggle|pause|next|prev|seek|seekto, n?}: the player keys and the bar's seek line
        const a = String(data.action || "");
        if (!/^(toggle|pause|next|prev|seek|seekto)$/.test(a)) throw new Error("unknown player action");
        const n = Number(data.n) || 0;
        return sc.player(a, a === "seekto" ? Math.max(0, Math.min(86400, n)) : Math.max(-600, Math.min(600, n)));
      }
      case "signout": await sc.signOut(); return { ok: true };
      case "status": {
        const token = await sc.token();
        let me: core.ScUser | null = null, can: { ok: boolean; why?: string; likes: boolean } | null = null;
        if (token) {
          try { me = await core.scMe(token); } catch { me = null; }   // a stale cookie: treat as signed out
          if (me) { try { can = await core.scCanWrite(token); } catch (e: any) { can = { ok: false, why: e.message, likes: false }; } }
        }
        let now: any = null;
        try { now = await sc.nowPlaying(); } catch {}
        if (now && now.url) {
          const url = now.url.split(/[?#]/)[0];
          if (url !== nowCache.url) {
            let r: core.ScNow | null = null;
            try { r = await core.scNow(url); } catch {}
            nowCache = { url, now: r };
          }
          const t = nowCache.now;
          const inList = t ? (core.activeLib()?.playlist?.tracks || []).some((x) => x.id === t.id) : false;
          const likedSet = me && t ? core.likedIdsCached(me) : null;   // null until the likes list is known
          now = { ...now, url, track: t, in_playlist: inList, liked: likedSet && t ? likedSet.has(t.id) : null };
        }
        // one look at the page, cheap enough for the poll; last, since the calls above may be what made the view
        const captcha = await sc.captcha();
        return { available: true, url: sc.url(), signed_in: !!me, me, can, now, start: sc.starting(), captcha };
      }
      case "add": case "remove":
        return enqueue(async () => {   // the token is read right before the write, so a sign-out in the view is respected
          const token = await sc.token();
          if (!token) throw new Error("sign in to SoundCloud on the Discover page first");
          if (await sc.captcha()) throw new Error(core.SC_CAPTCHA);
          const like = action === "add" && ("like" in data ? !!data.like : !!core.getSettings().like_on_add);
          return core.scSetInPlaylist(token, String(data.url || ""), action === "add", like);
        });
      case "like":   // {url, on}
        return enqueue(async () => {
          const token = await sc.token();
          if (!token) throw new Error("sign in to SoundCloud on the Discover page first");
          if (await sc.captcha()) throw new Error(core.SC_CAPTCHA);
          return core.scSetLiked(token, String(data.url || ""), !!data.on);
        });
      case "likes": {   // {force?}: the Your Likes page (not a view)
        const token = await sc.token();
        if (!token) return { signed_in: false };
        return enqueue(() => core.scLikesCheck(token, !!data.force));
      }
      default: throw new Error("unknown SoundCloud action");
    }
  }

  const server = http.createServer((req, res) => {
    const send = (code: number, type: string, body: Buffer | string) => {
      res.writeHead(code, { "Content-Type": type, "Content-Length": Buffer.byteLength(body) });
      res.end(body);
    };
    const json = (obj: any, code = 200) =>
      send(code, "application/json; charset=utf-8", JSON.stringify(obj));

    if (req.method === "GET") {
      if (req.url === "/" || req.url === "/index.html" || (req.url || "").startsWith("/?"))
        return send(200, "text/html; charset=utf-8", fs.readFileSync(indexPath));
      if (req.url === "/api/state")
        return void core.buildView().then(json, (e) => json({ error: e.message }, 500));
      if (req.url === "/api/prefs") return json(readPrefs());
      if (req.url === "/api/do-all/status") return json(pipeline.status());   // never builds the view
      if (req.url === "/api/state/raw") {   // the saved data as state.json of DJ HQ 1.7 and older (support, going back)
        if (!localHost(req)) return send(403, "text/plain", "forbidden");   // it carries private links and paths
        return void enqueue(async () => JSON.stringify(core.STATE)).then((text) => {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text),
            "Content-Disposition": 'attachment; filename="state.json"', "Cache-Control": "no-store" });
          res.end(text);
        }, (e) => json(errBody(e), 500));
      }
      if ((req.url || "").startsWith("/api/config/export?") || req.url === "/api/config/export") {   // headless: the file as a download
        if (!localHost(req)) return send(403, "text/plain", "forbidden");
        const q = new URL(req.url || "", "http://x").searchParams;
        return void enqueue(async () => JSON.stringify(config.buildExport({ leaveLinksOut: q.get("leave_links_out") === "1", theme: readPrefs().theme }), null, 2))
          .then((text) => {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text),
              "Content-Disposition": `attachment; filename="${config.exportFileName()}"`, "Cache-Control": "no-store" });
            res.end(text);
          }, (e) => json(errBody(e), 500));
      }
      if ((req.url || "").startsWith("/api/file?")) {   // stream a local audio file for the in-app preview
        const q = new URL(req.url || "", "http://x").searchParams;
        const p = path.resolve(String(q.get("path") || ""));
        const ok = core.allowedDirs().some((d) => p.startsWith(d + path.sep));
        if (!ok || !fs.existsSync(p) || !fs.statSync(p).isFile()) return send(404, "text/plain", "not found");
        const types: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".aiff": "audio/aiff", ".aif": "audio/aiff", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".opus": "audio/ogg" };
        const type = types[path.extname(p).toLowerCase()] || "application/octet-stream";
        const size = fs.statSync(p).size;
        const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
        let start = 0, end = size - 1;
        if (range) { if (range[1]) start = Number(range[1]); if (range[2]) end = Number(range[2]); if (!range[1] && range[2]) { start = Math.max(0, size - Number(range[2])); end = size - 1; } }
        if (start > end || end >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
        res.writeHead(range ? 206 : 200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
          ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
        return void fs.createReadStream(p, { start, end }).pipe(res);
      }
      if (req.url === "/api/app") {
        let version = "";
        try { version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version || ""; } catch {}
        return json({ version, platform: process.platform, arch: process.arch, packaged: !!opts.packaged, sc: !!opts.sc });
      }
      // static UI assets (web/app.css, web/app.js, web/pages/*.js)
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = path.normalize(path.join(webDir, rel));
      const ext = path.extname(file).toLowerCase();
      if (file.startsWith(webDir + path.sep) && MIME[ext] && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "no-cache" });
        return res.end(fs.readFileSync(file));
      }
      return send(404, "text/plain", "not found");
    }

    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let data: any = {};
        try { data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
        const route = (fn: () => Promise<any>) =>
          enqueue(fn).then(json, (e) => json(errBody(e), 500));
        const direct = (fn: () => Promise<any>) => void fn().then(json, (e) => json(errBody(e), 500));
        if (req.url === "/api/prefs") {   // not queued: must not wait behind a long tag/convert run
          try { return json(core.setPrefs(data && typeof data === "object" && !Array.isArray(data) ? data : {})); }
          catch (e: any) { return json({ error: e.message }, 500); }
        }
        if ((req.url || "").startsWith("/api/sc/")) return void scRoute(req.url!.slice(8), data).then(json, (e) => json({ error: e.message }, 500));
        switch (req.url) {
          case "/api/refresh":  return route(() => core.refresh());
          case "/api/rescan":   return route(() => core.buildView());
          case "/api/tag":      return route(() => core.tagAll());
          case "/api/convert":  return route(() => core.convertAll());
          case "/api/restore":  return route(() => core.restoreAll());
          case "/api/clean-backups": return route(() => core.cleanBackups());
          case "/api/library":  return route(() => core.libraryOp(data));
          case "/api/device":   return route(() => core.setDevice(data.device));
          case "/api/settings": return route(async () => {
            if (data && data.do_all) await pipeline.checkSettingsPatch(data.do_all);   // the app bundles / exes
            return core.setSettings(data);
          });
          // not queued: the job queues its own file operations (see pipeline.ts)
          case "/api/do-all/detect":  return direct(() => pipeline.detect());
          case "/api/do-all/start":   return direct(() => pipeline.start(data));
          case "/api/do-all/control": return direct(() => pipeline.controlJob(data));
          case "/api/do-all/access":  return direct(() => pipeline.accessibility(data));
          case "/api/override": return route(() => core.setOverride(data));
          case "/api/edit":     return route(() => core.setEdit(data));
          case "/api/assign":   return route(() => core.setAssign(data));
          case "/api/seen":     return route(() => core.markSeen());
          case "/api/find":     return route(() => core.findTrack(data));
          case "/api/found":    return route(() => core.setFound(data));
          case "/api/find-all": return route(() => core.findAll());
          case "/api/inbox":          return route(() => core.inboxView());
          case "/api/inbox-move":     return route(() => core.inboxMove(data));
          case "/api/inbox-find":     return route(() => core.inboxFind(data));
          case "/api/inbox-move-all": return route(() => core.inboxMoveAll());
          case "/api/export-xml":     return route(() => core.exportRekordboxXml());
          // configuration export / import (see config.ts)
          case "/api/config/export-info": return route(async () => ({ ...config.exportInfo(), can_save: !!opts.saveFile }));
          case "/api/config/export": {   // {leave_links_out}: a save dialog; headless answers {unsupported} and the page downloads GET /api/config/export
            if (!opts.saveFile) return json({ unsupported: true });
            const save = opts.saveFile;
            return void enqueue(async () => JSON.stringify(config.buildExport({ leaveLinksOut: !!data.leave_links_out, theme: readPrefs().theme }), null, 2))
              .then((text) => save(config.exportFileName(), text))
              .then((p) => { if (p) savedConfig = path.resolve(p); json(p ? { path: p } : { canceled: true }); }, (e) => json(errBody(e), 500));
          }
          case "/api/state/raw": {   // a save dialog for the raw data; headless answers {unsupported} and the page downloads GET /api/state/raw
            if (!opts.saveFile) return json({ unsupported: true });
            const save = opts.saveFile;
            return void enqueue(async () => JSON.stringify(core.STATE))
              .then((text) => save("state.json", text, "raw"))
              .then((p) => json(p ? { path: p } : { canceled: true }), (e) => json(errBody(e), 500));
          }
          case "/api/config/import/plan": {   // {text} (headless: the file's contents) or {pick: true} (a file dialog); nothing is written
            if (data.pick) {
              if (!opts.pickFile) return json({ unsupported: true });
              return void opts.pickFile("config").then((p) => {
                if (!p) return json({ canceled: true });
                const st = fs.statSync(p);
                if (st.size > 64 * 1024 * 1024) throw core.appError("config_too_big", "this file is far too big to be a DJ HQ configuration");
                return json({ ...config.plan(fs.readFileSync(p, "utf8")), file_name: path.basename(p) });
              }).catch((e) => json(errBody(e), 500));
            }
            return direct(async () => config.plan(String(data.text ?? "")));
          }
          case "/api/config/import/probe": return direct(async () => config.probe(data));
          case "/api/config/import/apply": return route(() => {
            const j = pipeline.status();   // a run that is going works on the current library's files
            return config.apply(data, { jobActive: !!j.active || ["running", "waiting"].includes(j.job?.status) });
          });
          case "/api/reveal": {
            if (!opts.reveal) return json({ unsupported: true });
            const p = path.resolve(String(data.path || ""));
            if (p !== core.rekordboxXmlPath() && !(savedConfig && p === savedConfig)) return json({ error: "can only reveal the exported file" }, 400);
            opts.reveal(p);
            return json({ ok: true });
          }
          case "/api/pick-file": {
            const kind = String(data.kind || "") as PickKind;
            if (!PICK_KINDS.includes(kind)) return json({ error: "unknown file kind", code: "bad_request" }, 400);
            if (!opts.pickFile) return json({ path: null, unsupported: true });
            return void opts.pickFile(kind).then((p) => json({ path: p }), (e) => json(errBody(e), 500));
          }
          case "/api/pick-folder":
            if (!opts.pickFolder) return json({ path: null, unsupported: true });
            return void opts.pickFolder()
              .then((p) => json({ path: p }), (e) => json({ error: e.message }, 500));
          default:
            return send(404, "text/plain", "not found");
        }
      });
      return;
    }
    send(405, "text/plain", "method not allowed");
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve(server));
  });
}

/** what a second DJ HQ on the same data folder says before it gives up */
export const IN_USE_TEXT = (dir: string) =>
  `Another DJ HQ window, or the headless server, is using this data folder:\n${dir}\nClose it first.`;

if (require.main === module) {
  const dataDir = process.env.DJHQ_DATA_DIR || path.resolve(__dirname, "..");
  let started: Promise<http.Server>;
  try { started = startServer({ dataDir, port: Number(process.env.DJHQ_PORT || 8765) }); }
  catch (e: any) { started = Promise.reject(e); }
  started.then((s) => {
    const addr = s.address() as any;
    console.log(`DJ HQ (headless) on http://localhost:${addr.port}  data: ${dataDir}`);
    // Ctrl+C / kill: close the database (releases the lock), then go
    const stop = () => { s.close(); core.shutdown(); process.exit(0); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }, (e) => {
    if (e?.code === "db_in_use") console.error("DJ HQ is already open. " + IN_USE_TEXT(dataDir));
    else console.error("failed to start:", e.message);
    core.shutdown();
    process.exit(1);
  });
}
