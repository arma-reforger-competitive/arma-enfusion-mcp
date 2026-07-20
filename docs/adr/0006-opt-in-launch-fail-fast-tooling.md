# 6. Opt-in Workbench launch; fail-fast tooling with freshness-aware state

Date: 2026-07-20
Status: Accepted

Supersedes part of [ADR-0002](0002-auto-launching-workbench-bridge.md): the
"auto-launch on *every* unreachable call" behaviour. The self-provisioning
machinery (handler-script injection, exe spawn, launch/recompile polls) is
unchanged and still lives in the bridge — only *who triggers it* changes.

## Context

ADR-0002 made `client.call()` auto-launch (up to ~90 s) and auto-recover missing
handlers (up to ~30 s) on *any* connection failure, for *any* caller. In
practice this meant an ordinary `wb_*` call against a down Workbench could hang
90 s, or silently cost 30 s — and the passive status footer could keep reporting
edit/play long after the socket had dropped, because the cache never decayed.

## Decision

- **Launch is opt-in.** `WorkbenchCallOptions.allowLaunch` defaults `false`; only
  `wb_launch` opts in. Every other caller **fails fast** and gets a one-line,
  actionable hint (`classifyCallFailure`) instead of a blind poll.
- **Freshness-aware state.** Cached state carries a TTL (`STATE_TTL_MS = 30 s`);
  `deriveStatus` reports `disconnected | connected | stale`. The footer stays
  synchronous (pure cache + TTL); explicit truth tools (`wb_state`,
  `wb_connect`, `wb_diagnose`) and stale mode-guards actively probe.
- **Probe-after-mutate.** `EMCP_WB_EditorControl`/`EMCP_WB_Reload` carry no mode,
  so `wb_play`/`wb_stop`/`wb_reload` confirm the transition with a bounded
  GetState/Ping poll rather than trusting the mutating response.

## Consequences

- **Good:** a down Workbench never costs 90 s/30 s from an ordinary call; the
  footer no longer "lies" after a stale disconnect; `wb_diagnose` is read-only
  and safe inside any "for details" flow.
- **Bad:** launch latency now only happens when the user explicitly calls
  `wb_launch` — a cold `wb_*` call no longer transparently boots the editor.
- The timeout constants stay hard-coded (not env-tunable) per the source
  decision.
