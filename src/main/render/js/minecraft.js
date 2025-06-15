import { showNotification } from "./global/Notification.js";

const VANILLA_MANIFEST =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

// ——— End‑points de loaders ———
const ENDPOINTS = {
  fabric: "https://meta.fabricmc.net/v2/versions/loader",
  legacyfabric: "https://meta.legacyfabric.net/v2/versions/loader",
  forge:
    "https://maven.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
  neoforge:
    "https://dl.neoforged.net/maven/net/neoforged/neoforge/maven-metadata.json",
  optifine: "https://bmclapi2.bangbang93.com/optifine/version",
};

/**
 * Devuelve un array de strings con todas las versiones disponibles
 * para el canal/tipo solicitado.
 *
 * @param {string} channel  'release' | 'snapshot' | 'old_beta' | 'old_alpha'
 *                          | 'fabric' | 'forge' | 'neoforge' | 'optifine'
 *                          | 'legacyfabric' | 'clients'
 * @returns {Promise<string[]>}
 */
export async function getVersions(channel = "release") {
  try {
    /* -------------- VANILLA (release, snapshot, old_*) -------------- */
    const vanillaKinds = ["release", "snapshot", "old_beta", "old_alpha"];
    if (vanillaKinds.includes(channel)) {
      const res = await fetch(VANILLA_MANIFEST);
      if (!res.ok) throw new Error();
      const data = await res.json();

      return data.versions
        .filter((v) => v.type === channel)
        .sort((a, b) => new Date(b.releaseTime) - new Date(a.releaseTime))
        .map((v) => v.id); // ej. '1.21.6-rc1', 'a1.2.6', etc.
    }

    /* -------------- FABRIC & LEGACYFABRIC -------------- */
    if (channel === "fabric" || channel === "legacyfabric") {
      const res = await fetch(ENDPOINTS[channel]);
      if (!res.ok) throw new Error();
      /** @type {{version:string}[]} */
      const data = await res.json();
      return data.map((v) => `${channel}-loader-${v.version}`); // fabric‑loader‑0.16.0
    }

    /* -------------- FORGE -------------- */
    if (channel === "forge") {
      const res = await fetch(ENDPOINTS.forge);
      if (!res.ok) throw new Error();
      const { promos } = await res.json(); // estructura { '1.21-recommended': '47.2.0', ... }
      return Object.entries(promos).map(([k, v]) => `forge-${v}`); // forge-47.2.0
    }

    /* -------------- NEOFORGE -------------- */
    if (channel === "neoforge") {
      const res = await fetch(ENDPOINTS.neoforge);
      if (!res.ok) throw new Error();
      const { versions } = await res.json(); // estructura: { versions: ['20.3.12', ...] }
      return versions.reverse().map((v) => `neoforge-${v}`);
    }

    /* -------------- OPTIFINE -------------- */
    if (channel === "optifine") {
      const res = await fetch(ENDPOINTS.optifine);
      if (!res.ok) throw new Error();
      /** @type {{version:string}[]} */
      const data = await res.json();
      return data.map((v) => v.version); // OptiFine_HD_U_I7
    }

    /* -------------- Fallback: última release -------------- */
    return await getVersions("release");
  } catch (err) {
    showNotification({
      type: "error",
      text: `No se pudo cargar las versiones de ${channel}`,
    });
    return [];
  }
}
