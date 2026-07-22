import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";
import { toEnginePath, normalizeOsPath } from "../utils/wsl-path.js";

const projectsTool = defineWorkbenchTool({
  name: "wb_projects",
  description:
    "Query project information from the Workbench. List all loaded addon projects, locate a specific project by name, or open a .gproj to load it into Workbench.",
  inputSchema: {
    action: z
      .enum(["list", "locate", "open"])
      .describe("Action: list (all loaded projects), locate (find specific project path), or open (load a .gproj into Workbench)"),
    name: z
      .string()
      .optional()
      .describe("Project/addon name to locate (required for locate action), or .gproj file path (required for open action)"),
  },
  validate: ({ action, name }) => {
    if (action === "open" && !name) {
      return "Error: `name` is required for the open action. Provide the .gproj file path or addon name.";
    }
    if (action === "locate" && !name) {
      return "Error: `name` is required for the locate action.";
    }
    return null;
  },
  apiFunc: ({ action, name }, client) => {
    if (action === "open") {
      // `name` may be an addon name or a .gproj file path in any form
      // (/mnt/..., D:\..., or D:/...). Normalize to WSL form then convert to
      // the Windows path the NET API expects, so all input forms round-trip
      // consistently. Addon names and resource paths pass through unchanged.
      return client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
        action: "openResource",
        path: toEnginePath(normalizeOsPath(name!)),
      });
    }
    if (action === "locate") {
      return client.call<Record<string, unknown>>("LocateProject", { name });
    }
    return client.call<Record<string, unknown>>("GetLoadedProjects");
  },
  formatter: ({ result, input }) => {
    const { action, name } = input;

    if (action === "open") {
      return {
        text: `**Project Opened**\n\nLoaded: ${name}${result.message ? `\n${result.message}` : ""}`,
      };
    }

    if (action === "locate") {
      const path = result.path || result.projectPath || "(not found)";
      return {
        text: `**Project Located**\n\n- **Name:** ${name}\n- **Path:** ${path}${result.guid ? `\n- **GUID:** ${result.guid}` : ""}`,
      };
    }

    // list
    const projects = Array.isArray(result.projects)
      ? result.projects
      : Array.isArray(result.addons)
        ? result.addons
        : [];

    if (projects.length === 0) {
      return { text: `**No projects loaded** in Workbench.` };
    }

    const lines = [`**Loaded Projects** (${projects.length})\n`];
    for (const proj of projects) {
      if (typeof proj === "string") {
        lines.push(`- ${proj}`);
      } else {
        const p = proj as Record<string, unknown>;
        const pName = p.name || p.id || "(unnamed)";
        const pPath = p.path ? ` - ${p.path}` : "";
        const pGuid = p.guid ? ` (${p.guid})` : "";
        lines.push(`- **${pName}**${pPath}${pGuid}`);
      }
    }

    return { text: lines.join("\n") };
  },
});

/** The project-query tool, migrated to the envelope. */
export const projectTools: WorkbenchTool[] = [projectsTool];
