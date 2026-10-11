/** DJ HQ HTTP server — same API as the original Python app. Runs inside the
 *  Electron main process, or standalone: `node dist/server.js`. */
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as core from "./core";

export interface ServerOpts {
  dataDir: string;
  port: number;
  pickFolder?: () => Promise<string | null>;
}

export function startServer(opts: ServerOpts): Promise<http.Server> {
  core.init(opts.dataDir, !!opts.pickFolder);

  // file-mutating actions run one at a time
  let queue: Promise<any> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const r = queue.then(() => fn());
    queue = r.catch(() => {});
    return r;
  }

  const indexPath = path.join(__dirname, "..", "web", "index.html");

  const server = http.createServer((req, res) => {
    const send = (code: number, type: string, body: Buffer | string) => {
      res.writeHead(code, { "Content-Type": type, "Content-Length": Buffer.byteLength(body) });
      res.end(body);
    };
    const json = (obj: any, code = 200) =>
      send(code, "application/json; charset=utf-8", JSON.stringify(obj));

    if (req.method === "GET") {
      if (req.url === "/" || req.url === "/index.html")
        return send(200, "text/html; charset=utf-8", fs.readFileSync(indexPath));
      if (req.url === "/api/state")
        return void core.buildView().then(json, (e) => json({ error: e.message }, 500));
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
        switch (req.url) {
          case "/api/refresh":  return route(() => core.refresh());
          case "/api/rescan":   return route(() => core.buildView());
          case "/api/tag":      return route(() => core.tagAll());
          case "/api/convert":  return route(() => core.convertAll());
          case "/api/restore":  return route(() => core.restoreAll());
          case "/api/library":  return route(() => core.libraryOp(data));
          case "/api/device":   return route(() => core.setDevice(data.device));
          case "/api/override": return route(() => core.setOverride(data));
          case "/api/edit":     return route(() => core.setEdit(data));
          case "/api/assign":   return route(() => core.setAssign(data));
          case "/api/seen":     return route(() => core.markSeen());
          case "/api/find":     return route(() => core.findTrack(data));
          case "/api/found":    return route(() => core.setFound(data));
          case "/api/find-all": return route(() => core.findAll());
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
