---
name: conveyor-ownership
description: Who owns each piece of the merge queue (the conveyor), where its code lives, the invariants that must not regress and the decisions already taken
---

# Conveyor ownership

The conveyor takes a verified card to `dev`: attempts and pushed work in progress, CI facts per card, then the queue
and green bundles. Design:
`docs/specs/maestro-lead/merge-queue.md`; spike evidence: `docs/specs/maestro-lead/merge-queue-spike.md`. How to change
it: skill `conveyor-maintenance`. User guide: `docs/guides/merge-queue.md`.

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
| Enqueue, dequeue, bundle cut, settle, merge-if-disjoint, record facts and the record port, 60 s tick | `packages/core/src/board/queue.ts`, `record.ts`, wired in `board.ts` | conveyor |
| `board_queue`, `board_dequeue` tools | `packages/core/src/board/tools.ts` | conveyor; Maestro only |
| `merge-outside-conveyor` guard | `script/guards/rules/merge-outside-conveyor.toml` | conveyor |
| Billing ledger `board_ci_run` | `packages/core/src/board/github.ts`, `money.ts` | board; unchanged by the conveyor |
| Queue visuals | `packages/app-shell` | Interface session |

## Invariants

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
- The PR body carries structure, hashes and the record only. Model spend never goes to GitHub.
- Core gathers record facts; Atlas renders bodies and commit trailers through `BoardRecord.Port`. Unbound, card
  bodies stay as written, the bundle body is one fixed line and merge commits carry no trailer.
- GitHub's server merge ignores `merge=union`; landing such paths takes a local merge and a fast-forward push.

## Decisions

- §14 is decided by the owner: bundles carry the `full.label` (`epic` here), `dev` uses `merge-if-disjoint`
  (`.orchestra/ci.json`), and the host merges a green bundle under the `board_queue` grant. With no contract,
  `onBaseMoved` defaults to `retest`.
- A red bundle (cancelled checks count as red) is `base-red` when its base commit's checks are red, else `red`; a base with no checks is unknown, never green, and gets a base probe (a memberless bundle on an empty commit) first; `red` halves the members until one card fails alone and goes back to Review (`bundle.dissolve`).
- The pool is the project: one open bundle per board project.
- The repository is public: attempts and snapshots carry structure and hashes only, never free text, spend or
  transcripts.
- Conflict notes are authored `orchestra` and name files and short shas only.
- The `<integration>` System Context line for conflicts waits for #1106's context sources.
- `board_read` does not show checks or the push state yet; it shows the queue state through `issue.queue`.
- The GitHub sync does not ship merged cards on its own; the queue ships them when it lands their bundle.
