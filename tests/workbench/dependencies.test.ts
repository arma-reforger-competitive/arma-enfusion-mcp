import { describe, it, expect } from "vitest";
import {
  parseOwnGuid,
  parseDeps,
  parseRegistryFilePaths,
} from "../../src/workbench/dependencies.js";

describe("parseOwnGuid", () => {
  it("parses a bare GUID (FindAndDestroy style)", () => {
    expect(parseOwnGuid("GameProject {\n ID FindAndDestroy\n GUID DCB86D202425D516\n"))
      .toBe("DCB86D202425D516");
  });

  it("parses a quoted GUID (PlayableSelector style)", () => {
    expect(parseOwnGuid('GameProject {\n ID "ReforgerLobby"\n GUID "5EAF2B0473DB5A99"\n'))
      .toBe("5EAF2B0473DB5A99");
  });

  it("uppercases lowercase hex", () => {
    expect(parseOwnGuid("GUID dcb86d202425d516")).toBe("DCB86D202425D516");
  });

  it("returns null when no GUID is present", () => {
    expect(parseOwnGuid("GameProject { ID Foo }")).toBeNull();
  });
});

describe("parseDeps", () => {
  it("parses one-GUID-per-line quoted dependencies", () => {
    const gproj = `GameProject {
 GUID DCB86D202425D516
 Dependencies {
  "58D0FB3206B6F859"
  "5EAF2B0473DB5A99"
 }
}`;
    expect(parseDeps(gproj)).toEqual(["58D0FB3206B6F859", "5EAF2B0473DB5A99"]);
  });

  it("parses multiple GUIDs on one line (PlayableSelector style)", () => {
    const gproj = `Dependencies {
  "58D0FB3206B6F859" "1337133713371337"
 }`;
    expect(parseDeps(gproj)).toEqual(["58D0FB3206B6F859", "1337133713371337"]);
  });

  it("returns an empty array when there is no Dependencies block", () => {
    expect(parseDeps("GameProject { GUID DCB86D202425D516 }")).toEqual([]);
  });

  it("does not pick up GUIDs outside the Dependencies block", () => {
    const gproj = `GUID AAAAAAAAAAAAAAAA
 Dependencies {
  "58D0FB3206B6F859"
 }`;
    expect(parseDeps(gproj)).toEqual(["58D0FB3206B6F859"]);
  });
});

describe("parseRegistryFilePaths", () => {
  it("extracts every FilePath entry from a project-list conf", () => {
    const conf = `WBProjectList {
 Projects {
  WBProjectListItem {
   FilePath "D:/ArmaReforgerWorkbench/FindAndDestroy/FindAndDestroy.gproj"
  }
  WBProjectListItem {
   FilePath "D:/DownloadedMods/addons/PSCore_1337133713371337/addon.gproj"
  }
 }
}`;
    expect(parseRegistryFilePaths(conf)).toEqual([
      "D:/ArmaReforgerWorkbench/FindAndDestroy/FindAndDestroy.gproj",
      "D:/DownloadedMods/addons/PSCore_1337133713371337/addon.gproj",
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(parseRegistryFilePaths("WBProjectList { Projects { } }")).toEqual([]);
  });
});
