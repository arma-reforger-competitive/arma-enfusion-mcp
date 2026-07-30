import type { WorkbenchClient, WorkbenchState } from "../../src/workbench/client.js";

/** The connection footer the envelope appends to every response. */
export const FOOTER = "Workbench:";

/**
 * A fake WorkbenchClient for envelope tests — no socket, no probe.
 *
 * `state` is a fixed, fresh cached state (so mode guards resolve without I/O);
 * `call` is the scripted response for tools that actually reach their `apiFunc`.
 * Tools exercising only `validate`/`requireMode` can leave `call` out.
 */
export function fakeClient(
  options: {
    state?: Partial<WorkbenchState>;
    call?: (apiFunc: string, params?: Record<string, unknown>) => Promise<unknown>;
  } = {}
): WorkbenchClient {
  const state: WorkbenchState = {
    connected: true,
    mode: "edit",
    lastUpdated: Date.now(),
    ...options.state,
  };
  return { state, call: options.call } as unknown as WorkbenchClient;
}
