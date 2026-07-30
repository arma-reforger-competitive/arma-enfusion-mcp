import { describe, it, expect } from "vitest";
import { layerTools } from "../../src/tools/wb-layers.js";

const t = layerTools[0];

describe("wb_layers — exported data seam", () => {
  it("exports a single tool named wb_layers", () => {
    expect(layerTools.map((e) => e.name)).toEqual(["wb_layers"]);
  });
});

describe("wb_layers — requireMode + modeAction", () => {
  it("requires edit mode only for mutating actions", () => {
    for (const action of ["create", "delete", "rename", "toggleLock"]) {
      expect(t.requireMode!({ action })).toBe("edit");
    }
    for (const action of ["list", "setActive", "setVisibility", "lock", "unlock", "isVisible", "getInfo"]) {
      expect(t.requireMode!({ action })).toBeNull();
    }
  });

  it("derives the guard phrase from the action", () => {
    const modeAction = t.modeAction as (input: unknown) => string;
    expect(modeAction({ action: "create" })).toBe("create layer");
    expect(modeAction({ action: "delete" })).toBe("delete layer");
  });
});

describe("wb_layers — formatter", () => {
  it("reports when no layers are found for list", () => {
    expect(t.formatter({ result: { layers: [] }, input: { action: "list", subScene: 0 } }).text).toBe(
      "**No layers found.**"
    );
  });

  it("lists layers with flags, entity counts, and the active layer", () => {
    const { text } = t.formatter({
      result: {
        layers: [
          { path: "default", active: true, entityCount: 3 },
          { name: "Secret", locked: true, visible: false },
          {},
        ],
        activeLayer: "default",
      },
      input: { action: "list", subScene: 2 },
    });
    expect(text).toContain("**Layers** (SubScene 2)");
    expect(text).toContain("- default [ACTIVE] (3 entities)");
    expect(text).toContain("- Secret [LOCKED, HIDDEN]");
    expect(text).toContain("- (unnamed)");
    expect(text).toContain("Active layer: **default**");
  });

  it("renders layer info, skipping undefined fields", () => {
    const { text } = t.formatter({
      result: { layerVisible: true, layerLocked: false, layerID: 7 },
      input: { action: "getInfo", layerPath: "default/A" },
    });
    expect(text).toContain("**Layer default/A**");
    expect(text).toContain("- **Visible:** true");
    expect(text).toContain("- **Locked:** false");
    expect(text).toContain("- **Layer ID:** 7");
    expect(text).not.toContain("**Active:**");
  });

  it("falls back to layerID in the info heading when no path given", () => {
    const { text } = t.formatter({
      result: { layerID: 42 },
      input: { action: "isVisible" },
    });
    expect(text).toContain("**Layer 42**");
  });

  it("renders the toggled lock state", () => {
    expect(
      t.formatter({ result: { layerLocked: true }, input: { action: "toggleLock", layerPath: "default/A" } }).text
    ).toBe('**Layer Lock Toggled**\n\nLayer "default/A" is now locked');
    expect(
      t.formatter({ result: { layerLocked: false }, input: { action: "toggleLock", layerPath: "default/A" } }).text
    ).toContain("is now unlocked");
  });

  it("renders create with parent and optional server note", () => {
    const { text } = t.formatter({
      result: { message: "layer id 5" },
      input: { action: "create", name: "MyLayer", parentPath: "default" },
    });
    expect(text).toContain("**Layer Updated**");
    expect(text).toContain('Created layer "MyLayer" under default');
    expect(text).toContain("layer id 5");
  });

  it("renders setVisibility using the visible flag", () => {
    expect(
      t.formatter({ result: {}, input: { action: "setVisibility", layerPath: "default/A", visible: false } }).text
    ).toContain('Set "default/A" visibility to hidden');
    expect(
      t.formatter({ result: {}, input: { action: "setVisibility", layerPath: "default/A", visible: true } }).text
    ).toContain("visibility to visible");
  });

  it("renders a rename", () => {
    expect(
      t.formatter({ result: {}, input: { action: "rename", layerPath: "default/Old", name: "New" } }).text
    ).toContain('Renamed layer "default/Old" to "New"');
  });
});
