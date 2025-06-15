export function applyUsernameToDOM(name) {
  if (!name) return; // Evitar ejecución automática sin nombre válido

  const usernameElements = document.querySelectorAll("#Username");
  usernameElements.forEach((el) => {
    el.textContent = name;
  });
}

// Ejecutar automáticamente si es cargado directamente y variable global existe
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    // Usar una variable global opcional (por ejemplo, window.MyName)
    if (window.MyName) {
      applyUsernameToDOM(window.MyName);
    }
  });
}
