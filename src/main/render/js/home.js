import { showNotification } from "./global/Notification.js";
document.addEventListener("DOMContentLoaded", async () => {
  const META = {
    SettingsItem: { title: "Opciones", src: "./layouts/config.html" },
    InstancieItem: { title: "Instancias", src: "./layouts/instancias.html" },
    DownloadItem: { title: "Descargar", src: "./layouts/downloads.html" },
    PlayItem: { title: "Jugar", src: "./layouts/play.html" },
  };

  const panelsWrapper = document.querySelector(".Panels");
  const sideItems = Array.from(document.querySelectorAll(".SideBarItem"));
  const htmlCache = new Map();
  let currentPanel = null;

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

  // Precarga HTML en memoria sin cache del navegador
  await Promise.all(
    Object.entries(META).map(async ([key, meta]) => {
      try {
        const res = await fetch(meta.src, { cache: "no-store" });
        if (!res.ok) throw new Error(`Error al cargar ${meta.src}`);
        htmlCache.set(meta.src, await res.text());
      } catch (e) {
        console.error(`Error cargando ${key}:`, e);
      }
    })
  );

  const closePanel = () => {
    if (!currentPanel) return;
    currentPanel.remove();
    currentPanel = null;
    panelsWrapper.classList.remove("active");
    sideItems.forEach((btn) => btn.classList.remove("active"));
  };

  const openPanel = (btn) => {
    const key = btn.id;
    const meta = META[key];
    if (!meta) return;

    if (btn.classList.contains("active")) {
      closePanel();
      return;
    }

    closePanel();

    const html = htmlCache.get(meta.src);
    if (!html) return console.error(`No hay HTML precargado para ${key}`);

    const panel = document.createElement("div");
    panel.className = "panel active";
    panel.dataset.panel = key;

    const fragment = document.createDocumentFragment();

    const titleBar = document.createElement("div");
    titleBar.className = "TittleBarPanel";

    // 👇 Solo añade botón de cerrar si NO es SettingsItem
    if (key !== "SettingsItem") {
      titleBar.innerHTML = `
        <button class="close-btn"><span class="material-icons">close</span></button>
        <h4>${meta.title}</h4>
      `;
    } else {
      titleBar.innerHTML = `<h4>${meta.title}</h4>`;
    }

    fragment.appendChild(titleBar);

    const host = document.createElement("div");
    host.className = "ContentHTML";
    host.innerHTML = html;
    execScripts(host);
    fragment.appendChild(host);

    panel.appendChild(fragment);

    // 👇 Solo agregar evento close si existe el botón
    const closeBtn = panel.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", closePanel);
    }

    btn.classList.add("active");
    panelsWrapper.appendChild(panel);
    panelsWrapper.classList.add("active");
    currentPanel = panel;
  };

  sideItems.forEach((btn) =>
    btn.addEventListener("click", () => openPanel(btn))
  );

  setTimeout(() => {
    showNotification({
      type: "accepted",
      text: "Paneles cargados correctamente",
    });
  }, 100);
});
