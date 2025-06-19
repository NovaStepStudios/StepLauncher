/**
 * MinecraftDownloader v2 – NovaStep Studios
 * 2025‑06‑21  (eventos por categoría 100 % funcionales)
 * ------------------------------------------------------------------
 * ▸ Eventos emitidos:
 *     • progress               – todas las líneas
 *     • <slug>-progress        – jvm, libs, natives, assets, client
 *     • progressTime           – ms transcurridos
 *     • estimatedTime          – ms ETA global
 *     • done / error
 * ------------------------------------------------------------------
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const https = require("https");
const { EventEmitter } = require("events");
const tar = require("tar");
const unzipper = require("unzipper");

const ManifestURL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/* ───────────── NUEVAS CONSTANTES (timeout y retry) ───────────── */
const DEFAULT_TIMEOUT_MS   = 20_000;   // 20 s sin datos
const MAX_RETRIES_PER_FILE = 3;

/* ───────────── Helpers ───────────── */

const fetchJson = (url) =>
  new Promise((res, rej) => {
    const r = https.get(url, (rsp) => {
      let raw = "";
      rsp.on("data", (c) => (raw += c));
      rsp.on("end", () => {
        try {
          res(JSON.parse(raw));
        } catch (e) {
          rej(e);
        }
      });
    });
    r.setTimeout(10_000, () => r.destroy(new Error("Timeout")));
    r.on("error", rej);
  });

const htmlProgress = (cat, p = "—") =>
  `[${cat}] Descargando : ${p}${
    typeof p === "number" ? " %" : ""
  } <span class="loader"></span>`;
const htmlDone = (cat) => `[${cat}] ¡Se ha descargado con éxito!`;

const slug = (cat) => {
  const dict = {
    JVM: "jvm",
    "JVM-extract": "jvm",
    Librerías: "libs",
    Librerias: "libs",
    Nativos: "natives",
    Assets: "assets",
    Client: "client",
  };
  if (dict[cat]) return dict[cat];
  return (
    cat
      .normalize("NFD") // quita tildes
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\-]/g, "")
      .toLowerCase() || "misc"
  );
};

/* ───────────── Clase ───────────── */

class MinecraftDownloader extends EventEmitter {
  constructor(rootPath, downloadJava = true, type = "release") {
    super();
    this.rootPath = rootPath;
    this.downloadJVM = downloadJava;
    this.type = type;
    this.osName =
      { win32: "windows", darwin: "macOs", linux: "linux" }[os.platform()] ||
      "unknown";
    this.config = JSON.parse(
      fs.readFileSync(path.join(__dirname, "config.json"), "utf8")
    );

    this._startTime = 0;
    this._catTotals = {};
    this._catDownloaded = {};
    this._sizeRegistry = new Set();
    this._lastEmit = 0;
  }

  /* ── Paso 0: conectividad ── */
  checkConnection() {
    return new Promise((ok, bad) =>
      https
        .get(ManifestURL, (r) =>
          r.statusCode === 200 ? ok() : bad(new Error(`HTTP ${r.statusCode}`))
        )
        .on("error", bad)
    );
  }

