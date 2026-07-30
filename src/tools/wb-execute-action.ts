import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

// Menu paths that are known-destructive and blocked for safety.
const BLOCKED_MENU_PREFIXES = [
  "File,Close",
  "File,New",
  "File,Exit",
  "File,Quit",
];

const executeActionTool = defineWorkbenchTool({
  name: "wb_execute_action",
  description:
    "Execute any Workbench menu action by its menu path. Use comma-separated path segments to identify the action (e.g., 'Tools,Reload Scripts' or 'File,Save'). " +
    "Some destructive actions (File,Close; File,New; File,Exit) are blocked for safety.",
  inputSchema: {
    menuPath: z
      .string()
      .describe(
        "Comma-separated menu path (e.g., 'Tools,Reload Scripts', 'File,Save', 'Edit,Undo')"
      ),
  },
  // Reject known-destructive menu paths before any mode probe or I/O. Rendered
  // through the envelope's usage-error path (now flagged isError).
  validate: ({ menuPath }) => {
    const normalizedPath = menuPath.trim();
    for (const blocked of BLOCKED_MENU_PREFIXES) {
      if (normalizedPath.startsWith(blocked)) {
        return `**Blocked:** "${menuPath}" is a destructive action and cannot be executed via this tool. Perform it manually in Workbench.`;
      }
    }
    return null;
  },
  requireMode: () => "edit",
  modeAction: ({ menuPath }) => `execute menu action "${menuPath}"`,
  apiFunc: ({ menuPath }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_ExecuteAction", { menuPath }),
  formatter: ({ result, input }) => ({
    text: `**Action Executed**\n\nMenu path: ${input.menuPath}${result.message ? `\n${result.message}` : ""}${result.result ? `\nResult: ${JSON.stringify(result.result)}` : ""}`,
  }),
});

/** The execute-menu-action tool, migrated to the envelope. */
export const executeActionTools: WorkbenchTool[] = [executeActionTool];
