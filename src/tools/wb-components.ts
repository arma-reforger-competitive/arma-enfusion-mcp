import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_COMPONENT_ACTIONS = new Set(["add", "remove"]);

const componentTool = defineWorkbenchTool({
  name: "wb_component",
  description:
    "Manage components on an entity in the World Editor. Add, remove, or list components attached to an entity. Add/remove only work in edit mode.",
  inputSchema: {
    entityName: z.string().describe("Name of the target entity"),
    action: z
      .enum(["add", "remove", "list"])
      .describe("Action to perform: add a new component, remove an existing one, or list all components"),
    componentClass: z
      .string()
      .optional()
      .describe("Component class name (required for add/remove, e.g., 'RigidBody', 'MeshObject')"),
    componentIndex: z
      .number()
      .optional()
      .describe("Component index for removal when multiple components of the same class exist"),
  },
  validate: ({ action, componentClass }) =>
    MUTATING_COMPONENT_ACTIONS.has(action) && !componentClass
      ? `Error: \`componentClass\` is required for the "${action}" action.`
      : null,
  requireMode: ({ action }) => (MUTATING_COMPONENT_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => `${action} component`,
  apiFunc: ({ entityName, action, componentClass, componentIndex }, client) => {
    const params: Record<string, unknown> = { entityName, action };
    if (componentClass) params.componentClass = componentClass;
    if (componentIndex !== undefined) params.componentIndex = componentIndex;
    return client.call<Record<string, unknown>>("EMCP_WB_Components", params);
  },
  formatter: ({ result, input }) => {
    const { entityName, action, componentClass } = input;

    if (action === "list") {
      const components = Array.isArray(result.components) ? result.components : [];
      if (components.length === 0) {
        return { text: `**${entityName}** has no components.` };
      }

      const lines = [`**Components on ${entityName}** (${components.length})\n`];
      for (let i = 0; i < components.length; i++) {
        const comp = components[i] as Record<string, unknown>;
        const className = comp.className || comp.type || "Unknown";
        const props = comp.propertyCount ? ` (${comp.propertyCount} properties)` : "";
        lines.push(`${i}. **${className}**${props}`);
      }
      return { text: lines.join("\n") };
    }

    const actionLabel = action === "add" ? "Added" : "Removed";
    return {
      text: `**Component ${actionLabel}**\n\n- **Entity:** ${entityName}\n- **Component:** ${componentClass}${result.message ? `\n- **Note:** ${result.message}` : ""}`,
    };
  },
});

/** The component-management tool, migrated to the envelope. */
export const componentTools: WorkbenchTool[] = [componentTool];
