import { showNotification } from "./global/Notification.js";
import { HeadModel } from "./skin/head.js";

document.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("HeadModel");
  const skin = "../assets/img/skin.png";
  const engine = new HeadModel(canvas, skin);
  const closeBtn = document.getElementById("__closeBtn");
  const maximizeBtn = document.getElementById("__maximizeBtn");
  const minimizeBtn = document.getElementById("__minimizeBtn");

  // No se como tengas vos ordenadas las funciones pero esto lo podes ordenar luego step.
  closeBtn.addEventListener("click", () => {
    window.electronAPI.closeWindow();
  })
  // No se como tengas vos ordenadas las funciones pero esto lo podes ordenar luego step.
  maximizeBtn.addEventListener("click", () => {
    window.electronAPI.maximizeWindow();
  })
  minimizeBtn.addEventListener("click", () => {
    window.electronAPI.minizeWindow()
  })

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

  // Función para mostrar un panel
  function showPanel(key) {
    hideAllPanels();
    const panel = panelsMap.get(key);
    if (!panel) return console.error(`Panel no encontrado: ${key}`);
    panel.style.display = "block";
    panel.classList.add("active");
    panelsWrapper.classList.add("active");
  }

  // Manejo de clicks en barra lateral
  sideItems.forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.id;

      // Si ya está activo, se cierra
      if (btn.classList.contains("active")) {
        hideAllPanels();
        btn.classList.remove("active");
        return;
      }

      // Desactiva todos los botones y activa solo el clickeado
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
  }, 100);
});
