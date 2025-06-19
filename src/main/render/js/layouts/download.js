/* ----------  Imports ---------- */
import { getVersions } from "../minecraft.js";
import { loadVersions } from "./play.js";
import { showNotification } from "../global/Notification.js";

/* ----------  Referencias / estado UI ---------- */
const typeBtns = document.querySelectorAll(".type-btn");
const vanillaRadios = document.querySelectorAll(
  'input[name="vanilla-channel"]'
);
const settings = document.querySelectorAll(".Settings");
const selectVanilla = document.getElementById("vanilla-select");

const progressWrap = document.getElementById("DownloadProgressElement");
const debugConsole = document.getElementById("DebugConsoleDownload");
const elementText = document.getElementById("TextDownload");
const downloadBtn = document.querySelector(".DownloadBtn");
downloadBtn.addEventListener("click", startDownload);

const loadedCache = {}; // canal|type → true
const logEntries = new Map(); // acción → div

let selectedType = "vanilla";
let isDownloading = false;
let currentDownloadVersion = null;
let totalEstimatedMs = 0;

/* ────────────────────────────────────────────────────────────────
   UTILIDADES
   ──────────────────────────────────────────────────────────────── */
async function fillSelect(select, versions) {
  select.innerHTML = "";
  versions.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = v;
    select.appendChild(opt);
  });
}

function formatTime(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}h ${m.toString().padStart(2, "0")}m ${s
        .toString()
        .padStart(2, "0")}s`
    : `${m}m ${s.toString().padStart(2, "0")}s`;
}

/* ----------  Cargar versiones ---------- */
async function updateVanillaSelect(channel) {
  if (loadedCache[channel]) return;
  selectVanilla.innerHTML = "<option>Cargando…</option>";
  try {
    const versions = await getVersions(channel);
    if (!versions?.length) throw new Error("Lista vacía");
    await fillSelect(selectVanilla, versions);
    loadedCache[channel] = true;
  } catch (e) {
    console.error("[updateVanillaSelect]", e);
    selectVanilla.innerHTML = "<option>Error</option>";
  }
}

async function updateSelectFor(type) {
  const select = document.querySelector(`#settings-${type} select`);
  if (!select || loadedCache[type]) return;

  select.innerHTML = "<option>Cargando…</option>";
  try {
    const versions = await getVersions(type);
    if (!versions?.length) throw new Error("Lista vacía");
    await fillSelect(select, versions);
    loadedCache[type] = true;
  } catch (e) {
    console.error(`[updateSelectFor] ${type}`, e);
    select.innerHTML = "<option>Error</option>";
    loadedCache[type] = false;
  }
}

/* ────────────────────────────────────────────────────────────────
   HANDLERS DE UI
   ──────────────────────────────────────────────────────────────── */
vanillaRadios.forEach((radio) =>
  radio.addEventListener("click", async (e) => {
    if (selectedType !== "vanilla") return;
    loadedCache[e.target.value] = false;
    await updateVanillaSelect(e.target.value);
  })
);

typeBtns.forEach((btn) =>
  btn.addEventListener("click", async () => {
    const type = btn.dataset.type;
    const channel =
      document.querySelector('input[name="vanilla-channel"]:checked')?.value ??
      "release";

    if (type !== selectedType) {
      typeBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedType = type;
      settings.forEach((s) => s.classList.remove("active"));
      document
        .getElementById(`settings-${selectedType}`)
        ?.classList.add("active");
    }
    if (type === "vanilla") await updateVanillaSelect(channel);
    else await updateSelectFor(type);
  })
);

/* ────────────────────────────────────────────────────────────────
   DESCARGA
   ──────────────────────────────────────────────────────────────── */
function startDownload() {
  if (isDownloading) return;

  document.querySelector(".DownloadTime").style.display = "none";

  const opts = { type: selectedType };
  const sel = document.querySelector(`#settings-${selectedType} select`);
  if (sel) opts.version = sel.value;
  if (selectedType === "vanilla")
    opts.channel =
      document.querySelector('input[name="vanilla-channel"]:checked')?.value ??
      "release";

  if (!opts.version) {
    showNotification({ type: "error", text: "Selecciona una versión" });
    return;
  }

  isDownloading = true;
  currentDownloadVersion = opts.version;
  elementText.textContent = `Descargando Minecraft: ${currentDownloadVersion}`;
  downloadBtn.disabled = true;

  let cd = 5;
  const int = setInterval(() => {
    downloadBtn.textContent = `Comenzando en ${cd}…`;
    if (cd === 0) {
      clearInterval(int);
      downloadBtn.innerHTML = `<p>Descargando…</p><span class="loader"></span>`;
      downloadBtn.classList.add("Disabled");
      toggleDownloadUI(true);
      setupDownloadListeners();
      window.electronAPI.downloadMinecraft(opts);
    }
    cd--;
  }, 1000);
}

