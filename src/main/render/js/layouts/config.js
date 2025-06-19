/* settings.js  –  ES Module */
import { BodyModel } from "../skin/body.js";
import { applyUsernameToDOM } from "../global/Account.js";
import { showNotification } from "../global/Notification.js";
async function ready() {
  if (document.readyState === "loading") {
    await new Promise((res) =>
      document.addEventListener("DOMContentLoaded", res, { once: true })
    );
  }
}

let configApplied = {}; // Config cargada y aplicada
let configPending = {}; // Cambios pendientes a aplicar
let engine = null;

function persist(mostrarNotificacion = false) {
  window.electronAPI?.saveConfig(configApplied);
  if (mostrarNotificacion) {
    showNotification({
      type: "accepted",
      text: "Configuración guardada con éxito.",
    });
  }
}

const canvas = document.getElementById("skin_container");
const skin = "../assets/img/skin.png";

// --- Loader visual ---
const loader = Object.assign(document.createElement("div"), {
  textContent: "Cargando skin...",
  style: `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: sans-serif;
    font-weight: bold;
    color: #666;
    user-select: none;
  `,
});
canvas.parentElement.style.position = "relative";

const showLoader = () => {
  if (!canvas.parentElement.contains(loader)) {
    canvas.parentElement.appendChild(loader);
  }
};
const hideLoader = () => {
  if (canvas.parentElement.contains(loader)) {
    loader.remove();
  }
};

async function loadBodyModel() {
  showLoader();
  await new Promise((r) => setTimeout(r, 400));
  engine = new BodyModel(canvas, skin);
  hideLoader();

  canvas.addEventListener("wheel", (e) => e.preventDefault(), {
    passive: false,
  });
}

function unloadBodyModel() {
  if (engine?.cleanup) engine.cleanup();
  engine = null;

  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gl =
    canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (gl) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
}

function disableAllCanvas() {
  document.querySelectorAll("canvas").forEach((cv) => {
    const ctx = cv.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);

    const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    if (gl) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  });

  unloadBodyModel();
}

const deepGet = (obj, path) =>
  path.split(".").reduce((acc, key) => acc?.[key], obj);
const deepSet = (obj, path, value) => {
  const keys = path.split(".");
  let temp = obj;
  keys.slice(0, -1).forEach((k) => {
    if (!(k in temp)) temp[k] = {};
    temp = temp[k];
  });
  temp[keys[keys.length - 1]] = value;
};

const bindings = {
  "input-username": "cuenta.username",
  "input-uuid": "cuenta.uuid",
  "checkbox-close-launcher": "launcher.closeLauncherOnStart",
  "select-startup-sounds": "launcher.selectedSound",
  "checkbox-disable-3d": "launcher.disable3DModels",
  "checkbox-hw-acceleration": "launcher.hardwareAcceleration",
  "checkbox-minimize-close": "launcher.minimizeOnClose",
  "input-minecraft-path": "minecraft.rutaMinecraft",
  "input-java-path": "minecraft.rutaJava",
  "input-ram": "minecraft.ram",
  "input-width": "minecraft.resolucion.ancho",
  "input-height": "minecraft.resolucion.alto",
  "checkbox-fullscreen": "minecraft.resolucion.fullscreen",
  "color-primary-theme": "apariencia.colorPrimarioTema",
  "color-secondary-theme": "apariencia.colorSecundarioTema",
  "color-primary-ui": "apariencia.colorPrimarioUI",
  "color-secondary-ui": "apariencia.colorSecundarioUI",
  "checkbox-debug-console": "desarrollador.mostrarDebug",
  "checkbox-save-logs": "desarrollador.guardarLogs",
  "checkbox-devtools": "desarrollador.habilitarDevtools",
  "select-java-version": "desarrollador.javaVersion",
  transparent: "apariencia.transparent",
  transparentTittle: "apariencia.transparentTittle",
};

const cssVars = {
  "color-primary-theme": "--bg-tittlebar-principal",
  "color-secondary-theme": "--bg-tittlebar-secundary",
  "color-primary-ui": "--items-color-principal",
  "color-secondary-ui": "--items-color-secundary",
  transparent: "--transparent",
  transparentTittle: "--transparentTittle",
};

function restoreConfig() {
  Object.entries(bindings).forEach(([id, path]) => {
    const el = document.getElementById(id);
    if (!el) return;

    const value = deepGet(configApplied, path);
    if (value == null) return;

    if (el.type === "checkbox") el.checked = value;
    else
      el.value =
        el.type === "range" && id === "transparent"
          ? Math.round(value * 100)
          : value;

    // Aplicar css vars si corresponde
    if (cssVars[id]) {
      document.documentElement.style.setProperty(cssVars[id], value);
    }
  });
}

