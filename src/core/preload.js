const { contextBridge, ipcRenderer, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ───── Rutas ─────
const getRootDir = () => path.join(os.homedir(), ".StepLauncher");
const configPath = () => path.join(getRootDir(), "config.json");

// ───── Configuración por defecto ─────
const defaultConfig = {
  memory: {
    min: "1G",
    max: "2G",
  },
  window: {
    width: 854,
    height: 480,
    fullscreen: false,
  },
  minecraftDir: getRootDir(),
  cuenta: {
    username: "Player",
  },
};

// ───── Asegura que el archivo exista ─────
function ensureConfigFileExists() {
  if (!fs.existsSync(getRootDir())) {
    fs.mkdirSync(getRootDir(), { recursive: true });
  }
  if (!fs.existsSync(configPath())) {
    fs.writeFileSync(
      configPath(),
      JSON.stringify(defaultConfig, null, 2),
      "utf-8"
    );
  }
}

// ───── Mezcla profunda ─────
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ───── Obtiene configuración completa ─────
function getConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const userConfig = JSON.parse(raw);
    return deepMerge(JSON.parse(JSON.stringify(defaultConfig)), userConfig);
  } catch (e) {
    return JSON.parse(JSON.stringify(defaultConfig));
  }
}

// ───── Obtiene solo username ─────
function getUsernameFromConfig() {
  const config = getConfig();
  return config.cuenta?.username || defaultConfig.cuenta.username;
}

ensureConfigFileExists();

// ───── Canales de progreso de descarga ─────
const DL_CHANNELS = {
  all: "download-progress",
  jvm: "jvm-progress",
  libs: "libs-progress",
  natives: "natives-progress",
  assets: "assets-progress",
  client: "client-progress",
};

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  requestMaximizedState: () =>
    ipcRenderer.send("window:request-maximized-state"),
  onMaximizedState: (cb) =>
    ipcRenderer.on("window:maximized-state", (_, state) => cb(state)),
});

contextBridge.exposeInMainWorld("userAPI", {
  getUsername: () => getUsernameFromConfig(),
});

contextBridge.exposeInMainWorld("electronAPI", {
  // Descargar Minecraft
  downloadMinecraft: (opts) => ipcRenderer.invoke("DownloadMinecraft", opts),

  // Escuchar progreso por etapa → 'jvm', 'libs', 'natives', 'assets', 'client' o 'all'
  onDownload: (stage, cb) => {
    const channel = DL_CHANNELS[stage] || DL_CHANNELS.all;
    ipcRenderer.on(channel, (_e, msg) => cb(msg));
  },

  // Métodos individuales (retrocompatibles)
  onProgress: (cb) => ipcRenderer.on(DL_CHANNELS.all, (_, m) => cb(m)),
  onJVMProgress: (cb) => ipcRenderer.on(DL_CHANNELS.jvm, (_, m) => cb(m)),
  onLibsProgress: (cb) => ipcRenderer.on(DL_CHANNELS.libs, (_, m) => cb(m)),
  onNativesProgress: (cb) =>
    ipcRenderer.on(DL_CHANNELS.natives, (_, m) => cb(m)),
  onAssetsProgress: (cb) => ipcRenderer.on(DL_CHANNELS.assets, (_, m) => cb(m)),
  onClientProgress: (cb) => ipcRenderer.on(DL_CHANNELS.client, (_, m) => cb(m)),

  // Eventos generales
  onError: (cb) => ipcRenderer.on("download-error", (_, e) => cb(e)),
  onDone: (cb) => ipcRenderer.on("download-done", (_, m) => cb(m)),
  onEstimatedTime: (cb) =>
    ipcRenderer.on("download-estimated-time", (_, ms) => cb(ms)),
  onElapsed: (cb) =>
    ipcRenderer.on("download-progress-time", (_, ms) => cb(ms)),

  // Utilidad avanzada
  on: (channel, cb) => ipcRenderer.on(channel, (_, data) => cb(_, data)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Configuración
  loadConfig: () => getConfig(),
  saveConfig: (data = {}) => {
    try {
      const current = getConfig();
      const merged = deepMerge(current, data);
      fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), "utf-8");
    } catch (err) {
      console.error("Error guardando configuración:", err);
    }
  },

  // Diálogo para archivo
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  // Abrir links externos
  openLink: (link) => {
    if (typeof link === "string" && link.trim() !== "") {
      shell.openExternal(link).catch((err) => {
        console.error("Error al abrir link externo:", err);
      });
    }
  },

  // Minecraft ejecución
  playMinecraft: (versionID) =>
    ipcRenderer.invoke("EjecutingMinecraft", versionID),
  onMinecraftDebug: (cb) => ipcRenderer.on("minecraft-debug", (_, m) => cb(m)),
  onMinecraftData: (cb) => ipcRenderer.on("minecraft-data", (_, m) => cb(m)),
  onMinecraftError: (cb) => ipcRenderer.on("minecraft-error", (_, m) => cb(m)),
  onMinecraftClose: (cb) => ipcRenderer.on("minecraft-close", (_, c) => cb(c)),
  sendMinecraftLaunchError: (m) =>
    ipcRenderer.send("minecraft-launch-error", m),

  // Versiones instaladas
  getInstalledVersions: () => ipcRenderer.invoke("get-installed-versions"),
});
