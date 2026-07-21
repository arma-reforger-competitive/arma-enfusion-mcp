import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { logger } from "./utils/logger.js";
import { isWsl, detectWslHostIp } from "./utils/wsl-path.js";

export interface Config {
  /** Path to "Arma Reforger Tools" installation */
  workbenchPath: string;
  /** Default project directory for project_browse */
  projectPath: string;
  /** Path to base game installation (auto-derived from workbenchPath) */
  gamePath: string;
  /** Workbench profile root — the folder containing `addons/` and `profile/`
   *  (default `<Documents>/My Games/ArmaReforgerWorkbench`). Used to resolve and
   *  stage a launched mod's dependency chain. Set via ENFUSION_WORKBENCH_PROFILE;
   *  WSL users must set it explicitly (homedir is the Linux home there). */
  workbenchProfile: string;
  /** Optional path to a pre-extracted game data library (fully flattened prefabs).
   *  When set, game_duplicate checks here first before falling back to pak loose files.
   *  Set via ENFUSION_EXTRACTED_PATH env var. */
  extractedPath?: string;
  /** Directory containing scraped data index */
  dataDir: string;
  /** Directory containing mod pattern definitions */
  patternsDir: string;
  /** Workbench NET API host (default 127.0.0.1) */
  workbenchHost: string;
  /** Workbench NET API port (default 5775) */
  workbenchPort: number;
  /** Default addon folder name used when modName is not specified in tool calls.
   *  Automatically set at runtime when wb_launch opens a .gproj file.
   *  Can also be set via ENFUSION_DEFAULT_MOD env var as a static fallback. */
  defaultMod?: string;
}

const DEFAULT_WORKBENCH_PATH =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Arma Reforger Tools";

const DEFAULTS: Config = {
  workbenchPath: DEFAULT_WORKBENCH_PATH,
  projectPath: join(homedir(), "Documents", "My Games", "ArmaReforgerWorkbench", "addons"),
  gamePath: resolve(DEFAULT_WORKBENCH_PATH, "..", "Arma Reforger"),
  workbenchProfile: join(homedir(), "Documents", "My Games", "ArmaReforgerWorkbench"),
  dataDir: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "data"
  ),
  patternsDir: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "data",
    "patterns"
  ),
  workbenchHost: "127.0.0.1",
  workbenchPort: 5775,
};

export function loadConfig(): Config {
  // 1. Start with defaults
  const config = { ...DEFAULTS };

  // 2. Environment variables are the single configuration mechanism. MCP clients
  //    pass these via the server's `env` block (see README). See ADR 0005.
  if (process.env.ENFUSION_WORKBENCH_PATH) {
    config.workbenchPath = process.env.ENFUSION_WORKBENCH_PATH;
  }
  if (process.env.ENFUSION_PROJECT_PATH) {
    config.projectPath = process.env.ENFUSION_PROJECT_PATH;
  }
  if (process.env.ENFUSION_GAME_PATH) {
    config.gamePath = process.env.ENFUSION_GAME_PATH;
  }
  if (process.env.ENFUSION_WORKBENCH_PROFILE) {
    config.workbenchProfile = process.env.ENFUSION_WORKBENCH_PROFILE;
  }
  if (process.env.ENFUSION_EXTRACTED_PATH) {
    config.extractedPath = process.env.ENFUSION_EXTRACTED_PATH;
  }
  if (process.env.ENFUSION_MCP_DATA_DIR) {
    config.dataDir = process.env.ENFUSION_MCP_DATA_DIR;
    // patternsDir is always <dataDir>/patterns
    config.patternsDir = join(process.env.ENFUSION_MCP_DATA_DIR, "patterns");
  }
  if (process.env.ENFUSION_WORKBENCH_HOST) {
    config.workbenchHost = process.env.ENFUSION_WORKBENCH_HOST;
  } else if (isWsl()) {
    // Under WSL2 the Workbench NET API runs on the Windows host and binds
    // 0.0.0.0, so it is reachable directly at the WSL default-gateway IP — no
    // netsh portproxy bridge needed. Auto-detect it so WSL users don't have to
    // set ENFUSION_WORKBENCH_HOST (and so a changed WSL IP self-heals on restart).
    const hostIp = detectWslHostIp();
    if (hostIp) {
      config.workbenchHost = hostIp;
      logger.info(`WSL detected — using Windows host IP ${hostIp} for the NET API.`);
    } else {
      logger.warn(
        "WSL detected but could not auto-detect the Windows host IP. " +
          "Set ENFUSION_WORKBENCH_HOST to the WSL gateway IP if wb_* tools cannot connect."
      );
    }
  }
  if (process.env.ENFUSION_WORKBENCH_PORT) {
    const port = parseInt(process.env.ENFUSION_WORKBENCH_PORT, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.workbenchPort = port;
    }
  }
  if (process.env.ENFUSION_DEFAULT_MOD) {
    config.defaultMod = process.env.ENFUSION_DEFAULT_MOD;
  }

  // Auto-derive gamePath from workbenchPath if not explicitly set
  if (!process.env.ENFUSION_GAME_PATH && config.workbenchPath !== DEFAULT_WORKBENCH_PATH) {
    config.gamePath = resolve(config.workbenchPath, "..", "Arma Reforger");
  }

  logger.debug("Config loaded", config);
  return config;
}
