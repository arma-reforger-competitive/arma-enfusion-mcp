import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

function formatEntityDetails(data: Record<string, unknown>): string {
  const lines: string[] = [];

  if (data.name) lines.push(`- **Name:** ${data.name}`);
  if (data.prefab) lines.push(`- **Prefab:** ${data.prefab}`);
  if (data.className) lines.push(`- **Class:** ${data.className}`);
  if (data.position) lines.push(`- **Position:** ${data.position}`);
  if (data.rotation) lines.push(`- **Rotation:** ${data.rotation}`);
  if (data.layerPath) lines.push(`- **Layer:** ${data.layerPath}`);
  if (data.parentName) lines.push(`- **Parent:** ${data.parentName}`);

  if (Array.isArray(data.components) && data.components.length > 0) {
    lines.push(`\n### Components (${data.components.length})`);
    for (let i = 0; i < data.components.length; i++) {
      const comp = data.components[i] as Record<string, unknown>;
      lines.push(`${i}. ${comp.className || comp.type || "Unknown"}`);
    }
  }

  if (Array.isArray(data.children) && data.children.length > 0) {
    lines.push(`\n### Children (${data.children.length})`);
    for (const child of data.children) {
      const c = child as Record<string, unknown>;
      lines.push(`- ${c.name || "unnamed"}`);
    }
  }

  return lines.join("\n");
}

function formatEntityList(data: Record<string, unknown>): string {
  const lines: string[] = [];
  const entities = Array.isArray(data.entities) ? data.entities : [];
  const total = typeof data.total === "number" ? data.total : entities.length;
  const offset = typeof data.offset === "number" ? data.offset : 0;

  lines.push(`**Entities** (showing ${entities.length} of ${total}, offset ${offset})\n`);

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i] as Record<string, unknown>;
    const name = ent.name || "(unnamed)";
    const prefab = ent.prefab ? ` [${ent.prefab}]` : "";
    const pos = ent.position ? ` at ${ent.position}` : "";
    lines.push(`${offset + i + 1}. **${name}**${prefab}${pos}`);
  }

  if (total > offset + entities.length) {
    lines.push(`\n*${total - offset - entities.length} more entities not shown. Use offset/limit to paginate.*`);
  }

  return lines.join("\n");
}

/** Modify actions that read rather than mutate — allowed in any mode. */
const READ_ONLY_ACTIONS = ["getProperty", "listProperties", "listArrayItems", "getWorldTransform", "makeVisible"];

// ---------------------------------------------------------------------------
// wb_entity_create
// ---------------------------------------------------------------------------
const createTool = defineWorkbenchTool({
  name: "wb_entity_create",
  description:
    "Create a new entity in the World Editor from a prefab. Optionally set position, rotation, name, and target layer. Only works in edit mode (not play mode).",
  inputSchema: {
    prefab: z
      .string()
      .describe("Prefab resource path (e.g., '{GUID}Prefabs/Characters/SoldierUS.et')"),
    position: z
      .string()
      .optional()
      .describe("World position as 'x y z' (e.g., '100 0 200'). Defaults to origin."),
    rotation: z
      .string()
      .optional()
      .describe("Rotation as 'pitch yaw roll' in degrees (e.g., '0 90 0')"),
    name: z
      .string()
      .optional()
      .describe("Entity display name. Auto-generated if omitted."),
    layerPath: z
      .string()
      .optional()
      .describe("Target layer path (e.g., 'default/MyLayer'). Uses active layer if omitted."),
  },
  requireMode: () => "edit",
  modeAction: "create entity",
  apiFunc: ({ prefab, position, rotation, name, layerPath }, client) => {
    const params: Record<string, unknown> = { prefab };
    if (position) params.position = position;
    if (rotation) params.rotation = rotation;
    if (name) params.name = name;
    if (layerPath) params.layerPath = layerPath;
    return client.call<Record<string, unknown>>("EMCP_WB_CreateEntity", params);
  },
  formatter: ({ result, input }) => {
    const { prefab, position, rotation, layerPath } = input;
    const lines: string[] = ["**Entity Created**\n"];
    if (result.name) lines.push(`- **Name:** ${result.name}`);
    lines.push(`- **Prefab:** ${prefab}`);
    if (position) lines.push(`- **Position:** ${position}`);
    if (rotation) lines.push(`- **Rotation:** ${rotation}`);
    if (layerPath) lines.push(`- **Layer:** ${layerPath}`);
    if (result.id) lines.push(`- **ID:** ${result.id}`);
    return { text: lines.join("\n") };
  },
});

// ---------------------------------------------------------------------------
// wb_entity_delete
// ---------------------------------------------------------------------------
const deleteTool = defineWorkbenchTool({
  name: "wb_entity_delete",
  description: "Delete an entity from the World Editor by name. Only works in edit mode.",
  inputSchema: {
    name: z.string().describe("Name of the entity to delete"),
  },
  requireMode: () => "edit",
  modeAction: "delete entity",
  apiFunc: ({ name }, client) => client.call("EMCP_WB_DeleteEntity", { name }),
  formatter: ({ input }) => ({
    text: `**Entity Deleted**\n\nRemoved entity: ${input.name}`,
  }),
});

