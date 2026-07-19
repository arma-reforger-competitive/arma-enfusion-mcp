/**
 * PROTOTYPE — upstream-change gate, state model (issue #8).
 *
 * Question being answered:
 *   When new commits arrive on `upstream/main` (steffenbk/enfusion-mcp-BK),
 *   the owner reviews each and decides accept / reject / defer. Does a
 *   ledger + watermark model actually handle the awkward cases —
 *   deciding commits out of order, rejecting so a commit never re-surfaces,
 *   and only "absorbing" (advancing the watermark) across a *contiguous*
 *   run of decided commits?
 *
 * This module is the KEEPER: a pure reducer + selectors, no git, no I/O.
 * The TUI shell (tui.ts) is throwaway. If the model proves out, this file
 * lifts into the real gate skill/script largely as-is.
 */

export type Sha = string;

export interface UpstreamCommit {
  sha: Sha;
  subject: string;
  date: string;
  author: string;
}

export type Disposition = "accept" | "reject" | "defer";

export interface LedgerEntry {
  sha: Sha;
  disposition: Disposition;
  reviewedAt: string;
  note?: string;
}

export interface GateState {
  /** Upstream commits, ordered OLDEST -> NEWEST. */
  commits: UpstreamCommit[];
  /** Recorded decisions, keyed by sha. */
  ledger: Record<Sha, LedgerEntry>;
  /** Newest sha considered absorbed/settled; it and everything older is hidden. */
  watermark: Sha | null;
}

export type GateAction =
  | { type: "load"; commits: UpstreamCommit[]; watermark?: Sha | null }
  | { type: "decide"; sha: Sha; disposition: Disposition; reviewedAt: string; note?: string }
  | { type: "clearDecision"; sha: Sha }
  | { type: "advanceWatermark" }
  | { type: "reset" };

export const emptyState: GateState = { commits: [], ledger: {}, watermark: null };

// ---- selectors (pure, derived) --------------------------------------------

/** Index of a sha in the ordered commit list, or -1. */
export function indexOf(state: GateState, sha: Sha): number {
  return state.commits.findIndex((c) => c.sha === sha);
}

/** Commits strictly newer than the watermark (all commits if watermark is null). */
export function commitsAfterWatermark(state: GateState): UpstreamCommit[] {
  if (state.watermark == null) return state.commits;
  const wm = indexOf(state, state.watermark);
  return wm < 0 ? state.commits : state.commits.slice(wm + 1);
}

/** A commit is "decided" only if accepted or rejected — defer is NOT a disposition that settles it. */
export function isDecided(state: GateState, sha: Sha): boolean {
  const d = state.ledger[sha]?.disposition;
  return d === "accept" || d === "reject";
}

/** The review queue: post-watermark commits that are undecided or explicitly deferred. */
export function pending(state: GateState): UpstreamCommit[] {
  return commitsAfterWatermark(state).filter((c) => !isDecided(state, c.sha));
}

/** Accepted-but-not-yet-absorbed commits (waiting behind the watermark). */
export function acceptedAwaitingAbsorb(state: GateState): UpstreamCommit[] {
  return commitsAfterWatermark(state).filter(
    (c) => state.ledger[c.sha]?.disposition === "accept",
  );
}

/**
 * Where the watermark COULD advance to: walk forward from the current
 * watermark across a contiguous run of decided (accept|reject) commits,
 * stopping at the first pending/deferred one. Returns the current watermark
 * if the very next commit isn't decided yet.
 *
 * This is the crux the prototype exists to feel out: accepting commit #5
 * while #3 is still pending must NOT let #5 be absorbed — the watermark
 * stalls at #3.
 */
export function nextWatermark(state: GateState): Sha | null {
  const start = state.watermark == null ? -1 : indexOf(state, state.watermark);
  let wm = state.watermark;
  for (let i = start + 1; i < state.commits.length; i++) {
    const c = state.commits[i];
    if (!isDecided(state, c.sha)) break;
    wm = c.sha;
  }
  return wm;
}

// ---- reducer (pure) --------------------------------------------------------

export function gateReducer(state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case "load":
      return {
        commits: action.commits,
        ledger: {},
        watermark: action.watermark ?? null,
      };

    case "decide": {
      const entry: LedgerEntry = {
        sha: action.sha,
        disposition: action.disposition,
        reviewedAt: action.reviewedAt,
        ...(action.note ? { note: action.note } : {}),
      };
      return { ...state, ledger: { ...state.ledger, [action.sha]: entry } };
    }

    case "clearDecision": {
      const next = { ...state.ledger };
      delete next[action.sha];
      return { ...state, ledger: next };
    }

    case "advanceWatermark":
      return { ...state, watermark: nextWatermark(state) };

    case "reset":
      return emptyState;

    default:
      return state;
  }
}
