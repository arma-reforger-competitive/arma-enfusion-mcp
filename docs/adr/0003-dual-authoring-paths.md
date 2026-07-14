# 3. Dual authoring paths — offline codegen and live Workbench creation

Date: 2026-07-14
Status: Accepted (records current reality)

## Context

Mod content (prefabs, configs, scenarios, scripts, layouts) can be produced two
fundamentally different ways: by writing the Enfusion text files directly, or by
asking the running editor to create the objects through the NET API. The
codebase supports both rather than picking one.

## Decision

Keep **two authoring paths**:

- **Offline authoring tools** — generate files from templates and JSON
  **recipes** (`src/templates/`, `data/recipes`, the recipe system's 12
  categories). No editor required; deterministic text output.
- **Live Workbench tools** (`wb_*`) — create/modify the same kinds of content in
  the running editor through the bridge, so results are validated by the engine
  and immediately visible.

## Consequences

- **Good:** offline codegen works without Workbench and is fast/deterministic;
  live creation is engine-validated and interactive. Users pick the trade-off.
- **Bad:** two code paths and two mental models for "create a prefab"; risk of
  divergence between what the templates emit and what the editor produces;
  higher maintenance surface.
- The recipe/JSON-prefab system is treated as part of this decision, not a
  separate ADR.