  /* ── Paso 1: versión ── */
  async resolveVersion(ver) {
    if (ver) return ver;
    const {
      latest: { release, snapshot },
    } = await fetchJson(ManifestURL);
    return this.type === "snapshot" ? snapshot : release;
  }
  /* ── Paso 2: descarga con eventos por categoría ── */
  downloadFile(url, dest, cat, attempt = 1) {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.part`;
      const file = fs.createWriteStream(tmp);
      const ch = `${slug(cat)}-progress`;

      /* --- declarar antes de usar --- */
      const retryOrFail = (err) => {
        if (attempt < MAX_RETRIES_PER_FILE) {
          const warn = `[${cat}] Reintentando ${path.basename(
            dest
          )} (${attempt}/${MAX_RETRIES_PER_FILE})`;
          this.emit("progress", warn);
          this.emit(ch, warn);
          setTimeout(() => {
            this.downloadFile(url, dest, cat, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, 1000 * attempt); // back‑off simple
        } else {
          this.emit("error", `${path.basename(dest)} ⇒ ${err.message}`);
          reject(err);
        }
      };
      /* -------------------------------- */

      if (attempt === 1) {
        const start = htmlProgress(cat, 0);
        this.emit("progress", start);
        this.emit(ch, start);
      }

      const req = https.get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(tmp, () => {});
          return retryOrFail(new Error(`HTTP ${res.statusCode}`));
        }

        const total = +res.headers["content-length"] || 0;
        if (total && !this._sizeRegistry.has(url)) {
          this._catTotals[cat] = (this._catTotals[cat] || 0) + total;
          this._sizeRegistry.add(url);
        }
        this._catDownloaded[cat] = this._catDownloaded[cat] || 0;

        res.on("data", (chunk) => {
          const now = Date.now();
          this._catDownloaded[cat] += chunk.length;

          const pct = this._catTotals[cat]
            ? Math.floor(
                (this._catDownloaded[cat] / this._catTotals[cat]) * 100
              )
            : Math.floor(
                (this._catDownloaded[cat] /
                  (Object.keys(this._sizeRegistry).length + 1)) *
                  100
              );

          const msg = htmlProgress(cat, pct);
          this.emit("progress", msg);
          this.emit(ch, msg);

          if (now - this._lastEmit > 500) {
            const elapsed = now - this._startTime;
            const totB = Object.values(this._catTotals).reduce(
              (a, b) => a + b,
              0
            );
            const donB = Object.values(this._catDownloaded).reduce(
              (a, b) => a + b,
              0
            );
            const speed = donB / (elapsed / 1000);
            const etaMs = speed ? ((totB - donB) / speed) * 1000 : 0;
            this.emit("progressTime", elapsed);
            this.emit("estimatedTime", Math.round(etaMs));
            this._lastEmit = now;
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            try {
              if (fs.existsSync(dest)) fs.unlinkSync(dest);
              fs.renameSync(tmp, dest);
              const done = htmlDone(cat);
              this.emit("progress", done);
              this.emit(ch, done);
              resolve(dest);
            } catch (e) {
              retryOrFail(e);
            }
          });
        });
      });

      req.setTimeout(DEFAULT_TIMEOUT_MS, () =>
        req.destroy(new Error("Timeout sin datos"))
      );

      req.on("error", retryOrFail);
    });
  }

  /* ── Paso 3: extracción (solo JVM) ── */
  async extractFile(archive, dest) {
    const cat = "JVM-extract";
    const ch = `${slug(cat)}-progress`;
    this.emit("progress", htmlProgress(cat));
    this.emit(ch, htmlProgress(cat));

    if (archive.endsWith(".zip"))
      await fs
        .createReadStream(archive)
        .pipe(unzipper.Extract({ path: dest }))
        .promise();
    else await tar.x({ file: archive, cwd: dest, strip: 1 });

    const done = htmlDone(cat);
    this.emit("progress", done);
    this.emit(ch, done);
  }

  /* ── Paso 4: JVM ── */
  async ensureJVM() {
    if (!this.downloadJVM) return true;
    const javaVer = "Java24";
    const url = this.config?.JVMDownload?.[javaVer]?.[this.osName];
    if (!url) throw new Error(`Sin URL de ${javaVer} para ${this.osName}`);

    const runtime = path.join(
      this.rootPath,
      this.config.DefaultPathJVM?.[this.osName] || "runtime"
    );
    const dir = path.join(runtime, javaVer.toLowerCase());
    const bin = path.join(
      dir,
      "bin",
      this.osName.startsWith("windows") ? "java.exe" : "java"
    );
    if (fs.existsSync(bin)) return true;

    await fsp.mkdir(dir, { recursive: true });
    const arc = path.join(runtime, path.basename(url.split("?")[0]));
    await this.downloadFile(url, arc, "JVM");
    await this.extractFile(arc, dir);
    await fsp.unlink(arc);
    return false;
  }

  /* ── Paso 5: version.json ── */
  async fetchVersionJson(id) {
    const cacheDir = path.join(this.rootPath, "cache", "json", "versions");
    await fsp.mkdir(cacheDir, { recursive: true });
    const file = path.join(cacheDir, `${id}.json`);
    if (fs.existsSync(file))
      return JSON.parse(await fsp.readFile(file, "utf8"));
    const { versions } = await fetchJson(ManifestURL);
    const meta = versions.find((v) => v.id === id);
    if (!meta) throw new Error(`Versión ${id} no encontrada`);
    const data = await fetchJson(meta.url);
    await fsp.writeFile(file, JSON.stringify(data, null, 2));
    return data;
  }

  /* ── Paso 6: helper paralelismo ── */
  async parallel(arr, limit, job) {
    const q = [...arr];
    const p = Array(Math.min(limit, q.length))
      .fill(null)
      .map(async () => {
        while (q.length) await job(q.shift());
      });
    await Promise.all(p);
  }

  /* ── Paso 7: Librerías ── */
  async handleLibraries(libs) {
    const base = path.join(this.rootPath, "libraries");
    await this.parallel(libs, 8, async (lib) => {
      if (!lib.downloads?.artifact) return;
      const { url, path: rel } = lib.downloads.artifact;
      const dest = path.join(base, rel);
      if (fs.existsSync(dest)) return;
      await this.downloadFile(url, dest, "Librerías");
    });
  }

  /* ── Paso 7.5: Nativos ── */
  async handleNatives(vData, id) {
    const plat =
      this.osName === "windows"
        ? "windows"
        : this.osName === "macOs"
        ? "osx"
        : "linux";
    const out = path.join(this.rootPath, "natives", id);
    await fsp.mkdir(out, { recursive: true });

    for (const lib of vData.libraries) {
      if (!lib.natives || !lib.downloads?.classifiers) continue;
      const key = lib.natives[plat];
      const nat = lib.downloads.classifiers[key];
      if (!key || !nat?.url) continue;

      const zip = path.join(out, path.basename(nat.path));
      if (!fs.existsSync(zip)) await this.downloadFile(nat.url, zip, "Nativos");

      const str = fs
        .createReadStream(zip)
        .pipe(unzipper.Parse({ forceStream: true }));
      for await (const entry of str) {
        if (entry.path.includes("META-INF")) {
          entry.autodrain();
          continue;
        }
        const f = path.join(out, entry.path);
        await fsp.mkdir(path.dirname(f), { recursive: true });
        await new Promise((ok, bad) => {
          const w = fs.createWriteStream(f);
          entry.pipe(w);
          w.on("finish", ok);
          w.on("error", bad);
        });
      }
      this.emit("progress", htmlDone("Nativos"));
      this.emit("natives-progress", htmlDone("Nativos"));
    }
  }

  /* ── Paso 8: Assets ── */
  async downloadAssets(vData) {
    const dir = path.join(this.rootPath, "assets");
    const idxD = path.join(dir, "indexes");
    fs.mkdirSync(idxD, { recursive: true });

    const idxJSON = await fetchJson(vData.assetIndex.url);
    await fsp.writeFile(
      path.join(idxD, `${vData.assetIndex.id}.json`),
      JSON.stringify(idxJSON, null, 2)
    );

    await this.parallel(
      Object.entries(idxJSON.objects),
      10,
      async ([name, obj]) => {
        const hash = obj.hash,
          sub = hash.slice(0, 2);
        const url = `https://resources.download.minecraft.net/${sub}/${hash}`;
        const dest = path.join(dir, "objects", sub, hash);
        if (fs.existsSync(dest)) return;
        await this.downloadFile(url, dest, "Assets");
      }
    );

    const done = htmlDone("Assets");
    this.emit("progress", done);
    this.emit("assets-progress", done);
  }

  /* ── Paso 9: Client ── */
  async handleClient(id, vData) {
    const vdir = path.join(this.rootPath, "versions", id);
    await fsp.mkdir(vdir, { recursive: true });
    const jar = path.join(vdir, `${id}.jar`);
    if (!fs.existsSync(jar))
      await this.downloadFile(vData.downloads.client.url, jar, "Client");
    await fsp.writeFile(
      path.join(vdir, `${id}.json`),
      JSON.stringify(vData, null, 2)
    );
  }

  /* ── Paso 10: estimar tamaños ── */
  async estimateTotals(vData, jvmReady) {
    const add = (cat, o) => {
      if (o?.size) this._catTotals[cat] = (this._catTotals[cat] || 0) + o.size;
    };

    for (const l of vData.libraries || []) {
      add("Librerías", l.downloads?.artifact);
      if (l.downloads?.classifiers) {
        const plat =
          this.osName === "windows"
            ? "windows"
            : this.osName === "macOs"
            ? "osx"
            : "linux";
        const key = l.natives?.[plat];
        add("Nativos", l.downloads.classifiers?.[key]);
      }
    }
    add("Client", vData.downloads?.client);

    if (!jvmReady && this.downloadJVM) {
      const javaVer = "Java17";
      add("JVM", this.config?.JVMDownload?.[javaVer]?.[this.osName]);
    }

    if (vData.assetIndex?.url) {
      const idx = await fetchJson(vData.assetIndex.url);
      for (const o of Object.values(idx.objects || {})) add("Assets", o);
    }
  }

  /* ── Punto de entrada ── */
  async download(versionId) {
    try {
      this.emit("progress", htmlProgress("Inicializando"));
      this._startTime = Date.now();

      await this.checkConnection();
      versionId = await this.resolveVersion(versionId);
      this.emit("progress", `[Versión objetivo] ${versionId}`);
      this.emit("progressTime", 0);

      const jvmReady = await this.ensureJVM();
      const vData = await this.fetchVersionJson(versionId);
      await this.estimateTotals(vData, jvmReady);

      await this.handleLibraries(vData.libraries || []);
      await this.handleNatives(vData, versionId);
      await this.downloadAssets(vData);
      await this.handleClient(versionId, vData);

      this.emit("done", htmlDone(`Minecraft ${versionId}`));
    } catch (e) {
      this.emit("error", e.message || String(e));
    }
  }
}

module.exports = MinecraftDownloader;
