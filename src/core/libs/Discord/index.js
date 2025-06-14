const RPC = require("discord-rpc");
const clientId = "1351432199190347846";

// Configuración de reintentos
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5000; // 5 s

let rpc = null;
let attempts = 0;
let isConnected = false;

/* ---------- Conexión y re‑intento ---------- */
function connectRpc() {
  if (attempts >= MAX_ATTEMPTS) {
    console.error(
      `[RPC] Se alcanzó el máximo de ${MAX_ATTEMPTS} intentos, abortando.`
    );
    return;
  }

  attempts++;
  console.log(`[RPC] Intento ${attempts}/${MAX_ATTEMPTS}…`);

  rpc = new RPC.Client({ transport: "ipc" });

  rpc.on("ready", () => {
    isConnected = true;
    console.log("[RPC] Conectado a Discord");
    setMenu();
  });

  rpc.on("disconnected", () => {
    console.warn("[RPC] Conexión RPC perdida, reintentando…");
    isConnected = false;
    reconnectWithDelay();
  });

  rpc.login({ clientId }).catch((err) => {
    console.warn(`[RPC] Falló el intento ${attempts}: ${err.message}`);
    reconnectWithDelay();
  });
}

function reconnectWithDelay() {
  setTimeout(connectRpc, RETRY_DELAY_MS);
}

/* ---------- Helpers de actividad ---------- */
function updateActivity(type) {
  if (!isConnected) return; // Evita error si aún NO hay conexión

  const activity = {
    details: type === "menu" ? "En el menú principal" : "Jugando Minecraft",
    state: type === "menu" ? "Esperando acción" : "En partida",
    largeImageKey: type === "menu" ? "menu" : "minecraft",
    largeImageText: "StepLauncher",
    startTimestamp: new Date(),
    instance: false,
  };

  rpc.setActivity(activity).catch(console.error);
}

function setMenu() {
  updateActivity("menu");
}
function setPlaying() {
  updateActivity("playing");
}

module.exports = { setMenu, setPlaying };

connectRpc();
