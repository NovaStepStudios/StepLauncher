// core/main.js
// Proceso principal de StepLauncher (solo define y exporta `bootstrap`)
// ─────────────────────────────────────
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { pathToFileURL } = require("url");
const path = require("path");
const fs = require("fs").promises;

// Utilidades propias
const { createTray } = require("./utils/tray");
const { loadIcon } = require("./utils/loadIcon");
const { sendNotification } = require("./utils/notifications");
const {
  getRootDir,
  getVersionsDir,
  readConfig,
  ensureDir,
} = require("./utils/config");

// IPC Handlers modulares
const { handleDownloadMinecraft } = require("./ipc/downloadMinecraft");
const { handleExecuteMinecraft } = require("./ipc/executeMinecraft");

// ───────── Variables de estado ─────────
let tray = null;
let win = null;

// ───────── Ventana principal ─────────
function createMainWindow() {
  const cfg = global.appConfig;

  win = new BrowserWindow({
    width: 1200,
    height: 600,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    resizable: true,
    title: "StepLauncher",
    icon: loadIcon("window", "StepLauncher"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webgl: !cfg.launcher.disable3DModels,
    },
  });

  // Política de cierre/minimizado configurable
  if (cfg.launcher.minimizeOnClose) {
    win.on("close", (e) => {
      e.preventDefault();
      win.hide();
    });
  } else {
    win.on("closed", () => {
      win = null;
      tray?.destroy();
      tray = null;
      app.quit();
    });
  }

  win.loadFile(path.join(__dirname, "../main/public/home.html"));
  return win;
}

// ───────── Handlers IPC genéricos ─────────
function registerGenericIPC() {
  ipcMain.on("window:minimize", () => win?.minimize());

  ipcMain.on("window:toggle-maximize", () => {
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });

  ipcMain.on("window:close", () => win?.close());

  ipcMain.on("window:request-maximized-state", (e) => {
    if (win) e.sender.send("window:maximized-state", win.isMaximized());
  });

  // Diálogo para elegir archivo
  ipcMain.handle("open-file-dialog", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif"] },
      ],
    });

    return canceled || filePaths.length === 0
      ? null
      : pathToFileURL(filePaths[0]).href;
  });

  // Listar versiones instaladas
  ipcMain.handle("get-installed-versions", async () => {
    const installed = new Set();
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
          if (id) installed.add(id);
        } catch {}
      }
    } catch {}
    return [...installed].sort();
  });
}

// ───────── Ciclo de vida de la app ─────────
async function bootstrap() {
  try {
    // 1. Cargar / crear config
    global.appConfig = await readConfig();

    // 2. Esperar Electron
    await app.whenReady();

    // 3. Crear ventana principal
    win = createMainWindow();

    // 4. Crear bandeja del sistema
    if (!tray) {
      tray = createTray(
        global.appConfig,
        () => win,
        () => {
          win = createMainWindow();
        }
      );
    }

    // 5. Registrar IPCs
    registerGenericIPC();
    handleDownloadMinecraft(ipcMain);
    handleExecuteMinecraft(ipcMain, () => win);

    // 6. Eventos de ciclo de vida
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
  } catch (err) {
    console.error("Fallo al iniciar StepLauncher:", err);
    sendNotification({
      title: "StepLauncher – Error fatal",
      body: err.message || String(err),
      silent: false,
    });
    console.log(err)
  }
}

// ───────── Exports ─────────
module.exports = bootstrap; // export por defecto (función)
module.exports.bootstrap = bootstrap; // export nombrado para tests
