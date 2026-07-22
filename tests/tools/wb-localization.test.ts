import { describe, it, expect } from "vitest";
import { localizationTools } from "../../src/tools/wb-localization.js";

const t = localizationTools[0];

describe("wb_localization — exported data seam", () => {
  it("exports a single tool named wb_localization", () => {
    expect(localizationTools.map((e) => e.name)).toEqual(["wb_localization"]);
  });

  it("guards edit mode only for mutating actions, with the original phrasing", () => {
    expect(t.requireMode!({ action: "insert" })).toBe("edit");
    expect(t.requireMode!({ action: "delete" })).toBe("edit");
    expect(t.requireMode!({ action: "modify" })).toBe("edit");
    expect(t.requireMode!({ action: "getTable" })).toBeNull();
    expect(t.requireMode!({ action: "listLanguages" })).toBeNull();
    expect((t.modeAction as (i: unknown) => string)({ action: "insert" })).toBe(
      "insert localization entry"
    );
  });
});

describe("wb_localization — validate", () => {
  it("rejects mutating actions without an itemId", () => {
    expect(t.validate!({ action: "insert" })).toBe('Error: `itemId` is required for the "insert" action.');
    expect(t.validate!({ action: "delete" })).toBe('Error: `itemId` is required for the "delete" action.');
    expect(t.validate!({ action: "modify" })).toBe('Error: `itemId` is required for the "modify" action.');
  });

  it("rejects modify without a property once itemId is present", () => {
    expect(t.validate!({ action: "modify", itemId: "MENU_PLAY" })).toBe(
      "Error: `property` is required for the modify action."
    );
  });

  it("accepts valid mutations and read-only actions", () => {
    expect(t.validate!({ action: "insert", itemId: "MENU_PLAY" })).toBeNull();
    expect(t.validate!({ action: "modify", itemId: "MENU_PLAY", property: "en_us" })).toBeNull();
    expect(t.validate!({ action: "getTable" })).toBeNull();
    expect(t.validate!({ action: "listLanguages" })).toBeNull();
  });
});

describe("wb_localization — formatter", () => {
  it("renders an empty and a populated table", () => {
    expect(t.formatter({ result: { entries: [] }, input: { action: "getTable" } }).text).toBe(
      "**Localization Table:** Empty (no entries)"
    );
    const { text } = t.formatter({
      result: { entries: [{ id: "A", en_us: "Play", target: "Jouer" }, { itemId: "B", source: "Exit" }] },
      input: { action: "getTable" },
    });
    expect(text).toContain("**Localization Table** (2 entries)");
    expect(text).toContain("| A | Play | Jouer |");
    expect(text).toContain("| B | Exit |  |");
  });

  it("renders language columns, empty and populated", () => {
    expect(
      t.formatter({ result: { languages: [], message: "none" }, input: { action: "listLanguages" } }).text
    ).toBe("**No language columns detected.**\n\nnone");
    expect(
      t.formatter({ result: { languages: ["en_us", "fr_fr"] }, input: { action: "listLanguages" } }).text
    ).toBe("**Language Columns** (2)\n\n- en_us\n- fr_fr");
  });

  it("renders each mutation with its label and an optional server message", () => {
    expect(t.formatter({ result: {}, input: { action: "insert", itemId: "X" } }).text).toBe(
      "**Localization Updated**\n\nInserted localization entry: **X**"
    );
    expect(t.formatter({ result: {}, input: { action: "delete", itemId: "X" } }).text).toBe(
      "**Localization Updated**\n\nDeleted localization entry: **X**"
    );
    expect(
      t.formatter({
        result: { message: "saved" },
        input: { action: "modify", itemId: "X", property: "en_us", value: "Go" },
      }).text
    ).toBe('**Localization Updated**\n\nModified **X**.en_us = "Go"\nsaved');
  });
});
