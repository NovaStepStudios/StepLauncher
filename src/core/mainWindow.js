const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
let win;

function StepLauncher() {
  win = new BrowserWindow({
    height: 600,
    width: 800,
    frame: false,
    resizable: true,
    webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        nodeIntegration: false,
        enableRemoteModule: true,
        webSecurity: true,
    },
    icon: path.join(__dirname, "icon.ico"),
    title: "StepLauncher",
  });

  win.setTitle("StepLauncher");
  win.loadFile(path.join(__dirname, '../','main','public','home.html'));
  win.on("closed", () => {
    win = null;
  });
};

module.exports = { StepLauncher };