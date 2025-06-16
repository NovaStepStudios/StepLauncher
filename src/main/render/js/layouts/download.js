import { getVersions } from "../minecraft.js";

/* ----------  Referencias / estado ---------- */
const typeBtns = document.querySelectorAll(".type-btn");
const settings = document.querySelectorAll(".Settings");
document.querySelector(".DownloadBtn").addEventListener("click", startDownload);
const vanillaRadios = document.querySelectorAll(
  'input[name="vanilla-channel"]'
);
const loaded = {}; // cache: { channel: true }
let selectedType = "vanilla";

/* ----------  Helpers ---------- */
async function fillSelect(select, versions) {
  select.innerHTML = "";
  versions.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

async function updateVanillaSelect(channel) {
  const select = document.getElementById("vanilla-select");
  select.innerHTML = "<option>Cargando...</option>";
  try {
    const versions = await getVersions(channel);
    await fillSelect(select, versions);
  } catch (err) {
    console.error("[updateVanillaSelect]", err);
    select.innerHTML = "<option>Error al cargar</option>";
  }
}

async function updateSelectFor(channel) {
  const select = document.querySelector(`#settings-${channel} select`);
  if (!select || loaded[channel]) return;

  select.innerHTML = "<option>Cargando...</option>";
  try {
    const versions = await getVersions(channel);
    await fillSelect(select, versions);
    loaded[channel] = true;
  } catch (err) {
    console.error(`[updateSelectFor] Error cargando ${channel}:`, err);
    select.innerHTML = "<option>Error al cargar</option>";
  }
}

/* ----------  Eventos UI ---------- */
vanillaRadios.forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (selectedType === "vanilla") updateVanillaSelect(e.target.value);
  });
});

typeBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    typeBtns.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedType = btn.dataset.type;

    settings.forEach((s) => s.classList.remove("active"));
    const activePanel = document.getElementById(`settings-${selectedType}`);
    if (activePanel) activePanel.classList.add("active");

    if (selectedType === "vanilla") {
      const channel = document.querySelector(
        'input[name="vanilla-channel"]:checked'
      ).value;
      await updateVanillaSelect(channel);
    } else {
      await updateSelectFor(selectedType);
    }
  });
});

/* ----------  Inicialización ---------- */
updateVanillaSelect("release");

/* ----------  Descargar ---------- */
function startDownload() {
  const downloadBtn = document.querySelector(".DownloadBtn");
  const selectVersions = document.getElementById("SelectVersions");
  const debugConsole = document.getElementById("DebugConsoleDownload");

  const opts = { type: selectedType };
  const select = document.querySelector(`#settings-${selectedType} select`);
  if (select) opts.version = select.value;

  if (selectedType === "vanilla") {
    const channel = document.querySelector(
      'input[name="vanilla-channel"]:checked'
    );
    opts.channel = channel?.value ?? "release";
  }

  downloadBtn.disabled = true;
  let countdown = 5;

  const countdownInterval = setInterval(() => {
    downloadBtn.textContent = `Comenzando en ${countdown}...`;

    if (countdown === 3) {
      downloadBtn.classList.add("Disabled");
      if (selectVersions) selectVersions.remove();
      if (debugConsole) debugConsole.style.display = "block";
      setupDownloadListeners();
    }

    if (countdown === 0) {
      clearInterval(countdownInterval);
      downloadBtn.innerHTML=`<p>Descargando...</p> <span class="loader"></span>`
      window.electronAPI.downloadMinecraft(opts);
    }

    countdown--;
  }, 1000);
}

/* ----------  Debug Consola + Logs ---------- */
function setupDownloadListeners() {
  const debugConsole = document.getElementById("DebugConsoleDownload");
  const downloadBtn = document.querySelector(".DownloadBtn");
  const closeBtn = document.querySelector(".close-btn");

  debugConsole.innerHTML = ""; // Limpiar consola

  // Desactivar el botón de cerrar
  if (closeBtn) closeBtn.disabled = true;

  // Eventos del backend
  window.electronAPI.onProgress((msg) => {
    appendDebug(msg);
  });

  window.electronAPI.onError((err) => {
    appendDebug(`ERROR: ${err}`, true);

    // Reactivar controles
    if (closeBtn) closeBtn.disabled = false;
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Descargar versión";
      downloadBtn.classList.remove("Disabled");
    }
  });

  window.electronAPI.onDone((msg) => {
    appendDebug(`COMPLETADO: ${msg}`);

    // Reactivar controles
    if (closeBtn) closeBtn.disabled = false;
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Descargar versión";
      downloadBtn.classList.remove("Disabled");
    }
  });
}

function appendDebug(text, isError = false) {
  const debugConsole = document.getElementById("DebugConsoleDownload");
  const p = document.createElement("p");
  p.textContent = text;

  if (isError) p.style.color = "red";

  debugConsole.appendChild(p);

  // Limitar a los últimos 100 logs
  const maxLogs = 10;
  while (debugConsole.children.length > maxLogs) {
    debugConsole.removeChild(debugConsole.firstChild);
  }

  debugConsole.scrollTop = debugConsole.scrollHeight;

  const prefix = "[DebugConsole]";
  isError ? console.error(prefix, text) : console.log(prefix, text);
}
