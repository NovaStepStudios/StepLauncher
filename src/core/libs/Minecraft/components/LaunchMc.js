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
      this.emit("error", "No se ha especificado una versión válida");
      return null;
    }

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

    const versionJsonPath = path.join(
      this.options.root,
      "versions",
      this.options.version.versionID,
      `${this.options.version.versionID}.json`
    );

    if (!fs.existsSync(versionJsonPath)) {
      this.emit(
        "error",
        `Archivo de versión no encontrado: ${versionJsonPath}`
      );
      return null;
    }

    try {
      const rawData = await fsPromises.readFile(versionJsonPath, "utf-8");
      this.versionDataCache = JSON.parse(rawData);
    } catch (e) {
      this.emit("error", `Error al leer archivo de versión: ${e.message}`);
      return null;
    }

    this.assetIndexIdCache =
      this.versionDataCache.assetIndex?.id || this.options.version.versionID;

    await Promise.all([this.getLibraries(), this._createDirs()]);

    try {
      this.emit("debug", `Iniciando versión ${this.options.version.versionID}`);
      const launchArgs = await this._buildLaunchArgs(await this.getLibraries());
      this.emit("debug", `Argumentos: ${launchArgs.join(" ")}`);
      return this._startMinecraftProcess(launchArgs);
    } catch (error) {
      this.emit("error", `Error al lanzar Minecraft: ${error.message}`);
      this.emit("close", 1);
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

    try {
      await fsPromises.access(assetIndexPath);
    } catch {
      this.emit(
        "debug",
        `Archivo de índice de assets no encontrado: ${assetIndexPath}`
      );
      return {};
    }

    try {
      const rawIndex = await fsPromises.readFile(assetIndexPath, "utf-8");
      const parsed = JSON.parse(rawIndex);
      if (!parsed.objects) {
        this.emit(
          "debug",
          `El índice de assets no contiene 'objects': ${assetIndexPath}`
        );
        return {};
      }
      return parsed.objects;
    } catch (e) {
      this.emit(
        "error",
        `Error leyendo/parsing índice de assets: ${e.message}`
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
        } else if (lib.name) {
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

    const existenceChecks = libPaths.map(async (libPath) => {
      try {
        await fsPromises.access(libPath);
        return libPath;
      } catch {
        return null;
      }
    });

    const existingLibs = (await Promise.all(existenceChecks)).filter(Boolean);
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
    return process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
      ? "osx"
      : process.platform === "linux"
      ? "linux"
      : "unknown";
  }

  _formatTimestamp() {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");

    return `[ ${day} / ${month} / ${year} || Time : ${hours} : ${minutes} : ${seconds} ]`;
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

    // Buscar perfil legacy válido
    for (const key in profilesData.profiles) {
      const p = profilesData.profiles[key];
      if (p.type === "legacy" && p.uuid && p.accessToken) {
        return p;
      }
    }

    // Si no existe, crear nuevo perfil
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
    } catch (e) {
      this.emit(
        "error",
        `Error al guardar launcher_profiles.json: ${e.message}`
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
        fsPromises.mkdir(dir, { recursive: true }).catch((e) => {
          this.emit("error", `Error creando directorio ${dir}: ${e.message}`);
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

    try {
      await fsPromises.access(versionJar);
    } catch {
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
      const msg = data.toString();
      this.emit("data", msg);
      this.logBuffer.push(`${this._formatTimestamp()} ${msg}`);
    });

    proc.stderr.on("data", (data) => {
      const err = data.toString();
      this.emit("error", err);
      this.logBuffer.push(`${this._formatTimestamp()} [ERROR] ${err}`);
    });

    proc.on("close", (code) => {
      if (code !== 0 && this.logBuffer.length > 0) {
        this._writeCrashLog();
      }
      this.emit("close", code);
      this.logBuffer = [];
    });

    proc.on("error", (err) => {
      this.emit("error", `Error en el proceso: ${err.message}`);
      this.emit("close", 1);
      if (this.logBuffer.length > 0) {
        this._writeCrashLog();
      }
      this.logBuffer = [];
    });

    return proc;
  }

  async _writeCrashLog() {
    const logDir = path.resolve(this.options.root, "logs");
    await fsPromises.mkdir(logDir, { recursive: true });

    const logPath = path.join(logDir, `stepLauncher_crash_${Date.now()}.log`);
    const content = this.logBuffer.join("");

    await fsPromises.writeFile(logPath, content, "utf-8");
    this.emit("debug", `Log de crash guardado en: ${logPath}`);
  }
}

module.exports = MinecraftEjecuting;
