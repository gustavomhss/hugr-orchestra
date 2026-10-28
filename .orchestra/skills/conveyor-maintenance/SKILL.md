---
name: conveyor-maintenance
description: How to change the merge queue (conveyor) safely — the CI contract, ci_run and the board_check ledger — with the traps and the gates to run
---

# Conveyor maintenance

Read `conveyor-ownership` first. Spec: `docs/specs/maestro-lead/merge-queue.md`, §5 for CI facts.

## Where a change goes

- New contract field: the `File` schema and `Contract` type in `board/ci.ts`, the default in `contract` and `defaults`,
  and `docs/guides/merge-queue.md`.
- New check kind or outcome: `CheckKind` or `CheckOutcome` in `packages/schema/src/board.ts`, then `state` in `ci.ts`.
- New column: `BoardCheckTable` in `board/sql.ts` (snake_case), then `bun run migration --name <name>` in
  `packages/core`.
- Exposing checks over HTTP or in `board_read`: protocol group and handler, then `bun run generate` in
  `packages/client`.

## Traps

- `scoped.tests` is split on whitespace and run without a shell. `{files}` expands to one argument per file.
- A workflow dispatch returns no run id. `settle` matches the newest `workflow_dispatch` run on the dispatched commit
  created after the dispatch; two dispatches of one workflow on one commit can swap.
- Workflow rows carry the pushed branch's tree, so they count toward the state only when the worktree matches what
  was pushed.
- `ci_run` waits for `scoped.tests`; with `test:ci` that is minutes.

## Gates

- Tests on Actions only: `bun run test:ci core test/board-ci.test.ts` (add `test/board.test.ts` and
  `test/board-tools.test.ts` when board code moves).
- Typecheck: `gh workflow run typecheck.yml --ref <branch>`. Never on the Mac.
- `bun run check:guards --base origin/dev` before calling a change done.
