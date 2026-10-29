---
name: conveyor-ownership
description: Who owns each piece of the merge queue (the conveyor), where its code lives, the invariants that must not regress and the decisions already taken. Use before answering a question about the queue, bundles, CI facts, snapshots or the Atlas record, or before changing any of them.
---

# Conveyor ownership

The conveyor takes a verified card to `dev`: attempts and pushed work in progress, CI facts per card, then the queue
and green bundles. Design:
`docs/specs/maestro-lead/merge-queue.md`; spike evidence: `docs/specs/maestro-lead/merge-queue-spike.md`. How to change
it: skill `conveyor-maintenance`. How it runs: `conveyor-usage`. User guide: `docs/guides/merge-queue.md`.

## Ownership

| Piece | Code | Owner |
|---|---|---|
| Wire types (`Check`, `CiRunInput`, `CiRunResult`, `ScopedState`) | `packages/schema/src/board.ts` | conveyor |
| `board_check` table and migration | `packages/core/src/board/sql.ts` | conveyor |
| CI contract reader, `ci_run`, scoped state | `packages/core/src/board/ci.ts` | conveyor |
| `ci_run` tool | `packages/core/src/board/tools.ts` | conveyor; Maestro only |
| Attempt ledger `board_attempt` (`AttemptOutcome`, `PushState`) | `packages/core/src/board/sql.ts`, `packages/schema/src/board.ts` | conveyor |
| Attempts on dispatch, snapshot push, push state, 10 min sweep | `packages/core/src/board/snapshot.ts`, wired in `board.ts` | conveyor |
| Base-advance sweep, conflict notes, `conflict_base`/`conflict_files`, `board_project.base_sha` | `packages/core/src/board/conflicts.ts`, wired in `board.ts` | conveyor |
| Queue stage, `board_queue`/`board_bundle`/`board_bundle_member`, `PrRecord` (`board_issue.record`) | `packages/core/src/board/sql.ts`, `packages/schema/src/board.ts` | conveyor |
| Enqueue, dequeue, bundle cut, 60 s tick | `packages/core/src/board/queue.ts`, wired in `board.ts` | conveyor |
| Lanes: the pure cut rules (`lanes`, `earlier`, `global`, `capacity`) | `packages/core/src/board/queue-lanes.ts`; `spread` in `queue.ts` | conveyor |
| Lane gate: the `packages` `workflow_dispatch` input | `.github/workflows/typecheck.yml`, `test.yml` | conveyor |
| Settle, land, skew (merge-if-disjoint), dissolve | `packages/core/src/board/queue-settle.ts` | conveyor |
| Red path: failing files, base state and probe, scoped judge, isolate, bisect, fix card, flaky | `packages/core/src/board/queue-red.ts` | conveyor |
| PR head, notes, record facts, record commit | `packages/core/src/board/queue-record.ts`; port `record.ts` | conveyor |
| Shared rollup judging, placement, release | `packages/core/src/board/queue-shared.ts` | conveyor |
| Card thread notes | `packages/core/src/board/thread.ts` | conveyor |
| Board log export and import (`BoardTree.event`, `BoardTree.restore`) | `packages/core/src/board/tree.ts` | conveyor |
| Queue numbers (`BoardLedger.of`) | `packages/core/src/board/ledger.ts` | conveyor |
| `board_queue`, `board_dequeue`, `board_bundle` tools | `packages/core/src/board/tools.ts` | conveyor; Maestro only |
| `merge-outside-conveyor` guard | `script/guards/rules/merge-outside-conveyor.toml` | conveyor |
| Billing ledger `board_ci_run` | `packages/core/src/board/github.ts`, `money.ts` | board; unchanged by the conveyor |
| Queue visuals | `packages/app-shell` | Interface session |

## Invariants

- Without `lanes` in the contract (or without `turbo.json` on base) the queue is phase 1, unchanged: one bundle at a
  time, labelled with `full.label`.
- A global card (a `lanes.global` path, or no affected set) goes alone or only with other global cards, and runs the
  whole suite with `full.label`.
- Rule 2 never starves a card: no card is cut ahead of an earlier bundleable card it overlaps, so a waiting global card
  holds everything queued behind it until the lanes in flight land.
- The epic bundle always runs the whole suite: a card whose epic has every open card queued gets no affected set, so it
  is cut as a global lane with `full.label`.
- `lanes.fullEvery` 0 is off and never starts a safety run. K above 0 starts one (a memberless bundle with `packages`
  `[]`, dispatched with no package filter) after K lane landings since the last whole-suite run, counted from bundle
  rows.
- A safety red pauses only the lanes that overlap F's packages: F counts as in flight for the lane rules until its fix
  card ships or is cut; the fix card rides alone; disjoint lanes keep cutting. There is no revert.
- A lane bundle always lands through `merge-if-disjoint`. The record logs under `.atlas/` are left out of its path
  overlap check because every bundle appends to them and they merge by union.

- A snapshot never touches the card's worktree, index or HEAD. It is a commit on the previous snapshot (else HEAD)
  pushed to `refs/orchestra/wip/<KEY>-<n>/a<attempt>`.
- The gitleaks scan fails closed: a hit or a scanner that cannot run blocks the push. `snapshot_sha` and
  `snapshot_tree` are written only after the push succeeds.
- A gone worktree with a snapshot is re-created at its path on the card's branch, with the snapshot written over its
  files only, so the work shows as uncommitted again (`restored`); with none it is a drift line (`missing`).
