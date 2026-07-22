import { describe, it, expect } from "vitest";
import { scriptEditorTools } from "../../src/tools/wb-script-editor.js";

const t = scriptEditorTools[0];

describe("wb_script_editor — exported data seam", () => {
  it("exports a single tool named wb_script_editor", () => {
    expect(scriptEditorTools.map((e) => e.name)).toEqual(["wb_script_editor"]);
  });

  it("guards edit mode only for line-mutating actions, with the original phrasing", () => {
    expect(t.requireMode!({ action: "setLine" })).toBe("edit");
    expect(t.requireMode!({ action: "insertLine" })).toBe("edit");
    expect(t.requireMode!({ action: "removeLine" })).toBe("edit");
    expect(t.requireMode!({ action: "getLine" })).toBeNull();
    expect(t.requireMode!({ action: "getCurrentFile" })).toBeNull();
    expect((t.modeAction as (i: unknown) => string)({ action: "setLine" })).toBe(
      "setLine in script editor"
    );
  });
});

describe("wb_script_editor — validate", () => {
  it("requires a line number for the line actions (0 is valid)", () => {
    for (const action of ["getLine", "setLine", "insertLine", "removeLine"]) {
      expect(t.validate!({ action })).toBe(`Error: \`line\` number is required for the "${action}" action.`);
    }
    expect(t.validate!({ action: "getLine", line: 0 })).toBeNull();
  });

  it("requires text for setLine/insertLine once a line is present (empty string is valid)", () => {
    expect(t.validate!({ action: "setLine", line: 1 })).toBe('Error: `text` is required for the "setLine" action.');
    expect(t.validate!({ action: "insertLine", line: 1 })).toBe('Error: `text` is required for the "insertLine" action.');
    expect(t.validate!({ action: "setLine", line: 1, text: "" })).toBeNull();
  });

  it("requires a path for openFile and accepts read-only actions", () => {
    expect(t.validate!({ action: "openFile" })).toBe('Error: `path` is required for the "openFile" action.');
    expect(t.validate!({ action: "openFile", path: "Scripts/A.c" })).toBeNull();
    expect(t.validate!({ action: "getCurrentFile" })).toBeNull();
    expect(t.validate!({ action: "getLinesCount" })).toBeNull();
  });
});

describe("wb_script_editor — formatter", () => {
  it("renders getCurrentFile with key fallbacks", () => {
    expect(t.formatter({ result: { path: "A.c" }, input: { action: "getCurrentFile" } }).text).toBe(
      "**Current Script File:** A.c"
    );
    expect(t.formatter({ result: { file: "B.c" }, input: { action: "getCurrentFile" } }).text).toBe(
      "**Current Script File:** B.c"
    );
    expect(t.formatter({ result: {}, input: { action: "getCurrentFile" } }).text).toBe(
      "**Current Script File:** (no file open)"
    );
  });

  it("renders getLine and getLinesCount with their fallbacks", () => {
    expect(t.formatter({ result: { content: "int x;" }, input: { action: "getLine", line: 4 } }).text).toBe(
      "**Line 4:**\n```\nint x;\n```"
    );
    expect(t.formatter({ result: { linesCount: 42 }, input: { action: "getLinesCount" } }).text).toBe(
      "**Line Count:** 42"
    );
    expect(t.formatter({ result: {}, input: { action: "getLinesCount" } }).text).toBe(
      "**Line Count:** unknown"
    );
  });

  it("renders the mutation confirmations echoing the input", () => {
    expect(t.formatter({ result: {}, input: { action: "setLine", line: 3, text: "x" } }).text).toBe(
      "**Line 3 Updated**\n\nNew content:\n```\nx\n```"
    );
    expect(t.formatter({ result: {}, input: { action: "insertLine", line: 3, text: "y" } }).text).toBe(
      "**Line Inserted** at position 3\n\nContent:\n```\ny\n```"
    );
    expect(t.formatter({ result: {}, input: { action: "removeLine", line: 3 } }).text).toBe(
      "**Line 3 Removed**"
    );
    expect(t.formatter({ result: { text: "old" }, input: { action: "removeLine", line: 3 } }).text).toBe(
      "**Line 3 Removed**\n\nRemoved content:\n```\nold\n```"
    );
  });

  it("renders openFile echoing the path", () => {
    expect(t.formatter({ result: {}, input: { action: "openFile", path: "Scripts/A.c" } }).text).toBe(
      "**Opened:** Scripts/A.c"
    );
  });
});
