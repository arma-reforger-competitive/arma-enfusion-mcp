import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";
import { renderError } from "../workbench/tool-helpers.js";

/**
 * The outcome of the connection probe. A failed probe is this tool's *answer*,
 * not an envelope failure, so `apiFunc` catches and hands the classified hint to
 * the formatter — that keeps the "**Connection Failed**" rendering intact (and
 * testable) rather than collapsing it to the envelope's generic `Error: …`.
 */
type ProbeOutcome =
  | { connected: true; details: Record<string, unknown> }
  | { connected: false; error: string };

const connectTool = defineWorkbenchTool({
  name: "wb_connect",
  description:
    "Test connection to Arma Reforger Workbench. Returns connection status and current editor mode. Use this to verify Workbench is running with the NET API enabled.",
  inputSchema: {},
  apiFunc: async (_input, client): Promise<ProbeOutcome> => {
    try {
      // Pure probe — EMCP_WB_Ping without allowLaunch never launches, and
      // returns status, mode, message. A failure carries a classified hint.
      const details = await client.call<Record<string, unknown>>("EMCP_WB_Ping");
      return { connected: true, details };
    } catch (e) {
      return { connected: false, error: renderError(e) };
    }
  },
  formatter: ({ result }) => {
    if (!result.connected) {
      return { text: `**Connection Failed**\n\n${result.error}`, isError: true };
    }

    const { details } = result;
    const lines: string[] = [];
    lines.push("**Workbench Connected**\n");
    lines.push(`- **Status:** Connected`);
    if (details.mode) lines.push(`- **Mode:** ${details.mode}`);
    if (details.message) lines.push(`- **Info:** ${details.message}`);

    return { text: lines.join("\n") };
  },
});

/** The connection probe, migrated to the envelope. */
export const connectTools: WorkbenchTool[] = [connectTool];
