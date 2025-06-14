const { BrowserWindow, ipcMain } = require('electron');
const rpc = require("./libs/Discord/index.js");
const path = require('path');
let win;
rpc.setMenu();
function StepLauncher() {
  win = new BrowserWindow({
    height: 600,
    width: 1200,
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
  win.loadFile(path.join(__dirname, "../", "main", "public", "home.html"));
  win.on("closed", () => {
    win = null;
  });
};

module.exports = { StepLauncher };