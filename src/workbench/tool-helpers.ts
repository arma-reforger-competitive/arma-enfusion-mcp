import { WorkbenchError } from "./client.js";

/** Resolve after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Render an error for a tool response, preferring the classified connectivity
 * hint attached by WorkbenchClient.call() (see classifyCallFailure) over the
 * raw message.
 */
export function renderError(e: unknown): string {
  if (e instanceof WorkbenchError && e.hint) return e.hint;
  return e instanceof Error ? e.message : String(e);
}
