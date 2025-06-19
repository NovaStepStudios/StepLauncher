import { applyUsernameToDOM } from "../global/Account.js";
import { showNotification } from "../global/Notification.js";

const versionSelect = document.getElementById("version");
const playBtn = document.getElementById("PlayGame");
const logArea = document.getElementById("logArea");
let installedVersions = [];

// Devuelve el tipo de versión según prefijo
function getTypeFromValue(value) {
  if (value.startsWith("forge-")) return "Forge";
  if (value.startsWith("fabric-")) return "Fabric";
  if (value.startsWith("neoforge-")) return "NeoForge";
  return "Vanilla";
}

function populateVersionOptions() {
  versionSelect.innerHTML = "";

  if (installedVersions.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No tienes versiones instaladas";
    versionSelect.appendChild(opt);
    versionSelect.disabled = true;
    playBtn.disabled = true;
  } else {
    installedVersions.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v.startsWith("forge-")
        ? `Forge ${v.substring(6)}`
        : v.startsWith("fabric-")
        ? `Fabric ${v.substring(7)}`
        : v.startsWith("neoforge-")
        ? `NeoForge ${v.substring(9)}`
        : v;
      versionSelect.appendChild(opt);
    });
    versionSelect.disabled = false;
    playBtn.disabled = false;
  }
}

export async function loadVersions() {
  try {
    installedVersions = await window.electronAPI.getInstalledVersions();
    populateVersionOptions();
  } catch (error) {
    console.error("Error obteniendo versiones:", error);
    versionSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Error cargando versiones";
    versionSelect.appendChild(opt);
    versionSelect.disabled = true;
    playBtn.disabled = true;

    showNotification({
      type: "error",
      icon: "warning",
      text: "Error al cargar versiones",
    });
  }
}

let logLines = [];
const MAX_LOG_LINES = 20;

function appendLog(message, type = "info") {
  const time = new Date().toLocaleTimeString();
  const prefix =
    {
      info: "[INFO]",
      debug: "[DEBUG]",
      error: "[ERROR]",
      data: "[DATA]",
      warn: "[WARN]",
    }[type] || "[LOG]";

  const line = `${time} ${prefix} ${message}`;

  // Evitar repeticiones continuas
  if (logLines.length && logLines[logLines.length - 1].startsWith(line)) {
    // Podríamos mejorar con contador, pero simple está bien
    logLines.push(line);
  } else {
    logLines.push(line);
  }

  if (logLines.length > MAX_LOG_LINES) {
    logLines.shift();
  }

  logArea.textContent = logLines.join("\n");
  logArea.scrollTop = logArea.scrollHeight;
}

function clearLog() {
  logLines = [];
  logArea.textContent = "";
}

// Registro único de listeners IPC fuera del click
function registerIpcListeners() {
  window.electronAPI.onMinecraftDebug((msg) => appendLog(msg, "debug"));
  window.electronAPI.onMinecraftData((msg) => appendLog(msg, "data"));
  window.electronAPI.onMinecraftError((msg) => appendLog(msg, "error"));
  window.electronAPI.onMinecraftClose((code) => {
    appendLog(`Minecraft se cerró con código: ${code}`, "info");
    playBtn.disabled = false;
    playBtn.textContent = "▶ JUGAR";
  });
}

// Al cargar el script:
loadVersions();
registerIpcListeners();

playBtn.addEventListener("click", async () => {
  const selectedVersion = versionSelect.value;
  if (!selectedVersion) {
    showNotification({
      type: "error",
      icon: "warning",
      text: "Por favor selecciona una versión para jugar",
    });
    return;
  }

  playBtn.disabled = true;
  playBtn.textContent = `Jugando: ${selectedVersion}`;
  clearLog();
  appendLog(
    `--- Lanzamiento iniciado a las ${new Date().toLocaleTimeString()} ---`,
    "info"
  );
  appendLog(`Iniciando Minecraft versión ${selectedVersion}...`, "info");

  try {
    await window.electronAPI.playMinecraft(selectedVersion);
    showNotification({
      type: "success",
      icon: "check",
      text: `Minecraft ${selectedVersion} se lanzó correctamente!`,
    });
    appendLog(
      `Minecraft versión ${selectedVersion} lanzado con éxito.`,
      "info"
    );
  } catch (err) {
    console.error("Error lanzando Minecraft:", err);
    appendLog(`Error al lanzar Minecraft: ${err.message || err}`, "error");
    showNotification({
      type: "error",
      icon: "warning",
      text: `Error al lanzar Minecraft: ${err.message || err}`,
    });
    playBtn.disabled = false;
    playBtn.textContent = "▶ JUGAR";
  }
});
