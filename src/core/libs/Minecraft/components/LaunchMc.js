const child_process = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const EventEmitter = require("events");
const fsPromises = fs.promises;

class MinecraftEjecuting extends EventEmitter {
  constructor() {
    super();
    this.options = {};
    this.logBuffer = [];
    this.versionDataCache = null;
    this.libraryCache = new Map();
    this.assetIndexIdCache = null;
    this.platform = this._getPlatform();
  }

  async launch(opts) {
    if (!opts?.version?.versionID) {
      this._emitErrorAndClose("No se ha especificado una versión válida");
      return null;
    }

    // Configuración base
    this.options = {
      root: path.resolve(opts.root || "./minecraft"),
      javaPath: opts.javaPath || "java",
      memory: opts.memory || { max: "4G", min: "1G" },
      window: opts.window || { width: 854, height: 480, fullscreen: false },
      version: opts.version,
      overrides: opts.overrides || {},
      user: {
        ...(await this._loadOrCreateUser(opts.root || "./minecraft")),
        ...opts.user,
      },
    };
    this.options.user.type = this.options.user.type || "legacy";

    // Leer archivo version.json
    const versionJsonPath = path.join(
      this.options.root,
      "versions",
      this.options.version.versionID,
      `${this.options.version.versionID}.json`
    );
    if (!(await this._exists(versionJsonPath))) {
      this._emitErrorAndClose(
        `Archivo de versión no encontrado: ${versionJsonPath}`
      );
      return null;
    }
    try {
      const rawData = await fsPromises.readFile(versionJsonPath, "utf-8");
      this.versionDataCache = JSON.parse(rawData);
    } catch (err) {
      this._emitErrorAndClose(
        `Error al leer archivo de versión: ${err.message}`
      );
      return null;
    }

    this.assetIndexIdCache =
      this.versionDataCache.assetIndex?.id || this.options.version.versionID;

    // Crear carpetas necesarias
    await this._createDirs();

    // Obtener librerías válidas
    const libraries = await this.getLibraries();

    // Validar java instalado y accesible
    try {
      await this._checkJava(this.options.javaPath);
    } catch (err) {
      this._emitErrorAndClose(`Java inválido o no encontrado: ${err.message}`);
      return null;
    }

    // Extraer natives antes de iniciar
    try {
      await this._extractNatives();
    } catch (err) {
      this.emit("debug", `Error extrayendo natives: ${err.message}`);
    }

    // Construir argumentos de lanzamiento
    try {
      this.emit("debug", `Iniciando versión ${this.options.version.versionID}`);
      const launchArgs = await this._buildLaunchArgs(libraries);
      this.emit("debug", `Argumentos: ${launchArgs.join(" ")}`);
      return this._startMinecraftProcess(launchArgs);
    } catch (err) {
      this._emitErrorAndClose(`Error al lanzar Minecraft: ${err.message}`);
      return null;
    }
  }

  getAssets() {
    return path.join(this.options.root, "assets");
  }

  async getAssetsObjects() {
    const assetIndexPath = path.join(
      this.options.root,
      "assets",
      "indexes",
      `${this.assetIndexIdCache}.json`
    );
    if (!(await this._exists(assetIndexPath))) {
      this.emit(
        "debug",
        `Archivo índice de assets no encontrado: ${assetIndexPath}`
      );
      return {};
    }
    try {
      const rawIndex = await fsPromises.readFile(assetIndexPath, "utf-8");
      const parsed = JSON.parse(rawIndex);
      return parsed.objects || {};
    } catch (err) {
      this.emit(
        "error",
        `Error leyendo/parsing índice de assets: ${err.message}`
      );
      return {};
    }
  }

  getNatives() {
    return path.join(
      this.options.root,
      "natives",
      this.options.version.versionID
    );
  }

