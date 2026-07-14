# 4. Local-only, Windows-first posture

Date: 2026-07-14
Status: Accepted (records current reality)

## Context

Arma Reforger Tools (the Workbench) is a Windows application. The MCP server
runs on the modder's own machine alongside it. This constrains transport,
networking, and default paths.

## Decision

Adopt a **local-only, Windows-first** posture:

- **Transport:** stdio (the server is launched as a child process by the MCP
  client, e.g. `npx -y enfusion-mcp`).
- **Networking:** the Workbench bridge talks to `127.0.0.1:5775` — loopback only.
- **Paths:** defaults assume a Windows Steam install
  (`C:\Program Files (x86)\Steam\steamapps\common\Arma Reforger Tools`), with the
  base game derived relative to it.

Non-Windows / remote setups (e.g. running the server in WSL2 against a Workbench
on the Windows host) are supported as a **documented workaround** via
`ENFUSION_WORKBENCH_HOST` + a `netsh` portproxy, not as a first-class mode.

## Consequences

- **Good:** matches the overwhelmingly common setup (Windows modder, local
  editor); no auth/remote-security surface to design.
- **Bad:** WSL2/remote users hit friction (port-proxy setup, `D:/`-style path
  quirks, `wb_launch` timeouts); the assumptions are baked into config defaults
  and the bridge's launch logic rather than abstracted behind a platform layer.
