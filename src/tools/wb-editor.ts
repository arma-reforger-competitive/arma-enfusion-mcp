import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PLAY_CONFIRM_TIMEOUT_MS,
  PLAY_CONFIRM_POLL_MS,
  type WorkbenchClient,
  type WorkbenchMode,
} from "../workbench/client.js";
import { formatConnectionStatus, requireEditMode, requirePlayMode } from "../workbench/status.js";
import { sleep, renderError } from "../workbench/tool-helpers.js";

/**
 * Poll EMCP_WB_GetState until the cached mode reaches `target` or the budget
 * elapses. EMCP_WB_EditorControl carries no `mode`, so the switch must be
 * confirmed out-of-band. Transient errors during the transition (socket briefly
 * down while the world loads) are ignored — we keep polling until the deadline.
 */
async function confirmMode(
  client: WorkbenchClient,
  target: WorkbenchMode,
  timeoutMs: number,
  pollMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await client.call<Record<string, unknown>>("EMCP_WB_GetState");
    } catch {
      /* transient during the mode transition — keep polling */
    }
    if (client.state.mode === target) return true;
    if (Date.now() >= deadline) return false;
    await sleep(pollMs);
  }
}

export function registerWbEditorTools(server: McpServer, client: WorkbenchClient): void {
  // wb_play — Switch to game mode (Play in Editor)
  server.registerTool(
    "wb_play",
    {
      description:
        "Switch Workbench to game (play) mode. Compiles scripts and launches the world for testing. Equivalent to pressing Play in the World Editor. Requires edit mode.",
      inputSchema: {
        debugMode: z
          .boolean()
          .optional()
          .describe("Enable debug mode (script breakpoints, extra logging)"),
        fullScreen: z
          .boolean()
          .optional()
          .describe("Launch in full-screen mode instead of windowed"),
      },
    },
    async ({ debugMode, fullScreen }) => {
      const modeErr = await requireEditMode(client, "start play mode");
      if (modeErr) {
        return { content: [{ type: "text" as const, text: modeErr + formatConnectionStatus(client) }] };
      }
      try {
        const params: Record<string, unknown> = { action: "play" };
        if (debugMode !== undefined) params.debugMode = debugMode;
        if (fullScreen !== undefined) params.fullScreen = fullScreen;

        const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorControl", params);
        if (result.status === "error") {
          const detail = result.message ? String(result.message) : "the editor reported an error";
          return {
            content: [{ type: "text" as const, text: `Error starting play mode: ${detail}. Run \`wb_diagnose\` for details.${formatConnectionStatus(client)}` }],
            isError: true,
          };
        }

        // EditorControl returns no mode — confirm the switch with a bounded poll.
        const confirmed = await confirmMode(client, "play", PLAY_CONFIRM_TIMEOUT_MS, PLAY_CONFIRM_POLL_MS);
        if (confirmed) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Play Mode Started**\n\nWorkbench is now in game mode.${result.message ? `\n${result.message}` : ""}${formatConnectionStatus(client)}`,
              },
            ],
          };
        }

        // Budget elapsed without a hard error — soft success. Marking isError
        // would provoke a retry that double-fires the transition.
        client.markStale();
        return {
          content: [
            {
              type: "text" as const,
              text: `**Play Initiated** — not yet confirmed. Workbench may still be compiling and loading the world. Run \`wb_state\` to confirm.${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error starting play mode: ${renderError(e)}${formatConnectionStatus(client)}` }],
          isError: true,
        };
      }
    }
  );

  // wb_stop — Switch to edit mode
  server.registerTool(
    "wb_stop",
    {
      description:
        "Stop game mode and return to the World Editor. Equivalent to pressing Stop in the World Editor. Requires play mode.",
      inputSchema: {},
    },
    async () => {
      const modeErr = await requirePlayMode(client, "stop play mode");
      if (modeErr) {
        return { content: [{ type: "text" as const, text: modeErr + formatConnectionStatus(client) }] };
      }
      try {
        const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
          action: "stop",
        });
        if (result.status === "error") {
          const detail = result.message ? String(result.message) : "the editor reported an error";
          return {
            content: [{ type: "text" as const, text: `Error stopping play mode: ${detail}. Run \`wb_diagnose\` for details.${formatConnectionStatus(client)}` }],
            isError: true,
          };
        }

        // Stop returns to edit quickly — single-shot GetState (no poll budget).
        try {
          await client.call<Record<string, unknown>>("EMCP_WB_GetState");
        } catch {
          /* GetState may momentarily fail during the transition — fall through to soft success */
        }

        if (client.state.mode === "edit") {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Edit Mode Restored**\n\nWorkbench has returned to edit mode.${result.message ? `\n${result.message}` : ""}${formatConnectionStatus(client)}`,
              },
            ],
          };
        }

        client.markStale();
        return {
          content: [
            {
              type: "text" as const,
              text: `**Stop Initiated** — return to edit mode not yet confirmed. Run \`wb_state\` to confirm.${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error stopping play mode: ${renderError(e)}${formatConnectionStatus(client)}` }],
          isError: true,
        };
      }
    }
  );

  // wb_save — Save the current world
  server.registerTool(
    "wb_save",
    {
      description:
        "Save the current world in the World Editor. Optionally save to a new path (Save As). Only works in edit mode.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("File path for Save As. Omit to save to the current file."),
      },
    },
    async ({ path }) => {
      const modeErr = await requireEditMode(client, "save");
      if (modeErr) {
        return { content: [{ type: "text" as const, text: modeErr + formatConnectionStatus(client) }] };
      }
      try {
        const params: Record<string, unknown> = {
          action: path ? "saveAs" : "save",
        };
        if (path) params.path = path;

        // Save can open a modal dialog for unsaved worlds — use longer timeout
        const result = await client.call<Record<string, unknown>>(
          "EMCP_WB_EditorControl",
          params,
          { timeout: 30_000 }
        );

        const label = path ? `Saved as: ${path}` : "World saved.";
        return {
          content: [
            {
              type: "text" as const,
              text: `**Save Complete**\n\n${label}${result.message ? `\n${result.message}` : ""}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("timed out")) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Save Pending** — Workbench opened a save dialog that requires user confirmation. The world will be saved once the user clicks OK in Workbench. This is normal for worlds that haven't been saved before.${formatConnectionStatus(client)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Error saving: ${msg}${formatConnectionStatus(client)}` }],
        isError: true,
        };
      }
    }
  );

  // wb_undo_redo — Undo or redo
  server.registerTool(
    "wb_undo_redo",
    {
      description: "Undo or redo the last action in the World Editor.",
      inputSchema: {
        action: z
          .enum(["undo", "redo"])
          .describe("Whether to undo or redo"),
      },
    },
    async ({ action }) => {
      try {
        const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
          action,
        });

        const label = action === "undo" ? "Undo" : "Redo";
        return {
          content: [
            {
              type: "text" as const,
              text: `**${label} Complete**${result.message ? `\n\n${result.message}` : ""}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `Error performing ${action}: ${msg}${formatConnectionStatus(client)}` }],
        isError: true,
        };
      }
    }
  );

  // wb_open_resource — Open a resource in Workbench
  server.registerTool(
    "wb_open_resource",
    {
      description:
        "Open a resource file in the appropriate Workbench editor (e.g., a .et prefab in the Prefab Editor, a .c script in the Script Editor).",
      inputSchema: {
        path: z
          .string()
          .describe("Resource path to open (e.g., 'Prefabs/Weapons/AK47.et', 'Scripts/Game/MyScript.c')"),
      },
    },
    async ({ path }) => {
      try {
        const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
          action: "openResource",
          path,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `**Resource Opened**\n\nOpened: ${path}${result.message ? `\n${result.message}` : ""}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `Error opening resource: ${msg}${formatConnectionStatus(client)}` }],
        isError: true,
        };
      }
    }
  );
}
