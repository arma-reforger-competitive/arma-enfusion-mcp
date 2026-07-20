import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  RELOAD_CONFIRM_TIMEOUT_MS,
  RELOAD_CONFIRM_POLL_MS,
  type WorkbenchClient,
} from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { sleep, renderError } from "../workbench/tool-helpers.js";

export function registerWbReload(server: McpServer, client: WorkbenchClient): void {
  server.registerTool(
    "wb_reload",
    {
      description:
        "Reload scripts or plugins in the Workbench. Use after editing .c script files or Workbench plugins to pick up changes without restarting.",
      inputSchema: {
        target: z
          .enum(["scripts", "plugins", "both"])
          .default("scripts")
          .describe("What to reload: scripts, plugins, or both"),
      },
    },
    async ({ target }) => {
      try {
        await client.call<Record<string, unknown>>("EMCP_WB_Reload", { target });
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error reloading: ${renderError(e)}${formatConnectionStatus(client)}` }],
          isError: true,
        };
      }

      // A reload recompiles scripts INCLUDING the EnfusionMCP handlers, so the
      // handlers deliberately drop for a moment ("Undefined API func" window).
      // Wait for them to come back on their own — this is observing the user's
      // own recompile, NOT recovery (no reinstall/mutation), so it respects the
      // opt-in launch policy. We never call recoverMissingHandlers here.
      const deadline = Date.now() + RELOAD_CONFIRM_TIMEOUT_MS;
      for (;;) {
        await sleep(RELOAD_CONFIRM_POLL_MS);
        let back = false;
        try {
          // Refreshes `connected`; mode is unchanged by a reload.
          await client.call<Record<string, unknown>>("EMCP_WB_Ping");
          back = true;
        } catch {
          /* handlers still recompiling — keep polling */
        }
        if (back) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Reload Complete** — handlers back online.${formatConnectionStatus(client)}`,
              },
            ],
          };
        }
        if (Date.now() >= deadline) break;
      }

      // Budget elapsed — handlers never returned. Almost always a script compile
      // error blocking recompilation. Soft-degrade, don't recover.
      client.markStale();
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**Reload Triggered** — handlers haven't come back online within ${RELOAD_CONFIRM_TIMEOUT_MS / 1000}s. ` +
              `This is likely a script compile error blocking recompilation. Run \`wb_diagnose\` for details.${formatConnectionStatus(client)}`,
          },
        ],
      };
    }
  );
}
