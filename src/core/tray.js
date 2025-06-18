// core/tray.js
const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");

function createTray(config, getWin, createMainWindow) {
  /* ---------- icono ---------- */
  const iconPath = path.join(__dirname, "icon.ico");
  let trayIcon   = nativeImage.createFromPath(iconPath);

  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn("⚠️ No se pudo cargar icon.ico; se usará un icono vacío.");
    trayIcon = nativeImage.createEmpty();
  } else {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip("StepLauncher");

  /* ---------- helpers ---------- */
  const ensureWindow = () => {
    const win = getWin();
    return win && !win.isDestroyed() ? win : createMainWindow(config);
  };

  /* ---------- menú contextual ---------- */
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Mostrar StepLauncher",
      click: () => {
        const w = ensureWindow();
        w.show();
        w.focus();
      },
    },
    {
      label: "Ocultar ventana",
      click: () => {
        const w = getWin();
        if (w && !w.isDestroyed()) w.hide();
      },
      enabled: !!getWin(),
    },
    {
      label: "Recargar launcher",
      click: () => {
        const w = getWin();
        if (w && !w.isDestroyed()) w.reload();
      },
      enabled: !!getWin(),
    },
    { type: "separator" },
    {
      label: "Cerrar",
      click: () => {
        app.isQuitting = true;
        const w = getWin();
        if (w && !w.isDestroyed()) {
          w.removeAllListeners("close");
          w.close();
        }
        tray.destroy();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  /* ---------- clic izquierdo: toggle ---------- */
  tray.on("click", () => {
    const w = ensureWindow();
    w.isVisible() ? w.hide() : w.show();
  });

  return tray;
}

module.exports = { createTray };
