/** DJ HQ — Electron entry point. Starts the local server on an ephemeral port
 *  and opens the UI in a window. External links open in the default browser. */
import { app, BrowserWindow, dialog, nativeTheme, shell } from "electron";
import * as path from "path";
import { startServer } from "./server";

// Packaged app keeps its data in the OS user-data dir; running from source uses
// the project folder (same place the Python version kept state.json).
const dataDir =
  process.env.DJHQ_DATA_DIR ||
  (app.isPackaged ? app.getPath("userData") : path.resolve(__dirname, ".."));

let win: BrowserWindow | null = null;

app.whenReady().then(async () => {
  const server = await startServer({
    dataDir,
    port: Number(process.env.DJHQ_PORT || 0),
    pickFolder: async () => {
      const r = await dialog.showOpenDialog(win!, {
        title: "Choose your music folder",
        properties: ["openDirectory"],
      });
      return r.canceled ? null : r.filePaths[0];
    },
    reveal: (p) => shell.showItemInFolder(p),
    packaged: app.isPackaged,
  });
  const port = (server.address() as any).port;

  const mac = process.platform === "darwin";
  win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1116" : "#f4f5f7",
    title: "DJ HQ",
    // macOS: the window chrome blends into the sidebar (traffic lights over it)
    ...(mac ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 18 } } : {}),
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://127.0.0.1:${port}/${mac ? "?titlebar=inset" : ""}`);
  win.on("closed", () => { win = null; });
});

app.on("window-all-closed", () => app.quit());
