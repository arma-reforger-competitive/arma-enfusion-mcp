# 2. Auto-launching Workbench bridge with handler-script injection

Date: 2026-07-14
Status: Accepted (records current reality)

## Context

The Workbench tools (`wb_*`) drive the Arma Workbench editor over its TCP "NET
API" (`127.0.0.1:5775`). The NET API only responds if handler scripts are
present in the active mod and the editor is running. Requiring the user to
manually prepare and launch a correctly-configured Workbench before any `wb_*`
call would make the tools brittle and hard to use from an LLM.

## Decision

The **Workbench bridge** (`src/workbench/`) makes the connection
self-provisioning. On a call, if the NET API is unreachable, the bridge:
1. installs its handler scripts into the target mod,
2. spawns the Workbench exe (`ArmaReforgerWorkbenchSteamDiag.exe`),
3. polls until the NET API is up (and handlers have recompiled),
4. retries the original call.

Each call still uses a fresh TCP connection (an engine constraint — see
`CONTEXT.md`).

## Consequences

- **Good:** `wb_*` tools "just work" from a cold start; the LLM does not manage
  editor lifecycle.
- **Bad:** the bridge owns process spawning, file installation, and long poll
  timeouts (launch up to ~90 s, handler recompile up to ~30 s) — significant
  hidden complexity and several failure modes (wrong exe path, port not
  released, handlers not recompiled).
- Ties the bridge to Windows-style exe launching and local filesystem layout
  (see ADR-0004).