  async getLibraries() {
    if (!this.versionDataCache) return [];
    const cacheKey = JSON.stringify(this.versionDataCache.libraries);

    if (this.libraryCache.has(cacheKey)) {
      return this.libraryCache.get(cacheKey);
    }

    const applicableLibs = (this.versionDataCache.libraries || []).filter(
      (lib) => this._isLibraryApplicable(lib)
    );

    const libPaths = applicableLibs
      .map((lib) => {
        if (lib.downloads?.artifact?.path) {
          return path.join(
            this.options.root,
            "libraries",
            lib.downloads.artifact.path
          );
        }
        if (lib.name) {
          const [group, artifact, version] = lib.name.split(":");
          return path.join(
            this.options.root,
            "libraries",
            ...group.split("."),
            artifact,
            version,
            `${artifact}-${version}.jar`
          );
        }
        return null;
      })
      .filter(Boolean);

    const existingLibs = (
      await Promise.all(
        libPaths.map(async (libPath) =>
          (await this._exists(libPath)) ? libPath : null
        )
      )
    ).filter(Boolean);

    this.libraryCache.set(cacheKey, existingLibs);
    return existingLibs;
  }

  _isLibraryApplicable(lib) {
    if (!lib.rules) return true;

    for (const rule of lib.rules) {
      if (rule.action === "allow") {
        if (!rule.os || rule.os.name === this.platform) return true;
      } else if (rule.action === "disallow") {
        if (!rule.os || rule.os.name === this.platform) return false;
      }
    }
    return true;
  }

  _getPlatform() {
    if (process.platform === "win32") return "windows";
    if (process.platform === "darwin") return "osx";
    if (process.platform === "linux") return "linux";
    return "unknown";
  }

