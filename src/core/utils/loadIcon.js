const path = require("path");
const os = require("os");

function getIconExtension() {
  switch (os.platform()) {
    case "win32":
      return ".ico";
    case "darwin":
      return ".icns";
    default:
      return ".png"; // Linux o fallback
  }
}

/**
 * Devuelve la ruta absoluta del ícono según tipo, nombre base y sistema operativo.
 * @param {"tray"|"window"} type Tipo de uso del ícono
 * @param {string} image Nombre base del ícono sin extensión (ej: "MiIcono")
 * @returns {string} Ruta absoluta al ícono
 */
function loadIcon(type, image) {
  if (!type || !image) {
    throw new Error("Faltan parámetros: se requiere `type` y `image`.");
  }

  const ext = getIconExtension();
  const iconPath = path.join(__dirname, "icons", `${image}${ext}`);
  return iconPath;
}

module.exports = {
  loadIcon,
};
