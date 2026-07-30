import { describe, it, expect } from "vitest";
import { stateTools } from "../../src/tools/wb-state.js";

const t = stateTools[0];

describe("wb_state — exported data seam", () => {
  it("exports a single tool named wb_state with no guard or validate", () => {
    expect(stateTools.map((e) => e.name)).toEqual(["wb_state"]);
    expect(t.requireMode).toBeUndefined();
    expect(t.validate).toBeUndefined();
  });
});

describe("wb_state — formatter", () => {
  it("renders every field of a full snapshot", () => {
    const { text } = t.formatter({
      result: {
        mode: "edit",
        entityCount: 42,
        selectedCount: 2,
        selectedNames: ["Tree_01", "Rock_02"],
        currentSubScene: "MainScene",
        isPrefabEditMode: false,
        boundsMin: "0,0,0",
        boundsMax: "12800,0,12800",
        message: "all good",
      },
      input: {},
    });
    expect(text).toBe(
      [
        "**Workbench State**\n",
        "- **Mode:** edit",
        "- **Entity Count:** 42",
        "- **Selected:** 2",
        "- **Selected Entities:** Tree_01, Rock_02",
        "- **Sub-Scene:** MainScene",
        "- **Prefab Edit Mode:** false",
        "- **Terrain Bounds:** 0,0,0 to 12800,0,12800",
        "\nall good",
      ].join("\n")
    );
  });

  it("renders zero-valued numeric fields (count/selected 0 are not dropped)", () => {
    const { text } = t.formatter({
      result: { mode: "play", entityCount: 0, selectedCount: 0, isPrefabEditMode: true },
      input: {},
    });
    expect(text).toContain("- **Entity Count:** 0");
    expect(text).toContain("- **Selected:** 0");
    expect(text).toContain("- **Prefab Edit Mode:** true");
  });

  it("filters non-string and empty selected names, and omits the line when none survive", () => {
    const withGarbage = t.formatter({
      result: { selectedCount: 3, selectedNames: ["Keep", "", 7, null] },
      input: {},
    }).text;
    expect(withGarbage).toContain("- **Selected Entities:** Keep");

    const allGarbage = t.formatter({
      result: { selectedCount: 2, selectedNames: ["", null] },
      input: {},
    }).text;
    expect(allGarbage).not.toContain("Selected Entities");
  });

  it("shows terrain bounds with a '?' placeholder when only one extent is present", () => {
    expect(t.formatter({ result: { boundsMin: "0,0,0" }, input: {} }).text).toContain(
      "- **Terrain Bounds:** 0,0,0 to ?"
    );
    expect(t.formatter({ result: { boundsMax: "1,1,1" }, input: {} }).text).toContain(
      "- **Terrain Bounds:** ? to 1,1,1"
    );
  });

  it("renders just the header when the snapshot is empty", () => {
    expect(t.formatter({ result: {}, input: {} }).text).toBe("**Workbench State**\n");
  });
});
