# PROTOTYPE — upstream-change gate (issue #8)

> **Throwaway.** This directory answers a design question; it is not production
> code. The keeper is `gate-model.ts` (pure reducer + selectors). `tui.ts` is a
> disposable shell for driving it by hand.

## Question

When new commits land on `upstream/main` (`steffenbk/enfusion-mcp-BK`), the fork
owner reviews each and decides **accept / reject / defer**. Does a
**ledger + watermark** state model actually hold up under the awkward cases?

1. Deciding commits **out of order** (accept #5 while #3 is still pending).
2. **Reject** must be sticky — a rejected commit never re-surfaces in the queue.
3. The **watermark** (the "absorbed up to here" line) may only advance across a
   *contiguous* run of decided commits — accepting #5 must not absorb it while
   #3 is undecided.

## Run

```bash
npm run gate:prototype
```

Loads the last 12 real `upstream/main` commits, seeds the watermark at an older
one (`11529dc`) so the newer commits appear as an incoming queue. Keys:
`a`ccept · `r`eject · `d`efer · `c`lear · `j/k` move · `w` advance watermark · `q`uit.

Watch the **Advanceable to** line: it stays blocked until the head of the queue
is decided, then jumps forward across the decided run.

## Proposed gate form (the decision this prototype supports)

- **Form: a slash-command skill** (`/upstream-gate`), *not* a plain script or CI
  check. The "explore + summarize intent + risk" step is inherently agent work
  (read the diff, explain what it does, flag risk) — only an LLM-driven skill
  does that well. A script/CI job can *trigger* the skill later, but the reasoning
  and the accept/reject decision are agent + human.
- **State: this `gate-model.ts` reducer**, persisted as an append-only ledger
  (e.g. `docs/upstream-gate/ledger.md` or `.json`) keyed by sha. Reject is sticky;
  accepted commits queue for cherry-pick; the watermark records "absorbed to here."
- **Fetch + diff:** `git fetch upstream` → `pending()` = commits after the
  watermark not yet in the ledger → `git show <sha>` per commit for the agent to
  summarize.
- **Record:** each decision appends a ledger entry (sha, disposition, reviewedAt,
  note); accept → cherry-pick/merge then `advanceWatermark`.

## Answer

_(captured after the owner drives it — see issue #8.)_
