import { describe, it, expect } from "vitest";
import { terrainTools } from "../../src/tools/wb-terrain.js";

const t = terrainTools[0];

describe("wb_terrain — exported data seam", () => {
  it("exports a single tool named wb_terrain with no mode guard", () => {
    expect(terrainTools.map((e) => e.name)).toEqual(["wb_terrain"]);
    expect(t.requireMode).toBeUndefined();
  });
});

describe("wb_terrain — validate", () => {
  it("rejects getHeight without both coordinates", () => {
    expect(t.validate!({ action: "getHeight" })).toBe(
      "Error: `x` and `z` coordinates are required for getHeight."
    );
    expect(t.validate!({ action: "getHeight", x: 5 })).toContain("required for getHeight");
    expect(t.validate!({ action: "getHeight", z: 5 })).toContain("required for getHeight");
  });

  it("accepts getHeight with both coordinates (including zero) and getBounds", () => {
    expect(t.validate!({ action: "getHeight", x: 0, z: 0 })).toBeNull();
    expect(t.validate!({ action: "getBounds" })).toBeNull();
  });
});

describe("wb_terrain — formatter", () => {
  it("renders getHeight echoing the input position and the height key fallback", () => {
    expect(t.formatter({ result: { height: 12.5 }, input: { action: "getHeight", x: 100, z: 200 } }).text).toBe(
      "**Terrain Height**\n\n- **Position:** (100, 200)\n- **Height (Y):** 12.5"
    );
    expect(t.formatter({ result: { y: 7 }, input: { action: "getHeight", x: 1, z: 2 } }).text).toContain(
      "**Height (Y):** 7"
    );
    expect(t.formatter({ result: {}, input: { action: "getHeight", x: 1, z: 2 } }).text).toContain(
      "**Height (Y):** unknown"
    );
  });

  it("renders only the bounds keys that are present", () => {
    const { text } = t.formatter({
      result: { minX: 0, maxX: 12800, gridSize: 4 },
      input: { action: "getBounds" },
    });
    expect(text).toBe("**World Bounds**\n\n- **Min X:** 0\n- **Max X:** 12800\n- **Grid Size:** 4");
  });

  it("dumps the raw result when no known bounds keys are present", () => {
    const { text } = t.formatter({ result: { odd: 1 }, input: { action: "getBounds" } });
    expect(text).toBe(`**World Bounds**\n\n${JSON.stringify({ odd: 1 }, null, 2)}`);
  });
});
