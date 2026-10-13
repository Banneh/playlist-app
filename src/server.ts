/** DJ HQ HTTP server: serves web/index.html and the JSON API documented in
 *  README.md ("HTTP API"). Runs inside the Electron main process, or
 *  standalone: `node dist/server.js`. Mutating requests are queued so file
 *  operations never overlap. */
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as core from "./core";

export interface ServerOpts {
  dataDir: string;
  port: number;
  pickFolder?: () => Promise<string | null>;
  /** show a file in the OS file manager (Electron only) */
  reveal?: (p: string) => void;
  /** true inside the packaged desktop app (enables the download link in update notices) */
  packaged?: boolean;
  /** the embedded SoundCloud view behind the Discover page (Electron only) */
  sc?: ScView;
}

export interface ScRect { x: number; y: number; width: number; height: number; }
export interface ScView {
  /** attach the view to the window at these window coordinates (loads SoundCloud the first time) */
  show(rect: ScRect, url?: string): Promise<void>;
  hide(): void;
  setBounds(rect: ScRect): void;
  navigate(url: string): void;
  back(): void;
  /** the track the SoundCloud player bar is showing, straight from the page */
  nowPlaying(): Promise<{ url: string; title: string; artist: string; playing: boolean } | null>;
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

  // UI preferences (theme, "tour seen", dismissed update) live next to state.json: the
  // window's origin changes with the port, so browser storage would forget them.
  const prefsPath = path.join(opts.dataDir, "prefs.json");
  const readPrefs = (): Record<string, unknown> => {
    try { return JSON.parse(fs.readFileSync(prefsPath, "utf8")); } catch { return {}; }
  };
  const webDir = path.join(__dirname, "..", "web");
  const indexPath = path.join(webDir, "index.html");
  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".woff2": "font/woff2", ".json": "application/json; charset=utf-8",
  };

  // Discover page: the embedded SoundCloud view and the signed-in user's actions.
  // Status calls are not queued (they poll); add/remove touch state.json, so they are.
  const rect = (d: any): ScRect => ({ x: Math.round(+d.x || 0), y: Math.round(+d.y || 0), width: Math.max(0, Math.round(+d.width || 0)), height: Math.max(0, Math.round(+d.height || 0)) });
  let nowCache: { url: string; now: core.ScNow | null } = { url: "", now: null };
  async function scRoute(action: string, data: any): Promise<any> {
    const sc = opts.sc;
    if (!sc) return { available: false };
    switch (action) {
      case "show":   await sc.show(rect(data), data.url ? String(data.url) : undefined); return { ok: true };
      case "hide":   sc.hide(); return { ok: true };
      case "bounds": sc.setBounds(rect(data)); return { ok: true };
      case "nav": {
        if (data.action === "back") sc.back();
        else if (data.action === "signin") sc.navigate("https://soundcloud.com/signin");
        else if (data.action === "home") sc.navigate("https://soundcloud.com/discover");
        else if (data.action === "playlist") { const l = core.activeLib(); if (l) sc.navigate(l.url); }
        else if (typeof data.url === "string" && /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(data.url)) sc.navigate(data.url);
        return { ok: true };
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
          now = { ...now, url, track: t, in_playlist: inList };
        }
        return { available: true, url: sc.url(), signed_in: !!me, me, can, now };
      }
      case "add": case "remove":
        return enqueue(async () => {   // the token is read right before the write, so a sign-out in the view is respected
          const token = await sc.token();
          if (!token) throw new Error("sign in to SoundCloud on the Discover page first");
          return core.scSetInPlaylist(token, String(data.url || ""), action === "add");
        });
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
          enqueue(fn).then(json, (e) => json({ error: e.message }, 500));
        if (req.url === "/api/prefs") {   // not queued: must not wait behind a long tag/convert run
          const next = { ...readPrefs(), ...(data && typeof data === "object" ? data : {}) };
          try { fs.writeFileSync(prefsPath, JSON.stringify(next, null, 2)); } catch (e: any) { return json({ error: e.message }, 500); }
          return json(next);
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
          case "/api/settings": return route(() => core.setSettings(data));
          case "/api/override": return route(() => core.setOverride(data));
          case "/api/edit":     return route(() => core.setEdit(data));
          case "/api/assign":   return route(() => core.setAssign(data));
          case "/api/seen":     return route(() => core.markSeen());
          case "/api/find":     return route(() => core.findTrack(data));
          case "/api/found":    return route(() => core.setFound(data));
          case "/api/find-all": return route(() => core.findAll());
          case "/api/inbox":          return route(() => core.inboxView());
          case "/api/inbox-move":     return route(() => core.inboxMove(data));
          case "/api/inbox-move-all": return route(() => core.inboxMoveAll());
          case "/api/export-xml":     return route(() => core.exportRekordboxXml());
          case "/api/reveal": {
            if (!opts.reveal) return json({ unsupported: true });
            const p = path.resolve(String(data.path || ""));
            if (p !== core.rekordboxXmlPath()) return json({ error: "can only reveal the exported file" }, 400);
            opts.reveal(p);
            return json({ ok: true });
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

if (require.main === module) {
  const dataDir = process.env.DJHQ_DATA_DIR || path.resolve(__dirname, "..");
  startServer({ dataDir, port: Number(process.env.DJHQ_PORT || 8765) }).then((s) => {
    const addr = s.address() as any;
    console.log(`DJ HQ (headless) on http://localhost:${addr.port}  data: ${dataDir}`);
  }, (e) => {
    console.error("failed to start:", e.message);
    process.exit(1);
  });
}
