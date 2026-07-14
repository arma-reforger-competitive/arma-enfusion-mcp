# CONTEXT

Shared vocabulary and architecture for `enfusion-mcp` — an MCP server for Arma
Reforger / Enfusion-engine modding. Read this before working in the codebase;
use its terms verbatim in issues, ADRs, and code.

## What this is

A stdio MCP server that lets an LLM build Arma Reforger mods: research the
Enfusion API, generate mod files, scaffold projects, and drive the Arma
Workbench editor live. ~18k LOC of TypeScript, **50 MCP tools** across 41 files.

## Architecture (8 subsystems)

1. **Server core** — `src/index.ts`, `src/server.ts`, `src/config.ts`.
   Boots the `McpServer` over stdio and registers all 50 tools, the prompts, and
   the resources. Config is layered: built-in defaults → JSON config file → env
   vars (`ENFUSION_WORKBENCH_HOST`, `ENFUSION_EXTRACTED_PATH`,
   `ENFUSION_DEFAULT_MOD`). Path defaults assume a Windows Arma install.

2. **Knowledge Base (KB) / search** — `src/index/` (loader, search-engine,
   types) over `data/`. The offline, searchable index the **reference tools**
   query. Split by origin (see *The `data/` folder* below).

3. **Scraper** — `src/scraper/` (doxygen-parser, source-local, source-remote,
   writer). Build-time only (`npm run scrape`); never in the request path. Reads
   the locally installed Workbench's bundled doxygen HTML (`local`) or the web
   (`remote`) and **writes only `data/api` and the Doxygen portion of
   `data/wiki`** — it does not touch the curated data.

4. **Workbench bridge** — `src/workbench/` (client, protocol, status). A TCP
   client to the running Arma Workbench's "NET API" (`127.0.0.1:5775`). More than
   a client: if Workbench isn't running it installs handler scripts into the mod,
   spawns the exe, waits for the NET API, then retries the call. The live-control
   half of the system — **31 of the 50 tools go through the bridge**.

5. **Tools layer** — `src/tools/` (41 files, 50 tools). Three families:
   - **reference tools** — query the KB (api/component/wiki search); no engine
     needed.
   - **authoring tools** — generate mod files from templates/recipes
     (script/prefab/config/layout/scenario create); touch neither KB nor bridge
     at call time.
   - **Workbench tools** (`wb_*`) — drive the live editor through the bridge.

6. **Templates & recipes** — `src/templates/` + `data/recipes` + `src/patterns`.
   Codegen for prefabs, configs, scenarios, scripts, layouts, gproj. The **recipe
   system** is JSON-driven prefab generation (12 categories with variants).

7. **Pak & formats** — `src/pak/` (reader, vfs) + `src/formats/` (enfusion-text,
   guid). Low-level substrate: reads Arma `.pak` archives as a VFS and
   parses/emits Enfusion text (`.et`/`.conf`) and GUIDs. Used by
   game_browse / game_read / game_duplicate.

8. **Prompts, resources & animation** — `src/prompts/` (create-mod, modify-mod
   MCP prompts), `src/resources/` (class/pattern/group MCP resources),
   `src/animation/` (animation-graph tooling).

## Engine constraints (dictated by Arma, not our choices)

These shape the bridge but are **not** design decisions — Arma's NET API
requires them, so they live here rather than in an ADR:

- **Fresh TCP connection per call** — each `rawCall()` opens a socket, sends one
  request, reads the response, closes. No connection pooling.
- **Pascal-string / JsonRPC framing** — the wire format is
  `[int32LE version=1][pascalString clientId][pascalString "JsonRPC"][pascalString JSON]`.

## The `data/` folder (two things in one directory)

| Path | Size | Origin | Ships in repo/npm? |
|---|---|---|---|
| `data/api` | ~52 MB | **generated** by the scraper | yes (today) |
| `data/wiki` (Doxygen pages) | ~7 MB | **generated** by the scraper | yes (today) |
| `data/wiki` (BI-wiki pages) | small | **curated**, merge-preserved | yes |
| `data/kb` (49 files) | ~760 KB | **curated** | yes |
| `data/recipes` (12 files) | ~52 KB | **curated** | yes |
| `data/patterns` (10 files) | ~44 KB | **curated** | yes |

The generated half is frozen at whatever engine version the scraper last ran
against, so a fork user on a newer Workbench gets stale API data. Changing that
is tracked as a future decision (see the map's *Not yet specified*), not a
current behaviour. See ADR-0001.

## Glossary

- **KB (Knowledge Base)** — the offline index under `data/` that reference tools
  search. Not the live editor state.
- **Workbench bridge** — the TCP link + auto-launch/handler-injection machinery
  in `src/workbench/`. Prefer this over "NET API client".
- **reference tools / authoring tools / Workbench tools** — the three tool
  families (see subsystem 5). Use these exact names.
- **recipe** — a JSON definition driving prefab generation (subsystem 6). Not a
  synonym for "template".
- **handler scripts** — the Enfusion scripts the bridge installs into a mod so
  the Workbench NET API can service MCP calls.

## Related docs

- `docs/adr/` — the load-bearing decisions behind the shape above.
- `docs/agents/` — how agents use the issue tracker, triage labels, and domain docs.
