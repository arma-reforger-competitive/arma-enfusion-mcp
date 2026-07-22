import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_PREFAB_ACTIONS = new Set(["createTemplate", "save"]);

const prefabsTool = defineWorkbenchTool({
  name: "wb_prefabs",
  description:
    "Prefab operations in the Workbench. Create entity templates, save prefab changes, look up prefab GUIDs, or locate prefabs by path. createTemplate/save only work in edit mode.",
  inputSchema: {
    action: z
      .enum(["createTemplate", "save", "getGuid", "locate", "getAncestor"])
      .describe(
        "Action: createTemplate (create .et from entity), save (save prefab changes), getGuid (look up GUID), locate (find prefabs in path), getAncestor (get the ancestor prefab path of a scene entity)"
      ),
    entityName: z
      .string()
      .optional()
      .describe("Entity name (required for createTemplate and save)"),
    templatePath: z
      .string()
      .optional()
      .describe("Output path for createTemplate (e.g., 'Prefabs/Custom/MyEntity.et')"),
    searchPath: z
      .string()
      .optional()
      .describe("Directory path for locate (e.g., 'Prefabs/Weapons')"),
  },
  requireMode: ({ action }) => (MUTATING_PREFAB_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => (action === "createTemplate" ? "create template" : "save prefab"),
  validate: ({ action, entityName, templatePath, searchPath }) => {
    if (action === "getGuid" && !templatePath && !searchPath) {
      return "Error: Provide `templatePath` (prefab resource path) for getGuid.";
    }
    if (action === "locate" && !searchPath) {
      return "Error: Provide `searchPath` for the locate action.";
    }
    if (action === "getAncestor" && !entityName) {
      return "Error: `entityName` is required for getAncestor.";
    }
    if ((action === "createTemplate" || action === "save") && !entityName) {
      return `Error: \`entityName\` is required for the "${action}" action.`;
    }
    return null;
  },
  apiFunc: ({ action, entityName, templatePath, searchPath }, client) => {
    if (action === "getGuid") {
      return client.call<Record<string, unknown>>("GetPrefabGUID", {
        path: templatePath || searchPath,
      });
    }
    if (action === "locate") {
      return client.call<Record<string, unknown>>("LocatePrefabsFromPath", {
        path: searchPath,
      });
    }
    if (action === "getAncestor") {
      return client.call<Record<string, unknown>>("EMCP_WB_Prefabs", {
        action: "getAncestor",
        entityName,
      });
    }
    // createTemplate and save use EMCP_WB_Prefabs
    const params: Record<string, unknown> = { action, entityName };
    if (templatePath) params.templatePath = templatePath;
    return client.call<Record<string, unknown>>("EMCP_WB_Prefabs", params);
  },
  formatter: ({ result, input }) => {
    const { action, entityName, templatePath, searchPath } = input;

    if (action === "getGuid") {
      return {
        text: `**Prefab GUID**\n\n- **Path:** ${templatePath || searchPath}\n- **GUID:** ${result.guid || result.GUID || "(not found)"}`,
      };
    }

    if (action === "locate") {
      const prefabs = Array.isArray(result.prefabs) ? result.prefabs : [];
      if (prefabs.length === 0) {
        return { text: `**No prefabs found** in: ${searchPath}` };
      }

      const lines = [`**Prefabs in ${searchPath}** (${prefabs.length})\n`];
      for (const p of prefabs) {
        if (typeof p === "string") {
          lines.push(`- ${p}`);
        } else {
          const pObj = p as Record<string, unknown>;
          lines.push(`- ${pObj.path || pObj.name || JSON.stringify(pObj)}`);
        }
      }
      return { text: lines.join("\n") };
    }

    if (action === "getAncestor") {
      return {
        text: `**Ancestor Prefab**\n\n- **Entity:** ${entityName}\n- **Ancestor:** ${result.ancestorPath || "(none)"}`,
      };
    }

    if (action === "createTemplate") {
      return {
        text: `**Template Created**\n\n- **Entity:** ${entityName}\n- **Path:** ${templatePath || result.path || "(auto)"}${result.guid ? `\n- **GUID:** ${result.guid}` : ""}`,
      };
    }

    // save
    return {
      text: `**Prefab Saved**\n\n- **Entity:** ${entityName}${result.message ? `\n- **Note:** ${result.message}` : ""}`,
    };
  },
});

/** The prefab-operations tool, migrated to the envelope. */
export const prefabTools: WorkbenchTool[] = [prefabsTool];
