const notificationQueue = [];
let isShowingNotification = false;

// Mapa de sonidos para cada tipo de notificación
const notificationSounds = {
  accepted: new Audio("../assets/sounds/Notification-1.mp3"),
  error: new Audio("../assets/sounds/Notification-5.mp3"),
  warning: new Audio("../assets/sounds/Notification-5.mp3"),
  info: new Audio("../assets/sounds/Notification-1.mp3"),
};

export function showNotification({
  type = "accepted",
  icon = "check_circle",
  text = "Todo correcto",
}) {
  notificationQueue.push({ type, icon, text });
  if (!isShowingNotification) processQueue();
}

function processQueue() {
  if (notificationQueue.length === 0) {
    isShowingNotification = false;
    return;
  }

  isShowingNotification = true;

  const { type, icon, text } = notificationQueue.shift();
  const notification =
    document.getElementById("Notification") || createNotificationContainer();
  const iconEl = document.getElementById("IconNotification");
  const textEl = document.getElementById("TextNotification");

  // Reproducir sonido correspondiente si existe
  const sound = notificationSounds[type];
  if (sound) {
    // Para reiniciar el sonido si se llama rápido seguido
    sound.pause();
    sound.currentTime = 0;
    sound.play().catch((e) => {
      // Puede fallar si el usuario no ha interactuado con la página
      console.warn("No se pudo reproducir el sonido:", e);
    });
  }

  notification.className = "Notification";
  notification.classList.add(type);
  iconEl.textContent = icon;
  textEl.textContent = text;

  notification.addEventListener("animationend", function handler(e) {
    if (e.animationName === "FadeOutNotification") {
      notification.className = "Notification";
      iconEl.textContent = "";
      textEl.textContent = "";
      notification.removeEventListener("animationend", handler);
      setTimeout(processQueue, 300);
    }
  });
}

function createNotificationContainer() {
  const notification = document.createElement("div");
  notification.id = "Notification";
  notification.className = "Notification";
  notification.innerHTML = `
  
    <div class="ContainerNotificationText">
      <span class="material-icons" id="IconNotification"></span>
      <h4 id="TextNotification"></h4>
    </div>
  `;
  document.body.appendChild(notification);
  return notification;
}
