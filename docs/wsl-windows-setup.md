# WSL ↔ Windows setup & mod-dev workflow

How to run `enfusion-mcp` from **WSL2** while the Arma Reforger **Workbench** runs
natively on **Windows**, build/test mods, and drive Claude Code from inside a mod
folder — without installing anything extra on Windows.

This is the reference for the "WSL box, Windows game" topology. On a native
Windows install none of the bridging below is needed and the path helpers are
no-ops.

## 1. How paths work (the important part)

The server runs in WSL but drives a native Windows exe, so an OS path needs two
forms (see the glossary in `CONTEXT.md`):

| Form | Example | Used for |
|---|---|---|
| **WSL path** | `/mnt/d/ArmaReforgerWorkbench/FindAndDestroy` | Node fs ops (canonical) |
| **Windows path** | `D:\ArmaReforgerWorkbench\FindAndDestroy` | the Workbench exe & NET API |

**You no longer have to pick.** `src/utils/wsl-path.ts` translates automatically:
callers may pass *either* form. Input is normalized to the WSL form for fs ops
and converted to the Windows form only where a path crosses into Windows (the
exe's `-gproj` arg, `wb_projects open`). **Resource paths** (`Prefabs/...`,
`{GUID}`) are never translated.

Detection is automatic (WSL kernel string). Override with `ENFUSION_WSL_MODE=1`
or `=0` if ever needed.

## 2. Environment variables (audit checklist)

The MCP loads no `.env`; vars are set on the server registration
(`claude mcp add enfusion-mcp -s user -e KEY=VAL ...` or in `~/.claude.json`).
Windows locations must be given as WSL `/mnt/...` paths:

| Var | This box | Purpose |
|---|---|---|
| `ENFUSION_WORKBENCH_PATH` | `/mnt/d/Games/steamapps/common/Arma Reforger Tools` | Tools install (Diag exe) |
| `ENFUSION_PROJECT_PATH` | `/mnt/d/ArmaReforgerWorkbench` | addon/project root |
| `ENFUSION_GAME_PATH` | `/mnt/d/Games/steamapps/common/Arma Reforger` | base game addons |
| `ENFUSION_WORKBENCH_HOST` | Windows host IP from WSL (see below) | NET API host |

After editing **source**, rebuild (`npm run build`) — the MCP runs the compiled
`dist/index.js`. Env-var changes do **not** need a rebuild (read at startup).

## 3. The NET API bridge (WSL2 NAT → Windows loopback)

Workbench's NET API listens on Windows `127.0.0.1:5775`. WSL2 in NAT mode can't
reach Windows loopback, so a one-time portproxy is required. In an **elevated**
Windows PowerShell:

```powershell
netsh interface portproxy add v4tov4 listenport=5775 listenaddress=0.0.0.0 connectport=5775 connectaddress=127.0.0.1
New-NetFirewallRule -DisplayName "EnfusionMCP NET API" -Direction Inbound -Protocol TCP -LocalPort 5775 -Action Allow -Profile Any
```

Then point the MCP at the Windows host IP as seen from WSL:

```bash
grep nameserver /etc/resolv.conf   # -> set ENFUSION_WORKBENCH_HOST to this
```

The IP can drift on WSL restart — re-check if `wb_*` tools stop connecting.
(Windows 11 build 22621+ mirrored networking removes the need for this bridge.)

Two more preconditions for `wb_*` tools:
- **NET API enabled** in Workbench: File → Options → General → Net API.
- A **project open** with the handler scripts (any `.gproj` under the project
  path) — handlers only compile once a project is loaded.

## 4. Mod-dev workflow: run Claude Code inside the mod

You do **not** need Claude Code on Windows. The mod lives on the Windows disk but
is fully reachable from WSL at `/mnt/d/...`, so open it there:

```bash
cd /mnt/d/ArmaReforgerWorkbench/FindAndDestroy
claude
```

The `enfusion-mcp` server is registered at **user scope**, so all its tools are
available in that session automatically. Launch/test the mod with `wb_launch`
(pass either path form):

```
wb_launch gprojPath=/mnt/d/ArmaReforgerWorkbench/FindAndDestroy/FindAndDestroy.gproj
```

Editing the MCP itself is a separate context — that source lives in
`~/www/arma-enfusion-mcp` and needs `npm run build` after changes.

## 5. Troubleshooting

- **`Can't find game project file` / `Undefined API func`** — the exe got a
  `/mnt/...` `-gproj` it couldn't resolve. With the current build this is handled
  automatically; if seen, confirm you're on the rebuilt `dist/`.
- **Connection refused on 5775** — bridge/firewall not set, or `WORKBENCH_HOST`
  IP drifted. Re-check `/etc/resolv.conf`; on Windows `netstat -ano | findstr 5775`.
- **Handlers won't compile** — a script error in the open project blocks the
  EnfusionMCP handlers; fix it in the Script Editor, then retry.
