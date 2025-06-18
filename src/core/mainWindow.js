const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { createTray } = require("./tray.js");
const { pathToFileURL } = require("url");
const { sendNotification } = require("./notifications.js");
const path = require("path");
const fs = require("fs").promises;
const os = require("os");

const { MinecraftDownloader } = require("./libs/Minecraft/index");
const { Client, Authenticator } = require("minecraft-launcher-core");

let tray = null;
let win = null;
const MB = 1024;

// ───────── Paths ─────────
const getRootDir = () => path.join(os.homedir(), ".StepLauncher");
const getVersionsDir = () => path.join(getRootDir(), "versions");
const getConfigPath = () => path.join(getRootDir(), "config.json");

// ───────── Utils ─────────
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

const defaultConfig = {
  minecraftDir: getRootDir(),
  launcher: {
    closeLauncherOnStart: false,
    disable3DModels: false,
    hardwareAcceleration: true,
    minimizeOnClose: false,
  },
  minecraft: {
    rutaJava: "",
    minRam: "1G",
    maxRam: "4G",
    resolucion: { width: 854, height: 480, fullscreen: false },
  },
  cuenta: { username: "Default", uuid: "" },
};

async function readConfig() {
  let config = {};
  let changed = false;

  try {
    const raw = await fs.readFile(getConfigPath(), "utf-8");
    config = JSON.parse(raw);
  } catch {
    changed = true;
  }

  function mergeDefaults(obj, defaults) {
    for (const key in defaults) {
      if (!(key in obj)) {
        obj[key] = defaults[key];
        changed = true;
      } else if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        mergeDefaults(obj[key], defaults[key]);
      }
    }
  }

  mergeDefaults(config, defaultConfig);

  if (changed) {
    try {
      await ensureDir(getRootDir());
      await fs.writeFile(
        getConfigPath(),
        JSON.stringify(config, null, 2),
        "utf-8"
      );
    } catch (e) {
      console.error("Error guardando config:", e);
    }
  }

  return config;
}

function normalizeRam(value, fallbackMb = 2048) {
  let mb;
  if (typeof value === "string") {
    const val = value.trim().toLowerCase();
    mb = val.endsWith("g") ? parseFloat(val) * MB : parseInt(val);
  } else {
    mb = Number(value);
  }
  if (!Number.isFinite(mb) || mb <= 0) mb = fallbackMb;
  const g = Math.max(1, Math.round(mb / MB));
  return { mb, jvm: `${g}G` };
}
function buildBaseOptions(cfg) {
  const { jvm: minJvm } = normalizeRam(cfg.minecraft?.minRam ?? "1G");
  const { jvm: maxJvm } = normalizeRam(cfg.minecraft?.maxRam ?? "4G");

  /* Resolución de la ventana */
  const res     = cfg.minecraft?.resolucion ?? {};
  const width   = res.fullscreen ? undefined : res.width  ?? 854;
  const height  = res.fullscreen ? undefined : res.height ?? 480;

  /*  ───── Java ─────  */
  const customJava = (cfg.minecraft?.rutaJava || "").trim();
  let javaPath;

  if (customJava) {
    // Permitir que el usuario apunte a la carpeta /bin o al ejecutable.
    const endsWithExe = /\bjava(w?)(\.exe)?$/i.test(path.basename(customJava));
    javaPath = endsWithExe
      ? customJava                                // ya es el ejecutable
      : path.join(customJava, os.platform() === "win32" ? "javaw.exe"
                                                        : "java");
  } else {
    // Java embebido que distribuyas con StepLauncher
    const runtimeBin = path.join(getRootDir(), "runtime", "java17", "bin");
    javaPath = path.join(
      runtimeBin,
      os.platform() === "win32" ? "javaw.exe" : "java"
    );
  }

  return {
    root   : cfg.minecraftDir ?? getRootDir(),
    javaPath,
    memory : { min: minJvm, max: maxJvm },
    window : { width, height, fullscreen: !!res.fullscreen },
  };
}

// ───────── Main Window ─────────
function createMainWindow() {
  const config = global.appConfig;

  win = new BrowserWindow({
    width: 1200,
    height: 600,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    resizable: true,
    icon: path.join(__dirname, "icon.ico"),
    title: "StepLauncher",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
      webgl: !config.launcher.disable3DModels,
    },
  });

  if (config.launcher.minimizeOnClose) {
    win.on("close", (e) => {
      e.preventDefault();
      win.hide();
    });
  } else {
    win.on("closed", () => {
      win = null;
      if (tray) tray.destroy();
      tray = null;
      app.quit();
    });
  }

  win.loadFile(path.join(__dirname, "../main/public/home.html"));
  return win;
}