// ---------------------------------------------------------------------------
// wb_entity_list
// ---------------------------------------------------------------------------
const listTool = defineWorkbenchTool({
  name: "wb_entity_list",
  description:
    "List entities in the current world. Supports pagination and optional name filtering.",
  inputSchema: {
    offset: z
      .number()
      .default(0)
      .describe("Starting offset for pagination (default 0)"),
    limit: z
      .number()
      .default(50)
      .describe("Maximum number of entities to return (default 50)"),
    nameFilter: z
      .string()
      .optional()
      .describe("Filter entities by name substring (case-insensitive)"),
  },
  apiFunc: ({ offset, limit, nameFilter }, client) => {
    const params: Record<string, unknown> = { offset, limit };
    if (nameFilter) params.nameFilter = nameFilter;
    return client.call<Record<string, unknown>>("EMCP_WB_ListEntities", params);
  },
  formatter: ({ result }) => ({ text: formatEntityList(result) }),
});

// ---------------------------------------------------------------------------
// wb_entity_inspect
// ---------------------------------------------------------------------------
const inspectTool = defineWorkbenchTool({
  name: "wb_entity_inspect",
  description:
    "Get detailed information about a specific entity, including its components, properties, position, and children. Identify by name or index.",
  inputSchema: {
    name: z
      .string()
      .optional()
      .describe("Entity name to inspect"),
    index: z
      .number()
      .optional()
      .describe("Entity index (from wb_entity_list) to inspect"),
  },
  validate: ({ name, index }) =>
    !name && index === undefined
      ? "Error: Provide either `name` or `index` to identify the entity."
      : null,
  apiFunc: ({ name, index }, client) => {
    const params: Record<string, unknown> = {};
    if (name) params.name = name;
    if (index !== undefined) params.index = index;
    return client.call<Record<string, unknown>>("EMCP_WB_GetEntity", params);
  },
  formatter: ({ result, input }) => {
    const label = input.name || `index ${input.index}`;
    return { text: `**Entity: ${result.name || label}**\n\n${formatEntityDetails(result)}` };
  },
});

