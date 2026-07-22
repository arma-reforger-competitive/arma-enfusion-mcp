import { describe, it, expect } from "vitest";
import { prefabTools } from "../../src/tools/wb-prefabs.js";

const t = prefabTools[0];

describe("wb_prefabs — exported data seam", () => {
  it("exports a single tool named wb_prefabs", () => {
    expect(prefabTools.map((e) => e.name)).toEqual(["wb_prefabs"]);
  });
});

describe("wb_prefabs — requireMode + modeAction", () => {
  it("requires edit mode only for createTemplate/save", () => {
    expect(t.requireMode!({ action: "createTemplate" })).toBe("edit");
    expect(t.requireMode!({ action: "save" })).toBe("edit");
    expect(t.requireMode!({ action: "getGuid" })).toBeNull();
    expect(t.requireMode!({ action: "locate" })).toBeNull();
    expect(t.requireMode!({ action: "getAncestor" })).toBeNull();
  });

  it("derives the guard phrase per mutating action", () => {
    const modeAction = t.modeAction as (input: unknown) => string;
    expect(modeAction({ action: "createTemplate" })).toBe("create template");
    expect(modeAction({ action: "save" })).toBe("save prefab");
  });
});

describe("wb_prefabs — validate", () => {
  it("requires templatePath or searchPath for getGuid", () => {
    expect(t.validate!({ action: "getGuid" })).toContain("Provide `templatePath`");
    expect(t.validate!({ action: "getGuid", templatePath: "P.et" })).toBeNull();
    expect(t.validate!({ action: "getGuid", searchPath: "Prefabs/" })).toBeNull();
  });

  it("requires searchPath for locate", () => {
    expect(t.validate!({ action: "locate" })).toContain("Provide `searchPath`");
    expect(t.validate!({ action: "locate", searchPath: "Prefabs/" })).toBeNull();
  });

  it("requires entityName for getAncestor", () => {
    expect(t.validate!({ action: "getAncestor" })).toContain("`entityName` is required for getAncestor");
    expect(t.validate!({ action: "getAncestor", entityName: "E" })).toBeNull();
  });

  it("requires entityName for createTemplate/save", () => {
    expect(t.validate!({ action: "createTemplate" })).toContain('`entityName` is required for the "createTemplate"');
    expect(t.validate!({ action: "save" })).toContain('`entityName` is required for the "save"');
    expect(t.validate!({ action: "createTemplate", entityName: "E" })).toBeNull();
  });
});

describe("wb_prefabs — formatter", () => {
  it("renders a GUID lookup, falling back across guid/GUID keys", () => {
    expect(
      t.formatter({ result: { guid: "0x1" }, input: { action: "getGuid", templatePath: "P.et" } }).text
    ).toContain("- **GUID:** 0x1");
    expect(
      t.formatter({ result: { GUID: "0x2" }, input: { action: "getGuid", searchPath: "Q.et" } }).text
    ).toContain("- **GUID:** 0x2");
    expect(
      t.formatter({ result: {}, input: { action: "getGuid", templatePath: "P.et" } }).text
    ).toContain("- **GUID:** (not found)");
  });

  it("lists located prefabs from strings and objects", () => {
    const { text } = t.formatter({
      result: { prefabs: ["A.et", { path: "B.et" }, { name: "C" }] },
      input: { action: "locate", searchPath: "Prefabs/" },
    });
    expect(text).toContain("**Prefabs in Prefabs/** (3)");
    expect(text).toContain("- A.et");
    expect(text).toContain("- B.et");
    expect(text).toContain("- C");
  });

  it("reports no prefabs found", () => {
    const { text } = t.formatter({
      result: { prefabs: [] },
      input: { action: "locate", searchPath: "Empty/" },
    });
    expect(text).toContain("**No prefabs found** in: Empty/");
  });

  it("renders the ancestor prefab, defaulting to (none)", () => {
    expect(
      t.formatter({ result: { ancestorPath: "Base.et" }, input: { action: "getAncestor", entityName: "E" } }).text
    ).toContain("- **Ancestor:** Base.et");
    expect(
      t.formatter({ result: {}, input: { action: "getAncestor", entityName: "E" } }).text
    ).toContain("- **Ancestor:** (none)");
  });

  it("renders a created template, echoing the input path and result guid", () => {
    const { text } = t.formatter({
      result: { guid: "0xABC" },
      input: { action: "createTemplate", entityName: "E", templatePath: "Prefabs/E.et" },
    });
    expect(text).toContain("**Template Created**");
    expect(text).toContain("- **Entity:** E");
    expect(text).toContain("- **Path:** Prefabs/E.et");
    expect(text).toContain("- **GUID:** 0xABC");
  });

  it("renders a saved prefab with an optional note", () => {
    expect(
      t.formatter({ result: {}, input: { action: "save", entityName: "E" } }).text
    ).toBe("**Prefab Saved**\n\n- **Entity:** E");
    expect(
      t.formatter({ result: { message: "wrote 2 files" }, input: { action: "save", entityName: "E" } }).text
    ).toContain("- **Note:** wrote 2 files");
  });
});
