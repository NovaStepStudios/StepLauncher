import { BodyModel } from "../skin/body.js";

const canvas = document.getElementById("skin_container");
const skin = "../assets/img/skin.png";

let engine = null; // guardamos instancia

const loader = document.createElement("div");
loader.textContent = "Cargando skin...";
loader.style.cssText = `
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-family: sans-serif;
  font-weight: bold;
  color: #666;
  user-select: none;
`;

canvas.parentElement.style.position = "relative";

const sidebarItems = document.querySelectorAll(".SideBarItem");
const panels = document.querySelectorAll(".PanelConfig");

function showLoader() {
  if (!canvas.parentElement.contains(loader)) {
    canvas.parentElement.appendChild(loader);
  }
}

function hideLoader() {
  if (canvas.parentElement.contains(loader)) {
    loader.remove();
  }
}

// Crear y mostrar el BodyModel
async function loadBodyModel() {
  showLoader();
  await new Promise((r) => setTimeout(r, 500)); // simula delay carga

  engine = new BodyModel(canvas, skin);

  hideLoader();

  // Evitar zoom scroll en canvas
  canvas.addEventListener("wheel", (e) => e.preventDefault(), {
    passive: false,
  });
}

// Limpiar canvas y liberar recursos si BodyModel tiene método cleanup o similar
function unloadBodyModel() {
  if (engine) {
    if (typeof engine.cleanup === "function") {
      engine.cleanup();
    }
    engine = null;

    // Limpiar el canvas
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

sidebarItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (item.classList.contains("close-btn")) {
      panels.forEach((p) => p.classList.remove("active"));
      sidebarItems.forEach((el) => el.classList.remove("active"));

      // Al cerrar, limpiamos modelo y canvas
      unloadBodyModel();
      return;
    }

    const target = item.dataset.target;
    if (!target) return;

    panels.forEach((p) => {
      const shouldBeActive = p.dataset.panel === target;
      p.classList.toggle("active", shouldBeActive);
    });

    sidebarItems.forEach((el) => {
      el.classList.toggle("active", el === item);
    });

    // Si el panel launcher se activó, cargamos modelo; si no, lo descargamos
    if (target === "launcher") {
      if (!engine) loadBodyModel();
    } else {
      unloadBodyModel();
    }
  });
});

// Si el panel launcher empieza activo, cargar modelo
if (document.querySelector('.PanelConfig.active[data-panel="launcher"]')) {
  loadBodyModel();
}
