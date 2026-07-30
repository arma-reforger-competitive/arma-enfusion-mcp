import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const validateTool = defineWorkbenchTool({
  name: "wb_validate",
  description:
    "Validate a material or texture resource using the Workbench's built-in validators. Returns validation errors and warnings.",
  inputSchema: {
    action: z
      .enum(["material", "texture"])
      .describe("Validator to run: material or texture"),
    path: z
      .string()
      .describe("Resource path to validate (e.g., 'Materials/MyMat.emat', 'Textures/MyTex.edds')"),
  },
  apiFunc: ({ action, path }, client) => {
    const handlerName = action === "material" ? "MaterialValidator" : "TextureValidator";
    return client.call<Record<string, unknown>>(handlerName, { path });
  },
  formatter: ({ result, input }) => {
    const { action, path } = input;
    const valid = result.valid ?? result.success ?? true;
    const errors = Array.isArray(result.errors) ? result.errors : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];

    const lines: string[] = [];
    const label = action === "material" ? "Material" : "Texture";

    if (valid && errors.length === 0) {
      lines.push(`**${label} Validation Passed**\n`);
      lines.push(`- **Path:** ${path}`);
      lines.push(`- **Status:** Valid`);
    } else {
      lines.push(`**${label} Validation Failed**\n`);
      lines.push(`- **Path:** ${path}`);
      lines.push(`- **Status:** Invalid`);
    }

    if (errors.length > 0) {
      lines.push(`\n### Errors (${errors.length})`);
      for (const err of errors) {
        if (typeof err === "string") {
          lines.push(`- ${err}`);
        } else {
          const e = err as Record<string, unknown>;
          lines.push(`- ${e.message || JSON.stringify(e)}`);
        }
      }
    }

    if (warnings.length > 0) {
      lines.push(`\n### Warnings (${warnings.length})`);
      for (const warn of warnings) {
        if (typeof warn === "string") {
          lines.push(`- ${warn}`);
        } else {
          const w = warn as Record<string, unknown>;
          lines.push(`- ${w.message || JSON.stringify(w)}`);
        }
      }
    }

    // Include any extra info from the response
    if (result.info) {
      lines.push(`\n### Info`);
      lines.push(typeof result.info === "string" ? result.info : JSON.stringify(result.info, null, 2));
    }

    return { text: lines.join("\n") };
  },
});

/** The material/texture validator tool, migrated to the envelope. */
export const validateTools: WorkbenchTool[] = [validateTool];
