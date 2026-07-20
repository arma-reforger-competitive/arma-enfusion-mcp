import type { WorkbenchClient, WorkbenchState } from "./client.js";
import { STATE_TTL_MS } from "./client.js";

export type DerivedStatus = "disconnected" | "connected" | "stale";

/**
 * Derive a freshness-aware status from stored state.
 * `connected` (fresh) collapses to `stale` once the cache ages past STATE_TTL_MS.
 */
export function deriveStatus(state: Readonly<WorkbenchState>, now = Date.now()): DerivedStatus {
  if (!state.connected) return "disconnected";
  return now - state.lastUpdated <= STATE_TTL_MS ? "connected" : "stale";
}

/** Whole-second age of the cached state, for footer display. */
function ageSeconds(state: Readonly<WorkbenchState>, now = Date.now()): number {
  return Math.round((now - state.lastUpdated) / 1000);
}

/**
 * Build a status footer line showing current Workbench connection state.
 * Appended to all wb_* tool responses so the LLM always knows the mode.
 *
 * Pure cache + TTL arithmetic — never touches the network (see the hybrid trust
 * model: the footer is passive, explicit tools/guards probe).
 */
export function formatConnectionStatus(client: WorkbenchClient, now = Date.now()): string {
  const state = client.state;
  const status = deriveStatus(state, now);
  const wrap = (text: string) => `\n\n---\n\`Workbench: ${text}\``;

  if (status === "disconnected") return wrap("disconnected");

  if (status === "stale") {
    const age = ageSeconds(state, now);
    const was = state.mode === "unknown" ? "mode unknown" : `was ${state.mode}`;
    return wrap(`stale — last seen ${age}s ago (${was})`);
  }

  // fresh connection
  const age = ageSeconds(state, now);
  if (state.mode === "play") return wrap(`play mode (${age}s ago)`);
  if (state.mode === "edit") return wrap(`edit mode (${age}s ago)`);
  return wrap(`connected (mode unknown) (${age}s ago)`);
}

/**
 * Guard: require edit mode before a mutating tool runs.
 * Self-refreshing — if the cache is stale or the mode is unknown, it actively
 * probes (one ping + GetState via refreshState) before deciding, and never runs
 * the mutation blind. Returns a warning string to block, or null to proceed.
 */
export async function requireEditMode(client: WorkbenchClient, toolAction: string): Promise<string | null> {
  return requireMode(client, toolAction, "edit");
}

/**
 * Guard: require play mode before a mutating tool runs. Self-refreshing, mirrors
 * requireEditMode. Returns a warning string to block, or null to proceed.
 */
export async function requirePlayMode(client: WorkbenchClient, toolAction: string): Promise<string | null> {
  return requireMode(client, toolAction, "play");
}

async function requireMode(
  client: WorkbenchClient,
  toolAction: string,
  required: "edit" | "play"
): Promise<string | null> {
  const status = deriveStatus(client.state);

  // Stale cache or unknown mode: probe once for the truth before deciding.
  if (status === "stale" || client.state.mode === "unknown") {
    const fresh = await client.refreshState();
    if (!fresh.connected) {
      return `Cannot ${toolAction}: Workbench is not reachable. Run \`wb_diagnose\` for details.`;
    }
    if (fresh.mode === "unknown") {
      return `Cannot ${toolAction}: Workbench mode is unknown. Run \`wb_diagnose\` for details.`;
    }
  }

  return evaluateModeRule(client.state.mode, toolAction, required);
}

function evaluateModeRule(
  mode: WorkbenchState["mode"],
  toolAction: string,
  required: "edit" | "play"
): string | null {
  if (required === "edit") {
    if (mode === "play") {
      return `Cannot ${toolAction} while in play mode. Call \`wb_stop\` first to return to edit mode.`;
    }
    return mode === "edit" ? null : `Cannot ${toolAction}: Workbench mode is unknown. Run \`wb_diagnose\` for details.`;
  }
  if (mode === "edit") {
    return `Cannot ${toolAction} while in edit mode. Call \`wb_play\` first to enter play mode.`;
  }
  return mode === "play" ? null : `Cannot ${toolAction}: Workbench mode is unknown. Run \`wb_diagnose\` for details.`;
}