- `settle` treats a bundle whose head is already an ancestor of base as merged: it writes the rows, never pushes again.
- A new Session on a card opens the next attempt. The open one ends `failed` when the card had a crash reason, else
  `superseded`. `board_issue.attempts` follows the ledger.
- Checks are keyed by tree, never by commit. The tree comes from a temporary index: the card's worktree and index are
  never touched.
- The scoped state is derived from `board_check` on every read and never stored.
- A pass or fail on the same tree and command is never run again. An `error` row (could not start) is retried.
- `.orchestra/ci.json` is read from the base branch, never the card's branch. `merge` other than `merge` is refused.
- `test:ci` keys its upload by the tree plus `.ci-run.json`; `board_check` keeps the snapshot tree from before that file.
- The host never rebases or merges into a seat's worktree. A base advance only runs `git merge-tree` and writes a
  note; the seat merges base on its next dispatch.
- Only cards whose write set (declared paths plus the card's real diff from base) the advance touched are checked,
  plus cards that conflicted before. The first sighting of a base only records `base_sha`.
- Only the host moves a card into or out of `queue`; `board_move` refuses both. A card's queue state is derived on read.
- `board_queue` refuses a card without a PR, a complete record (Intent, Decisions, Not covered, Risk level), ready
  dependencies, a clean merge with base, or a `scoped-green` tree when the contract names scoped checks. It records the
  PR head it queued.
- A bundle lands only when its full gate is green, its PR head is the head it assembled and every member's PR head still
  equals the one recorded at assembly. A moved member is dequeued and the bundle dissolves; it never lands.
- The base branch is pushed with `--force-with-lease` on the base the bundle was tested on (or the tip it skewed onto),
  so a concurrent push to base fails the land instead of being overwritten.
- `merge-if-disjoint` lands without a retest only when the trial merge is clean, no file overlaps and the `turbo`
  affected sets are disjoint; any doubt (no `bun`, turbo error) is a retest.
- Plan drift never blocks a landing: a card whose real affected set left its `area` queues anyway and raises one note
  and one `integration` line. `area` and `order` are optional everywhere; without them nothing is checked.
- The PR body carries structure, hashes and the record only. Model spend never goes to GitHub.
- Core gathers record facts; Atlas renders bodies and commit trailers through `BoardRecord.Port`. Unbound, card
  bodies stay as written, the bundle body is one fixed line and merge commits carry no trailer.
- GitHub's server merge ignores `merge=union`; landing such paths takes a local merge and a fast-forward push.

## Decisions

- §14 is decided by the owner: bundles carry the `full.label` (`epic` here), `dev` uses `merge-if-disjoint`
  (`.orchestra/ci.json`), and the host merges a green bundle under the `board_queue` grant. With no contract,
  `onBaseMoved` defaults to `retest`.
- A red bundle (cancelled checks count as red) is `base-red` when its base commit's checks are red, else `red`; a base with no checks is unknown, never green, and gets a base probe (a memberless bundle on an empty commit) first; `red` halves the members until one card fails alone and goes back to Review (`bundle.dissolve`).
- The bundle size follows the red rate of the last 50 settled attempts (`size()`); infrastructure reds (`infra`) rerun once, and a second one sets the project's bundle to `paused`, which holds the queue until Maestro retries it. Eject writes outcome `ejected` and opens the next attempt through `BoardSnapshot.dispatch`.
- `failures()` reads job logs through `detailsUrl` with `gh api repos/<o>/<r>/actions/jobs/<id>/logs`, strips timestamps, and uses `BoardCi.failing`; `full.control` (`line` plus job-name prefixes) is the control-line infra rule and applies only to the jobs it names; `gating` matches `workflowName`.
- A red whose failing files are bun tests in turbo package groups is judged by `scope()` (base, code or flaky), not by base's checks; a `flaky` bundle keeps its PR open and is recorded in `board_flake` (migration `20261028230000_board_flake`).
- The pool is the project: one open bundle per board project, unless the contract has `lanes`; then one open bundle
  per lane, at most `floor(budget.jobs / lanes.jobs)` in flight.
- Lanes are recomputed from turbo's affected sets at every cut and never stored; only a bundle's `packages` is.
  A card whose affected set cannot be read counts as global. Turbo always reads the graph of the tree that lands (the
  commit merged onto base) in its own scratch checkout, never the project checkout, which may sit on any branch.
- A bundle PR carries its members' guard approval labels (decision 2026-10-29): the queue copies them at the cut, and
  the guard keeps reading only the PR it runs on. An approval stays per card; the bundle never gains one no member had.
- A lane bundle is gated by `gh workflow run` with `-f packages=...` instead of `full.label`, and settles from the
  dispatched runs (`dispatchRollup`); its red split looks only at closed bundles that share its cards.
- The repository is public: attempts and snapshots carry structure and hashes only, never free text, spend or
  transcripts.
- Conflict notes are authored `orchestra` and name files and short shas only.
- The `<integration>` System Context line for conflicts waits for #1106's context sources.
- `board_read` does not show checks or the push state yet; it shows the queue state through `issue.queue`.
- The GitHub sync does not ship merged cards on its own; the queue ships them when it lands their bundle.
- `BoardLedger.of` computes `Board.Ledger` from activity, check and attempt rows; it is optional on `Board.Snapshot`; per-lane numbers are phase 2.
- 2026-10-29: phase 2 (lanes, safety net, plan shape) starts without waiting for a real phase 1 epic.
- `BoardTree.restore` is a library call with no tool or CLI yet; it rebuilds structure only, never the queue, bundles,
  checks or GitHub sync.