// ───────── IPC ─────────
ipcMain.on("window:minimize", () => win?.minimize());
ipcMain.on("window:toggle-maximize", () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on("window:close", () => win?.close());
ipcMain.on("window:request-maximized-state", (e) => {
  if (win) e.sender.send("window:maximized-state", win.isMaximized());
});
ipcMain.on("GameMode",()=>{
  if (win) {
    fullscreen = true,
    win.loadFile(path.join(__dirname, "../main/public/extra/gameMode.home.html"));
  }
});

ipcMain.handle("open-file-dialog", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif"] }],
  });

  if (canceled || filePaths.length === 0) return null;

  return pathToFileURL(filePaths[0]).href;
});

ipcMain.handle("DownloadMinecraft", async (evt, { type, version } = {}) => {
  if (!type || !version) {
    evt.sender.send("download-error", "Faltan parámetros");
    return;
  }

  const downloader = new MinecraftDownloader(getRootDir(), true, type);
  downloader.on("progress", (m) => evt.sender.send("download-progress", m));
  downloader.on("error", (e) => evt.sender.send("download-error", e));
  downloader.on("done", (m) => evt.sender.send("download-done", m));

  try {
    await downloader.download(version);
  } catch (e) {
    evt.sender.send("download-error", e.message || String(e));
  }
});

ipcMain.handle("get-installed-versions", async () => {
  const versions = new Set();
  try {
    const dirs = await fs.readdir(getVersionsDir(), { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      try {
        const jsonPath = path.join(
          getVersionsDir(),
          dir.name,
          `${dir.name}.json`
        );
        const data = await fs.readFile(jsonPath, "utf-8");
        const { id } = JSON.parse(data);
        if (id) versions.add(id);
      } catch {}
    }
  } catch {}
  return [...versions].sort();
});
let isLaunching = false;

ipcMain.handle("EjecutingMinecraft", async (evt, versionID) => {
  if (isLaunching)
    return { success: false, error: "Minecraft ya se está ejecutando." };

  if (!versionID?.trim())
    return { success: false, error: "Versión no válida." };

  isLaunching = true;

  try {
    const cfg = await readConfig();
    const base = buildBaseOptions(cfg);

    // Autenticación básica con username y uuid
    const auth = Authenticator.getAuth(cfg.cuenta?.username || "Default");
    if (cfg.cuenta?.uuid?.trim()) auth.uuid = cfg.cuenta.uuid;

    const launcher = new Client();

    // Eventos para enviar logs y estado al frontend
    launcher.on("debug", (msg) =>
      evt.sender.send("minecraft-debug", msg.toString())
    );
    launcher.on("data", (msg) =>
      evt.sender.send("minecraft-data", msg.toString())
    );
    launcher.on("error", (err) =>
      evt.sender.send("minecraft-error", err.message || String(err))
    );
    launcher.on("close", (code) => {
      isLaunching = false;
      evt.sender.send("minecraft-close", code);

      // Mostrar ventana launcher si está configurado así
      if (cfg.launcher?.closeLauncherOnStart && win) win.show();
    });

    // Ocultar ventana launcher si corresponde
    if (cfg.launcher?.closeLauncherOnStart && win) win.hide();

    // Lanzar Minecraft con parámetros correctos
    await launcher.launch({
      authorization: auth,
      root: getRootDir(),
      version: { number: versionID, type: "release" }, // Aquí podrías ajustar 'type' dinámicamente si quieres
      memory: base.memory,
      javaPath: base.javaPath,
      window: base.window,
    });

    // Notificación de éxito
    sendNotification({
      title: "StepLauncher",
      body: `¡Minecraft versión ${versionID} se abrió exitosamente!`,
      icon: path.join(__dirname, "icon.ico"),
      silent: false,
    });

    return { success: true };
  } catch (error) {
    isLaunching = false;
    if (win) win.show();

    // Mandar error al frontend para que pueda mostrarlo en logs
    evt.sender.send("minecraft-error", error.message || String(error));

    return { success: false, error: error.message || String(error) };
  }
});

async function main() {
  const config = await readConfig();
  global.appConfig = config;
  await app.whenReady();

  win = createMainWindow();

  if (!tray) {
    tray = createTray(config, () => win, () => {
      win = createMainWindow();
    });
  }

  app.on("activate", () => {
    if (!win || win.isDestroyed()) {
      win = createMainWindow();
    } else {
      win.show();
      win.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

module.exports = main;