import { describe, it, expect } from "vitest";
import {
  detectWsl,
  toWindowsPath,
  toWslPath,
  normalizeOsPath,
  toEnginePath,
} from "../../src/utils/wsl-path.js";

describe("detectWsl", () => {
  it("detects WSL2 from the kernel release string", () => {
    expect(detectWsl("5.15.167.4-microsoft-standard-WSL2", "linux")).toBe(true);
  });

  it("detects WSL1 (Microsoft in release, any case)", () => {
    expect(detectWsl("4.4.0-19041-Microsoft", "linux")).toBe(true);
  });

  it("is false on a normal Linux kernel", () => {
    expect(detectWsl("6.1.0-generic", "linux")).toBe(false);
  });

  it("is false on native Windows", () => {
    expect(detectWsl("10.0.19045", "win32")).toBe(false);
  });

  it("is false on macOS", () => {
    expect(detectWsl("23.5.0", "darwin")).toBe(false);
  });
});

describe("toWindowsPath (WSL /mnt form -> Windows)", () => {
  it("converts a /mnt drive path to a backslashed Windows path", () => {
    expect(
      toWindowsPath("/mnt/d/ArmaReforgerWorkbench/FindAndDestroy/FindAndDestroy.gproj")
    ).toBe("D:\\ArmaReforgerWorkbench\\FindAndDestroy\\FindAndDestroy.gproj");
  });

  it("uppercases the drive letter", () => {
    expect(toWindowsPath("/mnt/c/Users/x")).toBe("C:\\Users\\x");
  });

  it("passes through an already-Windows path unchanged", () => {
    expect(toWindowsPath("D:\\already\\here")).toBe("D:\\already\\here");
  });

  it("passes through a non-/mnt Linux path unchanged (no drive mapping)", () => {
    expect(toWindowsPath("/home/yevhenii/foo")).toBe("/home/yevhenii/foo");
  });

  it("passes through an Enfusion resource path unchanged", () => {
    expect(toWindowsPath("Prefabs/Characters/foo.et")).toBe("Prefabs/Characters/foo.et");
  });
});

describe("toWslPath (Windows form -> WSL /mnt)", () => {
  it("converts a backslashed Windows path to /mnt form with lowercased drive", () => {
    expect(toWslPath("D:\\ArmaReforgerWorkbench\\FindAndDestroy")).toBe(
      "/mnt/d/ArmaReforgerWorkbench/FindAndDestroy"
    );
  });

  it("converts a forward-slash Windows path", () => {
    expect(toWslPath("D:/ArmaReforgerWorkbench/x")).toBe("/mnt/d/ArmaReforgerWorkbench/x");
  });

  it("passes through an already-/mnt path unchanged", () => {
    expect(toWslPath("/mnt/d/already")).toBe("/mnt/d/already");
  });

  it("passes through an Enfusion resource path unchanged", () => {
    expect(toWslPath("Prefabs/Characters/foo.et")).toBe("Prefabs/Characters/foo.et");
  });
});

describe("normalizeOsPath (canonical WSL form, gated on isWsl)", () => {
  it("converts a Windows path to WSL form when in WSL", () => {
    expect(normalizeOsPath("D:\\ArmaReforgerWorkbench\\x", true)).toBe(
      "/mnt/d/ArmaReforgerWorkbench/x"
    );
  });

  it("leaves a /mnt path unchanged when in WSL", () => {
    expect(normalizeOsPath("/mnt/d/x", true)).toBe("/mnt/d/x");
  });

  it("is a no-op when NOT in WSL (native Windows keeps its D: path)", () => {
    expect(normalizeOsPath("D:\\ArmaReforgerWorkbench\\x", false)).toBe(
      "D:\\ArmaReforgerWorkbench\\x"
    );
  });
});

describe("toEnginePath (Windows form for the exe/NET API, gated on isWsl)", () => {
  it("converts a /mnt path to a Windows path when in WSL", () => {
    expect(toEnginePath("/mnt/d/ArmaReforgerWorkbench/FindAndDestroy/FindAndDestroy.gproj", true)).toBe(
      "D:\\ArmaReforgerWorkbench\\FindAndDestroy\\FindAndDestroy.gproj"
    );
  });

  it("is a no-op when NOT in WSL (native Windows keeps its path)", () => {
    expect(toEnginePath("D:\\ArmaReforgerWorkbench\\x", false)).toBe(
      "D:\\ArmaReforgerWorkbench\\x"
    );
  });

  it("leaves a resource path unchanged even in WSL", () => {
    expect(toEnginePath("Prefabs/Characters/foo.et", true)).toBe("Prefabs/Characters/foo.et");
  });
});
