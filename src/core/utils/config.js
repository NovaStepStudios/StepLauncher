const path = require("path");
const os = require("os");
const fs = require("fs").promises;

const MB = 1024;

// Ruta base del launcher
function getRootDir() {
  return path.join(os.homedir(), ".StepLauncher");
}

function getVersionsDir() {
  return path.join(getRootDir(), "versions");
}

function getConfigPath() {
  return path.join(getRootDir(), "config.json");
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

const defaultConfig = {
  minecraftDir: getRootDir(),
  launcher: {
    closeLauncherOnStart: true,
    disable3DModels: false,
    hardwareAcceleration: true,
    minimizeOnClose: false,
  },
  minecraft: {
    rutaJava: "",
    minRam: "1G",
    maxRam: "4G",
    resolucion: { width: 854, height: 480, fullscreen: false },
  },
  cuenta: { username: "Default", uuid: "" },
};

async function readConfig() {
  let config = {};
  let changed = false;

  try {
    const raw = await fs.readFile(getConfigPath(), "utf-8");
    config = JSON.parse(raw);
  } catch {
    changed = true;
  }

  function mergeDefaults(obj, defaults) {
    for (const key in defaults) {
      if (!(key in obj)) {
        obj[key] = defaults[key];
        changed = true;
      } else if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        mergeDefaults(obj[key], defaults[key]);
      }
    }
  }

  mergeDefaults(config, defaultConfig);

  if (changed) {
    try {
      await ensureDir(getRootDir());
      await fs.writeFile(
        getConfigPath(),
        JSON.stringify(config, null, 2),
        "utf-8"
      );
    } catch (e) {
      console.error("Error guardando config:", e);
    }
  }

  return config;
}

function normalizeRam(value, fallbackMb = 2048) {
  let mb;
  if (typeof value === "string") {
    const val = value.trim().toLowerCase();
    mb = val.endsWith("g") ? parseFloat(val) * MB : parseInt(val);
  } else {
    mb = Number(value);
  }
  if (!Number.isFinite(mb) || mb <= 0) mb = fallbackMb;
  const g = Math.max(1, Math.round(mb / MB));
  return { mb, jvm: `${g}G` };
}

function buildBaseOptions(cfg) {
  const { jvm: minJvm } = normalizeRam(cfg.minecraft?.minRam ?? "1G");
  const { jvm: maxJvm } = normalizeRam(cfg.minecraft?.maxRam ?? "4G");

  const res = cfg.minecraft?.resolucion ?? {};
  const width = res.fullscreen ? undefined : res.width ?? 854;
  const height = res.fullscreen ? undefined : res.height ?? 480;

  const customJava = (cfg.minecraft?.rutaJava || "").trim();
  let javaPath;

  if (customJava) {
    const endsWithExe = /\bjava(w?)(\.exe)?$/i.test(path.basename(customJava));
    javaPath = endsWithExe
      ? customJava
      : path.join(customJava, os.platform() === "win32" ? "javaw.exe" : "java");
  } else {
    const runtimeBin = path.join(getRootDir(), "runtime", "java24", "bin");
    javaPath = path.join(
      runtimeBin,
      os.platform() === "win32" ? "javaw.exe" : "java"
    );
  }

  return {
    root: cfg.minecraftDir ?? getRootDir(),
    javaPath,
    memory: { min: minJvm, max: maxJvm },
    window: { width, height, fullscreen: !!res.fullscreen },
  };
}

module.exports = {
  getRootDir,
  getVersionsDir,
  getConfigPath,
  readConfig,
  buildBaseOptions,
  normalizeRam,
  ensureDir,
  defaultConfig,
};
