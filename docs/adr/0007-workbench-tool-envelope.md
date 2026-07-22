# 7. A deep envelope for single-call Workbench tools (`defineWorkbenchTool`)

Date: 2026-07-22
Status: Proposed

## Context

Every `wb_*` tool re-implements the same shape by hand: an optional mode guard,
a `try`, one `client.call`, result formatting, a `formatConnectionStatus`
footer, and a `catch`. Measured across `src/tools/wb-*.ts`: 153 manual
envelopes, 122 footer appends, 126 `isError` flags, 30 mode guards — and **0
tests on the handlers**. The envelope fills roughly two-thirds of every tool;
the unique work is a thin sliver.

Two concrete costs, both visible in the code today:

- **The fallible logic is untestable.** The part that actually rots — output
  formatting, e.g. `wb_entity_modify`'s 14-branch action-label table
  (`wb-entities.ts:361`) — is welded to I/O inside the handler, after
  `await client.call`. Testing it needs a live socket, a running Workbench, and
  mode state. So it is never tested.
- **The error envelope has drifted.** `tool-helpers.ts` exports `renderError`,
  which prefers the classified connectivity hint (`WorkbenchError.hint`). Only 4
  files use it; 26 catch sites inline the raw `e instanceof Error ? e.message
  : String(e)` fallback and never surface the hint. The same connectivity
  failure reads differently depending on which tool hit it.

## Decision

Introduce a deep module, `defineWorkbenchTool`, that owns the envelope. It
covers **only the single-call tools** (the ~40 that genuinely are `guard → one
call → format → footer → catch`). Orchestration tools with their own control
flow — `wb_reload` (poll loop + `markStale`), `wb_play`/`wb_stop`
(probe-after-mutate), `wb_launch`, `wb_diagnose` — **stay hand-written**; an
abstraction earns its keep on the common case, not by swallowing the outliers.

Each covered tool is declared as **data** with these parts:

```ts
defineWorkbenchTool({
  name, description, inputSchema,                 // ZodRawShape
  validate?:    (input) => string | null,         // pre-call usage errors; null = proceed
  requireMode?: (input) => RequiredMode | null,   // mode guard; null = no guard
  apiFunc:      (input, client) => Promise<R>,     // the I/O; may be >1 call internally
  formatter:    ({ result, input }) => { text: string; isError?: boolean },  // PURE
})
```

Deliberate boundaries:

- **The `formatter` is pure** — `({ result, input }) → { text, isError? }`, no
  `client`. This is the whole point: the fallible formatting becomes a function
  testable with a plain object and a string assertion, no Workbench. `client`
  stays in the envelope, which owns the footer; letting the formatter touch
  `client` would re-weld it to live state and forfeit the win.
  - `input` is required because many formatters echo the caller's arguments back
    (`wb_entity_create` renders `input.prefab`/`position`, not just `result`).
  - `formatter` returns `{ text, isError? }` because a *successful* call can be
    semantically an error (`getSelected` with an empty list is `isError`, while
    `listProperties` empty is not) — so `isError` can't be equated with "the
    `catch` block".
- **The guard is a function of input**, not a static declaration, because
  `wb_entity_modify` requires edit mode only for its mutating actions. Static
  tools write `() => "edit"`. Its return type is `RequiredMode` (see glossary) —
  the modes a guard can *demand* (`"edit" | "play"`), which is a distinct concept
  from `WorkbenchMode` (the state the engine is *in*, including `"unknown"`).
- **`validate` is a separate hook**, run before the guard, because cross-field
  usage rules ("`name` **or** `index`"; "`value` required **iff** action ∈ {…}")
  can't be expressed in the per-field `ZodRawShape` the MCP SDK's `registerTool`
  requires, and shouldn't be conflated with runtime failures in the `catch`.
- **`apiFunc` is imperative** (`(input, client) => Promise<R>`), not a
  declarative `method + buildParams`, because param-building is too varied and
  covered tools may still make more than one call. It is the I/O boundary and is
  not expected to be pure.
- **The `catch` is generic**: `Error: ${renderError(e)}`. The verbose per-tool
  prefix ("creating entity", the embedded name) is redundant — the caller already
  knows the tool and input it invoked. Dropping it costs nothing and gives all
  ~40 tools the `renderError` hint they were silently dropping.
- **`defineWorkbenchTool` is a type-inferring constructor**: it infers the input
  type `I` from `inputSchema` via `z.infer`, type-checks that tool's
  `validate`/`requireMode`/`apiFunc`/`formatter` against `I` at construction, and
  returns an erased element. Tools are exported as arrays of these elements
  (`export const entityTools = [...]`); a separate `registerWorkbenchTools(server,
  client, tools)` does the registration loop. This keeps per-tool input types
  alive *inside* the formatters (where tests and correctness depend on them)
  while the array stays homogeneous for storage.

Also fold the two inline `"edit" | "play"` copies in `status.ts` into the named
`RequiredMode`.

## Consequences

- **Good:** the formatting logic — the fallible part — becomes ~40 pure
  functions with a socket-free test surface, turning the `0 tests` metric
  actionable. Envelope bugs (footer, error rendering) concentrate in one module
  and can't drift tool-to-tool; every covered tool gains the `renderError` hint.
- **Bad / accepted:** 26 tools' error text changes from `Error <verb>: …` to
  `Error: …` (redundant → concise). The "just three parts" story from the review
  is really four (`validate` exists in the code today regardless). The coverage
  boundary — "single-call tools only" — is a fact you must *know*, not one the
  type system enforces; the orchestration tools stay bespoke by design.
- Migration is mechanical and per-file; each `registerWb*Tools` function becomes
  an exported `*Tools` array, and `server.ts` swaps ~15 calls for one
  concatenated list plus one `registerWorkbenchTools` call.
