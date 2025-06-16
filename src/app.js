const { app, BrowserWindow } = require("electron");
const StepLauncher = require("./core/mainWindow.js"); // ahora sí es función

let isStarted = false;

async function launchOnce() {
  if (!isStarted || BrowserWindow.getAllWindows().length === 0) {
    await StepLauncher(); // ← llama a main()
    isStarted = true;
  } else {
    const win = BrowserWindow.getAllWindows()[0];
    win?.show();
    win?.focus();
  }
}

app
  .whenReady()
  .then(launchOnce)
  .catch((err) => {
    console.error("Error al iniciar StepLauncher:", err);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", launchOnce);
