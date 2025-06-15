// main.js (entrypoint de Electron)
const { BrowserWindow, ipcMain } = require("electron");
const { MinecraftDownloader, MinecraftEjecuting } = require("./libs/Minecraft");
const path = require("path");
const fs = require("fs").promises;

/* ───────── Helpers de rutas ────────── */
const getRootDir = () => ".StepLauncher"; // ~/.StepLauncher
const getVersionsDir = () => path.join(getRootDir(), "versions"); // ~/.StepLauncher/versions

/* ───────── Ventana principal ───────── */
let win;
function StepLauncher() {
  win = new BrowserWindow({
    width: 1200,
    height: 600,
    frame: false,
    resizable: true,
    icon: path.join(__dirname, "icon.ico"),
    title: "StepLauncher",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webgl: true,
      webSecurity: true,
    },
  });

  win.loadFile(path.join(__dirname, "../main/public/home.html"));
  win.on("closed", () => (win = null));
}

/* ───────── DESCARGA DE VERSIONES ───── */
ipcMain.handle("DownloadMinecraft", async (event, opts = {}) => {
  const { type, version } = opts;
  if (!type || !version) {
    return event.sender.send(
      "download-error",
      "Faltan parámetros obligatorios: type y/o version"
    );
  }

  const downloader = new MinecraftDownloader(getRootDir(), false, type);

  downloader.on("progress", (m) => event.sender.send("download-progress", m));
  downloader.on("error", (e) => event.sender.send("download-error", e));
  downloader.on("done", (m) => event.sender.send("download-done", m));

  try {
    await downloader.download(version);
  } catch (e) {
    event.sender.send("download-error", e.message || String(e));
  }
});

/* ───────── LISTAR VERSIONES INSTALADAS ───── */
async function getInstalledMinecraftVersions() {
  const ids = new Set();
  const dir = getVersionsDir();

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await fs.readFile(
          path.join(dir, entry.name, `${entry.name}.json`),
          "utf-8"
        );
        const { id } = JSON.parse(raw);
        if (id) ids.add(id);
      } catch {
        /* JSON corrupto: se ignora */
      }
    }
  } catch (err) {
    console.error("[getInstalledVersions]", err);
  }

  return [...ids].sort();
}
ipcMain.handle("get-installed-versions", getInstalledMinecraftVersions);

/* ───────── EJECUTAR MINECRAFT ───── */
ipcMain.handle("EjecutingMinecraft", async (event, versionID) => {
  try {
    if (typeof versionID !== "string" || !versionID.trim()) {
      throw new Error("Versión no especificada o inválida");
    }

    const launcher = new MinecraftEjecuting();

    const launchOpts = {
      root: getRootDir(),
      javaPath:
        "/home/stepnickasantiago/Descargas/jre-8u451-linux-x64 (1)/jre1.8.0_451/bin/java",
      memory: { max: "6G", min: "1G" },
      window: { width: 854, height: 480, fullscreen: false },
      version: { versionID, type: "release" },
      user: { name: "default_user" },
    };

    launcher.on("debug", (m) => event.sender.send("minecraft-debug", m));
    launcher.on("data", (m) => event.sender.send("minecraft-data", m));

    await launcher.launch(launchOpts);
  } catch (err) {
    console.log("Error lanzando Minecraft:", err);
  }
});

ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.close();
  }
});

ipcMain.on('maximize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    try {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    } catch (error) {
      console.log(error);
    }
  }
});

ipcMain.on('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    try {
      win.minimize();
    } catch (error) {
      console.log(error);
    }
  }
});

module.exports = { StepLauncher };
