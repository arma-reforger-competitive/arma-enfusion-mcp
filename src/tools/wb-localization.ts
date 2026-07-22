import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_LOCALIZATION_ACTIONS = new Set(["insert", "delete", "modify"]);

const localizationTool = defineWorkbenchTool({
  name: "wb_localization",
  description:
    "Manage localization entries in the Workbench Localization Editor. Insert, delete, or modify string table entries, or get the full localization table.",
  inputSchema: {
    action: z
      .enum(["insert", "delete", "modify", "getTable", "listLanguages"])
      .describe(
        "Action: insert (add new entry), delete (remove entry), modify (update entry), getTable (list all entries), listLanguages (list available language columns)"
      ),
    itemId: z
      .string()
      .optional()
      .describe("Localization item ID / key (required for insert, delete, modify)"),
    property: z
      .string()
      .optional()
      .describe("Property to modify (e.g., 'en_us', 'target', 'comment')"),
    value: z
      .string()
      .optional()
      .describe("Value to set for insert/modify"),
  },
  validate: ({ action, itemId, property }) => {
    if (MUTATING_LOCALIZATION_ACTIONS.has(action) && !itemId) {
      return `Error: \`itemId\` is required for the "${action}" action.`;
    }
    if (action === "modify" && !property) {
      return "Error: `property` is required for the modify action.";
    }
    return null;
  },
  requireMode: ({ action }) => (MUTATING_LOCALIZATION_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => `${action} localization entry`,
  apiFunc: ({ action, itemId, property, value }, client) => {
    const params: Record<string, unknown> = { action };
    if (itemId) params.itemId = itemId;
    if (property) params.property = property;
    if (value !== undefined) params.value = value;
    return client.call<Record<string, unknown>>("EMCP_WB_Localization", params);
  },
  formatter: ({ result, input }) => {
    const { action, itemId, property, value } = input;

    if (action === "getTable") {
      const entries = Array.isArray(result.entries) ? result.entries : [];
      if (entries.length === 0) {
        return { text: `**Localization Table:** Empty (no entries)` };
      }

      const lines = [`**Localization Table** (${entries.length} entries)\n`];
      lines.push("| ID | en_us | Target |");
      lines.push("|---|---|---|");
      for (const entry of entries) {
        const e = entry as Record<string, unknown>;
        const id = e.id || e.itemId || "?";
        const enUs = e.en_us || e.source || "";
        const target = e.target || "";
        lines.push(`| ${id} | ${enUs} | ${target} |`);
      }

      return { text: lines.join("\n") };
    }

    if (action === "listLanguages") {
      const langs = Array.isArray(result.languages) ? result.languages : [];
      if (langs.length === 0) {
        return { text: `**No language columns detected.**\n\n${result.message || ""}` };
      }
      return {
        text: `**Language Columns** (${langs.length})\n\n${(langs as unknown[]).map((l) => `- ${l}`).join("\n")}`,
      };
    }

    const actionLabels: Record<string, string> = {
      insert: `Inserted localization entry: **${itemId}**`,
      delete: `Deleted localization entry: **${itemId}**`,
      modify: `Modified **${itemId}**.${property} = "${value || ""}"`,
    };

    return {
      text: `**Localization Updated**\n\n${actionLabels[action]}${result.message ? `\n${result.message}` : ""}`,
    };
  },
});

/** The localization-editor tool, migrated to the envelope. */
export const localizationTools: WorkbenchTool[] = [localizationTool];
