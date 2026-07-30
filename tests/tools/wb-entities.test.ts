import { describe, it, expect } from "vitest";
import { entityTools } from "../../src/tools/wb-entities.js";
import type { WorkbenchTool } from "../../src/workbench/define-tool.js";

/** Look a migrated tool up by name (the exported data is the test seam). */
function tool(name: string): WorkbenchTool {
  const t = entityTools.find((e) => e.name === name);
  if (!t) throw new Error(`tool ${name} not found in entityTools`);
  return t;
}

describe("entityTools — exported data seam", () => {
  it("exports the six wb_entity_* tools", () => {
    expect(entityTools.map((t) => t.name).sort()).toEqual([
      "wb_entity_create",
      "wb_entity_delete",
      "wb_entity_inspect",
      "wb_entity_list",
      "wb_entity_modify",
      "wb_entity_select",
    ]);
  });
});

describe("wb_entity_create — formatter echoes input", () => {
  const t = tool("wb_entity_create");

  it("requires edit mode with the original guard phrase", () => {
    expect(t.requireMode!({})).toBe("edit");
    expect(t.modeAction).toBe("create entity");
  });

  it("renders prefab/position/rotation/layer from input and name/id from result", () => {
    const { text } = t.formatter({
      result: { name: "Soldier_01", id: "0xABC" },
      input: { prefab: "{GUID}Prefabs/Soldier.et", position: "1 2 3", rotation: "0 90 0", layerPath: "default/A" },
    });
    expect(text).toContain("**Entity Created**");
    expect(text).toContain("- **Name:** Soldier_01");
    expect(text).toContain("- **Prefab:** {GUID}Prefabs/Soldier.et");
    expect(text).toContain("- **Position:** 1 2 3");
    expect(text).toContain("- **Rotation:** 0 90 0");
    expect(text).toContain("- **Layer:** default/A");
    expect(text).toContain("- **ID:** 0xABC");
  });

  it("omits optional lines when absent", () => {
    const { text } = t.formatter({ result: {}, input: { prefab: "P.et" } });
    expect(text).toContain("- **Prefab:** P.et");
    expect(text).not.toContain("Position");
    expect(text).not.toContain("Name:");
    expect(text).not.toContain("ID:");
  });
});

describe("wb_entity_delete", () => {
  const t = tool("wb_entity_delete");

  it("requires edit mode with the original guard phrase", () => {
    expect(t.requireMode!({ name: "x" })).toBe("edit");
    expect(t.modeAction).toBe("delete entity");
  });

  it("echoes the deleted entity name", () => {
    const { text } = t.formatter({ result: {}, input: { name: "Barrel_3" } });
    expect(text).toBe("**Entity Deleted**\n\nRemoved entity: Barrel_3");
  });
});

describe("wb_entity_list", () => {
  const t = tool("wb_entity_list");

  it("has no mode guard", () => {
    expect(t.requireMode).toBeUndefined();
  });

  it("renders a paginated list with a more-not-shown note", () => {
    const { text } = t.formatter({
      result: { entities: [{ name: "A", prefab: "P.et", position: "1 1 1" }], total: 3, offset: 0 },
      input: { offset: 0, limit: 1 },
    });
    expect(text).toContain("**Entities** (showing 1 of 3, offset 0)");
    expect(text).toContain("1. **A** [P.et] at 1 1 1");
    expect(text).toContain("2 more entities not shown");
  });
});

describe("wb_entity_inspect — validate name-or-index", () => {
  const t = tool("wb_entity_inspect");

  it("rejects when neither name nor index provided", () => {
    expect(t.validate!({})).toBe("Error: Provide either `name` or `index` to identify the entity.");
  });

  it("proceeds when name is given", () => {
    expect(t.validate!({ name: "Foo" })).toBeNull();
  });

  it("proceeds when index is 0 (falsy but defined)", () => {
    expect(t.validate!({ index: 0 })).toBeNull();
  });

  it("labels by index when result has no name", () => {
    const { text } = t.formatter({ result: {}, input: { index: 5 } });
    expect(text).toContain("**Entity: index 5**");
  });

  it("prefers the result name", () => {
    const { text } = t.formatter({ result: { name: "Real" }, input: { name: "Query" } });
    expect(text).toContain("**Entity: Real**");
  });
});

