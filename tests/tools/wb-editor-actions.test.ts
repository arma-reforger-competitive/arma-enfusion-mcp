import { describe, it, expect } from "vitest";
import { editorActionTools } from "../../src/tools/wb-editor-actions.js";
import { runWorkbenchTool } from "../../src/workbench/define-tool.js";
import { WorkbenchError } from "../../src/workbench/client.js";
import { fakeClient, FOOTER } from "../workbench/fake-client.js";

const byName = (name: string) => {
  const tool = editorActionTools.find((e) => e.name === name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool;
};

const save = byName("wb_save");
const undoRedo = byName("wb_undo_redo");
const openResource = byName("wb_open_resource");

describe("wb-editor-actions — exported data seam", () => {
  it("exports the three single-call editor actions", () => {
    expect(editorActionTools.map((e) => e.name)).toEqual([
      "wb_save",
      "wb_undo_redo",
      "wb_open_resource",
    ]);
  });

  it("guards only wb_save, and does so as 'save'", () => {
    expect(save.requireMode?.({})).toBe("edit");
    expect(save.modeAction).toBe("save");
    expect(undoRedo.requireMode).toBeUndefined();
    expect(openResource.requireMode).toBeUndefined();
  });
});

describe("wb_save — formatter", () => {
  it("reports a plain save", () => {
    expect(save.formatter({ result: { pending: false, result: {} }, input: {} }).text).toBe(
      "**Save Complete**\n\nWorld saved."
    );
  });

  it("echoes the Save As path from the input and appends the handler message", () => {
    const { text } = save.formatter({
      result: { pending: false, result: { message: "2 layers written" } },
      input: { path: "worlds/MyWorld.ent" },
    });
    expect(text).toBe("**Save Complete**\n\nSaved as: worlds/MyWorld.ent\n2 layers written");
  });

  it("renders a pending save without flagging an error", () => {
    const { text, isError } = save.formatter({ result: { pending: true }, input: {} });
    expect(text).toContain("**Save Pending**");
    expect(text).toContain("requires user confirmation");
    expect(isError).toBeUndefined();
  });
});

describe("wb_undo_redo — formatter", () => {
  it("labels the action from the input, not the result", () => {
    expect(undoRedo.formatter({ result: {}, input: { action: "undo" } }).text).toBe(
      "**Undo Complete**"
    );
    expect(undoRedo.formatter({ result: {}, input: { action: "redo" } }).text).toBe(
      "**Redo Complete**"
    );
  });

  it("appends the handler message when present", () => {
    expect(
      undoRedo.formatter({ result: { message: "reverted 1 change" }, input: { action: "undo" } })
        .text
    ).toBe("**Undo Complete**\n\nreverted 1 change");
  });
});

describe("wb_open_resource — formatter", () => {
  it("echoes the requested path", () => {
    expect(
      openResource.formatter({ result: {}, input: { path: "Prefabs/Weapons/AK47.et" } }).text
    ).toBe("**Resource Opened**\n\nOpened: Prefabs/Weapons/AK47.et");
  });

  it("appends the handler message when present", () => {
    expect(
      openResource.formatter({
        result: { message: "opened in Prefab Editor" },
        input: { path: "a.et" },
      }).text
    ).toBe("**Resource Opened**\n\nOpened: a.et\nopened in Prefab Editor");
  });
});

describe("wb_save — through the envelope", () => {
  it("treats a TIMEOUT as a pending save, not an error", async () => {
    const res = await runWorkbenchTool(
      save,
      {},
      fakeClient({
        call: () => Promise.reject(new WorkbenchError("call timed out after 30000ms", "TIMEOUT")),
      })
    );
    expect(res.content[0].text).toContain("**Save Pending**");
    expect(res.content[0].text).toContain(FOOTER);
    expect(res.isError).toBeUndefined();
  });

  it("lets any other failure fall through to the envelope's error path", async () => {
    const err = new WorkbenchError("refused", "CONNECTION_REFUSED");
    err.hint = "Workbench not reachable. Run `wb_launch`.";

    const res = await runWorkbenchTool(save, {}, fakeClient({ call: () => Promise.reject(err) }));
    expect(res.content[0].text).toContain("Error: Workbench not reachable. Run `wb_launch`.");
    expect(res.content[0].text).not.toContain("**Save Pending**");
    expect(res.isError).toBe(true);
  });

  it("blocks in play mode with the original 'save' wording", async () => {
    const res = await runWorkbenchTool(save, {}, fakeClient({ state: { mode: "play" } }));
    expect(res.content[0].text).toContain("Cannot save while in play mode");
    expect(res.isError).toBeUndefined();
  });
});
