import { describe, it, expect } from "vitest";
import { componentTools } from "../../src/tools/wb-components.js";

const t = componentTools[0];

describe("wb_component — exported data seam", () => {
  it("exports a single tool named wb_component", () => {
    expect(componentTools.map((e) => e.name)).toEqual(["wb_component"]);
  });
});

describe("wb_component — requireMode + modeAction", () => {
  it("requires edit mode only for add/remove", () => {
    expect(t.requireMode!({ action: "add" })).toBe("edit");
    expect(t.requireMode!({ action: "remove" })).toBe("edit");
    expect(t.requireMode!({ action: "list" })).toBeNull();
  });

  it("derives the guard phrase from the action", () => {
    const modeAction = t.modeAction as (input: unknown) => string;
    expect(modeAction({ action: "add" })).toBe("add component");
    expect(modeAction({ action: "remove" })).toBe("remove component");
  });
});

describe("wb_component — validate", () => {
  it("requires componentClass for add/remove", () => {
    expect(t.validate!({ action: "add", entityName: "E" })).toContain(
      '`componentClass` is required for the "add"'
    );
    expect(t.validate!({ action: "remove", entityName: "E" })).toContain(
      '`componentClass` is required for the "remove"'
    );
    expect(t.validate!({ action: "add", entityName: "E", componentClass: "RigidBody" })).toBeNull();
  });

  it("does not require componentClass for list", () => {
    expect(t.validate!({ action: "list", entityName: "E" })).toBeNull();
  });
});

describe("wb_component — formatter", () => {
  it("reports an entity with no components", () => {
    expect(t.formatter({ result: { components: [] }, input: { entityName: "E", action: "list" } }).text).toBe(
      "**E** has no components."
    );
  });

  it("lists components, falling back across className/type and showing property counts", () => {
    const { text } = t.formatter({
      result: {
        components: [
          { className: "RigidBody", propertyCount: 4 },
          { type: "MeshObject" },
          {},
        ],
      },
      input: { entityName: "E", action: "list" },
    });
    expect(text).toContain("**Components on E** (3)");
    expect(text).toContain("0. **RigidBody** (4 properties)");
    expect(text).toContain("1. **MeshObject**");
    expect(text).toContain("2. **Unknown**");
  });

  it("renders an added component with an optional note", () => {
    expect(
      t.formatter({ result: {}, input: { entityName: "E", action: "add", componentClass: "RigidBody" } }).text
    ).toBe("**Component Added**\n\n- **Entity:** E\n- **Component:** RigidBody");
    expect(
      t.formatter({
        result: { message: "attached" },
        input: { entityName: "E", action: "add", componentClass: "RigidBody" },
      }).text
    ).toContain("- **Note:** attached");
  });

  it("renders a removed component", () => {
    expect(
      t.formatter({ result: {}, input: { entityName: "E", action: "remove", componentClass: "RigidBody" } }).text
    ).toContain("**Component Removed**");
  });
});