describe("wb_entity_modify — guard, validate, action-label table", () => {
  const t = tool("wb_entity_modify");

  it("requires edit mode for mutating actions with the original guard phrase", () => {
    expect(t.requireMode!({ action: "move" })).toBe("edit");
    expect(t.requireMode!({ action: "setProperty" })).toBe("edit");
    expect(t.modeAction).toBe("modify entity");
  });

  it("allows read-only actions in any mode", () => {
    for (const action of ["getProperty", "listProperties", "listArrayItems", "getWorldTransform", "makeVisible"]) {
      expect(t.requireMode!({ action })).toBeNull();
    }
  });

  it("requires value for value-taking actions", () => {
    expect(t.validate!({ action: "move", value: "" })).toContain('"value" parameter is required');
    expect(t.validate!({ action: "rename" })).toContain('"value" parameter is required');
  });

  it("requires value for setProperty (but accepts empty string)", () => {
    expect(t.validate!({ action: "setProperty" })).toContain('"value" parameter is required');
    expect(t.validate!({ action: "setProperty", value: "" })).toBeNull();
  });

  it("does not require value for read-only actions", () => {
    expect(t.validate!({ action: "listProperties" })).toBeNull();
  });

  it("renders the action-label table", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: "E", action: "move", value: "1 2 3" }, "Moved to 1 2 3"],
      [{ name: "E", action: "rotate", value: "0 90 0" }, "Rotated to 0 90 0"],
      [{ name: "E", action: "rename", value: "New" }, 'Renamed to "New"'],
      [{ name: "E", action: "reparent", value: "Parent" }, 'Reparented to "Parent"'],
      [{ name: "E", action: "setProperty", propertyPath: "M.O", value: "v" }, "Set M.O = v"],
      [{ name: "E", action: "clearProperty", propertyKey: "K" }, "Cleared K"],
      [{ name: "E", action: "addArrayItem", value: "C", propertyKey: "arr", memberIndex: 2 }, "Added 'C' to 'arr' at index 2"],
      [{ name: "E", action: "removeArrayItem", propertyKey: "arr", memberIndex: 1 }, "Removed index 1 from 'arr'"],
      [{ name: "E", action: "setObjectClass", propertyKey: "K", value: "Cls" }, "Changed class of 'K' to 'Cls'"],
    ];
    for (const [input, expected] of cases) {
      const { text } = t.formatter({ result: {}, input });
      expect(text).toContain(`- **Action:** ${expected}`);
      expect(text).toContain(`- **Entity:** E`);
    }
  });

  it("appends the note when the result carries a message", () => {
    const { text } = t.formatter({ result: { message: "heads up" }, input: { name: "E", action: "makeVisible" } });
    expect(text).toContain("- **Note:** heads up");
  });

  it("renders getWorldTransform from the properties array", () => {
    const { text } = t.formatter({
      result: { properties: [{ name: "position", value: " 1 2 3 " }, { name: "rotation", value: "0 0 0" }] },
      input: { name: "E", action: "getWorldTransform" },
    });
    expect(text).toContain("**Transform: E**");
    expect(text).toContain("- **Position:** 1 2 3");
    expect(text).toContain("- **Rotation:** 0 0 0");
  });

  it("falls back to (unknown) when a transform property is missing", () => {
    const { text } = t.formatter({ result: { properties: [] }, input: { name: "E", action: "getWorldTransform" } });
    expect(text).toContain("- **Position:** (unknown)");
    expect(text).toContain("- **Rotation:** (unknown)");
  });

  it("renders a listProperties table", () => {
    const { text } = t.formatter({
      result: { properties: [{ name: "Health", value: "100" }, { name: "Armor", value: "" }] },
      input: { name: "E", action: "listProperties", propertyPath: "Damage" },
    });
    expect(text).toContain("**Properties of Damage** (2)");
    expect(text).toContain("| Health | 100 |");
    expect(text).toContain("| Armor |  |");
  });

  it("reports no properties without flagging an error", () => {
    const r = t.formatter({ result: { properties: [] }, input: { name: "E", action: "listProperties" } });
    expect(r.text).toBe("**No properties found.**");
    expect(r.isError).toBeUndefined();
  });
});

describe("wb_entity_select — validate and getSelected isError", () => {
  const t = tool("wb_entity_select");

  it("requires name for select/deselect", () => {
    expect(t.validate!({ action: "select" })).toContain("`name` is required");
    expect(t.validate!({ action: "deselect" })).toContain("`name` is required");
  });

  it("does not require name for clear/getSelected", () => {
    expect(t.validate!({ action: "clear" })).toBeNull();
    expect(t.validate!({ action: "getSelected" })).toBeNull();
  });

  it("flags isError when getSelected is empty", () => {
    const r = t.formatter({ result: { selected: [] }, input: { action: "getSelected" } });
    expect(r.text).toBe("**No entities selected.**");
    expect(r.isError).toBe(true);
  });

  it("lists selected entities without an error flag", () => {
    const r = t.formatter({ result: { selected: [{ name: "A" }, {}] }, input: { action: "getSelected" } });
    expect(r.text).toContain("**Selected Entities**");
    expect(r.text).toContain("- A");
    expect(r.text).toContain("- (unnamed)");
    expect(r.isError).toBeUndefined();
  });

  it("labels select/deselect/clear actions", () => {
    expect(t.formatter({ result: {}, input: { action: "select", name: "A" } }).text).toContain("**Selected: A**");
    expect(t.formatter({ result: {}, input: { action: "deselect", name: "A" } }).text).toContain("**Deselected: A**");
    expect(t.formatter({ result: {}, input: { action: "clear" } }).text).toContain("**Selection cleared**");
  });
});
