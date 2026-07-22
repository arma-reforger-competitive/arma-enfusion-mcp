/**
 * A deep envelope for single-call Workbench tools.
 *
 * Every covered `wb_*` tool is declared as data — an `inputSchema`, an optional
 * `validate`, an optional `requireMode` guard, an `apiFunc`, and a *pure*
 * `formatter`. `defineWorkbenchTool` owns the shared shape:
 *
 *   validate → requireMode → apiFunc → formatter → append footer
 *
 * with one generic `catch` rendering `Error: ${renderError(e)}`. Because the
 * `formatter`/`validate`/`requireMode` hooks are pure and exported as data, the
 * fallible formatting logic becomes a socket-free test surface — no live
 * Workbench, no mode state. See ADR-0007.
 *
 * Scope: only tools shaped `guard → one (or few) call(s) → format once → footer
 * → catch`. Orchestration tools (`wb_reload`, `wb_play`/`wb_stop`, `wb_launch`,
 * `wb_diagnose`) with their own poll loops stay hand-written.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { WorkbenchClient } from "./client.js";
import {
  formatConnectionStatus,
  requireEditMode,
  requirePlayMode,
  type RequiredMode,
} from "./status.js";
import { renderError } from "./tool-helpers.js";

/** The input type inferred from a tool's `inputSchema` (a ZodRawShape). */
type InferInput<Schema extends ZodRawShape> = z.infer<z.ZodObject<Schema>>;

/** What a formatter returns: the rendered text and an optional error flag. */
export interface FormatterResult {
  text: string;
  isError?: boolean;
}

/** A single MCP tool response (a subset of CallToolResult that we build). */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** CallToolResult carries an open index signature; mirror it so the SDK accepts us. */
  [key: string]: unknown;
}

/**
 * The typed declaration of a covered Workbench tool. The input type is inferred
 * from `inputSchema` (as `InferInput<Schema>`); every hook is type-checked
 * against it at construction.
 */
export interface WorkbenchToolConfig<Schema extends ZodRawShape, R> {
  name: string;
  description: string;
  inputSchema: Schema;
  /** Pre-call cross-field usage check. Return a message to reject, null to proceed. */
  validate?: (input: InferInput<Schema>) => string | null;
  /** Input-dependent mode guard. Return the demanded mode, or null for no guard. */
  requireMode?: (input: InferInput<Schema>) => RequiredMode | null;
  /**
   * Human phrase for a blocked-guard message ("Cannot <modeAction> while in
   * play mode…"). Defaults to `name`; set it to preserve a tool's original
   * wording (e.g. "create entity" rather than "wb_entity_create"). May be a
   * function of input for multi-action tools whose original phrase varied per
   * action (e.g. "register resource" vs "rebuild resource").
   */
  modeAction?: string | ((input: InferInput<Schema>) => string);
  /** The I/O boundary — imperative, may make more than one call. */
  apiFunc: (input: InferInput<Schema>, client: WorkbenchClient) => Promise<R>;
  /** PURE: render the result (and echo input) to text; may flag a semantic error. */
  formatter: (args: { result: R; input: InferInput<Schema> }) => FormatterResult;
}

/**
 * An erased tool element for a homogeneous array. The per-tool input type stays
 * alive *inside* each hook (where tests and correctness depend on it); the
 * outer element is erased so `entityTools: WorkbenchTool[]` can concatenate
 * across tools. Hooks take `any` because their real input type has been erased.
 */
export interface WorkbenchTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modeAction?: string | ((input: any) => string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate?: (input: any) => string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requireMode?: (input: any) => RequiredMode | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiFunc: (input: any, client: WorkbenchClient) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatter: (args: { result: any; input: any }) => FormatterResult;
}

/**
 * Type-inferring constructor: infers the input type from `inputSchema`,
 * type-checks the tool's hooks against it, and returns an erased element.
 */
export function defineWorkbenchTool<Schema extends ZodRawShape, R>(
  config: WorkbenchToolConfig<Schema, R>
): WorkbenchTool {
  return config as unknown as WorkbenchTool;
}

/**
 * Run a tool's envelope: validate → requireMode → apiFunc → formatter, with the
 * connection footer appended to *every* return path and one generic catch.
 */
export async function runWorkbenchTool(
  tool: WorkbenchTool,
  input: Record<string, unknown>,
  client: WorkbenchClient
): Promise<ToolResponse> {
  const footer = () => formatConnectionStatus(client);
  const text = (t: string): ToolResponse["content"] => [{ type: "text", text: t }];

  try {
    // 1. Cross-field usage validation (before any I/O).
    if (tool.validate) {
      const usageError = tool.validate(input);
      if (usageError) {
        return { content: text(usageError + footer()), isError: true };
      }
    }

    // 2. Input-dependent mode guard.
    if (tool.requireMode) {
      const required = tool.requireMode(input);
      if (required) {
        const action =
          typeof tool.modeAction === "function"
            ? tool.modeAction(input)
            : tool.modeAction ?? tool.name;
        const block =
          required === "edit"
            ? await requireEditMode(client, action)
            : await requirePlayMode(client, action);
        if (block) {
          return { content: text(block + footer()) };
        }
      }
    }

    // 3. The I/O.
    const result = await tool.apiFunc(input, client);

    // 4. Pure formatting.
    const formatted = tool.formatter({ result, input });
    return {
      content: text(formatted.text + footer()),
      ...(formatted.isError ? { isError: true } : {}),
    };
  } catch (e) {
    return { content: text(`Error: ${renderError(e)}${footer()}`), isError: true };
  }
}

/** Register a list of covered Workbench tools on the MCP server. */
export function registerWorkbenchTools(
  server: McpServer,
  client: WorkbenchClient,
  tools: WorkbenchTool[]
): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (input: Record<string, unknown>) => runWorkbenchTool(tool, input, client)
    );
  }
}
