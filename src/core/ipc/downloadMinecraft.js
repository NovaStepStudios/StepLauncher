const { MinecraftDownloader } = require("../libs/Minecraft/index.js");
const { getRootDir } = require("../utils/config.js");

function handleDownloadMinecraft(ipcMain) {
  ipcMain.handle("DownloadMinecraft", async (evt, { type, version } = {}) => {
    if (!type || !version) {
      evt.sender.send("download-error", "Faltan parámetros");
      return;
    }

    const downloader = new MinecraftDownloader(getRootDir(), true, type);
    const verToDownload =
      typeof version === "object" && version.ID ? version.ID : version;

    downloader.version = verToDownload;
    downloader._startTime = Date.now();

    // General
    downloader.on("progress", (m) => evt.sender.send("download-progress", m));
    downloader.on("error", (e) => evt.sender.send("download-error", e));
    downloader.on("done", (msg) => {
      const totalMs = Date.now() - downloader._startTime;
      evt.sender.send("download-done", msg);
      evt.sender.send("download-total-time", totalMs);
    });

    downloader.on("estimatedTime", (ms) =>
      evt.sender.send("download-estimated-time", ms)
    );
    downloader.on("progressTime", (elapsed) =>
      evt.sender.send("download-progress-time", elapsed)
    );

    // Etapas específicas
    downloader.on("jvm-progress", (msg) =>
      evt.sender.send("jvm-progress", msg)
    );
    downloader.on("libs-progress", (msg) =>
      evt.sender.send("libs-progress", msg)
    );
    downloader.on("natives-progress", (msg) =>
      evt.sender.send("natives-progress", msg)
    );
    downloader.on("assets-progress", (msg) =>
      evt.sender.send("assets-progress", msg)
    );
    downloader.on("client-progress", (msg) =>
      evt.sender.send("client-progress", msg)
    );

    try {
      await downloader.download(verToDownload);
    } catch (e) {
      console.error("[MAIN] Error en download:", e);
      evt.sender.send("download-error", e.message || String(e));
    }
  });
}

module.exports = { handleDownloadMinecraft };
