import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

/** Actions that mutate the resource database — require edit mode. */
const MUTATING_RESOURCE_ACTIONS = new Set(["register", "rebuild"]);

const resourcesTool = defineWorkbenchTool({
  name: "wb_resources",
  description:
    "Manage Workbench resources. Register new resources, rebuild resource databases, get resource info, or open a resource in its editor.",
  inputSchema: {
    action: z
      .enum(["register", "rebuild", "getInfo", "open", "browse"])
      .describe(
        "Action: register (add resource to DB), rebuild (regenerate resource DB), getInfo (resource metadata), open (open in editor), browse (list resources by path prefix)"
      ),
    path: z
      .string()
      .describe(
        "Resource path or path prefix. Required for all actions. For browse: use a prefix like 'Prefabs/Characters/' to find matching resources."
      ),
    buildRuntime: z
      .boolean()
      .optional()
      .describe("Build runtime data during register/rebuild (slower but ensures assets are ready)"),
  },
  requireMode: ({ action }) => (MUTATING_RESOURCE_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => `${action} resource`,
  apiFunc: ({ action, path, buildRuntime }, client) => {
    if (action === "getInfo") {
      // Use built-in GetResourceInfo handler
      return client.call<Record<string, unknown>>("GetResourceInfo", { path });
    }
    if (action === "browse") {
      return client.call<Record<string, unknown>>("EMCP_WB_Resources", { action, path });
    }
    // register, rebuild, open all use EMCP_WB_Resources
    const params: Record<string, unknown> = { action, path };
    if (buildRuntime !== undefined) params.buildRuntime = buildRuntime;
    return client.call<Record<string, unknown>>("EMCP_WB_Resources", params);
  },
  formatter: ({ result, input }) => {
    const { action, path } = input;

    if (action === "browse") {
      const entries = Array.isArray(result.entries) ? result.entries : [];
      const total = typeof result.entryCount === "number" ? result.entryCount : entries.length;

      if (entries.length === 0) {
        return { text: `**No resources found** matching \`${path}\`\n\n${result.message || ""}` };
      }
      const lines = [`**Resources matching \`${path}\`** (${entries.length} of ${total})\n`];
      for (const entry of entries) {
        const e = entry as Record<string, unknown>;
        lines.push(`- \`${e.path}\` *(${e.type || "?"})*`);
      }
      if (total > entries.length) {
        lines.push(`\n*${total - entries.length} more not shown (cap 200).*`);
      }
      return { text: lines.join("\n") };
    }

    if (action === "getInfo") {
      const lines = [`**Resource Info**\n`];
      lines.push(`- **Path:** ${path}`);
      if (result.guid) lines.push(`- **GUID:** ${result.guid}`);
      if (result.type) lines.push(`- **Type:** ${result.type}`);
      if (result.size !== undefined) lines.push(`- **Size:** ${result.size}`);
      if (result.lastModified) lines.push(`- **Modified:** ${result.lastModified}`);
      if (result.dependencies && Array.isArray(result.dependencies)) {
        lines.push(`\n### Dependencies (${result.dependencies.length})`);
        for (const dep of result.dependencies) {
          lines.push(`- ${dep}`);
        }
      }

      // Fallback for unknown response shapes
      const knownKeys = new Set(["guid", "type", "size", "lastModified", "dependencies", "path"]);
      for (const [key, val] of Object.entries(result)) {
        if (!knownKeys.has(key) && val !== undefined) {
          lines.push(`- **${key}:** ${typeof val === "object" ? JSON.stringify(val) : val}`);
        }
      }

      return { text: lines.join("\n") };
    }

    // register, rebuild, open
    const actionLabels: Record<string, string> = {
      register: `Registered resource: ${path}`,
      rebuild: `Rebuilt resource database for: ${path}`,
      open: `Opened resource: ${path}`,
    };

    return { text: `**${actionLabels[action]}**${result.message ? `\n\n${result.message}` : ""}` };
  },
});

/** The resource-management tool, migrated to the envelope. */
export const resourceTools: WorkbenchTool[] = [resourcesTool];
