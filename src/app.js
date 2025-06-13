const { app } = require('electron');
const {StepLauncher} = require('./core/mainWindow.js');
const os = require('os');

if (os.platform() === "linux") {
  app.disableHardwareAcceleration();
  console.log("Aceleración de hardware desactivada");
}

app.whenReady().then(()=>{
    StepLauncher();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        StepLauncher();
    }
});