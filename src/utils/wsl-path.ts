/**
 * WSL <-> Windows path translation.
 *
 * The MCP server runs inside WSL2 but drives a native **Windows** Workbench exe
 * and its NET API. The same OS path therefore needs two forms:
 *
 *   - **WSL path**     `/mnt/d/...`  — for Node filesystem ops (they run in WSL).
 *   - **Windows path** `D:\...`      — for the exe CLI arg and any path handed to
 *                                       the Windows-side NET API (it resolves natively).
 *
 * These helpers translate between the two. Translation only makes sense when we
 * are in WSL talking to Windows; on native Windows or native Linux the gated
 * helpers (`normalizeOsPath`, `toEnginePath`) are pure no-ops so the published
 * npm package behaves exactly as before.
 *
 * Only **OS paths** (drive-mounted: `/mnt/<x>/...` or `<X>:\...`) are rewritten.
 * **Resource paths** (Enfusion VFS: `Prefabs/...`, `{GUID}`) match neither shape
 * and pass through untouched — so calling these on a resource path is harmless.
 *
 * The pure-regex conversion assumes the default `/mnt` automount root.
 */

import { release } from "node:os";

/** `/mnt/<drive>/rest` — a WSL drive mount. */
const WSL_MOUNT_RE = /^\/mnt\/([a-zA-Z])(\/.*|)$/;
/** `<drive>:\rest` or `<drive>:/rest` — a Windows absolute path. */
const WINDOWS_DRIVE_RE = /^([a-zA-Z]):[\\/](.*)$/;

/**
 * Pure WSL detection from a kernel release string and platform.
 * Split out from {@link isWsl} so it can be unit-tested deterministically.
 */
export function detectWsl(releaseStr: string, platform: NodeJS.Platform): boolean {
  return platform === "linux" && /microsoft/i.test(releaseStr);
}

let cachedIsWsl: boolean | undefined;

/**
 * Whether this process is running under WSL (detected once, then cached).
 * Honours `ENFUSION_WSL_MODE` (`1`/`true` force on, `0`/`false` force off).
 */
export function isWsl(): boolean {
  if (cachedIsWsl !== undefined) return cachedIsWsl;

  const override = process.env.ENFUSION_WSL_MODE;
  if (override !== undefined) {
    cachedIsWsl = override === "1" || override.toLowerCase() === "true";
    return cachedIsWsl;
  }

  cachedIsWsl = detectWsl(release(), process.platform);
  return cachedIsWsl;
}

/**
 * Convert a WSL `/mnt/<x>/...` path to a Windows `<X>:\...` path.
 * Passes through anything that isn't a drive-mounted WSL path (already-Windows
 * paths, Linux-fs paths, Enfusion resource paths).
 */
export function toWindowsPath(p: string): string {
  const m = WSL_MOUNT_RE.exec(p);
  if (!m) return p;
  const drive = m[1].toUpperCase();
  const rest = m[2].replace(/\//g, "\\"); // includes the leading separator (or "")
  return `${drive}:${rest}`;
}

/**
 * Convert a Windows `<X>:\...` (or `<X>:/...`) path to a WSL `/mnt/<x>/...` path.
 * Passes through anything that isn't a Windows drive path.
 */
export function toWslPath(p: string): string {
  const m = WINDOWS_DRIVE_RE.exec(p);
  if (!m) return p;
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

/**
 * Canonicalise an OS path to the form Node filesystem ops expect.
 * In WSL that is the `/mnt/...` form; elsewhere the path is returned unchanged.
 *
 * @param wsl Override for the WSL check (defaults to {@link isWsl}); pass
 *            explicitly in tests.
 */
export function normalizeOsPath(p: string, wsl: boolean = isWsl()): string {
  return wsl ? toWslPath(p) : p;
}

/**
 * Convert an OS path to the form the Windows Workbench exe / NET API expects.
 * In WSL that is the `<X>:\...` form; elsewhere the path is returned unchanged.
 *
 * @param wsl Override for the WSL check (defaults to {@link isWsl}); pass
 *            explicitly in tests.
 */
export function toEnginePath(p: string, wsl: boolean = isWsl()): string {
  return wsl ? toWindowsPath(p) : p;
}
