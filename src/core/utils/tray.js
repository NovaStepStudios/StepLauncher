const { Tray, Menu, nativeImage, app } = require("electron");
const { loadIcon } = require("./loadIcon");

function createTray(config, getWin, createMainWindow) {
  const iconPath = loadIcon("tray", "StepLauncher32x32");
  let trayIcon = nativeImage.createFromPath(iconPath);

  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn("⚠️ No se pudo cargar icono de tray:", iconPath);
    trayIcon = nativeImage.createEmpty();
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip("StepLauncher");

  const ensureWindow = () => {
    const win = getWin();
    return win && !win.isDestroyed() ? win : createMainWindow(config);
  };

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

  tray.on("click", () => {
    const w = ensureWindow();
    w.isVisible() ? w.hide() : w.show();
  });

  return tray;
}

module.exports = { createTray };
