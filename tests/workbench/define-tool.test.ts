import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  defineWorkbenchTool,
  runWorkbenchTool,
} from "../../src/workbench/define-tool.js";
import { WorkbenchError } from "../../src/workbench/client.js";
import { fakeClient, FOOTER } from "./fake-client.js";

describe("runWorkbenchTool — envelope orchestration", () => {
  it("runs validate → apiFunc → formatter and appends the footer on success", async () => {
    const apiFunc = vi.fn(async () => ({ ok: true }));
    const tool = defineWorkbenchTool({
      name: "t",
      description: "d",
      inputSchema: { x: z.string() },
      apiFunc,
      formatter: ({ result, input }) => ({ text: `x=${input.x} ok=${result.ok}` }),
    });

    const res = await runWorkbenchTool(tool, { x: "hi" }, fakeClient());
    expect(apiFunc).toHaveBeenCalledOnce();
    expect(res.content[0].text).toContain("x=hi ok=true");
    expect(res.content[0].text).toContain(FOOTER);
    expect(res.isError).toBeUndefined();
  });

  it("rejects on validate before any I/O, with footer and isError", async () => {
    const apiFunc = vi.fn(async () => ({}));
    const tool = defineWorkbenchTool({
      name: "t",
      description: "d",
      inputSchema: { x: z.string().optional() },
      validate: () => "Error: bad usage",
      apiFunc,
      formatter: () => ({ text: "unreached" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient());
    expect(apiFunc).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain("Error: bad usage");
    expect(res.content[0].text).toContain(FOOTER);
    expect(res.isError).toBe(true);
  });

  it("blocks on the mode guard before any I/O (no isError, with footer)", async () => {
    const apiFunc = vi.fn(async () => ({}));
    const tool = defineWorkbenchTool({
      name: "wb_thing",
      description: "d",
      inputSchema: { x: z.string().optional() },
      requireMode: () => "edit",
      apiFunc,
      formatter: () => ({ text: "unreached" }),
    });

    // Fresh play mode → an edit-mode guard blocks.
    const res = await runWorkbenchTool(tool, {}, fakeClient({ state: { mode: "play" } }));
    expect(apiFunc).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain("play mode");
    expect(res.content[0].text).toContain(FOOTER);
    expect(res.isError).toBeUndefined();
  });

  it("uses modeAction (not the tool name) in the guard-block phrase", async () => {
    const tool = defineWorkbenchTool({
      name: "wb_entity_create",
      description: "d",
      inputSchema: { x: z.string().optional() },
      requireMode: () => "edit",
      modeAction: "create entity",
      apiFunc: async () => ({}),
      formatter: () => ({ text: "unreached" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient({ state: { mode: "play" } }));
    expect(res.content[0].text).toContain("Cannot create entity while in play mode");
    expect(res.content[0].text).not.toContain("wb_entity_create");
  });

  it("resolves a function modeAction against the input for the guard phrase", async () => {
    const tool = defineWorkbenchTool({
      name: "wb_resources",
      description: "d",
      inputSchema: { action: z.enum(["register", "rebuild"]) },
      requireMode: () => "edit",
      modeAction: ({ action }) => `${action} resource`,
      apiFunc: async () => ({}),
      formatter: () => ({ text: "unreached" }),
    });

    const register = await runWorkbenchTool(tool, { action: "register" }, fakeClient({ state: { mode: "play" } }));
    expect(register.content[0].text).toContain("Cannot register resource while in play mode");

    const rebuild = await runWorkbenchTool(tool, { action: "rebuild" }, fakeClient({ state: { mode: "play" } }));
    expect(rebuild.content[0].text).toContain("Cannot rebuild resource while in play mode");
  });

  it("falls back to the tool name when modeAction is omitted", async () => {
    const tool = defineWorkbenchTool({
      name: "wb_thing",
      description: "d",
      inputSchema: {},
      requireMode: () => "edit",
      apiFunc: async () => ({}),
      formatter: () => ({ text: "unreached" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient({ state: { mode: "play" } }));
    expect(res.content[0].text).toContain("Cannot wb_thing while in play mode");
  });

  it("proceeds past the guard when the required mode matches", async () => {
    const apiFunc = vi.fn(async () => ({}));
    const tool = defineWorkbenchTool({
      name: "wb_thing",
      description: "d",
      inputSchema: { x: z.string().optional() },
      requireMode: () => "edit",
      apiFunc,
      formatter: () => ({ text: "did it" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient({ state: { mode: "edit" } }));
    expect(apiFunc).toHaveBeenCalledOnce();
    expect(res.content[0].text).toContain("did it");
  });

  it("skips the guard when requireMode returns null", async () => {
    const apiFunc = vi.fn(async () => ({}));
    const tool = defineWorkbenchTool({
      name: "wb_thing",
      description: "d",
      inputSchema: { x: z.string().optional() },
      requireMode: () => null,
      apiFunc,
      formatter: () => ({ text: "ran" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient({ state: { mode: "play" } }));
    expect(apiFunc).toHaveBeenCalledOnce();
    expect(res.content[0].text).toContain("ran");
  });

  it("renders a thrown error as `Error: <hint>` + footer + isError", async () => {
    const err = new WorkbenchError("raw message", "CONNECTION_REFUSED");
    err.hint = "Workbench not reachable. Run `wb_launch`.";
    const tool = defineWorkbenchTool({
      name: "t",
      description: "d",
      inputSchema: { x: z.string().optional() },
      apiFunc: async () => {
        throw err;
      },
      formatter: () => ({ text: "unreached" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient());
    // renderError prefers the classified hint over the raw message.
    expect(res.content[0].text).toContain("Error: Workbench not reachable. Run `wb_launch`.");
    expect(res.content[0].text).not.toContain("raw message");
    expect(res.content[0].text).toContain(FOOTER);
    expect(res.isError).toBe(true);
  });

  it("falls back to the raw message for a plain Error", async () => {
    const tool = defineWorkbenchTool({
      name: "t",
      description: "d",
      inputSchema: {},
      apiFunc: async () => {
        throw new Error("plain boom");
      },
      formatter: () => ({ text: "unreached" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient());
    expect(res.content[0].text).toContain("Error: plain boom");
    expect(res.isError).toBe(true);
  });

  it("propagates a formatter's isError on an otherwise successful call", async () => {
    const tool = defineWorkbenchTool({
      name: "t",
      description: "d",
      inputSchema: {},
      apiFunc: async () => ({ selected: [] }),
      formatter: ({ result }) => ({
        text: "nothing selected",
        isError: Array.isArray(result.selected) && result.selected.length === 0,
      }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient());
    expect(res.content[0].text).toContain("nothing selected");
    expect(res.content[0].text).toContain(FOOTER);
    expect(res.isError).toBe(true);
  });

  it("always appends the footer, including on disconnected state", async () => {
    const tool = defineWorkbenchTool({
      name: "t",
      description: "d",
      inputSchema: {},
      apiFunc: async () => ({}),
      formatter: () => ({ text: "body" }),
    });

    const res = await runWorkbenchTool(tool, {}, fakeClient({ state: { connected: false, mode: "unknown" } }));
    expect(res.content[0].text).toContain("body");
    expect(res.content[0].text).toContain("Workbench: disconnected");
  });
});