  _formatTimestamp() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    return `[${pad(now.getDate())}/${pad(
      now.getMonth() + 1
    )}/${now.getFullYear()} ${pad(now.getHours())}:${pad(
      now.getMinutes()
    )}:${pad(now.getSeconds())}]`;
  }

  async _loadOrCreateUser(rootPath) {
    const profilesPath = path.resolve(rootPath, "launcher_profiles.json");
    let profilesData = {};
    try {
      const rawData = await fsPromises.readFile(profilesPath, "utf-8");
      profilesData = JSON.parse(rawData);
    } catch {
      // archivo no existe o corrupto
    }

    if (!profilesData.profiles || typeof profilesData.profiles !== "object") {
      profilesData.profiles = {};
    }

    for (const key in profilesData.profiles) {
      const p = profilesData.profiles[key];
      if (p.type === "legacy" && p.uuid && p.accessToken) {
        return p;
      }
    }

    const newUUID = crypto.randomUUID();
    const newAccessToken = crypto.randomBytes(32).toString("hex");
    const newName = this.options.user?.name || "Player";

    const newUser = {
      type: "legacy",
      name: newName,
      uuid: newUUID,
      accessToken: newAccessToken,
    };

    profilesData.profiles[newUUID] = newUser;

    try {
      await fsPromises.writeFile(
        profilesPath,
        JSON.stringify(profilesData, null, 2),
        "utf-8"
      );
    } catch (err) {
      this.emit(
        "error",
        `Error al guardar launcher_profiles.json: ${err.message}`
      );
    }

    return newUser;
  }

  async _createDirs() {
    const dirs = [
      this.options.root,
      this.options.overrides?.gameDirectory,
      this.getNatives(),
      path.join(this.getAssets(), "indexes"),
      path.join(this.options.root, "logs"),
    ].filter(Boolean);

    await Promise.all(
      dirs.map((dir) =>
        fsPromises.mkdir(dir, { recursive: true }).catch((err) => {
          this.emit("error", `Error creando directorio ${dir}: ${err.message}`);
        })
      )
    );
  }

  async _buildLaunchArgs(libraries) {
    const versionID = this.options.version.versionID;
    const versionJar = path.join(
      this.options.root,
      "versions",
      versionID,
      `${versionID}.jar`
    );

    if (!(await this._exists(versionJar))) {
      this.emit("error", `JAR de versión no encontrado: ${versionJar}`);
    }

    const mainClass =
      this.versionDataCache.mainClass || "net.minecraft.client.main.Main";
    const classPathSeparator = process.platform === "win32" ? ";" : ":";
    const classPath = [...libraries, versionJar].join(classPathSeparator);

    const args = [
      `-Xmx${this.options.memory.max}`,
      `-Xms${this.options.memory.min}`,
      `-Djava.library.path=${this.getNatives()}`,
      "-cp",
      classPath,
      mainClass,
      "--username",
      this.options.user.name,
      "--uuid",
      this.options.user.uuid,
      "--accessToken",
      this.options.user.accessToken,
      "--version",
      versionID,
      "--gameDir",
      this.options.overrides?.gameDirectory || this.options.root,
      "--assetsDir",
      this.getAssets(),
      "--assetIndex",
      this.assetIndexIdCache,
      "--userType",
      this.options.user.type,
    ];

    if (this.options.window) {
      if (this.options.window.width)
        args.push("--width", String(this.options.window.width));
      if (this.options.window.height)
        args.push("--height", String(this.options.window.height));
      if (this.options.window.fullscreen) args.push("--fullscreen");
    }

    return [this.options.javaPath, ...args];
  }

  _startMinecraftProcess(args) {
    const javaPath = args[0];
    const spawnOptions = {
      cwd: this.options.overrides?.gameDirectory || this.options.root,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    };

    const proc = child_process.spawn(javaPath, args.slice(1), spawnOptions);

    proc.stdout.on("data", (data) => {
      const msg = data.toString().trim();
      this.emit("data", msg);
      this.logBuffer.push(`${this._formatTimestamp()} ${msg}\n`);
    });

    proc.stderr.on("data", (data) => {
      const err = data.toString().trim();
      this.emit("error", err);
      this.logBuffer.push(`${this._formatTimestamp()} [ERROR] ${err}\n`);
    });

    proc.on("close", async (code) => {
      if (code !== 0 && this.logBuffer.length > 0) {
        await this._writeCrashLog();
      }
      this.emit("close", code);
      this.logBuffer = [];
    });

    proc.on("error", async (err) => {
      this.emit("error", `Error en el proceso: ${err.message}`);
      this.logBuffer.push(
        `${this._formatTimestamp()} [PROCESS ERROR] ${err.message}\n`
      );
      if (this.logBuffer.length > 0) {
        await this._writeCrashLog();
      }
      this.emit("close", 1);
      this.logBuffer = [];
    });

    return proc;
  }

  async _writeCrashLog() {
    try {
      const logDir = path.resolve(this.options.root, "logs");
      await fsPromises.mkdir(logDir, { recursive: true });

      const logPath = path.join(logDir, `stepLauncher_crash_${Date.now()}.log`);
      const content = this.logBuffer.join("");
      await fsPromises.writeFile(logPath, content, "utf-8");
      this.emit("debug", `Log de crash guardado en: ${logPath}`);
    } catch (err) {
      this.emit("error", `Error escribiendo log de crash: ${err.message}`);
    }
  }

  // Helper para verificar existencia archivo/carpeta
  async _exists(pathToCheck) {
    try {
      await fsPromises.access(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }

  // Validar java -version
  async _checkJava(javaPath) {
    return new Promise((resolve, reject) => {
      const proc = child_process.spawn(javaPath, ["-version"]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error("El proceso java -version salió con error"));
          return;
        }
        const match = stderr.match(/version "(?<ver>\d+)/);
        if (!match || !match.groups?.ver || parseInt(match.groups.ver) < 8) {
          reject(new Error(`Versión de Java insuficiente: ${stderr.trim()}`));
          return;
        }
        resolve();
      });
      proc.on("error", (err) => reject(err));
    });
  }

  // Extrae natives (opcional, solo si están)
  async _extractNatives() {
    const unzipper = require("unzipper");
    const nativesDir = this.getNatives();
    await fsPromises.mkdir(nativesDir, { recursive: true });

    const libsWithNatives = (this.versionDataCache.libraries || []).filter(
      (lib) =>
        lib.downloads?.classifiers &&
        (lib.downloads.classifiers[`natives-${this.platform}`] ||
          lib.downloads.classifiers[`natives_${this.platform}`])
    );

    for (const lib of libsWithNatives) {
      const classifiers = lib.downloads.classifiers;
      const nativeKey = `natives-${this.platform}`;
      const nativeAltKey = `natives_${this.platform}`;
      const nativeFile = classifiers[nativeKey] || classifiers[nativeAltKey];
      if (!nativeFile) continue;

      const nativePath = path.join(
        this.options.root,
        "libraries",
        nativeFile.path
      );
      if (!(await this._exists(nativePath))) continue;

      try {
        await fs
          .createReadStream(nativePath)
          .pipe(unzipper.Extract({ path: nativesDir }))
          .promise();
      } catch (err) {
        this.emit(
          "debug",
          `Error extrayendo natives desde ${nativePath}: ${err.message}`
        );
      }
    }
  }
}

module.exports = MinecraftEjecuting;
