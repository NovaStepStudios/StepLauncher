/**
 * MinecraftDownloader v2 – NovaStep Studios
 * 2025‑06‑17
 * Reescrito para StepLauncher
 */
const fs          = require("fs");
const fsp         = fs.promises;
const path        = require("path");
const os          = require("os");
const https       = require("https");
const { EventEmitter } = require("events");
const tar         = require("tar");
const unzipper    = require("unzipper");

/* ─────────────── Utilidades ─────────────── */

const ManifestURL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

function fetchJson (url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      })
      .on("error", reject);
  });
}

function htmlProgress (action, pct = "—") {
  return `[${action}] Descargando : ${pct} <span class="loader"></span>`;
}
function htmlDone     (action) {
  return `[${action}] ¡Se ha descargado con éxito!`;
}

/* ─────────────── Clase ─────────────── */

class MinecraftDownloader extends EventEmitter {
  constructor (rootPath, downloadJava = true, type = "release") {
    super();
    this.rootPath    = rootPath;
    this.downloadJVM = downloadJava;
    this.type        = type;
    this.osName      = ({win32:"windows", darwin:"macOs", linux:"linux"})[os.platform()] || "unknown";
    this.config      = JSON.parse(
      fs.readFileSync(path.join(__dirname, "config.json"), "utf8")
    );
  }

  /* ── Paso 0: conectividad ── */
  async checkConnection (url = ManifestURL) {
    await new Promise((res, rej) =>
      https.get(url, r => (r.statusCode === 200 ? res() :
        rej(new Error(`Sin conexión o HTTP ${r.statusCode}`))))
           .on("error", rej)
    );
  }

  /* ── Paso 1: determinar versión ── */
  async resolveVersion (versionId) {
    if (versionId) return versionId;

    const {latest:{release,snapshot}} = await fetchJson(ManifestURL);
    return this.type === "snapshot" ? snapshot : release;
  }

