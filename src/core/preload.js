const { contextBridge, ipcRenderer } = require("electron");
console.log("Preload - Onready!");

contextBridge.exposeInMainWorld("electronAPI", {
  downloadMinecraft: (opts) => ipcRenderer.invoke("DownloadMinecraft", opts),

  // Cambié para que reciba un objeto 'opts' con version, type, etc
  playMinecraft: (versionID) =>
    ipcRenderer.invoke("EjecutingMinecraft", versionID),

  getInstalledVersions: () => ipcRenderer.invoke("get-installed-versions"),

  onProgress: (callback) =>
    ipcRenderer.on("download-progress", (event, msg) => callback(msg)),

  onError: (callback) =>
    ipcRenderer.on("download-error", (event, err) => callback(err)),

  onDone: (callback) =>
    ipcRenderer.on("download-done", (event, msg) => callback(msg)),

  // Nuevo método para enviar error al main process
  sendMinecraftLaunchError: (message) => {
    ipcRenderer.send("minecraft-launch-error", message);
  },
});
