# Backlog

Salvaged from root-level `TODO.md` and `UPGRADE_IDEAS.md` (upstream `steffenbk` docs) before those files were removed. These are the still-open items only — completed items were dropped. Canonical tracking is GitHub issues; this file is a holding note. Promote anything worth doing into an issue.

## Open bugs

### `scenario_create_objective` — SlotKill ends up inside Layer_AI, not as a direct LayerTask child
`ScenarioFramework: ... could not init task due to missing m_SlotTask!` — `GetSlotTask()` only searches *direct* children of LayerTask, so the slot must not be nested in Layer_AI. `wb-scenario.ts` reparents the slot to `layerTask`, but Workbench appears to rewrite the layer file with the slot back inside Layer_AI on save.
- Investigate whether `ParentEntity(false)` in `EMCP_WB_ModifyEntity.c` actually nests entities in the saved `.layer` file, or whether Workbench flattens/reorders on save.
- Likely fix: write the full hierarchy block directly to the `.layer` file instead of per-entity reparent API calls.
- Files: `src/tools/wb-scenario.ts`, `mod/Scripts/WorkbenchGame/EnfusionMCP/EMCP_WB_ModifyEntity.c`

### `m_eActivationType ON_TRIGGER_ACTIVATION` not settable via `setProperty`
Enum string values can't be set via `SetVariableValue` — `setProperty` silently fails; currently must be written directly to the `.layer` file. Solved automatically if the layer-file-write approach above is adopted.

## Open features

- **Write hierarchy directly to `.layer` file from `scenario_create_objective`** — generate the complete layer block and write it, instead of placing entities one-by-one and reparenting. Also fixes the enum issue above.
- **`scenario_create_objective` spawn offset** — add `m_sSpawnRadius` / offset so SlotAI spawns away from the trigger edge.
- **Multiple SlotAI under Layer_AI** — optional `aiSpawnCount` to place N SlotAIs (currently only one).

## Open upgrade ideas

Ranked roughly by effort. Effort: S/M/L. "Where" = starting point in the code.

- **10. Dry-run mode for mutation tools** (S) — `dryRun: boolean` on `mod/script/prefab/config/layout_create` + `project_write`; return what *would* be written. `script-create.ts:78` already returns code without writing when the file exists.
- **11. Consolidate `project_browse` & `game_browse`** (S) — extract shared `listDirectory()`/`FILE_TYPE_MAP`/`formatSize()`/`DirEntry` into `src/utils/dir-listing.ts`; the two files are near-identical and have drifted (`game-browse` labels `.emat`/`.sounds`, `project-browse` doesn't).
- **13. Method signature validator tool** (M) — `script_check` taking class + method signature, returning the correct signature on close match. Pairs with fuzzy-search infra. New `src/tools/script-check.ts`.
- **16. Compilation error feedback + log capture** (M) — parse Workbench compile errors (file/line/msg) after `wb_play`/`wb_reload`, auto-read the failing file; add a tool to read the Workbench script/runtime log. New `src/tools/wb-log.ts` + `mod/Scripts/WorkbenchGame/EnfusionMCP/EMCP_WB_GetLog.c`.
- **17. Example code snippets in patterns** (M) — add `codeExamples` (3–15 line working snippets) to `data/patterns/*.json`, inject into the create-mod prompt. Requires Enfusion domain knowledge to write correctly.
- **18. Common-pitfalls context injection** (M) — `data/pitfalls.json` of Enfusion gotchas (e.g. `EntityEvent.FRAME` needs `SetEventMask`), injected based on what's being created.
- **19. Validation-driven fix suggestions** (M) — extend `mod_validate` `ValidationIssue` with machine-actionable fix objects (`{fix:"move", from, to}`); optional `src/tools/mod-fix.ts` to apply them.
- **20. Cross-index "used by" backlinks** (M) — reverse index in `SearchEngine` (parent/param/return/property type), surfaced as `usedBy` in `api_search` + class resource.
- **21. MODPLAN as structured data** (M) — replace freeform `MODPLAN.md` with typed JSON/YAML + a `mod_plan` tool to query/advance phases. Used by both create/modify prompts.
- **22. Incremental asset index** (M) — replace session-scoped `cachedIndex` in `asset-search.ts` with an on-disk, mtime-invalidated index so first search isn't a cold full-directory + `.pak` walk each session.
- **23. Multi-mod workspace support** (M) — point config at `addons/` and accept a `modName` param per tool, instead of one `ENFUSION_PROJECT_PATH` addon. Touches `src/config.ts` + all tools using `config.projectPath`.
- **24. Diff-based script patching** (M–L) — `script_patch`/`project_patch` accepting a diff (and, as a stretch, structure-aware edits: add/modify method, add member) so the LLM stops re-emitting whole files. Reuses parsing in `src/templates/script.ts`.
- **25. Cross-reference validation on write** (L) — on `project_write` of a `.c`, statically extract method calls and verify against the API index, warning on hallucinated calls (goes beyond `mod_validate`'s parent-class-only check).
- **26. Component compatibility matrix** (L) — scan base-game `.et` files during indexing to learn which components co-occur per entity type; add a `type:"components"` `api_search` mode to prevent incompatible component combos.

### Data-quality context (why several ideas above matter)
From the original audit: ~85% of Arma class briefs empty, ~88% of method descriptions empty, 0 scraped enum values, `hierarchy.json` empty, wiki search truncated at 2K chars (avg page ~8.7K). Sparse context = high hallucination surface, which most "hallucination prevention" ideas target.