  /* ── Paso 2: descarga genérica con progreso ── */
  downloadFile (url, dest, action) {
    return new Promise((resolve, reject) => {
      const tmp   = `${dest}.part`;
      const file  = fs.createWriteStream(tmp);
      https.get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} – ${url}`));
          return;
        }
        const total = +res.headers["content-length"] || 0;
        let done    = 0;

        this.emit("progress", htmlProgress(action, "0 %"));

        res.on("data", chunk => {
          done += chunk.length;
          if (total) {
            const pct = Math.floor((done / total) * 100);
            this.emit("progress", htmlProgress(action, `${pct} %`));
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(tmp, dest);
            this.emit("progress", htmlDone(action));
            resolve(dest);
          });
        });
      }).on("error", err => {
        fs.unlink(tmp, () => {});
        reject(err);
      });
    });
  }

  /* ── Paso 3: extracción flexible ── */
  async extractFile (archive, dest) {
    const action = path.basename(archive);
    this.emit("progress", htmlProgress(`Extrayendo ${action}`));

    if (archive.endsWith(".zip")) {
      await fs.createReadStream(archive)
              .pipe(unzipper.Extract({ path: dest }))
              .promise();
    } else {
      await tar.x({ file: archive, cwd: dest, strip: 1 });
    }

    /* Post‑proceso: aplanar jdk‑* si existe */
    const sub = (await fsp.readdir(dest, { withFileTypes: true }))
      .find(d => d.isDirectory() && /^jdk-/.test(d.name));
    if (sub) {
      const inner = path.join(dest, sub.name);
      const moves = await fsp.readdir(inner);
      await Promise.all(
        moves.map(f => fsp.rename(
          path.join(inner, f),
          path.join(dest, f)
        ))
      );
      await fsp.rmdir(inner);
    }
    this.emit("progress", htmlDone(`Extrayendo ${action}`));
  }

  /* ── Paso 4: descargar JVM una sola vez ── */
  async ensureJVM () {
    if (!this.downloadJVM) return;

    const javaVer   = "Java17";
    const url       = this.config?.JVMDownload?.[javaVer]?.[this.osName];
    if (!url) throw new Error(`Sin URL de ${javaVer} para ${this.osName}`);

    const runtime   = path.join(
      this.rootPath,
      this.config.DefaultPathJVM?.[this.osName] || "runtime"
    );
    const destDir   = path.join(runtime, javaVer.toLowerCase());
    const binCheck  = path.join(destDir, "bin", /^win/.test(this.osName) ? "java.exe" : "java");

    if (fs.existsSync(binCheck)) return; // ya instalada, sin mensaje

    await fsp.mkdir(destDir, { recursive: true });

    const archive   = path.join(runtime, path.basename(url.split("?")[0]));
    await this.downloadFile(url, archive, "JVM");
    await this.extractFile(archive, destDir);
    await fsp.unlink(archive);
  }

  /* ── Paso 5: descarga versión ── */
  async fetchVersionJson (versionId) {
    const cacheDir   = path.join(this.rootPath, "cache", "json", "versions");
    await fsp.mkdir(cacheDir, { recursive: true });
    const jsonPath   = path.join(cacheDir, `${versionId}.json`);

    if (fs.existsSync(jsonPath))
      return JSON.parse(await fsp.readFile(jsonPath, "utf8"));

    const {versions} = await fetchJson(ManifestURL);
    const vData      = versions.find(v => v.id === versionId);
    if (!vData) throw new Error(`Versión ${versionId} no encontrada`);

    const raw        = await fetchJson(vData.url);
    await fsp.writeFile(jsonPath, JSON.stringify(raw, null, 2));
    return raw;
  }

  /* ── Paso 6: helpers para paralelizar ── */
  async parallel (items, limit, job) {
    const q = [...items];
    const pool = Array(Math.min(limit, q.length)).fill(null).map(async () => {
      while (q.length) await job(q.shift());
    });
    await Promise.all(pool);
  }

  /* ── Paso 7: descarga librerías ── */
  async handleLibraries (libraries) {
    const base = path.join(this.rootPath, "libraries");
    await this.parallel(libraries, 8, async lib => {
      if (!lib.downloads?.artifact) return;
      const {url, path: rel} = lib.downloads.artifact;
      const full = path.join(base, rel);
      await fsp.mkdir(path.dirname(full), { recursive: true });
      if (fs.existsSync(full)) return;
      await this.downloadFile(url, full, "Librería");
    });
  }

  /* ── Paso 8: assets ── */
  async handleAssets (assetIndex) {
    const assetsDir   = path.join(this.rootPath, "assets");
    const indexDir    = path.join(assetsDir, "indexes");
    await fsp.mkdir(indexDir, { recursive: true });

    const idxPath     = path.join(indexDir, `${assetIndex.id}.json`);
    let data          = assetIndex;

    if (!fs.existsSync(idxPath)) {
      await fsp.writeFile(idxPath, JSON.stringify(assetIndex, null, 2));
    }

    const objects = data.objects || {};
    await this.parallel(Object.entries(objects), 16, async ([name, obj]) => {
      const sub   = obj.hash.substring(0,2);
      const url   = `https://resources.download.minecraft.net/${sub}/${obj.hash}`;
      const dest  = path.join(assetsDir, "objects", sub, obj.hash);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) return;
      await this.downloadFile(url, dest, "Asset");
    });
  }

  /* ── Paso 9: client.jar & versión ── */
  async handleClient (versionId, versionData) {
    const vDir     = path.join(this.rootPath, "versions", versionId);
    await fsp.mkdir(vDir, { recursive: true });

    const jarPath  = path.join(vDir, `${versionId}.jar`);
    if (!fs.existsSync(jarPath))
      await this.downloadFile(versionData.downloads.client.url, jarPath, "Client");

    await fsp.writeFile(
      path.join(vDir, `${versionId}.json`),
      JSON.stringify(versionData, null, 2)
    );
  }

  /* ── Punto de entrada ── */
  async download (versionId) {
    try {
      this.emit("progress", htmlProgress("Inicializando", "—"));
      await this.checkConnection();

      versionId = await this.resolveVersion(versionId);
      await this.ensureJVM();

      const vData = await this.fetchVersionJson(versionId);
      await this.handleLibraries(vData.libraries || []);
      if (vData.assetIndex) await this.handleAssets(vData.assetIndex);
      await this.handleClient(versionId, vData);

      this.emit("done", htmlDone(`Minecraft ${versionId}`));
    } catch (e) {
      this.emit("error", e.message);
    }
  }
}

module.exports = MinecraftDownloader;
