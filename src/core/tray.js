// core/tray.js
const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");

function createTray(config, win, createMainWindow) {
  const iconPath = path.join(__dirname, "../icon.ico");
  let trayIcon = nativeImage.createFromPath(iconPath);

  if (trayIcon.isEmpty()) {
    console.warn("⚠️ No se pudo cargar el icono de la bandeja.");
  }

  trayIcon = trayIcon.resize({ width: 16, height: 16 });
  const tray = new Tray(trayIcon);

  tray.setToolTip("StepLauncher");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Mostrar StepLauncher",
      click: () => {
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
        } else {
          createMainWindow(config);
        }
      },
    },
    {
      label: "Ocultar ventana",
      click: () => win?.hide(),
      enabled: !!win,
    },
    {
      label: "Recargar launcher",
      click: () => win?.reload(),
      enabled: !!win,
    },
    { type: "separator" },
    {
      label: "Cerrar",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (!win || win.isDestroyed()) {
      createMainWindow(config);
    } else {
      win.isVisible() ? win.hide() : win.show();
    }
  });

  return tray;
}

module.exports = { createTray };
