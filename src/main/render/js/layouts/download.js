/* ----------  Imports ---------- */
import { getVersions }      from "../minecraft.js";
import { loadVersions }     from "./play.js";
import { showNotification } from "../global/Notification.js";

/* ----------  Referencias / estado UI ---------- */
const typeBtns      = document.querySelectorAll(".type-btn");
const vanillaRadios = document.querySelectorAll('input[name="vanilla-channel"]');
const settings      = document.querySelectorAll(".Settings");
const selectVanilla = document.getElementById("vanilla-select");

const progressWrap  = document.getElementById("DownloadProgressElement");
const debugConsole  = document.getElementById("DebugConsoleDownload");
const elementText   = document.getElementById("TextDownload");
const downloadBtn   = document.querySelector(".DownloadBtn");
downloadBtn.addEventListener("click", startDownload);

const loadedCache   = {};          // versiones ya cargadas → { channel|type : true }
const logEntries    = new Map();   // acción → elemento <div>

let selectedType    = "vanilla";   // pestaña activa
let isDownloading   = false;
let currentDownloadVersion = null;

/* ────────────────────────────────────────────────────────────────
   UTILIDADES
   ──────────────────────────────────────────────────────────────── */
async function fillSelect (select, versions) {
  select.innerHTML = "";
  versions.forEach(v => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = v;
    select.appendChild(opt);
  });
}

/* ----------  Cargar versiones vanilla por canal ---------- */
async function updateVanillaSelect (channel) {
  if (loadedCache[channel]) return;

  selectVanilla.innerHTML = "<option>Cargando…</option>";
  try {
    const versions = await getVersions(channel);
    await fillSelect(selectVanilla, versions);
    loadedCache[channel] = true;
  } catch (e) {
    console.error("[updateVanillaSelect]", e);
    selectVanilla.innerHTML = "<option>Error</option>";
  }
}

/* ----------  Cargar versiones de otros tipos (forge, fabric…) ---------- */
async function updateSelectFor (type) {
  const select = document.querySelector(`#settings-${type} select`);
  if (!select || loadedCache[type]) return;

  select.innerHTML = "<option>Cargando…</option>";
  try {
    const versions = await getVersions(type);
    await fillSelect(select, versions);
    loadedCache[type] = true;
  } catch (e) {
    console.error(`[updateSelectFor] ${type}`, e);
    select.innerHTML = "<option>Error</option>";
  }
}

/* ────────────────────────────────────────────────────────────────
   HANDLERS DE UI
   ──────────────────────────────────────────────────────────────── */
/* cambio de radio (release ↔ snapshot en vanilla) */
vanillaRadios.forEach(radio =>
  radio.addEventListener("change", e =>
    selectedType === "vanilla" && updateVanillaSelect(e.target.value))
);

/* cambio de pestaña (vanilla / forge / fabric…) */
typeBtns.forEach(btn =>
  btn.addEventListener("click", async () => {
    typeBtns.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedType = btn.dataset.type;

    settings.forEach(s => s.classList.remove("active"));
    document.getElementById(`settings-${selectedType}`)?.classList.add("active");

    if (selectedType === "vanilla") {
      const channel = document.querySelector('input[name="vanilla-channel"]:checked').value;
      await updateVanillaSelect(channel);
    } else {
      await updateSelectFor(selectedType);
    }
  })
);

/* ────────────────────────────────────────────────────────────────
   DESCARGA
   ──────────────────────────────────────────────────────────────── */
function startDownload () {
  if (isDownloading) return;

  const opts   = { type: selectedType };
  const select = document.querySelector(`#settings-${selectedType} select`);
  if (select) opts.version = select.value;

  if (selectedType === "vanilla")
    opts.channel = document.querySelector('input[name="vanilla-channel"]:checked')?.value ?? "release";

  if (!opts.version) {
    showNotification({ type: "error", text: "Selecciona una versión" });
    return;
  }

  isDownloading          = true;
  currentDownloadVersion = opts.version;
  elementText.textContent = `Descargando Minecraft: ${currentDownloadVersion}`;
  downloadBtn.disabled   = true;

  /* cuenta regresiva */
  let cd = 5;
  const int = setInterval(() => {
    downloadBtn.textContent = `Comenzando en ${cd}…`;
    if (cd === 3) {            // mostrar consola
      downloadBtn.classList.add("Disabled");
      toggleDownloadUI(true);
      setupDownloadListeners();
    }
    if (cd === 0) {
      clearInterval(int);
      downloadBtn.innerHTML = `<p>Descargando…</p><span class="loader"></span>`;
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
    // 👉 Eliminar último <p> (si existe y es suelto)
    const last = debugConsole.lastElementChild;
    if (last && last.tagName === "P") {
      debugConsole.removeChild(last);
    }

    // 👉 Agregar nueva línea suelta
    const p = document.createElement("p");
    p[isHtml ? "innerHTML" : "textContent"] = msg;
    if (isError) p.style.color = "red";
    debugConsole.appendChild(p);
  }

  // Limitar a 20 elementos
  while (debugConsole.children.length > 20)
    debugConsole.removeChild(debugConsole.firstChild);

  debugConsole.scrollTop = debugConsole.scrollHeight;
}


/* ────────────────────────────────────────────────────────────────
   IPC LISTENERS
   ──────────────────────────────────────────────────────────────── */
function setupDownloadListeners () {
  debugConsole.innerHTML = "";
  logEntries.clear();

  window.electronAPI.onProgress(m => updateLog(m));
  window.electronAPI.onError(e   => {
    updateLog(`❌ ERROR: ${e}`, true);
    restoreControls();
  });
  window.electronAPI.onDone(m    => {
    updateLog(`✅ COMPLETADO: ${m}`);
    if (m.includes(currentDownloadVersion)) {
      showNotification({ type: "accepted", text: `Descarga completada: ${currentDownloadVersion}` });
      loadVersions();
      restoreControls();
      elementText.textContent = `Descarga Completada: ${currentDownloadVersion}`;
    }
  });
}

function removeDownloadListeners () {
  window.electronAPI.removeAllListeners("onProgress");
  window.electronAPI.removeAllListeners("onError");
  window.electronAPI.removeAllListeners("onDone");
}

/* ────────────────────────────────────────────────────────────────
   UI helpers
   ──────────────────────────────────────────────────────────────── */
function restoreControls () {
  downloadBtn.disabled = false;
  downloadBtn.textContent = "Descargar versión";
  downloadBtn.classList.remove("Disabled");
  toggleDownloadUI(false);
  isDownloading = false;
  currentDownloadVersion = null;
  removeDownloadListeners();
}

function toggleDownloadUI (show) {
  document.getElementById("SelectVersions")?.style.setProperty("display", show ? "none" : "block");
  progressWrap.style.display = show ? "flex" : "none";
  debugConsole.style.display = show ? "block" : "none";
}

/* ────────────────────────────────────────────────────────────────
   INICIALIZACIÓN
   ──────────────────────────────────────────────────────────────── */
(async () => {
  await updateVanillaSelect("release");   // carga inicial
})();
