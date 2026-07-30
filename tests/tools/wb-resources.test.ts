import { describe, it, expect } from "vitest";
import { resourceTools } from "../../src/tools/wb-resources.js";

const t = resourceTools[0];

describe("wb_resources — exported data seam", () => {
  it("exports a single tool named wb_resources", () => {
    expect(resourceTools.map((e) => e.name)).toEqual(["wb_resources"]);
  });
});

describe("wb_resources — requireMode + modeAction", () => {
  it("requires edit mode only for register/rebuild", () => {
    expect(t.requireMode!({ action: "register" })).toBe("edit");
    expect(t.requireMode!({ action: "rebuild" })).toBe("edit");
    expect(t.requireMode!({ action: "browse" })).toBeNull();
    expect(t.requireMode!({ action: "getInfo" })).toBeNull();
    expect(t.requireMode!({ action: "open" })).toBeNull();
  });

  it("derives the guard phrase per action", () => {
    const modeAction = t.modeAction as (input: unknown) => string;
    expect(modeAction({ action: "register" })).toBe("register resource");
    expect(modeAction({ action: "rebuild" })).toBe("rebuild resource");
  });
});

describe("wb_resources — formatter", () => {
  it("renders a browse listing with a more-not-shown note", () => {
    const { text } = t.formatter({
      result: {
        entries: [{ path: "Prefabs/A.et", type: "Prefab" }],
        entryCount: 3,
      },
      input: { action: "browse", path: "Prefabs/" },
    });
    expect(text).toContain("**Resources matching `Prefabs/`** (1 of 3)");
    expect(text).toContain("- `Prefabs/A.et` *(Prefab)*");
    expect(text).toContain("*2 more not shown (cap 200).*");
  });

  it("renders an empty browse result without an error flag", () => {
    const r = t.formatter({
      result: { entries: [], message: "nothing here" },
      input: { action: "browse", path: "Missing/" },
    });
    expect(r.text).toContain("**No resources found** matching `Missing/`");
    expect(r.text).toContain("nothing here");
    expect(r.isError).toBeUndefined();
  });

  it("renders resource info with known and unknown keys", () => {
    const { text } = t.formatter({
      result: {
        guid: "0xABC",
        type: "Prefab",
        size: 128,
        dependencies: ["Dep/A.et", "Dep/B.et"],
        custom: { nested: true },
      },
      input: { action: "getInfo", path: "Prefabs/A.et" },
    });
    expect(text).toContain("**Resource Info**");
    expect(text).toContain("- **Path:** Prefabs/A.et");
    expect(text).toContain("- **GUID:** 0xABC");
    expect(text).toContain("- **Type:** Prefab");
    expect(text).toContain("- **Size:** 128");
    expect(text).toContain("### Dependencies (2)");
    expect(text).toContain("- Dep/A.et");
    expect(text).toContain('- **custom:** {"nested":true}');
  });

  it("labels register/rebuild/open success", () => {
    expect(
      t.formatter({ result: {}, input: { action: "register", path: "P.et" } }).text
    ).toContain("**Registered resource: P.et**");
    expect(
      t.formatter({ result: {}, input: { action: "rebuild", path: "P.et" } }).text
    ).toContain("**Rebuilt resource database for: P.et**");
    expect(
      t.formatter({ result: { message: "done" }, input: { action: "open", path: "P.et" } }).text
    ).toContain("**Opened resource: P.et**\n\ndone");
  });
});
