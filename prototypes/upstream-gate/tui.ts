/**
 * PROTOTYPE — throwaway TUI shell for the upstream-change gate (issue #8).
 *
 * Drives the pure model in gate-model.ts by hand against REAL upstream
 * commits. Seeds the watermark at an older commit so several real
 * `upstream/main` commits show up as an incoming review queue to react to.
 *
 * Run:  npm run gate:prototype
 * This shell is disposable; gate-model.ts is the bit worth keeping.
 */

import { execFileSync } from "node:child_process";
import {
  acceptedAwaitingAbsorb,
  commitsAfterWatermark,
  gateReducer,
  isDecided,
  nextWatermark,
  pending,
  type GateState,
  type UpstreamCommit,
} from "./gate-model.ts";

const B = "\x1b[1m";
const D = "\x1b[2m";
const R = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

// Seed watermark: pretend we've absorbed up to this older real commit, so the
// commits after it become the "incoming" queue. (Real baseline is 3eecd8f.)
const SEED_WATERMARK = "11529dc";

function loadUpstreamCommits(): UpstreamCommit[] {
  // oldest -> newest, last 12 on upstream/main
  const out = execFileSync(
    "git",
    ["log", "--reverse", "-12", "--pretty=%h%x1f%an%x1f%ad%x1f%s", "--date=short", "upstream/main"],
    { encoding: "utf8" },
  );
  return out
    .trim()
    .split("\n")
    .map((line) => {
      const [sha, author, date, subject] = line.split("\x1f");
      return { sha, author, date, subject };
    });
}

let state: GateState = gateReducer(
  { commits: [], ledger: {}, watermark: null },
  { type: "load", commits: loadUpstreamCommits(), watermark: SEED_WATERMARK },
);

let cursor = 0; // index into the pending queue

function render(): void {
  process.stdout.write("\x1b[2J\x1b[H");
  const queue = pending(state);
  const absorbable = nextWatermark(state);
  const accepted = acceptedAwaitingAbsorb(state);

  console.log(`${B}Upstream Gate — prototype${R}  ${D}(issue #8, model feel-out)${R}\n`);
  console.log(`${B}Watermark:${R} ${state.watermark ?? "(none)"}   ${D}everything at/before is absorbed${R}`);
  console.log(
    `${B}Advanceable to:${R} ${absorbable === state.watermark ? D + "(blocked — head of queue undecided)" + R : GREEN + absorbable + R}\n`,
  );

  console.log(`${B}Incoming review queue${R} ${D}(post-watermark, undecided/deferred)${R}`);
  if (queue.length === 0) {
    console.log(`  ${D}(empty — all incoming commits decided)${R}`);
  }
  const afterWm = commitsAfterWatermark(state);
  afterWm.forEach((c) => {
    const disp = state.ledger[c.sha]?.disposition;
    const inQueueIdx = queue.findIndex((q) => q.sha === c.sha);
    const isCursor = inQueueIdx === cursor;
    const marker = isCursor ? `${B}>${R}` : " ";
    let tag = `${D}·pending${R}`;
    if (disp === "accept") tag = `${GREEN}✓accept${R}`;
    else if (disp === "reject") tag = `${RED}✗reject${R}`;
    else if (disp === "defer") tag = `${YELLOW}~defer${R}`;
    const absorbed = state.watermark != null && isDecided(state, c.sha) && !afterWm.includes(c);
    console.log(`  ${marker} ${D}${c.sha}${R} ${tag}  ${c.subject}  ${D}${c.date} ${c.author}${R}`);
  });

  if (accepted.length) {
    console.log(
      `\n${D}${accepted.length} accepted awaiting absorb (blocked behind an undecided older commit until watermark advances)${R}`,
    );
  }

  console.log(
    `\n${B}[a]${R}${D}ccept${R}  ${B}[r]${R}${D}eject${R}  ${B}[d]${R}${D}efer${R}  ${B}[c]${R}${D}lear${R}   ${B}[j/k]${R}${D} move${R}  ${B}[w]${R}${D} advance watermark${R}  ${B}[q]${R}${D}uit${R}`,
  );
}

function decideCursor(disposition: "accept" | "reject" | "defer"): void {
  const queue = pending(state);
  const target = queue[cursor];
  if (!target) return;
  state = gateReducer(state, {
    type: "decide",
    sha: target.sha,
    disposition,
    reviewedAt: new Date().toISOString(),
  });
  if (cursor >= pending(state).length) cursor = Math.max(0, pending(state).length - 1);
}

function clearCursor(): void {
  // clear acts on the commit under the cursor within the full post-watermark window
  const win = commitsAfterWatermark(state).filter((c) => !isDecided(state, c.sha) === false || state.ledger[c.sha]);
  const target = win[cursor] ?? pending(state)[cursor];
  if (target) state = gateReducer(state, { type: "clearDecision", sha: target.sha });
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
render();

process.stdin.on("data", (key: string) => {
  switch (key) {
    case "a":
      decideCursor("accept");
      break;
    case "r":
      decideCursor("reject");
      break;
    case "d":
      decideCursor("defer");
      break;
    case "c":
      clearCursor();
      break;
    case "j":
      cursor = Math.min(cursor + 1, Math.max(0, pending(state).length - 1));
      break;
    case "k":
      cursor = Math.max(cursor - 1, 0);
      break;
    case "w":
      state = gateReducer(state, { type: "advanceWatermark" });
      break;
    case "q":
    case "\x03": // ctrl-c
      process.stdout.write("\x1b[2J\x1b[H");
      process.exit(0);
  }
  render();
});
