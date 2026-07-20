import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { renderError } from "../workbench/tool-helpers.js";

export function registerWbConnect(server: McpServer, client: WorkbenchClient): void {
  server.registerTool(
    "wb_connect",
    {
      description:
        "Test connection to Arma Reforger Workbench. Returns connection status and current editor mode. Use this to verify Workbench is running with the NET API enabled.",
      inputSchema: {},
    },
    async () => {
      try {
        // Pure probe — EMCP_WB_Ping without allowLaunch never launches, and
        // returns status, mode, message. A failure carries a classified hint.
        const details = await client.call<Record<string, unknown>>("EMCP_WB_Ping");

        const lines: string[] = [];
        lines.push("**Workbench Connected**\n");
        lines.push(`- **Status:** Connected`);
        if (details.mode) lines.push(`- **Mode:** ${details.mode}`);
        if (details.message) lines.push(`- **Info:** ${details.message}`);

        return { content: [{ type: "text" as const, text: lines.join("\n") + formatConnectionStatus(client) }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `**Connection Failed**\n\n${renderError(e)}${formatConnectionStatus(client)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
