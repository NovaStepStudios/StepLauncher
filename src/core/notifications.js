// Notifications.js
const { Notification, nativeImage } = require("electron");
const path = require("path");

class NotificationManager {
  /**
   * Envía una notificación nativa.
   * @param {Object} options Opciones de notificación.
   * @param {string} options.title - Título de la notificación (obligatorio).
   * @param {string} options.body - Texto o cuerpo (obligatorio).
   * @param {string|nativeImage} [options.icon] - Ruta al icono o nativeImage (opcional).
   * @param {boolean} [options.silent=false] - Si la notificación debe ser silenciosa.
   * @param {number} [options.timeoutType=undefined] - 'default', 'never' o 'short' (según SO).
   * @param {Array<{type:string, text:string}>} [options.actions] - Botones de acción (solo en Windows/macOS).
   * @param {Function} [options.onClick] - Callback para click en notificación.
   */
  static send({
    title = "StepLauncher",
    body,
    icon = path.join(__dirname,'icon.ico'),
    silent = false,
    timeoutType,
    actions = [],
    onClick,
  }) {
    if (!title || !body) {
      throw new Error("title y body son obligatorios para la notificación.");
    }

    let iconImg;
    if (icon) {
      if (typeof icon === "string") {
        iconImg = nativeImage.createFromPath(path.resolve(icon));
      } else if (icon instanceof nativeImage) {
        iconImg = icon;
      } else {
        throw new Error("El icon debe ser ruta string o nativeImage.");
      }
    }

    const options = {
      title,
      body,
      icon: iconImg,
      silent,
      timeoutType,
      actions,
    };

    const notification = new Notification(options);

    if (typeof onClick === "function") {
      notification.on("click", onClick);
    }

    notification.show();

    return notification; // por si querés agregar listeners luego
  }
}

module.exports = {
  NotificationManager,
  sendNotification: NotificationManager.send,
};
