/** DJ HQ — Electron entry point. Starts the local server on an ephemeral port
 *  and opens the UI in a window. External links open in the default browser. */
import { app, BrowserWindow, dialog, shell } from "electron";
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
  });
  const port = (server.address() as any).port;

  win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 760,
    backgroundColor: "#0d0f14",
    title: "DJ HQ",
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://127.0.0.1:${port}`);
  win.on("closed", () => { win = null; });
});

app.on("window-all-closed", () => app.quit());
