const { contextBridge, ipcRenderer } = require("electron");
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
  downloadMinecraft: (opts) => ipcRenderer.invoke("DownloadMinecraft", opts),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  loadConfig: () => {
    return getConfig();
  },

  saveConfig: (data = {}) => {
    try {
      const current = getConfig();
      const merged = deepMerge(current, data);
      fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), "utf-8");
    } catch (err) {
      console.error("Error guardando configuración:", err);
    }
  },
  gameMode: () =>
    ipcRenderer.send("GameMode"),

  onMinecraftDebug: (callback) =>
    ipcRenderer.on("minecraft-debug", (_, msg) => callback(msg)),

  onMinecraftData: (callback) =>
    ipcRenderer.on("minecraft-data", (_, msg) => callback(msg)),

  onMinecraftError: (callback) =>
    ipcRenderer.on("minecraft-error", (_, msg) => callback(msg)),

  onMinecraftClose: (callback) =>
    ipcRenderer.on("minecraft-close", (_, code) => callback(code)),
  playMinecraft: (versionID) =>
    ipcRenderer.invoke("EjecutingMinecraft", versionID),

  getInstalledVersions: () => ipcRenderer.invoke("get-installed-versions"),

  onProgress: (callback) =>
    ipcRenderer.on("download-progress", (_, msg) => callback(msg)),

  onError: (callback) =>
    ipcRenderer.on("download-error", (_, err) => callback(err)),

  onDone: (callback) =>
    ipcRenderer.on("download-done", (_, msg) => callback(msg)),

  sendMinecraftLaunchError: (message) => {
    ipcRenderer.send("minecraft-launch-error", message);
  },
});
