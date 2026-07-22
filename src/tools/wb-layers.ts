import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_LAYER_ACTIONS = new Set(["create", "delete", "rename", "toggleLock"]);

const layersTool = defineWorkbenchTool({
  name: "wb_layers",
  description:
    "Manage layers in the World Editor. List layers, create/delete layers, rename, set active layer, query visibility, get layer info, or toggle lock. Create/delete/rename/toggleLock only work in edit mode.",
  inputSchema: {
    action: z
      .enum([
        "list",
        "create",
        "delete",
        "rename",
        "setActive",
        "setVisibility",
        "lock",
        "unlock",
        "isVisible",
        "getInfo",
        "toggleLock",
      ])
      .describe("Layer management action to perform"),
    subScene: z
      .number()
      .default(0)
      .describe("SubScene index (default 0, the main scene)"),
    layerPath: z
      .string()
      .optional()
      .describe("Layer path (e.g., 'default/MyLayer'). Required for most actions except list and create."),
    name: z
      .string()
      .optional()
      .describe("Layer name for create or new name for rename"),
    parentPath: z
      .string()
      .optional()
      .describe("Parent layer path for create (e.g., 'default')"),
    visible: z
      .boolean()
      .optional()
      .describe("Visibility state for setVisibility (true = visible, false = hidden)"),
  },
  requireMode: ({ action }) => (MUTATING_LAYER_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => `${action} layer`,
  apiFunc: ({ action, subScene, layerPath, name, parentPath, visible }, client) => {
    const params: Record<string, unknown> = { action, subScene };
    if (layerPath) params.layerPath = layerPath;
    if (name) params.name = name;
    if (parentPath) params.parentPath = parentPath;
    if (visible !== undefined) params.visible = visible;
    return client.call<Record<string, unknown>>("EMCP_WB_Layers", params);
  },
  formatter: ({ result, input }) => {
    const { action, subScene, layerPath, name, parentPath, visible } = input;

    if (action === "list") {
      const layers = Array.isArray(result.layers) ? result.layers : [];
      if (layers.length === 0) {
        return { text: `**No layers found.**` };
      }

      const lines = [`**Layers** (SubScene ${subScene})\n`];
      for (const layer of layers) {
        const l = layer as Record<string, unknown>;
        const path = l.path || l.name || "(unnamed)";
        const flags: string[] = [];
        if (l.active) flags.push("ACTIVE");
        if (l.locked) flags.push("LOCKED");
        if (l.visible === false) flags.push("HIDDEN");
        const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
        const entityCount = l.entityCount !== undefined ? ` (${l.entityCount} entities)` : "";
        lines.push(`- ${path}${flagStr}${entityCount}`);
      }

      if (result.activeLayer) {
        lines.push(`\nActive layer: **${result.activeLayer}**`);
      }

      return { text: lines.join("\n") };
    }

    if (action === "isVisible" || action === "getInfo") {
      const lines = [`**Layer ${layerPath || result.layerID}**\n`];
      if (result.layerVisible !== undefined) lines.push(`- **Visible:** ${result.layerVisible}`);
      if (result.layerLocked !== undefined) lines.push(`- **Locked:** ${result.layerLocked}`);
      if (result.layerActive !== undefined) lines.push(`- **Active:** ${result.layerActive}`);
      if (result.layerEntityCount !== undefined) lines.push(`- **Entities:** ${result.layerEntityCount}`);
      if (result.layerID !== undefined) lines.push(`- **Layer ID:** ${result.layerID}`);
      return { text: lines.join("\n") };
    }

    if (action === "toggleLock") {
      const nowLocked = result.layerLocked;
      return {
        text: `**Layer Lock Toggled**\n\nLayer "${layerPath}" is now ${nowLocked ? "locked" : "unlocked"}`,
      };
    }

    const actionLabels: Record<string, string> = {
      create: `Created layer "${name || "(unnamed)"}"${parentPath ? ` under ${parentPath}` : ""}`,
      delete: `Deleted layer "${layerPath}"`,
      rename: `Renamed layer "${layerPath}" to "${name}"`,
      setActive: `Set active layer to "${layerPath}"`,
      setVisibility: `Set "${layerPath}" visibility to ${visible ? "visible" : "hidden"}`,
      lock: `Locked layer "${layerPath}"`,
      unlock: `Unlocked layer "${layerPath}"`,
    };

    return {
      text: `**Layer Updated**\n\n${actionLabels[action] || action}${result.message ? `\n${result.message}` : ""}`,
    };
  },
});

/** The layer-management tool, migrated to the envelope. */
export const layerTools: WorkbenchTool[] = [layersTool];
