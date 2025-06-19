const { app, BrowserWindow } = require("electron");
const StepLauncher = require("./core/mainWindow.js"); // export default = función bootstrap

let isStarted = false;

async function launchOnce() {
  if (!isStarted || BrowserWindow.getAllWindows().length === 0) {
    try {
      await StepLauncher(); // ← ejecuta bootstrap
      isStarted = true;
    } catch (err) {
      console.error("Error al iniciar StepLauncher:", err);
      app.quit();
    }
  } else {
    const win = BrowserWindow.getAllWindows()[0];
    if (win?.isMinimized()) win.restore();
    win?.show();
    win?.focus();
  }
}

app.whenReady().then(launchOnce);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", launchOnce);
