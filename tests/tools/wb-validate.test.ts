import { describe, it, expect } from "vitest";
import { validateTools } from "../../src/tools/wb-validate.js";

const t = validateTools[0];

describe("wb_validate — exported data seam", () => {
  it("exports a single tool named wb_validate with no guard", () => {
    expect(validateTools.map((e) => e.name)).toEqual(["wb_validate"]);
    expect(t.requireMode).toBeUndefined();
    expect(t.validate).toBeUndefined();
  });
});

describe("wb_validate — formatter", () => {
  it("renders a passing material validation", () => {
    const { text } = t.formatter({
      result: { valid: true, errors: [], warnings: [] },
      input: { action: "material", path: "Materials/M.emat" },
    });
    expect(text).toContain("**Material Validation Passed**");
    expect(text).toContain("- **Path:** Materials/M.emat");
    expect(text).toContain("- **Status:** Valid");
  });

  it("treats a missing valid flag as passing", () => {
    const { text } = t.formatter({
      result: {},
      input: { action: "texture", path: "Textures/T.edds" },
    });
    expect(text).toContain("**Texture Validation Passed**");
    expect(text).toContain("- **Status:** Valid");
  });

  it("renders a failing validation with error and warning lists", () => {
    const { text } = t.formatter({
      result: {
        valid: false,
        errors: ["missing channel", { message: "bad ref" }],
        warnings: [{ message: "unused" }, "loose"],
      },
      input: { action: "material", path: "Materials/Bad.emat" },
    });
    expect(text).toContain("**Material Validation Failed**");
    expect(text).toContain("- **Status:** Invalid");
    expect(text).toContain("### Errors (2)");
    expect(text).toContain("- missing channel");
    expect(text).toContain("- bad ref");
    expect(text).toContain("### Warnings (2)");
    expect(text).toContain("- unused");
    expect(text).toContain("- loose");
  });

  it("marks valid=true but non-empty errors as failed", () => {
    const { text } = t.formatter({
      result: { valid: true, errors: ["still broken"] },
      input: { action: "material", path: "Materials/M.emat" },
    });
    expect(text).toContain("**Material Validation Failed**");
  });

  it("appends extra info when present", () => {
    const { text } = t.formatter({
      result: { valid: true, info: "compiled in 3ms" },
      input: { action: "texture", path: "Textures/T.edds" },
    });
    expect(text).toContain("### Info");
    expect(text).toContain("compiled in 3ms");
  });
});
