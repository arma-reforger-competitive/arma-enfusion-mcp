import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const stateTool = defineWorkbenchTool({
  name: "wb_state",
  description:
    "Get a full snapshot of the current Workbench state. Returns mode (edit/play), entity count, selected entity count and names, terrain bounds, sub-scene, and prefab edit status.",
  inputSchema: {},
  apiFunc: (_input, client) => client.call<Record<string, unknown>>("EMCP_WB_GetState"),
  formatter: ({ result }) => {
    const lines: string[] = ["**Workbench State**\n"];

    if (result.mode) lines.push(`- **Mode:** ${result.mode}`);
    if (result.entityCount !== undefined) lines.push(`- **Entity Count:** ${result.entityCount}`);
    if (result.selectedCount !== undefined) lines.push(`- **Selected:** ${result.selectedCount}`);

    // Selected entity names (handler packs as selectedNames array)
    if (Array.isArray(result.selectedNames) && result.selectedNames.length > 0) {
      const names = result.selectedNames.filter((n: unknown) => typeof n === "string" && n.length > 0);
      if (names.length > 0) {
        lines.push(`- **Selected Entities:** ${names.join(", ")}`);
      }
    }

    if (result.currentSubScene !== undefined) lines.push(`- **Sub-Scene:** ${result.currentSubScene}`);
    if (result.isPrefabEditMode !== undefined) lines.push(`- **Prefab Edit Mode:** ${result.isPrefabEditMode}`);

    if (result.boundsMin || result.boundsMax) {
      lines.push(`- **Terrain Bounds:** ${result.boundsMin || "?"} to ${result.boundsMax || "?"}`);
    }

    if (result.message) lines.push(`\n${result.message}`);

    return { text: lines.join("\n") };
  },
});

/** The state-snapshot probe, migrated to the envelope. */
export const stateTools: WorkbenchTool[] = [stateTool];
