# 5. Environment-variable-only configuration

Date: 2026-07-19
Status: Accepted

## Context

`enfusion-mcp` is distributed on npm and run by MCP clients via `npx -y
enfusion-mcp` (see [ADR 0004](0004-local-windows-first-posture.md)). Historically
`loadConfig()` merged three sources in precedence order:

1. a package-local `enfusion-mcp.config.json` (next to `dist/`),
2. a user-home `~/.enfusion-mcp/config.json`,
3. environment variables (highest priority).

Two of those three layers were effectively dead. The package-local file is
gitignored and absent from the `files` array, so it is never published — and for
an `npx`-run package it would live inside the npm cache directory, unreachable to
users. The home-config file was documented but, in practice, unused. Meanwhile
the shipped `enfusion-mcp.config.example.json` was referenced nowhere and drifted
out of sync with the `Config` interface. MCP clients configure servers by passing
an `env` block, so environment variables are already the natural transport — and
the only one users actually reach for.

## Decision

Make **environment variables the single configuration mechanism.**

- Remove both JSON-file reads from `loadConfig()`; delete the unused loader
  helper and the `enfusion-mcp.config.example.json` example.
- Configuration precedence is now simply: built-in defaults, overridden by
  `ENFUSION_*` environment variables.
- Users set these in their MCP client's `env` block (documented in the README,
  Core + Advanced tables).

## Consequences

- **Good:** one obvious, discoverable path that matches how MCP clients already
  launch and configure servers; no dead/unreachable config layers; no example
  file to drift from the code.
- **Bad:** no way to configure via a file for users who would prefer one. This is
  a clean break with no fallback shim — acceptable pre-1.0 given the file layers
  were unreachable (package-local) or undocumented-in-practice and unused (home).
