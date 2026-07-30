import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_CLIPBOARD_ACTIONS = new Set(["paste", "pasteAtCursor", "cut", "duplicate"]);

const clipboardTool = defineWorkbenchTool({
  name: "wb_clipboard",
  description:
    "Clipboard operations in the World Editor. Copy, cut, paste, paste at cursor, duplicate selected entities, or check if clipboard has content. Paste/cut/duplicate only work in edit mode.",
  inputSchema: {
    action: z
      .enum(["copy", "cut", "paste", "pasteAtCursor", "duplicate", "hasCopied"])
      .describe(
        "Clipboard action: copy/cut (selected entities to clipboard), paste (at original position), pasteAtCursor (at cursor position), duplicate (copy+paste in place), hasCopied (check clipboard)"
      ),
  },
  requireMode: ({ action }) => (MUTATING_CLIPBOARD_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => action,
  apiFunc: ({ action }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_Clipboard", { action }),
  formatter: ({ result, input }) => {
    const { action } = input;

    if (action === "hasCopied") {
      const hasCopied = result.hasCopied ?? result.result ?? false;
      return { text: `**Clipboard:** ${hasCopied ? "Has content" : "Empty"}` };
    }

    const actionLabels: Record<string, string> = {
      copy: "Copied to clipboard",
      cut: "Cut to clipboard",
      paste: "Pasted from clipboard",
      pasteAtCursor: "Pasted at cursor position",
      duplicate: "Duplicated selection",
    };

    const lines = [`**${actionLabels[action] || action}**`];
    if (result.count !== undefined) lines.push(`\nEntities affected: ${result.count}`);
    if (result.message) lines.push(`\n${result.message}`);

    return { text: lines.join("") };
  },
});

/** The clipboard tool, migrated to the envelope. */
export const clipboardTools: WorkbenchTool[] = [clipboardTool];
