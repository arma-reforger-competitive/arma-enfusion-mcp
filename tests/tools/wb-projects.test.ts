import { describe, it, expect } from "vitest";
import { projectTools } from "../../src/tools/wb-projects.js";

const t = projectTools[0];

describe("wb_projects — exported data seam", () => {
  it("exports a single tool named wb_projects", () => {
    expect(projectTools.map((e) => e.name)).toEqual(["wb_projects"]);
  });

  it("has no mode guard (querying/opening projects works in any mode)", () => {
    expect(t.requireMode).toBeUndefined();
  });
});

describe("wb_projects — validate", () => {
  it("rejects open without a name", () => {
    expect(t.validate!({ action: "open" })).toBe(
      "Error: `name` is required for the open action. Provide the .gproj file path or addon name."
    );
  });

  it("rejects locate without a name", () => {
    expect(t.validate!({ action: "locate" })).toBe(
      "Error: `name` is required for the locate action."
    );
  });

  it("accepts open/locate with a name and list with none", () => {
    expect(t.validate!({ action: "open", name: "MyMod" })).toBeNull();
    expect(t.validate!({ action: "locate", name: "MyMod" })).toBeNull();
    expect(t.validate!({ action: "list" })).toBeNull();
  });
});

describe("wb_projects — formatter", () => {
  it("renders open with the loaded name and an optional server message", () => {
    expect(
      t.formatter({ result: {}, input: { action: "open", name: "MyMod.gproj" } }).text
    ).toBe("**Project Opened**\n\nLoaded: MyMod.gproj");
    expect(
      t.formatter({ result: { message: "already loaded" }, input: { action: "open", name: "MyMod.gproj" } }).text
    ).toBe("**Project Opened**\n\nLoaded: MyMod.gproj\nalready loaded");
  });

  it("renders locate with path fallbacks and an optional GUID", () => {
    expect(
      t.formatter({ result: { path: "D:/mods/MyMod" }, input: { action: "locate", name: "MyMod" } }).text
    ).toBe("**Project Located**\n\n- **Name:** MyMod\n- **Path:** D:/mods/MyMod");
    // falls back to projectPath, then to "(not found)"
    expect(
      t.formatter({ result: { projectPath: "D:/alt", guid: "{ABC}" }, input: { action: "locate", name: "MyMod" } }).text
    ).toBe("**Project Located**\n\n- **Name:** MyMod\n- **Path:** D:/alt\n- **GUID:** {ABC}");
    expect(
      t.formatter({ result: {}, input: { action: "locate", name: "MyMod" } }).text
    ).toContain("- **Path:** (not found)");
  });

  it("reports when no projects are loaded", () => {
    expect(t.formatter({ result: { projects: [] }, input: { action: "list" } }).text).toBe(
      "**No projects loaded** in Workbench."
    );
  });

  it("lists projects from the primary `projects` key, falling back to id for the name", () => {
    const { text } = t.formatter({
      result: { projects: [{ id: "addon-42" }] },
      input: { action: "list" },
    });
    expect(text).toContain("**Loaded Projects** (1)");
    expect(text).toContain("- **addon-42**");
  });

  it("lists projects from the addons fallback, string and object entries", () => {
    const { text } = t.formatter({
      result: {
        addons: [
          "PlainString",
          { name: "MyMod", path: "D:/mods/MyMod", guid: "{ABC}" },
          {},
        ],
      },
      input: { action: "list" },
    });
    expect(text).toContain("**Loaded Projects** (3)");
    expect(text).toContain("- PlainString");
    expect(text).toContain("- **MyMod** - D:/mods/MyMod ({ABC})");
    expect(text).toContain("- **(unnamed)**");
  });
});