function bindControls() {
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Control de inputs que modifican variables CSS en tiempo real
  Object.keys(cssVars).forEach((id) => {
    const el = $(id);
    if (!el) return;

    on(el, "input", () => {
      let val = el.value;

      if (id === "transparent" || id === "transparentTittle") {
        val = (val / 100).toFixed(2);
      }

      document.documentElement.style.setProperty(cssVars[id], val);
      deepSet(configApplied, bindings[id], val);
    });

    // Persistir solo cuando termina de cambiar (evitar guardar en cada movimiento)
    on(el, "change", () => {
      persist();
    });
  });

  // Control de otros inputs / checkboxes (guardamos en configPending)
  Object.entries(bindings).forEach(([id, path]) => {
    if (cssVars[id]) return; // ya manejado arriba

    const el = $(id);
    if (!el) return;

    const evt = el.type === "checkbox" ? "change" : "input";
    on(el, evt, () => {
      const val = el.type === "checkbox" ? el.checked : el.value;
      deepSet(configPending, path, val);
    });
  });

  on($("btn-apply-config"), "click", applyPendingChanges);
}
function applyPendingChanges() {
  if (!Object.keys(configPending).length) {
    showNotification({
      type: "accepted",
      text: "Cambios guardados",
    });
    return;
  }

  Object.entries(configPending).forEach(([path, value]) =>
    deepSet(configApplied, path, value)
  );
  configPending = {};
  persist(true); // Persistir y mostrar notificación

  const disable3D = deepGet(configApplied, "launcher.disable3DModels");

  if (disable3D) {
    disableAllCanvas();
  } else {
    const launcherPanelActive = document.querySelector(
      '.PanelConfig.active[data-panel="launcher"]'
    );
    if (launcherPanelActive && !engine) {
      loadBodyModel();
    }
  }
}

function bindPanels() {
  const sidebarItems = document.querySelectorAll(".SideBarItem");
  const panels = document.querySelectorAll(".PanelConfig");
  const elUsername = document.getElementById("input-username");
  if (elUsername) {
    elUsername.addEventListener("input", () => {
      const val = elUsername.value;
      deepSet(configApplied, "cuenta.username", val);
      applyUsernameToDOM(val);
      persist();
    });
  }
  sidebarItems.forEach((item) => {
    item.addEventListener("click", () => {
      if (item.classList.contains("close-btn")) {
        panels.forEach((p) => p.classList.remove("active"));
        sidebarItems.forEach((el) => el.classList.remove("active"));
        unloadBodyModel();
        return;
      }

      const target = item.dataset.target;
      if (!target) return;

      panels.forEach((p) =>
        p.classList.toggle("active", p.dataset.panel === target)
      );
      sidebarItems.forEach((el) => el.classList.toggle("active", el === item));

      const disable3D = deepGet(configApplied, "launcher.desactivarModelos3D");

      if (target === "launcher" && !disable3D) {
        if (!engine) loadBodyModel();
      } else {
        unloadBodyModel();
      }
    });
  });

  const launcherAct = document.querySelector(
    '.PanelConfig.active[data-panel="launcher"]'
  );
  if (launcherAct && !deepGet(configApplied, "launcher.desactivarModelos3D")) {
    loadBodyModel();
  }
}

function applyBgCustom(path) {
  if (!path || typeof path !== "string" || !path.startsWith("file://")) {
    document.documentElement.style.removeProperty("--bg-custom-user");
    return;
  }

  const cssValue = `linear-gradient(-45deg, rgba(0,0,0,0.8) 10%, transparent 90%), url("${path}")`;
  document.documentElement.style.setProperty("--bg-custom-user", cssValue);
}


const btnUploadBg = document.getElementById("btn-upload-bg");

if (btnUploadBg && window.electronAPI?.openFileDialog) {
  btnUploadBg.addEventListener("click", async () => {
    const filePath = await window.electronAPI.openFileDialog();
    if (!filePath) return;

    deepSet(configApplied, "apariencia.bgCustomUser", filePath);
    persist();
    applyBgCustom(filePath);
  });
}

async function loadInitialConfig() {
  try {
    const loaded = await window.electronAPI?.loadConfig();
    if (loaded && typeof loaded === "object") {
      configApplied = loaded;
      Object.entries(cssVars).forEach(([id, cssVar]) => {
        const val = deepGet(configApplied, bindings[id]);
        if (val != null) {
          document.documentElement.style.setProperty(cssVar, val);
        }
      });
      const bgPath = deepGet(configApplied, "apariencia.bgCustomUser");
      if (bgPath) applyBgCustom(bgPath);
    } else {
      configApplied = {};
    }
  } catch (e) {
    console.error("Error cargando configuración:", e);
    showNotification({
      type: "error",
      icon: "error",
      text: "Hubo un error al cargar Configuracion",
    });
    configApplied = {};
  }
  restoreConfig();
}

function getConfig() {
  return JSON.parse(JSON.stringify(configApplied));
}

function applyConfig(newConfig) {
  configApplied = newConfig;
  persist();
  restoreConfig();
  applyPendingChanges();
}

(async () => {
  await ready();
  await loadInitialConfig();
  bindControls();
  bindPanels();
  if (!deepGet(configApplied, "launcher.desactivarModelos3D")) {
    await loadBodyModel();
  }
  if (window.userAPI?.getUsername) {
    const username = window.userAPI.getUsername();
    applyUsernameToDOM(username);
  }

  Object.assign(window, { getConfig, applyConfig });
})();

