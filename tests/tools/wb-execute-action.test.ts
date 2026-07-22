import { describe, it, expect } from "vitest";
import { executeActionTools } from "../../src/tools/wb-execute-action.js";

const t = executeActionTools[0];

describe("wb_execute_action — exported data seam", () => {
  it("exports a single tool named wb_execute_action", () => {
    expect(executeActionTools.map((e) => e.name)).toEqual(["wb_execute_action"]);
  });

  it("always requires edit mode, phrased with the menu path", () => {
    expect(t.requireMode!({ menuPath: "File,Save" })).toBe("edit");
    expect((t.modeAction as (i: unknown) => string)({ menuPath: "File,Save" })).toBe(
      'execute menu action "File,Save"'
    );
  });
});

describe("wb_execute_action — validate (destructive-path block)", () => {
  it("blocks known-destructive prefixes, trimming whitespace", () => {
    expect(t.validate!({ menuPath: "File,Close" })).toBe(
      '**Blocked:** "File,Close" is a destructive action and cannot be executed via this tool. Perform it manually in Workbench.'
    );
    expect(t.validate!({ menuPath: "  File,New,Scenario  " })).toContain("**Blocked:**");
    expect(t.validate!({ menuPath: "File,Exit" })).toContain("**Blocked:**");
    expect(t.validate!({ menuPath: "File,Quit" })).toContain("**Blocked:**");
  });

  it("allows non-destructive menu paths", () => {
    expect(t.validate!({ menuPath: "File,Save" })).toBeNull();
    expect(t.validate!({ menuPath: "Tools,Reload Scripts" })).toBeNull();
    expect(t.validate!({ menuPath: "Edit,Undo" })).toBeNull();
  });
});

describe("wb_execute_action — formatter", () => {
  it("echoes the menu path and appends message and result when present", () => {
    expect(t.formatter({ result: {}, input: { menuPath: "File,Save" } }).text).toBe(
      "**Action Executed**\n\nMenu path: File,Save"
    );
    expect(
      t.formatter({ result: { message: "done", result: { ok: 1 } }, input: { menuPath: "File,Save" } }).text
    ).toBe('**Action Executed**\n\nMenu path: File,Save\ndone\nResult: {"ok":1}');
  });
});