/* ────────────────────────────────────────────────────────────────
   LOG DE PROGRESO
   ──────────────────────────────────────────────────────────────── */
function updateLog(msg, isError = false) {
  const actionMatch = msg.match(/^\[([^\]]+)]/);
  const isHtml = msg.includes("<span");

  if (actionMatch) {
    const action = actionMatch[1];
    let entry = logEntries.get(action);
    if (!entry) {
      entry = document.createElement("div");
      entry.className = "download-msg";
      debugConsole.appendChild(entry);
      logEntries.set(action, entry);
    }
    entry.innerHTML = msg;
    if (msg.includes("¡Se ha descargado con éxito!")) {
      entry.classList.add("success");
      entry.querySelector(".loader")?.remove();
      logEntries.delete(action);
    }
  } else {
    const p = document.createElement("p");
    p[isHtml ? "innerHTML" : "textContent"] = msg;
    if (isError) p.style.color = "red";
    debugConsole.appendChild(p);
  }

  while (debugConsole.children.length > 20)
    debugConsole.removeChild(debugConsole.firstChild);
  debugConsole.scrollTop = debugConsole.scrollHeight;
}

/* ────────────────────────────────────────────────────────────────
   IPC LISTENERS
   ──────────────────────────────────────────────────────────────── */
function setupDownloadListeners() {
  debugConsole.innerHTML = "";
  logEntries.clear();
  totalEstimatedMs = 0;

  updateLog("[Inicialización] Preparando descarga...");

  // Escucha todas las líneas
  window.electronAPI.onProgress(updateLog);

  // Escucha las etapas específicas
  ["jvm", "libs", "natives", "assets", "client"].forEach((stage) => {
    window.electronAPI.onDownload(stage, updateLog);
  });

  window.electronAPI.onError((e) => {
    updateLog(`❌ ERROR: ${e}`, true);
    restoreControls();
  });

  window.electronAPI.onDone((m) => {
    updateLog(`✅ COMPLETADO: ${m}`);
    if (m.includes(currentDownloadVersion)) {
      showNotification({
        type: "accepted",
        text: `Descarga completada: ${currentDownloadVersion}`,
      });
      loadVersions();
      elementText.textContent = `Descarga Completada: ${currentDownloadVersion}`;
      setTimeout(restoreControls, 5000);
    }
  });

  window.electronAPI.onEstimatedTime((ms) => {
    totalEstimatedMs = ms;
    document.getElementById(
      "TotalTime"
    ).textContent = `Tiempo total estimado: ${formatTime(ms)}`;
    document.querySelector(".DownloadTime").style.display = "flex";
  });

  window.electronAPI.onElapsed((elapsed) => {
    const restanteMs = Math.max(0, totalEstimatedMs - elapsed);
    const pct = totalEstimatedMs
      ? Math.min(100, Math.floor((elapsed / totalEstimatedMs) * 100))
      : 0;

    document.getElementById(
      "ProgressTotal"
    ).textContent = `Progreso: ${pct}%  •  Tiempo restante: ${formatTime(
      restanteMs 
    )}  •  `;
    document.querySelector(".DownloadTime").style.display = "flex";
  });
}

function removeDownloadListeners() {
  [
    "download-progress",
    "download-error",
    "download-done",
    "download-estimated-time",
    "download-progress-time",
    "jvm-progress",
    "libs-progress",
    "natives-progress",
    "assets-progress",
    "client-progress",
  ].forEach((ch) => window.electronAPI.removeAllListeners(ch));
}

/* ────────────────────────────────────────────────────────────────
   UI helpers
   ──────────────────────────────────────────────────────────────── */
function restoreControls() {
  downloadBtn.disabled = false;
  downloadBtn.textContent = "Descargar versión";
  downloadBtn.classList.remove("Disabled");
  toggleDownloadUI(false);
  isDownloading = false;
  currentDownloadVersion = null;
  document.querySelector(".DownloadTime").style.display = "none";
  removeDownloadListeners();
}

function toggleDownloadUI(show) {
  document
    .getElementById("SelectVersions")
    ?.style.setProperty("display", show ? "none" : "block");
  progressWrap.style.display = show ? "flex" : "none";
  debugConsole.style.display = show ? "block" : "none";
}

/* ────────────────────────────────────────────────────────────────
   INICIALIZACIÓN
   ──────────────────────────────────────────────────────────────── */
(async () => {
  await updateVanillaSelect("release");
})();
