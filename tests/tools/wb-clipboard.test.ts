import { describe, it, expect } from "vitest";
import { clipboardTools } from "../../src/tools/wb-clipboard.js";

const t = clipboardTools[0];

describe("wb_clipboard — exported data seam", () => {
  it("exports a single tool named wb_clipboard", () => {
    expect(clipboardTools.map((e) => e.name)).toEqual(["wb_clipboard"]);
  });
});

describe("wb_clipboard — requireMode", () => {
  it("guards edit mode only for mutating actions", () => {
    expect(t.requireMode!({ action: "paste" })).toBe("edit");
    expect(t.requireMode!({ action: "pasteAtCursor" })).toBe("edit");
    expect(t.requireMode!({ action: "cut" })).toBe("edit");
    expect(t.requireMode!({ action: "duplicate" })).toBe("edit");
    expect(t.requireMode!({ action: "copy" })).toBeNull();
    expect(t.requireMode!({ action: "hasCopied" })).toBeNull();
  });

  it("phrases the blocked-guard action as the bare action name", () => {
    expect((t.modeAction as (i: unknown) => string)({ action: "paste" })).toBe("paste");
  });
});

describe("wb_clipboard — formatter", () => {
  it("reports clipboard content for hasCopied via either result key", () => {
    expect(t.formatter({ result: { hasCopied: true }, input: { action: "hasCopied" } }).text).toBe(
      "**Clipboard:** Has content"
    );
    expect(t.formatter({ result: { result: true }, input: { action: "hasCopied" } }).text).toBe(
      "**Clipboard:** Has content"
    );
    expect(t.formatter({ result: {}, input: { action: "hasCopied" } }).text).toBe(
      "**Clipboard:** Empty"
    );
  });

  it("labels each mutating action and appends count and message when present", () => {
    expect(t.formatter({ result: {}, input: { action: "copy" } }).text).toBe("**Copied to clipboard**");
    expect(
      t.formatter({ result: { count: 3, message: "ok" }, input: { action: "paste" } }).text
    ).toBe("**Pasted from clipboard**\nEntities affected: 3\nok");
  });

  it("falls back to the raw action name for an unknown label", () => {
    expect(t.formatter({ result: {}, input: { action: "weird" } }).text).toBe("**weird**");
  });
});
