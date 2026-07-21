/**
 * Dependency staging for `-gproj` launches.
 *
 * When Workbench is launched with `-gproj <path>` (as wb_launch does), the engine
 * resolves addon dependencies from only three fixed search dirs:
 *   1. the opened gproj's own folder,
 *   2. `./addons` relative to CWD (the base game — core.gproj + ArmaReforger.gproj),
 *   3. `<profile>/addons` (the Workbench profile's local addon folder).
 *
 * It does **not** consult the Workbench project-list registry
 * (`<profile>/profile/.projectList_*.conf`) that the GUI launcher uses. So a mod
 * whose dependencies live anywhere else — Steam Workshop mods under a downloads
 * folder, or a sibling project repo nested a level deep — fails with
 * `Addon '<x>' dependency '<GUID>' can't be added`, and Workbench silently falls
 * back to loading only the base ArmaReforger project.
 *
 * This module closes that gap: before launch we resolve the target gproj's full
 * (transitive) dependency chain via the project-list registry, then make each
 * dependency discoverable by creating a directory **junction** for it under
 * `<profile>/addons/` — search dir (3) above. Junctions are reversible and copy
 * nothing. Every junction we create is recorded in a manifest so wb_cleanup can
 * remove exactly what we added without touching the user's real addon folders.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { logger } from "../utils/logger.js";
import { normalizeOsPath, toWindowsPath } from "../utils/wsl-path.js";

/** Base-game GUIDs that always resolve via `./addons`; never need staging. */
const BASE_GUIDS = new Set([
  "58D0FB3206B6F859", // ArmaReforger (data)
  "5614BBCCBB55ED1C", // core
]);

/** Manifest of junctions we created, so cleanup removes only our own. */
const MANIFEST_NAME = ".emcp-managed-junctions.json";

interface RegistryEntry {
  /** Absolute WSL/OS path to the addon's .gproj. */
  gproj: string;
  /** The addon's own directory (parent of the .gproj). */
  dir: string;
  /** Folder name used as the junction name under <profile>/addons. */
  name: string;
  /** GUIDs this addon depends on (for transitive resolution). */
  deps: string[];
}

interface ManifestEntry {
  /** Junction folder name under <profile>/addons. */
  name: string;
  /** Junction target (Windows path form, for logging/debug). */
  target: string;
}

export interface StageResult {
  /** Names of dependency addons newly junctioned into <profile>/addons. */
  created: string[];
  /** Names already discoverable (skipped). */
  skipped: string[];
  /** Human-readable problems (e.g. a dependency missing from the registry). */
  warnings: string[];
}

/** Extract a gproj's own 16-hex GUID (bare `GUID X` or quoted `GUID "X"`). */
export function parseOwnGuid(content: string): string | null {
  const m = /GUID\s+"?([0-9A-Fa-f]{16})"?/.exec(content);
  return m ? m[1].toUpperCase() : null;
}

/** Extract the GUIDs inside a gproj's `Dependencies { ... }` block. */
export function parseDeps(content: string): string[] {
  const block = /Dependencies\s*\{([^}]*)\}/.exec(content);
  if (!block) return [];
  const guids = block[1].match(/[0-9A-Fa-f]{16}/g) ?? [];
  return guids.map((g) => g.toUpperCase());
}