// ---------------------------------------------------------------------------
// wb_entity_modify
// ---------------------------------------------------------------------------
const modifyTool = defineWorkbenchTool({
  name: "wb_entity_modify",
  description:
    "Modify an entity in the World Editor. Supports moving, rotating, renaming, reparenting, and setting or clearing component properties. Only works in edit mode.",
  inputSchema: {
    name: z.string().describe("Name of the entity to modify"),
    action: z
      .enum([
        "move", "rotate", "rename", "reparent",
        "setProperty", "clearProperty", "getProperty", "listProperties",
        "listArrayItems", "addArrayItem", "removeArrayItem", "setObjectClass",
        "getWorldTransform", "makeVisible",
      ])
      .describe(
        "Modification action: move (set position), rotate (set rotation), rename, reparent (change parent entity), setProperty (set a component property), clearProperty (reset to default), getProperty (read a property value), listProperties (list all property names on entity or component), listArrayItems (list items in an array-of-objects property with class names and indices), addArrayItem (append item to array-of-objects property — like the + button), removeArrayItem (remove item from array by index), setObjectClass (change class of an object property — like the dropdown), getWorldTransform (read world position and rotation), makeVisible (scroll World Editor hierarchy to this entity)"
      ),
    value: z
      .string()
      .optional()
      .describe(
        "Value for the action: coordinates 'x y z' for move/rotate, new name for rename, parent name for reparent, property value for setProperty, item class for addArrayItem, new class for setObjectClass. Not needed for clearProperty/getProperty/listProperties/removeArrayItem."
      ),
    propertyPath: z
      .string()
      .optional()
      .describe("Component property path for setProperty/clearProperty (e.g., 'MeshObject.Object')"),
    propertyKey: z
      .string()
      .optional()
      .describe("Property key name for setProperty/clearProperty/getProperty/listProperties/listArrayItems/addArrayItem/removeArrayItem/setObjectClass"),
    memberIndex: z
      .number()
      .default(-1)
      .describe("Array element index for addArrayItem (insert position, -1 = append) or removeArrayItem (item to remove, 0-based)"),
  },
  // Only require edit mode for mutating actions, not read-only ones.
  requireMode: ({ action }) => (READ_ONLY_ACTIONS.includes(action) ? null : "edit"),
  modeAction: "modify entity",
  validate: ({ action, value }) => {
    // setProperty allows empty string as a valid value, so it's validated separately.
    const actionsRequiringValue = ["move", "rotate", "rename", "reparent", "addArrayItem", "setObjectClass"];
    if (actionsRequiringValue.includes(action) && (!value || value.trim() === "")) {
      return `Error: "value" parameter is required for the "${action}" action.`;
    }
    if (action === "setProperty" && value === undefined) {
      return `Error: "value" parameter is required for the "${action}" action.`;
    }
    return null;
  },
  apiFunc: ({ name, action, value, propertyPath, propertyKey, memberIndex }, client) => {
    const params: Record<string, unknown> = { name, action };
    if (!READ_ONLY_ACTIONS.includes(action)) {
      params.value = value ?? "";
    }
    if (propertyPath) params.propertyPath = propertyPath;
    if (propertyKey) params.propertyKey = propertyKey;
    // Always send memberIndex for array actions (-1 = append for addArrayItem).
    if (action === "addArrayItem" || action === "removeArrayItem") {
      params.memberIndex = memberIndex;
    }
    return client.call<Record<string, unknown>>("EMCP_WB_ModifyEntity", params);
  },
  formatter: ({ result, input }) => {
    const { name, action, value, propertyPath, propertyKey, memberIndex } = input;

    // Special output for getWorldTransform.
    if (action === "getWorldTransform") {
      const props = Array.isArray(result.properties) ? result.properties : [];
      const pos = (props as Record<string, unknown>[]).find((p) => p.name === "position");
      const rot = (props as Record<string, unknown>[]).find((p) => p.name === "rotation");
      return {
        text: `**Transform: ${name}**\n\n- **Position:** ${(pos?.value as string | undefined)?.trim() || "(unknown)"}\n- **Rotation:** ${(rot?.value as string | undefined)?.trim() || "(unknown)"}`,
      };
    }

    // Enhanced output for listProperties.
    if (action === "listProperties") {
      const props = Array.isArray(result.properties) ? result.properties : [];
      if (props.length === 0) {
        return { text: `**No properties found.**` };
      }
      const lines = [
        `**Properties${propertyPath ? " of " + propertyPath : ""}** (${props.length})\n`,
        "| Property | Value |",
        "|---|---|",
      ];
      for (const p of props) {
        const prop = p as Record<string, unknown>;
        lines.push(`| ${prop.name ?? "(unnamed)"} | ${prop.value || ""} |`);
      }
      return { text: lines.join("\n") };
    }

    const actionLabels: Record<string, string> = {
      move: `Moved to ${value}`,
      rotate: `Rotated to ${value}`,
      rename: `Renamed to "${value}"`,
      reparent: `Reparented to "${value}"`,
      setProperty: `Set ${propertyPath || propertyKey || "property"} = ${value}`,
      clearProperty: `Cleared ${propertyPath || propertyKey || "property"}`,
      getProperty: `Got ${propertyPath ? propertyPath + "." : ""}${propertyKey || "property"}`,
      listProperties: `Listed properties${propertyPath ? " of " + propertyPath : ""}`,
      listArrayItems: `Listed array items in '${propertyKey || "array"}'`,
      addArrayItem: `Added '${value}' to '${propertyKey || "array"}' at index ${memberIndex ?? -1}`,
      removeArrayItem: `Removed index ${memberIndex ?? 0} from '${propertyKey || "array"}'`,
      setObjectClass: `Changed class of '${propertyKey || "property"}' to '${value}'`,
      getWorldTransform: `Got world transform of ${name}`,
      makeVisible: `Scrolled to ${name}`,
    };

    return {
      text: `**Entity Modified**\n\n- **Entity:** ${name}\n- **Action:** ${actionLabels[action] || action}${result.message ? `\n- **Note:** ${result.message}` : ""}`,
    };
  },
});

// ---------------------------------------------------------------------------
// wb_entity_select
// ---------------------------------------------------------------------------
const selectTool = defineWorkbenchTool({
  name: "wb_entity_select",
  description:
    "Manage entity selection in the World Editor. Select, deselect, clear selection, or get the current selection.",
  inputSchema: {
    action: z
      .enum(["select", "deselect", "clear", "getSelected"])
      .describe("Selection action to perform"),
    name: z
      .string()
      .optional()
      .describe("Entity name (required for select/deselect, ignored for clear/getSelected)"),
  },
  validate: ({ action, name }) =>
    (action === "select" || action === "deselect") && !name
      ? `Error: \`name\` is required for the "${action}" action.`
      : null,
  apiFunc: ({ action, name }, client) => {
    const params: Record<string, unknown> = { action };
    if (name) params.name = name;
    return client.call<Record<string, unknown>>("EMCP_WB_SelectEntity", params);
  },
  formatter: ({ result, input }) => {
    const { action, name } = input;

    if (action === "getSelected") {
      const selected = Array.isArray(result.selected) ? result.selected : [];
      if (selected.length === 0) {
        return { text: `**No entities selected.**`, isError: true };
      }
      const lines = ["**Selected Entities**\n"];
      for (const ent of selected) {
        const e = ent as Record<string, unknown>;
        lines.push(`- ${e.name || "(unnamed)"}`);
      }
      return { text: lines.join("\n") };
    }

    const labels: Record<string, string> = {
      select: `Selected: ${name}`,
      deselect: `Deselected: ${name}`,
      clear: "Selection cleared",
    };

    return {
      text: `**${labels[action]}**${result.message ? `\n\n${result.message}` : ""}`,
    };
  },
});

/** The six entity tools, migrated to the `defineWorkbenchTool` envelope. */
export const entityTools: WorkbenchTool[] = [
  createTool,
  deleteTool,
  listTool,
  inspectTool,
  modifyTool,
  selectTool,
];
