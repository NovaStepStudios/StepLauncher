import { showNotification } from "./global/Notification.js";
import { HeadModel } from "./skin/head.js";

function loadConfig() {
  try {
    const configApplied = window.electronAPI?.loadConfig() || {};
    const cssVars = {
      "color-primary-theme": "--bg-tittlebar-principal",
      "color-secondary-theme": "--bg-tittlebar-secundary",
      "color-primary-ui": "--items-color-principal",
      "color-secondary-ui": "--items-color-secundary",
    };

    // Mapeo de keys para coincidir con la estructura real de configApplied.apariencia
    const mapping = {
      "color-primary-theme": "colorPrimarioTema",
      "color-secondary-theme": "colorSecundarioTema",
      "color-primary-ui": "colorPrimarioUI",
      "color-secondary-ui": "colorSecundarioUI",
    };

    Object.entries(cssVars).forEach(([id, cssVar]) => {
      const key = mapping[id];
      const value = configApplied.apariencia?.[key] || configApplied[id];
      if (value != null) {
        document.documentElement.style.setProperty(cssVar, value);
      }
    });

    return configApplied;
  } catch (e) {
    console.error("Error en loadConfig:", e);
    return {};
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("HeadModel");
  const skin = "../assets/img/skin.png";
  const engine = new HeadModel(canvas, skin);
  loadConfig();

  const META = {
    SettingsItem: { title: "Opciones", src: "./layouts/config.html" },
    InstancieItem: { title: "Instancias", src: "./layouts/instancias.html" },
    DownloadItem: { title: "Descargar", src: "./layouts/downloads.html" },
    PlayItem: { title: "Jugar", src: "./layouts/play.html" },
  };

  const panelsWrapper = document.querySelector(".Panels");
  const sideItems = Array.from(document.querySelectorAll(".SideBarItem"));
  const htmlCache = new Map();

  // Ejecuta scripts embebidos solo una vez, evitando re-ejecución posterior
  const execScripts = (root) => {
    root.querySelectorAll("script").forEach((old) => {
      const script = document.createElement("script");
      [...old.attributes].forEach((attr) =>
        script.setAttribute(attr.name, attr.value)
      );
      script.textContent = old.textContent;
      old.replaceWith(script);
    });
  };

  // Precarga HTML en memoria (sin cache navegador)
  await Promise.all(
    Object.entries(META).map(async ([key, meta]) => {
      try {
        const res = await fetch(meta.src, { cache: "no-store" });
        if (!res.ok) throw new Error(`Error al cargar ${meta.src}`);
        const html = await res.text();
        htmlCache.set(key, html);
      } catch (e) {
        console.error(`Error cargando ${key}:`, e);
      }
    })
  );

  // Crear todos los paneles precargados ocultos
  const panelsMap = new Map();
  for (const [key, meta] of Object.entries(META)) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.dataset.panel = key;
    panel.style.display = "none"; // oculto inicialmente

    const titleBar = document.createElement("div");
    titleBar.className = "TittleBarPanel";

    if (key !== "SettingsItem") {
      titleBar.innerHTML = `
        <button class="close-btn"><span class="material-icons">close</span></button>
        <h4>${meta.title}</h4>
      `;
    } else {
      titleBar.innerHTML = `<h4>${meta.title}</h4>`;
    }
    panel.appendChild(titleBar);

    const contentDiv = document.createElement("div");
    contentDiv.className = "ContentHTML";
    contentDiv.innerHTML = htmlCache.get(key) || "";
    execScripts(contentDiv);
    panel.appendChild(contentDiv);

    // Evento cerrar panel
    const closeBtn = panel.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        hideAllPanels();
        sideItems.forEach((btn) => btn.classList.remove("active"));
      });
    }

    panelsWrapper.appendChild(panel);
    panelsMap.set(key, panel);
  }

  // Función para ocultar todos los paneles
  function hideAllPanels() {
    panelsMap.forEach((panel) => {
      panel.style.display = "none";
      panel.classList.remove("active");
    });
    panelsWrapper.classList.remove("active");
  }

  function showPanel(key) {
    hideAllPanels();
    const panel = panelsMap.get(key);
    if (!panel) return console.error(`Panel no encontrado: ${key}`);
    panel.style.display = "block";
    panel.classList.add("active");
    panelsWrapper.classList.add("active");
  }

  sideItems.forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.id;
      if (btn.classList.contains("active")) {
        hideAllPanels();
        btn.classList.remove("active");
        return;
      }
      sideItems.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showPanel(key);
    })
  );

  setTimeout(() => {
    showNotification({
      type: "accepted",
      text: "Paneles cargados correctamente",
    });
  }, 1000);
});
