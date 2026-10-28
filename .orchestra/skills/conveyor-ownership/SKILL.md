---
name: conveyor-ownership
description: Who owns each piece of the merge queue (the conveyor), where its code lives, the invariants that must not regress and the decisions already taken
---

# Conveyor ownership

The conveyor takes a verified card to `dev`: CI facts per card, then the queue and green bundles. Design:
`docs/specs/maestro-lead/merge-queue.md`; spike evidence: `docs/specs/maestro-lead/merge-queue-spike.md`. How to change
it: skill `conveyor-maintenance`. User guide: `docs/guides/merge-queue.md`.

## Ownership

| Piece | Code | Owner |
|---|---|---|
| Wire types (`Check`, `CiRunInput`, `CiRunResult`, `ScopedState`) | `packages/schema/src/board.ts` | conveyor |
| `board_check` table and migration | `packages/core/src/board/sql.ts` | conveyor |
| CI contract reader, `ci_run`, scoped state | `packages/core/src/board/ci.ts` | conveyor |
| `ci_run` tool | `packages/core/src/board/tools.ts` | conveyor; Maestro only |
| Billing ledger `board_ci_run` | `packages/core/src/board/github.ts`, `money.ts` | board; unchanged by the conveyor |
| Queue visuals | `packages/app-shell` | Interface session |

## Invariants

- Checks are keyed by tree, never by commit. The tree comes from a temporary index: the card's worktree and index are
  never touched.
- The scoped state is derived from `board_check` on every read and never stored.
- A pass or fail on the same tree and command is never run again. An `error` row (could not start) is retried.
- `.orchestra/ci.json` is read from the base branch, never the card's branch. `merge` other than `merge` is refused.
- `test:ci` keys its upload by the tree plus `.ci-run.json`; `board_check` keeps the snapshot tree from before that file.
- GitHub's server merge ignores `merge=union`; landing such paths takes a local merge and a fast-forward push.

## Decisions

- §14 owner questions are open. Each "Recommended" answer is a config default, not a constant: `onBaseMoved`
  defaults to `retest`.
- `board_read` does not show checks yet; WP4 adds them with the rest of the integration state.