/** Extract `FilePath "..."` entries from a project-list registry .conf. */
export function parseRegistryFilePaths(content: string): string[] {
  const out: string[] = [];
  const re = /FilePath\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

/** Locate the project-list registry .conf under `<profileRoot>/profile`. */
function findRegistry(profileRoot: string): string | null {
  const profileDir = join(profileRoot, "profile");
  if (!existsSync(profileDir)) return null;
  try {
    for (const f of readdirSync(profileDir)) {
      if (f.includes("projectList") && f.endsWith(".conf")) {
        return join(profileDir, f);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Build a GUID -> addon map from the Workbench project-list registry.
 * Registry paths are Windows form (`D:/...`); we normalise them to the OS form
 * Node can stat (WSL `/mnt/...` when applicable).
 */
function buildRegistryMap(registryPath: string): Map<string, RegistryEntry> {
  const map = new Map<string, RegistryEntry>();
  let content: string;
  try {
    content = readFileSync(registryPath, "utf-8");
  } catch {
    return map;
  }
  for (const winPath of parseRegistryFilePaths(content)) {
    const gproj = normalizeOsPath(winPath);
    if (!existsSync(gproj)) continue;
    let gcontent: string;
    try {
      gcontent = readFileSync(gproj, "utf-8");
    } catch {
      continue;
    }
    const guid = parseOwnGuid(gcontent);
    if (!guid) continue;
    map.set(guid, {
      gproj,
      dir: dirname(gproj),
      name: basename(dirname(gproj)),
      deps: parseDeps(gcontent),
    });
  }
  return map;
}

function readManifest(addonsDir: string): ManifestEntry[] {
  const p = join(addonsDir, MANIFEST_NAME);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeManifest(addonsDir: string, entries: ManifestEntry[]): void {
  const p = join(addonsDir, MANIFEST_NAME);
  try {
    if (entries.length === 0) {
      rmSync(p, { force: true });
    } else {
      writeFileSync(p, JSON.stringify(entries, null, 2), "utf-8");
    }
  } catch (e) {
    logger.warn(`Could not write junction manifest: ${e}`);
  }
}

/**
 * Create a Windows directory junction `linkOsPath` -> `targetOsPath`.
 * On WSL the paths live on a Windows drive, so we drive PowerShell (a WSL
 * symlink would not be followed correctly by the native Workbench). On native
 * Windows, PowerShell's New-Item -Junction works the same way.
 */
function createJunction(linkOsPath: string, targetOsPath: string): void {
  const link = toWindowsPath(linkOsPath);
  const target = toWindowsPath(targetOsPath);
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `New-Item -ItemType Junction -Path '${link}' -Target '${target}' | Out-Null`,
    ],
    { stdio: "ignore" }
  );
}

/**
 * Remove a directory junction without touching its target. `Directory.Delete`
 * with recursive=false deletes only the reparse point.
 */
function removeJunction(linkOsPath: string): void {
  const link = toWindowsPath(linkOsPath);
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `if (Test-Path -LiteralPath '${link}') { [System.IO.Directory]::Delete('${link}', $false) }`,
    ],
    { stdio: "ignore" }
  );
}

/**
 * Resolve the target gproj's transitive dependency chain via the project-list
 * registry and junction any not-yet-discoverable dependency into
 * `<profileRoot>/addons`. Idempotent and best-effort: failures degrade to the
 * previous behaviour (Workbench simply reports the unresolved dependency).
 *
 * @param targetGproj Absolute OS path to the .gproj being launched.
 * @param profileRoot Absolute OS path to the Workbench profile root
 *                    (the folder containing `addons/` and `profile/`).
 */
export function stageDependencyChain(
  targetGproj: string,
  profileRoot: string
): StageResult {
  const result: StageResult = { created: [], skipped: [], warnings: [] };

  const addonsDir = join(profileRoot, "addons");
  if (!existsSync(addonsDir)) {
    result.warnings.push(
      `Workbench profile addons dir not found: ${addonsDir}. ` +
        `Set ENFUSION_WORKBENCH_PROFILE to the Workbench profile root ` +
        `(the folder containing 'addons' and 'profile').`
    );
    return result;
  }

  const registry = findRegistry(profileRoot);
  if (!registry) {
    result.warnings.push(
      `Project-list registry not found under ${profileRoot}/profile — ` +
        `cannot resolve dependency locations. Open each dependency once via ` +
        `the Workbench GUI (Add Existing) so it is registered.`
    );
    return result;
  }
  const map = buildRegistryMap(registry);

  let targetDeps: string[];
  try {
    targetDeps = parseDeps(readFileSync(targetGproj, "utf-8"));
  } catch (e) {
    result.warnings.push(`Could not read target gproj ${targetGproj}: ${e}`);
    return result;
  }

  // BFS the dependency graph, skipping base-game GUIDs.
  const visited = new Set<string>();
  const queue = [...targetDeps];
  const toStage: RegistryEntry[] = [];
  while (queue.length > 0) {
    const guid = queue.shift()!;
    if (visited.has(guid) || BASE_GUIDS.has(guid)) continue;
    visited.add(guid);

    const entry = map.get(guid);
    if (!entry) {
      result.warnings.push(
        `Dependency ${guid} is not in the Workbench project list — ` +
          `register it once via the GUI (Add Existing) so it can be resolved.`
      );
      continue;
    }
    toStage.push(entry);
    for (const d of entry.deps) if (!visited.has(d)) queue.push(d);
  }

  const manifest = readManifest(addonsDir);
  const managed = new Map(manifest.map((m) => [m.name, m]));

  for (const entry of toStage) {
    // Already discoverable: the addon already lives directly under the profile
    // addons dir (a locally-registered addon), so the engine will find it.
    if (dirname(entry.dir) === addonsDir) {
      result.skipped.push(entry.name);
      continue;
    }

    const linkPath = join(addonsDir, entry.name);
    if (existsSync(linkPath)) {
      // Something already occupies this name. If it's our own junction, fine;
      // otherwise leave the user's real folder untouched.
      if (managed.has(entry.name)) result.skipped.push(entry.name);
      else
        result.warnings.push(
          `'${entry.name}' already exists in ${addonsDir}; not overwriting.`
        );
      continue;
    }

    try {
      createJunction(linkPath, entry.dir);
      const target = toWindowsPath(entry.dir);
      managed.set(entry.name, { name: entry.name, target });
      result.created.push(entry.name);
      logger.info(`Staged dependency '${entry.name}' -> ${target}`);
    } catch (e) {
      result.warnings.push(`Failed to junction '${entry.name}': ${e}`);
    }
  }

  writeManifest(addonsDir, [...managed.values()]);
  return result;
}

/**
 * Remove every junction we created under `<profileRoot>/addons` and clear the
 * manifest. Safe to call when nothing was staged.
 */
export function unstageDependencies(profileRoot: string): string[] {
  const addonsDir = join(profileRoot, "addons");
  const manifest = readManifest(addonsDir);
  const removed: string[] = [];
  for (const entry of manifest) {
    try {
      removeJunction(join(addonsDir, entry.name));
      removed.push(entry.name);
    } catch (e) {
      logger.warn(`Could not remove junction '${entry.name}': ${e}`);
    }
  }
  writeManifest(addonsDir, []);
  return removed;
}
