/**
 * The single-call World Editor actions — save, undo/redo, open resource.
 *
 * Split out of `wb-editor.ts`, which keeps only `wb_play`/`wb_stop`: those two
 * poll `confirmMode` after switching mode and stay hand-written, while these
 * three are plain `guard → call → format once → footer → catch` tools and
 * belong in the envelope (ADR-0007).
 */

import { z } from "zod";
import { WorkbenchError } from "../workbench/client.js";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

/**
 * A save either completes or is left pending behind a modal dialog. The pending
 * case is an *outcome*, not a failure — Workbench really did open the dialog and
 * the user can still confirm it — so `apiFunc` catches the timeout and the
 * formatter renders it without `isError`, as the hand-written version did.
 */
type SaveOutcome =
  | { pending: false; result: Record<string, unknown> }
  | { pending: true };

const saveTool = defineWorkbenchTool({
  name: "wb_save",
  description:
    "Save the current world in the World Editor. Optionally save to a new path (Save As). Only works in edit mode.",
  inputSchema: {
    path: z
      .string()
      .optional()
      .describe("File path for Save As. Omit to save to the current file."),
  },
  requireMode: () => "edit",
  modeAction: "save",
  apiFunc: async ({ path }, client): Promise<SaveOutcome> => {
    const params: Record<string, unknown> = { action: path ? "saveAs" : "save" };
    if (path) params.path = path;

    try {
      // Save can open a modal dialog for unsaved worlds — use longer timeout
      const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorControl", params, {
        timeout: 30_000,
      });
      return { pending: false, result };
    } catch (e) {
      if (e instanceof WorkbenchError && e.code === "TIMEOUT") return { pending: true };
      throw e;
    }
  },
  formatter: ({ result, input }) => {
    if (result.pending) {
      return {
        text: "**Save Pending** — Workbench opened a save dialog that requires user confirmation. The world will be saved once the user clicks OK in Workbench. This is normal for worlds that haven't been saved before.",
      };
    }

    const label = input.path ? `Saved as: ${input.path}` : "World saved.";
    const message = result.result.message;
    return { text: `**Save Complete**\n\n${label}${message ? `\n${message}` : ""}` };
  },
});

const undoRedoTool = defineWorkbenchTool({
  name: "wb_undo_redo",
  description: "Undo or redo the last action in the World Editor.",
  inputSchema: {
    action: z.enum(["undo", "redo"]).describe("Whether to undo or redo"),
  },
  apiFunc: ({ action }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_EditorControl", { action }),
  formatter: ({ result, input }) => {
    const label = input.action === "undo" ? "Undo" : "Redo";
    return { text: `**${label} Complete**${result.message ? `\n\n${result.message}` : ""}` };
  },
});

const openResourceTool = defineWorkbenchTool({
  name: "wb_open_resource",
  description:
    "Open a resource file in the appropriate Workbench editor (e.g., a .et prefab in the Prefab Editor, a .c script in the Script Editor).",
  inputSchema: {
    path: z
      .string()
      .describe("Resource path to open (e.g., 'Prefabs/Weapons/AK47.et', 'Scripts/Game/MyScript.c')"),
  },
  apiFunc: ({ path }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
      action: "openResource",
      path,
    }),
  formatter: ({ result, input }) => ({
    text: `**Resource Opened**\n\nOpened: ${input.path}${result.message ? `\n${result.message}` : ""}`,
  }),
});

/** The single-call editor actions, migrated to the envelope. */
export const editorActionTools: WorkbenchTool[] = [saveTool, undoRedoTool, openResourceTool];
