import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DiagnosticReport, WorkbenchClient } from "../workbench/client.js";

/**
 * Build the environment-branched "what to check" differential for a `refused`
 * observation. We never claim which cause applies — all of these surface
 * identically as ECONNREFUSED.
 */
function refusedChecklist(r: DiagnosticReport): string[] {
  if (r.env === "wsl2" && r.bridged) {
    return [
      "Workbench is not running",
      "NET API is off (File > Options > General > Net API)",
      "The portproxy bridge is down (see docs/wsl-windows-setup.md)",
    ];
  }
  if (r.env === "linux" && r.bridged) {
    return [
      `The host is unreachable or ENFUSION_WORKBENCH_HOST is wrong (${r.host})`,
      "NET API is off (File > Options > General > Net API)",
    ];
  }
  return [
    "Workbench is not running",
    "NET API is off (File > Options > General > Net API)",
  ];
}

/** The "what to check" list for a broken connection, keyed by observed state. */
function whatToCheck(r: DiagnosticReport): string[] {
  switch (r.netApi) {
    case "refused":
      return refusedChecklist(r);
    case "timeout":
      return r.bridged
        ? [
            "The bridge is forwarding to a dead port (Workbench closed or mid-launch)",
            "NET API is off (File > Options > General > Net API)",
          ]
        : ["Workbench is mid-launch or hung", "A firewall or port conflict is blocking the reply"];
    case "up_no_handlers":
      return [
        "Are the EnfusionMCP handlers installed in the open mod?",
        "Does that mod have script compile errors preventing compilation?",
        "Is Workbench open with that mod's .gproj loaded? Run `wb_launch` to (re)install and compile handlers.",
      ];
    default:
      return [];
  }
}

/** One-line verdict: observed state + primary action. */
function verdict(r: DiagnosticReport): string {
  switch (r.netApi) {
    case "up_with_handlers":
      return `✅ CONNECTED — mode: ${r.mode}. All wb_* tools available.`;
    case "up_no_handlers":
      return "⚠️ PORT OPEN, HANDLERS NOT LOADED — run `wb_launch` to install and compile handlers.";
    case "refused":
      return "❌ NOT REACHABLE — Workbench is down, NET API is off, or the bridge is broken. See the checklist below.";
    case "timeout":
      return "❌ PORT OPEN BUT NO REPLY — check the bridge / Workbench. See the checklist below.";
    default:
      return `❌ ERROR — ${r.netApiError ?? "unknown error probing the NET API"}.`;
  }
}

/** Config-hygiene warnings — evaluated regardless of the connection verdict. */
function warnings(r: DiagnosticReport): string[] {
  const out: string[] = [];

  if (!r.bundledScripts.exists) {
    out.push("Bundled handler scripts are missing from the package — re-install enfusion-mcp.");
  }
  if (r.standaloneAddon.exists && r.installedMods.length > 0) {
    out.push(
      "A standalone addon AND mod-injected handlers coexist — this causes duplicate-class errors. " +
        `Run \`wb_launch\` to clean up the standalone addon automatically, or delete it: \`${r.standaloneAddon.path}\``
    );
  }
  if (r.netApi === "up_no_handlers" && r.installedMods.length === 0) {
    out.push(
      "NET API is up but no handler scripts are installed anywhere — nothing to compile. " +
        "Run `wb_launch` with a `gprojPath` to inject handlers into the correct mod."
    );
  }
  // ENFUSION_WORKBENCH_HOST set but the resolved host is loopback: self-contradictory.
  if (process.env.ENFUSION_WORKBENCH_HOST && !r.bridged) {
    out.push(
      `ENFUSION_WORKBENCH_HOST is set but resolves to a loopback address (${r.host}) — ` +
        "bridged intent with a loopback target. The bridge is likely misconfigured."
    );
  }
  // Exe configured but missing — only meaningful where a local exe is expected.
  if (r.workbenchExe && !r.workbenchExe.exists && r.env !== "linux") {
    out.push(
      `Workbench executable not found on disk — \`${r.workbenchExe.path}\`. ` +
        "Install Arma Reforger Tools from Steam, or set ENFUSION_WORKBENCH_PATH."
    );
  }

  return out;
}

export function registerWbDiagnose(server: McpServer, client: WorkbenchClient): void {
  server.registerTool(
    "wb_diagnose",
    {
      description:
        "Run a full diagnostic of the EnfusionMCP ↔ Workbench connection. " +
        "Reports a verdict, an environment-aware checklist when the connection is broken, live mode, " +
        "config-hygiene warnings, and raw evidence. Read-only — never launches Workbench. " +
        "Use this when wb_launch fails or wb_connect returns errors.",
      inputSchema: {},
    },
    async () => {
      const r = await client.diagnose();
      const lines: string[] = ["## EnfusionMCP Diagnostic Report\n"];

      // 1. Verdict
      lines.push(`### Verdict`);
      lines.push(verdict(r));

      // 2. What to check — only when the connection is broken.
      const checks = r.netApi === "up_with_handlers" ? [] : whatToCheck(r);
      if (checks.length > 0) {
        lines.push("\n### What to check");
        checks.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
      }

      // 3. Connection & Mode — observed state + live mode.
      lines.push("\n### Connection & Mode");
      lines.push(`- **NET API:** ${r.host}:${r.port} — ${r.netApi}`);
      lines.push(`- **Environment:** ${r.env}${r.bridged ? " (bridged / non-loopback host)" : " (loopback host)"}`);
      const modeText = r.netApi === "up_with_handlers" ? r.mode : "unknown (not connected)";
      lines.push(`- **Mode:** ${modeText}`);

      // 4. Warnings — always evaluated.
      const warns = warnings(r);
      if (warns.length > 0) {
        lines.push("\n### ⚠️ Warnings");
        for (const w of warns) lines.push(`- ${w}`);
      }

      // 5. Evidence — demoted config / handler-scripts / raw error.
      lines.push("\n### Evidence");
      if (r.workbenchExe) {
        lines.push(`- **Workbench Exe:** ${r.workbenchExe.exists ? "FOUND" : "NOT FOUND"} — \`${r.workbenchExe.path}\``);
      } else {
        lines.push("- **Workbench Exe:** config not loaded");
      }
      if (r.projectPath) {
        lines.push(`- **Project Path:** ${r.projectPath.exists ? "EXISTS" : "NOT FOUND"} — \`${r.projectPath.path}\``);
      } else {
        lines.push("- **Project Path:** not configured");
      }
      lines.push(`- **Default Mod:** ${r.defaultMod ?? "(not set)"}`);
      lines.push(`- **Bundled scripts:** ${r.bundledScripts.exists ? "FOUND" : "MISSING"} — \`${r.bundledScripts.path}\``);
      {
        const mark = r.standaloneAddon.exists
          ? `EXISTS (${r.standaloneAddon.fileCount} .c files) — should be absent when injecting into a mod`
          : "not present (correct)";
        lines.push(`- **Standalone addon:** ${mark} — \`${r.standaloneAddon.path}\``);
      }
      if (r.installedMods.length === 0) {
        lines.push("- **Installed in mods:** none found");
      } else {
        for (const m of r.installedMods) {
          lines.push(`- **Installed:** ${m.fileCount} .c files → \`${m.handlerDir}\``);
        }
      }
      if (r.netApiError) {
        lines.push(`- **Raw NET API error:** \`${r.netApiError}\``);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
