import { describe, it, expect } from "vitest";
import { connectTools } from "../../src/tools/wb-connect.js";
import { runWorkbenchTool } from "../../src/workbench/define-tool.js";
import { WorkbenchClient, WorkbenchError, type WorkbenchState } from "../../src/workbench/client.js";

const t = connectTools[0];

describe("wb_connect — exported data seam", () => {
  it("exports a single tool named wb_connect with no guard or validate", () => {
    expect(connectTools.map((e) => e.name)).toEqual(["wb_connect"]);
    expect(t.requireMode).toBeUndefined();
    expect(t.validate).toBeUndefined();
  });
});

describe("wb_connect — formatter", () => {
  it("renders a successful probe with mode and info", () => {
    const { text, isError } = t.formatter({
      result: { connected: true, details: { mode: "edit", message: "NET API v1" } },
      input: {},
    });
    expect(text).toBe(
      [
        "**Workbench Connected**\n",
        "- **Status:** Connected",
        "- **Mode:** edit",
        "- **Info:** NET API v1",
      ].join("\n")
    );
    expect(isError).toBeUndefined();
  });

  it("omits the mode and info lines when the probe carries neither", () => {
    const { text } = t.formatter({ result: { connected: true, details: {} }, input: {} });
    expect(text).toBe("**Workbench Connected**\n\n- **Status:** Connected");
  });

  it("renders a failed probe as **Connection Failed** with the hint, flagged isError", () => {
    const { text, isError } = t.formatter({
      result: { connected: false, error: "Workbench not reachable. Run `wb_launch`." },
      input: {},
    });
    expect(text).toBe("**Connection Failed**\n\nWorkbench not reachable. Run `wb_launch`.");
    expect(isError).toBe(true);
  });
});

/** A fake client whose probe outcome is scripted (no socket). */
function fakeClient(call: () => Promise<unknown>): WorkbenchClient {
  const state: WorkbenchState = { connected: true, mode: "edit", lastUpdated: Date.now() };
  return { state, call } as unknown as WorkbenchClient;
}

describe("wb_connect — through the envelope", () => {
  it("reports a probe failure as its own answer rather than a generic Error", async () => {
    const err = new WorkbenchError("ECONNREFUSED", "CONNECTION_REFUSED");
    err.hint = "Workbench not reachable. Run `wb_launch`.";

    const res = await runWorkbenchTool(
      t,
      {},
      fakeClient(() => Promise.reject(err))
    );

    // apiFunc catches, so the envelope's generic `Error: …` prefix never appears.
    expect(res.content[0].text).toContain("**Connection Failed**");
    expect(res.content[0].text).toContain("Workbench not reachable. Run `wb_launch`.");
    expect(res.content[0].text).not.toContain("Error: ");
    expect(res.content[0].text).toContain("Workbench:");
    expect(res.isError).toBe(true);
  });

  it("appends the connection footer to a successful probe", async () => {
    const res = await runWorkbenchTool(
      t,
      {},
      fakeClient(() => Promise.resolve({ mode: "play" }))
    );
    expect(res.content[0].text).toContain("**Workbench Connected**");
    expect(res.content[0].text).toContain("Workbench:");
    expect(res.isError).toBeUndefined();
  });
});
