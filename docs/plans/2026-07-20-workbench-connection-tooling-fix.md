# Workbench launch / connection / status tooling — hand-off implementation spec

**Status:** Ready to implement (planning complete)
**Wayfinder map:** [#10 — Fix Workbench launch / connection / status tooling](https://github.com/arma-reforger-competitive/arma-enfusion-mcp/issues/10)
**Source decisions:** [#11](https://github.com/arma-reforger-competitive/arma-enfusion-mcp/issues/11) (error string) · [#12](https://github.com/arma-reforger-competitive/arma-enfusion-mcp/issues/12) (state model) · [#13](https://github.com/arma-reforger-competitive/arma-enfusion-mcp/issues/13) (auto-launch/timeout policy) · [#14](https://github.com/arma-reforger-competitive/arma-enfusion-mcp/issues/14) (diagnose redesign) · [#16](https://github.com/arma-reforger-competitive/arma-enfusion-mcp/issues/16) (play/stop/reload)

This is a **concrete, per-file plan** a fresh implementer can execute cold. It consolidates five resolved decisions. No engine-side (`mod/Scripts/`) changes are required — every fix is in the TypeScript client and tools.

---

## 1. What we're fixing (symptoms → root causes)

| Symptom | Root cause | Fixed by |
|---|---|---|
| Ordinary `wb_*` calls hang up to 90s when Workbench is down | `call()` auto-launches (`ensureRunning`, 90s poll) on *every* `CONNECTION_REFUSED` | §4.1 D-a |
| Ordinary calls silently cost 30s | `call()` auto-recovers handlers (30s recompile poll) on *every* `"Undefined API func"` | §4.1 D-a |
| Footer "lies" — reports edit/play after a stale disconnect | Cache never decays; no freshness concept | §4.2 (TTL), §4.3 (footer) |
| `wb_play`/`wb_stop`/`wb_reload` report a mode that never updates | `EMCP_WB_EditorControl`/`EMCP_WB_Reload` responses carry **no `mode` field**, so `extractMode()` no-ops | §4.7, §4.8 (probe-after-mutate) |
| `wb_diagnose` `up_no_handlers` never triggers | Classifier matches `"not existing Net API function"`; real string is `"Undefined API func"` (dead code at `client.ts:310`) | §4.6 D2 |
| `wb_diagnose` fabricates false precision on `refused` | Treats bridge-down / NET-API-off / dead-Workbench as distinguishable; they all surface as `ECONNREFUSED` | §4.6 D1 |
| Mutating tools dead-end on stale cache ("run `wb_state` first") | Guards hard-block on `stale`/`unknown` | §4.3 (self-refreshing guards) |

**Precondition (out of scope):** the WSL2↔Windows portproxy bridge + `ENFUSION_WORKBENCH_HOST`, documented in `docs/wsl-windows-setup.md`. This spec assumes the bridge exists; it does **not** remediate it. The tooling's UX *when the bridge is absent* (fail-fast messaging, diagnose checklist) **is** in scope.

---

## 2. Core model (shared vocabulary)

**Stored state** (`WorkbenchState`, shape unchanged): `connected: boolean`, `mode: "edit" | "play" | "unknown"`, `lastUpdated: number` (epoch ms).

**Derived status** (computed at read time, `STATE_TTL_MS = 30_000`):

| Status | Condition |
|---|---|
| `disconnected` | `!connected` |
| `connected` (fresh) | `connected && now - lastUpdated <= 30s` |
| `stale` | `connected && now - lastUpdated > 30s` |

**Trust model (hybrid):**
- **Passive footer** (`formatConnectionStatus`) stays **synchronous** — pure cache + TTL arithmetic, no network.
- **Explicit truth tools** (`wb_state`, `wb_connect`, `wb_diagnose`) and **stale mode-guards** actively probe (`ping()` / `EMCP_WB_GetState`) before reporting.

**Mode authority:** `EMCP_WB_GetState` is canonical and works in **both** modes (edit → reads `WorldEditorAPI`; play → API null → returns `mode:"game"` → mapped to `play`). Any response carrying a recognized `mode` updates the cache via `extractMode`. `connected=false` is set **only** on `CONNECTION_REFUSED`/`TIMEOUT`/`PROTOCOL_ERROR` — an `API_ERROR` means the socket answered, so it stays `connected`.

---

## 3. Constants (all in `src/workbench/client.ts`)

Existing (keep hard-coded, unchanged — decision #13.3):
```
LAUNCH_POLL_INTERVAL_MS       = 3_000
LAUNCH_TIMEOUT_MS             = 90_000
HANDLER_RECOMPILE_TIMEOUT_MS  = 30_000
HANDLER_RECOMPILE_POLL_MS     = 2_000
ping timeout                  = 3_000  (inline)
```

New:
```
STATE_TTL_MS            = 30_000   // freshness window (§2)
PLAY_CONFIRM_TIMEOUT_MS = 8_000    // wb_play confirm-poll budget (#16 D2)
PLAY_CONFIRM_POLL_MS    = 1_000
RELOAD_CONFIRM_TIMEOUT_MS = 30_000 // wb_reload handlers-back poll (mirrors recompile constant)
RELOAD_CONFIRM_POLL_MS  = 1_000
```

---

## 4. Per-file plan

### 4.1 `src/workbench/client.ts` — gate the slow paths, fix classifier

**D-a — Invert auto-launch/recovery to opt-in (#13).**
Today `call()` (lines 103–146) auto-runs `ensureRunning()` on `CONNECTION_REFUSED` and `recoverMissingHandlers()` on `"Undefined API func"` for *any* caller unless `skipAutoLaunch` is passed. Invert this:

- Add a flag to `WorkbenchCallOptions`: rename the intent from opt-*out* to opt-*in*. Introduce `allowLaunch?: boolean` (default **false**). Keep `skipAutoLaunch` working during migration or remove it and update `ping`/`launchWorkbench`/`diagnose` probe sites (they pass `skipAutoLaunch: true` today — under the inverted default they simply omit `allowLaunch`, so the three internal probe call sites at `client.ts:198, 301, 504` can drop the flag).
- In `call()`'s `catch` (line 114): only enter the `ensureRunning()` branch (line 120) and the `recoverMissingHandlers()` branch (line 130) when `options.allowLaunch === true`.
- **Only `wb_launch` passes `allowLaunch: true`.** `wb_launch` already calls `ensureRunning()` directly (`wb-launch.ts:63`), so in practice `call()`'s auto-launch branch may become dead for external callers — keep it guarded by `allowLaunch` for the internal retry semantics, or fold launch entirely into `wb_launch`. Simplest: guard both branches with `allowLaunch`, leave `wb_launch` using `ensureRunning()` directly.

**D-b — Fail-fast classifier in the `catch` (#13.4).**
When `allowLaunch` is false and the call failed, map the error class to a one-line, actionable message before rethrowing (or return a typed classification the tools render). Recommended: add a helper `classifyCallFailure(err: WorkbenchError): string` returning:
- `CONNECTION_REFUSED` → `"Workbench not reachable. Run `wb_launch`, or check the WSL bridge. Run `wb_diagnose` for details."`
- `TIMEOUT` → `"Port open but no reply — check the bridge. Run `wb_diagnose` for details."`
- `API_ERROR` with `"Undefined API func"` → `"Handler scripts not loaded. Run `wb_launch`. Run `wb_diagnose` for details."`
- other `API_ERROR` → surface `err.message` **verbatim** (a real engine API error, not connectivity).

Attach the classified hint to the thrown `WorkbenchError` (e.g. a `hint` field) so each tool's `catch` renders it uniformly. Tools keep their existing `isError: true` shape.

**D-c — TTL-ready state.** No shape change; `lastUpdated` already stamped on success (lines 111, 126, 137) and failure (line 117). Confirm every success path updates `lastUpdated` (they do). Freshness is derived downstream — no change needed here beyond exporting `STATE_TTL_MS` for `status.ts`.

**D-d — Harmonize the recovery-trigger string.** `call()`'s recovery trigger at `client.ts:130` exact-matches `"Undefined API func"` — keep it (it is the real string per #11), but note the diagnose classifier (§4.6) must go **structural**, not string-based.

**D-e — `refreshState()` (lines 151–159) stays** as the canonical forced GetState refresh; guards and probe tools reuse it. Verify it still updates `connected=false` correctly on failure (it does).

---

### 4.2 `src/workbench/status.ts` — TTL derivation + async self-refreshing guards

Add a derived-status helper and rewrite the footer + guards.

**Derived status:**
```ts
export type DerivedStatus = "disconnected" | "connected" | "stale";
export function deriveStatus(state, now = Date.now()): DerivedStatus {
  if (!state.connected) return "disconnected";
  return now - state.lastUpdated <= STATE_TTL_MS ? "connected" : "stale";
}
```

**Footer — `formatConnectionStatus` (currently lines 7–13): always show age.** Stays **synchronous**. New wording (#12):
```
Workbench: edit mode (3s ago)
Workbench: play mode (1s ago)
Workbench: connected (mode unknown) (8s ago)
Workbench: stale — last seen 47s ago (was edit)
Workbench: disconnected
```
Age = `Math.round((now - lastUpdated)/1000)`. For `stale`, include the last-known mode in `(was <mode>)`.

**Guards become async + self-refreshing (#12, #16 D4).** `requireEditMode`/`requirePlayMode` change signature to `Promise<string | null>`:
1. Compute `deriveStatus`.
2. If `stale` or `mode === "unknown"`: `await client.refreshState()` (one ping+GetState), then evaluate the edit/play rule on the **fresh** mode.
3. If the refresh **fails** (disconnected / handlers gone): hard-block with a message pointing at `wb_diagnose` — never run the mutation blind.
4. If `connected` (fresh): apply the rule on cache, no round-trip.
5. On the opposite mode, return the existing "Cannot X while in Y mode..." string (unchanged wording).

---

### 4.3 Ripple: `await` the now-async guards (mechanical, 12 files)

Every guard call site is already inside an `async` handler, so each edit is prefixing `await`. Call sites:

- `src/tools/wb-editor.ts:25, 63, 104`
- `src/tools/wb-entities.ts:89, 131, 295`
- `src/tools/wb-scenario.ts:202, 342`
- `src/tools/wb-resources.ts:33`
- `src/tools/wb-layers.ts:54`
- `src/tools/wb-clipboard.ts:24`
- `src/tools/wb-prefabs.ts:36`
- `src/tools/wb-components.ts:29`
- `src/tools/wb-localization.ts:37`
- `src/tools/wb-entity-duplicate.ts:66`
- `src/tools/wb-execute-action.ts:45`
- `src/tools/wb-script-editor.ts:37`

Change `const modeErr = require*Mode(...)` → `const modeErr = await require*Mode(...)`. No other change per site.

---

### 4.4 `src/tools/wb-connect.ts` — pure probe, class-specific messaging (#13)

Already a pure `ping()` probe (never launches) — keep that. Replace the generic failure text (lines 20–24, 44) with decision #13.4's class-specific one-liners (reuse the §4.1 D-b classifier / `hint`). Footer already appended. No launch, no recovery.

### 4.5 `src/tools/wb-state.ts` — explicit probe (#12)

Already calls `EMCP_WB_GetState` via `client.call` — that write-throughs mode and freshens the cache. Keep. Under the inverted default (§4.1), `call()` no longer auto-launches, so a down Workbench now returns the fail-fast classified message instead of hanging 90s — render `err.hint` if present. Footer already appended.

### 4.6 `src/tools/wb-diagnose.ts` + `client.ts diagnose()` — full redesign (#14)

**D1 — Environment detection (facts, looked up not asked), in `client.ts diagnose()`:**
- WSL2: `/proc/version` contains `microsoft`, or `WSL_DISTRO_NAME` env set.
- Bridged vs loopback: `ENFUSION_WORKBENCH_HOST` non-loopback (not `127.0.0.1`/`localhost`).
- Local-exe reachability: existing `findWorkbenchExe()` disk check.

Render `refused` as **one observed state** with an environment-branched, prioritized differential checklist — never claim which cause applies:
- **WSL2 + bridge:** (1) Workbench not running · (2) NET API off · (3) portproxy bridge down.
- **Native Windows loopback:** (1) Workbench not running · (2) NET API off. *(no bridge item)*
- **Native Linux → remote host:** (1) host unreachable / wrong `ENFUSION_WORKBENCH_HOST` · (2) NET API off. *(no local-exe claims)*

**D2 — Structural `up_no_handlers` classifier (fixes #11 dead code at `client.ts:310`).** Replace the string match `"not existing Net API function"` with: **any `API_ERROR` returned from the `EMCP_WB_Ping` probe ⇒ `up_no_handlers`** (socket connected + NET API answered + application error). Show `err.message` as **evidence**, not as the classifier. (`CONNECTION_REFUSED` → `refused`; `TIMEOUT` → `timeout`; non-`WorkbenchError` → `error`.)

**D3 — Probe-and-writethrough; report live mode.** Flow: `ping` (rawCall, no launch) → if `up_with_handlers`, second probe `EMCP_WB_GetState` → report connection **and** live mode. In every non-connected state, mode = `unknown (not connected)` — no stale guess. Both the ping outcome and GetState result **write through** to the shared cache (so diagnose freshens the footer). diagnose displays **no TTL age** (always age≈0).

**D4 — Verdict-first report structure** (invert today's config-first dump in `wb-diagnose.ts`):
1. **Verdict** — one line: observed state + primary action. Healthy collapses to `✅ CONNECTED — mode: edit. All wb_* tools available.`
2. **What to check** — the D1 checklist, **only when the connection is broken**.
3. **Connection & Mode** — observed `netApi` state + live mode.
4. **⚠️ Warnings** — §D7, **always evaluated**, regardless of verdict.
5. **Evidence** — today's Config / Handler-Scripts / raw-error blocks, demoted but retained.

**D5 — Strictly read-only.** diagnose **never** launches, recompiles/recovers, deletes the standalone addon, or installs. Only observes (ping, GetState, disk checks). **Sole** permitted side effect: the D3 cache write-through. All probes stay on `rawCall` with no `allowLaunch`, so they can never trip gated auto-recovery. Safe to run inside any fail-fast "for details" flow — zero risk of a 90s/30s side effect.

**D6/D7 — Warnings section** (distinct axis: connection-verdict vs config-hygiene), sits between Connection&Mode and Evidence, renders regardless of verdict. The five warnings:
1. Bundled scripts missing → package broken; re-install enfusion-mcp.
2. Standalone addon + mod handlers coexist → duplicate-class likely; run `wb_launch` to clean up.
3. `up_no_handlers` + no mods installed → nothing to compile; run `wb_launch` with a `gprojPath`.
4. `ENFUSION_WORKBENCH_HOST` set but resolves to loopback → self-contradictory (bridged intent, loopback target); likely misconfigured bridge.
5. Exe configured but not found on disk → **environment-gated**: emit only when a local exe is expected (native Windows, or WSL2 with a translatable path); suppress for remote-host setups.

`DiagnosticReport` gains fields for the detected environment (e.g. `env: "windows" | "linux" | "wsl2"`, `bridged: boolean`) and the live `mode` so the renderer can branch without re-detecting.

### 4.7 `src/tools/wb-editor.ts` — `wb_play` / `wb_stop` probe-after-mutate (#16)

Because `EMCP_WB_EditorControl` returns no `mode`, both tools must probe after the switch.

**`wb_play` (lines 8–52):**
1. `await requireEditMode(...)` (now async, §4.2).
2. Fire `EMCP_WB_EditorControl {action:"play", ...}`.
3. **Bounded confirm-poll** (`PLAY_CONFIRM_TIMEOUT_MS` ≈ 8s, `EMCP_WB_GetState` every ~1s) until cached mode flips to `play`. This is the tool doing its job (compile + world-load), **not** the 90s hang #13 killed.
4. Confirmed → plain success, footer shows fresh `play` (age≈0).
5. Budget elapses, no error → **soft success** (`isError` **false**): "Play initiated, not yet confirmed — run `wb_state` to confirm," mode cached `stale`. *(Marking `isError` would provoke a retry that double-fires the transition.)*
6. Hard failure (`EditorControl` `status:"error"` / connection dropped / guard probe failed) → `isError: true`, point at `wb_diagnose`.

**`wb_stop` (lines 55–88):**
1. `await requirePlayMode(...)`.
2. Fire `EMCP_WB_EditorControl {action:"stop"}`.
3. **Single-shot** `EMCP_WB_GetState` (stop returns to edit quickly — no poll budget).
4. Confirmed edit → success; else soft-success "initiated, unconfirmed," mode `stale`. Same `isError` rules as `wb_play`.

(`wb_save`, `wb_undo_redo`, `wb_open_resource` in this file only need the §4.3 `await` on their guards — no probe-after-mutate.)

### 4.8 `src/tools/wb-reload.ts` — observe the handler-drop, don't recover (#16 D3)

`EMCP_WB_Reload` recompiles scripts **including the EnfusionMCP handlers**, so a successful reload deliberately drops handlers for a moment (the `"Undefined API func"` window). Since #13 gated recovery to `wb_launch` only, the user's next ordinary call would otherwise fail-fast right after a "successful" reload. Fix:
1. Fire `EMCP_WB_Reload {target}`.
2. **Bounded `EMCP_WB_Ping` confirm-poll** (`RELOAD_CONFIRM_TIMEOUT_MS` ≈ 30s, ping every ~1s) until handlers respond again (recompile finished).
3. Success → "Reload complete — handlers back online"; the ping refreshes `connected`; **mode left untouched** (reload doesn't change mode).
4. Budget elapses → soft-degrade: "handlers haven't come back — likely a **script compile error** blocking recompilation; run `wb_diagnose`," mark `stale`.
5. **Never call `recoverMissingHandlers()`** — observing the user's own recompile bring handlers back is *not* recovery (no reinstall/mutation), so it respects #13. Reinstall stays `wb_launch`'s job.

### 4.9 `src/tools/wb-launch.ts` — the sole opt-in launcher

Already the explicit launcher (`client.ping()` then `client.ensureRunning()`, lines 51–63). Under the inverted default it becomes the **only** path that launches. If §4.1 D-a routes launch through `call({allowLaunch:true})`, pass it here; otherwise `ensureRunning()` direct is fine (recommended — least churn). No behavioral change to the 90s launch poll (opt-in latency is acceptable, #13.3). Ensure the launch-timeout error still carries the actionable NET-API / script-error hint it builds today (`client.ts:518–538`).

---

## 5. Implementation order (suggested)

1. **`client.ts`** — add constants (§3), invert `WorkbenchCallOptions` default + fail-fast classifier (§4.1), structural diagnose classifier + env detection + GetState write-through (§4.6 engine half). Compile.
2. **`status.ts`** — `deriveStatus`, footer age, async self-refreshing guards (§4.2).
3. **Ripple** — `await` the 17 guard call sites across 12 files (§4.3). Typecheck catches any missed one.
4. **Explicit tools** — `wb-connect`, `wb-state`, `wb-diagnose` renderer (§4.4–4.6).
5. **Transition tools** — `wb-editor` play/stop, `wb-reload` (§4.7–4.8).
6. **`wb-launch`** — confirm sole-launcher wiring (§4.9).

## 6. Test plan

- **Unit — `deriveStatus`:** fresh/stale/disconnected boundaries around `STATE_TTL_MS`.
- **Unit — classifier:** each `WorkbenchError` code → expected fail-fast hint; verbatim passthrough for non-connectivity `API_ERROR`.
- **Unit — footer:** each status → exact wording incl. age and `(was <mode>)`.
- **Unit — guards:** fresh-target proceeds w/o probe; stale fires one `refreshState`; refresh-fail hard-blocks to `wb_diagnose`.
- **Unit — diagnose classifier:** any `API_ERROR` from ping ⇒ `up_no_handlers` (regression for the #11 dead-code bug); env-branched checklist selection; the five warnings incl. env-gating of #5.
- **Behavioral — no-hang:** with Workbench down, every non-`wb_launch` tool returns fast (≈ping timeout), never 90s. Update the three stale tests noted in the map's history if they assert old auto-launch behavior.
- **Behavioral — probe-after-mutate:** `wb_play` confirms `play` within budget; budget-elapse → soft success (`isError:false`), mode `stale`; `wb_reload` waits for handlers to return, budget-elapse → compile-error hint.

## 7. Non-goals (out of scope — map #10)

- Implementing beyond this repo's client/tools (no engine `mod/Scripts/` changes — none needed).
- Remediating the WSL2 networking bridge itself (portproxy / mirrored networking) — a precondition per `docs/wsl-windows-setup.md`.
- Making timeout constants env-tunable — they stay hard-coded (#13.3).
