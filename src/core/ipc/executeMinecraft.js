const {
  readConfig,
  buildBaseOptions,
  getRootDir,
} = require("../utils/config.js");
const { sendNotification } = require("../utils/notifications.js");
const {MinecraftEjecuting} = require("../libs/Minecraft/index.js"); // Tu clase personalizada

function handleExecuteMinecraft(ipcMain, winRef) {
  let isLaunching = false;

  ipcMain.handle("EjecutingMinecraft", async (evt, versionID) => {
    if (isLaunching) return { success: false, error: "Ya se está ejecutando" };
    if (!versionID?.trim())
      return { success: false, error: "Versión inválida" };

    isLaunching = true;

    try {
      const cfg = await readConfig();
      const base = buildBaseOptions(cfg);
      const root = getRootDir();

      const launcher = new MinecraftEjecuting();

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
        if (cfg.launcher?.closeLauncherOnStart && winRef()) winRef().show();
      });

      if (cfg.launcher?.closeLauncherOnStart && winRef()) winRef().hide();

      await launcher.launch({
        version: {
          versionID: versionID,
          type: "release",
        },
        root: root,
        javaPath: base.javaPath,
        memory: base.memory,
        window: base.window,
        user: {
          name: cfg.cuenta?.username || "Jugador",
          uuid: cfg.cuenta?.uuid,
        },
        overrides: {
          gameDirectory: root,
        },
      });

      sendNotification({
        title: "StepLauncher",
        body: `¡Minecraft versión ${versionID} lanzada!`,
        icon: "icon.ico",
      });

      return { success: true };
    } catch (error) {
      isLaunching = false;
      if (winRef()) winRef().show();
      evt.sender.send("minecraft-error", error.message || String(error));
      return { success: false, error: error.message || String(error) };
    }
  });
}

module.exports = { handleExecuteMinecraft };
