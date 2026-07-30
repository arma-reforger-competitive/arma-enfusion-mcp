import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const terrainTool = defineWorkbenchTool({
  name: "wb_terrain",
  description:
    "Query terrain information. Get the terrain height at a world coordinate or get the world bounds (min/max extents).",
  inputSchema: {
    action: z
      .enum(["getHeight", "getBounds"])
      .describe("Action: getHeight (sample terrain Y at x,z) or getBounds (world extents)"),
    x: z
      .number()
      .optional()
      .describe("World X coordinate (required for getHeight)"),
    z: z
      .number()
      .optional()
      .describe("World Z coordinate (required for getHeight)"),
  },
  validate: ({ action, x, z }) =>
    action === "getHeight" && (x === undefined || z === undefined)
      ? "Error: `x` and `z` coordinates are required for getHeight."
      : null,
  apiFunc: ({ action, x, z }, client) => {
    // Send x/z as strings — Enfusion RegV for float ignores JSON integers
    // (no decimal point), so "6400" as a number → 0.0, but "6400" as a string → parsed via ToFloat()
    const params: Record<string, unknown> = { action };
    if (x !== undefined) params.x = String(x);
    if (z !== undefined) params.z = String(z);
    return client.call<Record<string, unknown>>("EMCP_WB_Terrain", params);
  },
  formatter: ({ result, input }) => {
    const { action, x, z } = input;

    if (action === "getHeight") {
      const height = result.height ?? result.y ?? "unknown";
      return {
        text: `**Terrain Height**\n\n- **Position:** (${x}, ${z})\n- **Height (Y):** ${height}`,
      };
    }

    // getBounds
    const lines = ["**World Bounds**\n"];
    if (result.minX !== undefined) lines.push(`- **Min X:** ${result.minX}`);
    if (result.minZ !== undefined) lines.push(`- **Min Z:** ${result.minZ}`);
    if (result.maxX !== undefined) lines.push(`- **Max X:** ${result.maxX}`);
    if (result.maxZ !== undefined) lines.push(`- **Max Z:** ${result.maxZ}`);
    if (result.sizeX !== undefined) lines.push(`- **Size X:** ${result.sizeX}`);
    if (result.sizeZ !== undefined) lines.push(`- **Size Z:** ${result.sizeZ}`);
    if (result.gridSize !== undefined) lines.push(`- **Grid Size:** ${result.gridSize}`);

    // Fallback if the response has different keys
    if (lines.length === 1) {
      lines.push(JSON.stringify(result, null, 2));
    }

    return { text: lines.join("\n") };
  },
});

/** The terrain-query tool, migrated to the envelope. */
export const terrainTools: WorkbenchTool[] = [terrainTool];
