---
name: conveyor-maintenance
description: How to change the merge queue (conveyor) safely — the CI contract, ci_run and checks, attempts and snapshots, the queue, bundles, red path, card thread, record commit and board import — with the traps and the gates to run. Use before editing packages/core/src/board/{ci,snapshot,conflicts,queue*,record,thread,tree,ledger}.ts.
---

# Conveyor maintenance

Read `conveyor-ownership` first; runtime behavior is `conveyor-usage`. Spec: `docs/specs/maestro-lead/merge-queue.md`, §5 for CI facts, §8 for attempts,
snapshots and targeted rebase notices (§8.4), §6 and §4.5 for the queue, bundles and the PR record.

## Where a change goes

- New contract field: the `File` schema and `Contract` type in `board/ci.ts`, the default in `contract` and `defaults`,
  and `docs/guides/merge-queue.md`.
- New check kind or outcome: `CheckKind` or `CheckOutcome` in `packages/schema/src/board.ts`, then `state` in `ci.ts`.
- Attempt fields: `BoardAttemptTable` in `board/sql.ts`; who opens and ends attempts is `dispatch` and `follow` in
  `board/snapshot.ts`.
- Card thread notes: `board/thread.ts` owns them. Ids are deterministic (`bno_<promptID>`, `bno_review_*`,
  `bno_verdict_*`, `bno_rework_*`) so exact retries write once. Blocked comes from `TaskGovernance.settle`'s `blocked`,
  never from text.
- Record commit: `recordBundle` in `board/queue-record.ts` writes spec §4.7 through `@orchestra/atlas-boundary/record-log`.
  Redaction comes from `gh api repos/<slug>` (`.private`; any failure counts as public); free text goes in a board
  event's `text`, never in `before`/`after`. Writers skip lines already present so a rebuilt bundle does not duplicate
  them.
- Which cards a base advance checks: `WATCHED` and the candidate query in `board/conflicts.ts`.
- Enqueue preconditions: `enqueue` in `board/queue.ts`; they are checked again inside the write transaction.
- Per-project `busy` set in `BoardQueue.make` keeps a project from settling twice when ticks overlap. `accepted` is the
  only non-`open` bundle status that `openBundle` returns (a flaky bundle Maestro merged with `board_bundle`).
- Lane rules (spec §7.2): the pure `lanes` in `board/queue-lanes.ts`; `spread` in `board/queue.ts` builds each card's
  affected set and cuts one bundle per lane through `cut(..., lane)`. The lane gate's workflows read the `packages`
  input in `.github/workflows/typecheck.yml` and `test.yml`.
- Cut rules and bundle order: `cut` in `board/queue.ts`. Landing and base moves: `settle` and `skew` in `board/queue-settle.ts`; the red path in `board/queue-red.ts`. `settle` checks
  for an already-landed head (an ancestor of base) before it pushes; restore from a snapshot lives in `push` (`restored`).
- PR record fields: `PrRecord` in `packages/schema/src/board.ts` (what Maestro writes), the completeness check
  `incomplete`, and `recordOf` in `board/queue-record.ts` (host facts). Rendering is Atlas's: core calls the
  `BoardRecord.Port` in `board/record.ts`, bound through `Board.layerWith({ record })`. Its types mirror Atlas's
  `PrRecord`/`BundleRecord`/`Trailer`; change both sides together. Never add a renderer in core.
- Plan shape (spec §4.4): `area` and `order` are `board_issue` columns, written by `board_issue` (`board.ts`) and
  replayed by `tree.ts`. The enqueue drift check is `drift` in `board/queue-drift.ts`, one call in `enqueue`. It only
  writes a note and an `integration` line; it never refuses. The overlap rule at plan review is prose in
  `maestro-plan`, and `archie-plan` decomposition owns the fields. The drift test stands in `bun` on PATH
  (`itTurbo` in `test/fixture/board-queue.ts`), so it skips on Windows.
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
- A `ci_run` without `package` against a `{package}` template computes the card's packages: it commits the snapshot
  tree with `commit-tree` (no ref keeps it) because turbo compares commits, diffs it against the merge-base with base,
  and asks `affected` (bound through `Board.layerWith({ affected })` in tests). Only an empty set records
  `BoardCi.UNTOUCHED`; never let it pass silently for a card that changes code.
- gitleaks comes from `BackendToolkit.ensure`; tests pass a fake through `Board.layerWith({ scanner })`. The scanner is
  a command (executable plus leading arguments), so a test fake is a `.ts` file run as `[process.execPath, fake]`, which
  spawns on Windows too. The scan exits 0 clean, 1 on a finding, anything else could not run.
- An attempt with no stored worktree is located by `git worktree list` on the card's branch, then saved. git lists
  Windows paths with forward slashes, so the path goes through `path.resolve` before it is compared or stored.
- `snapshots.remote` is read through `ci.contract`; with no `ci.json` that costs a `gh api` call per card per sweep.
- The conflict sweep reads `base` through `ci.contract` too: one `gh api` call per project per minute without
  `ci.json`.
- `git merge-tree --write-tree` exits 0 clean and 1 on a conflict, listing the files after the tree line; above 1 the
  card gets no note for that advance.
- Every `gh` call goes through the injected `Gh` (`Board.layerWith({ gh })`); tests fake GitHub there and run real git
  against a bare origin.
- A bundle branch is `bundle-<KEY>-<n>`, pushed with force; the base branch only with `--force-with-lease`.
- `turbo` runs through `bun x turbo --dry=json` with a 120 s timeout; any failure means retest, never land.
  `affected` runs it in a detached scratch worktree of `to` merged onto `from` (`merge-tree` plus `commit-tree`, so
  the graph is the tree that lands), never in the project directory: turbo reads the workspace
  graph from its working tree, and a project checkout on an old branch once fed a lane a package base no longer had
  (`No package found with name ...`), so the lane gate failed on a host bug.
- `cut` reads each member's labels with its head (`QueueRecord.head`) and opens the bundle PR with every
  `guardrail-approved` and `guardrail-approved:<rule>` label its members carry, and no other label. The guard reads the
  bundle PR, so an approval Maestro gave a card must travel with its change.
- The tick runs every 60 s in the board poll; it settles the open bundle before it cuts a new one. With lanes it
  settles every open bundle, then cuts lanes in the same tick.
- workflow_dispatch runs never show in a PR's status rollup: a lane bundle's checks come from `gh run list` and
  `gh run view` on its branch and head (`dispatchRollup`). A lane bundle gets no `full.label`, or the full suite would
  run too.
- Invariants to keep: phase 1 is unchanged without `lanes`; a global card goes alone; rule 2 never starves a card;
  the epic bundle always runs the whole suite; a safety red pauses only overlapping lanes; `fullEvery` 0 is off.
  `test/board-lanes.test.ts` covers them.
- Safety net (spec §7.3): `spread` counts merged lane bundles (non-null `packages`) since the last whole-suite point (a
  merged bundle with `packages` null, or a closed memberless bundle) from a left join on member position 0, and starts
  `probe(..., tip, body, [])` when the count reaches `fullEvery`. `packages: []` overlaps nothing, and `dispatched`
  sends it through the lane workflows with no `-f packages`, which run every package. A memberless bundle with
  `packages` set that goes red runs `safety` in `queue-settle.ts`: infra closes `infra`, F that passes on base closes
  `probe-green`, F red on base bisects, opens the fix card and closes `base-red` with `failing`; any other red closes
  `base-red` without `failing`, which falls back to phase 1 for the whole project.
- Narrowed base red: `spread` reads the latest bundle with `failing` whose fix card is neither shipped nor cut, adds
  F's package names to the lanes flight, and cuts the fix card through `cut(..., lane, broken)` alone; only a
  `base-red` at the tip without `failing` takes the phase 1 fallback. `bisect` starts from the last green whole-suite
  point, never a lane bundle.
- `size()` reads the last 50 settled attempts (`merged` or `ejected`) for the bundle size; `infra` reruns once and `paused` (a second infra red) stops `cut`. Eject writes outcome `ejected` and opens the next attempt via `BoardSnapshot.dispatch`.
- `failures()` reads job logs through `detailsUrl` with `gh api repos/<o>/<r>/actions/jobs/<id>/logs`, strips timestamps, and uses `BoardCi.failing`; `full.control` (`line` plus job-name prefixes) is the control-line infra rule and applies only to the jobs it names; `gating` matches `workflowName`.
- `cut` reads the last closed bundle: after a `red` it cuts half its members (the cap); after `base-red` it waits until the base tip moves. A memberless bundle is a base probe: it closes `probe-green` or `base-red` and never merges; `cut` looks past a `probe-green` to the `probing` bundle before it.
- Section 6.8: a base-red bundle sets `culprit`, `failing` and `fix_issue_id` (migration `20261029070552_board_base_fix`). `cut` reads them from the last closed bundle and cuts only its fix card while base stays put; a fix bundle that stays red closes `base-red` with the same fields, so the wait holds. `fixCard` reuses an unshipped fix card.
- `scope()` adds its scratch worktrees one at a time (concurrent `git worktree add` races on the lock), runs F in parallel and returns base, code or flaky; `BoardCi.packaged` maps failing bun files to their turbo group; `flaky()` writes the `board_flake` row (migration `20261028230000_board_flake`) and keeps the bundle open.
- `isolate` runs its scoped checkouts one at a time because of the worktree lock. Bundle `rebuilds` counts consecutive `isolated` reds. A queue row's `hold` (`held`, `alone`) is cleared when the card is cut.
- `board/tree.ts` owns export (`BoardTree.event`, called by the record commit) and import (`BoardTree.restore`). One applier per `Board.Action` in `APPLIERS`; a new action needs a new applier (the `Record<Board.Action, ...>` type forces it) and a structure field in its activity `after`. Unknown actions fail with `BoardTree.UnknownActionError`.
- Keep every queue module under 750 lines (`script/godfile.ts`): the epic fails above it. A new concern gets its own `queue-*.ts` built from the shared `Context`, like `makeRed` and `makeSettle`.
- Write-set matching drops `:L` line ranges and matches patterns with `Bun.Glob`, like the arsenal's `conflictVerdict`.

## Gates

- Tests on Actions only: `bun run test:ci core test/board-ci.test.ts test/board-snapshot.test.ts test/board-conflicts.test.ts test/board-queue.test.ts test/board-queue-red.test.ts test/board-queue-scoped.test.ts test/board-tree.test.ts test/board-lanes.test.ts` (add `test/board.test.ts` and
  `test/board-tools.test.ts` when board code moves).
- Typecheck: `gh workflow run typecheck.yml --ref <branch>`. Never on the Mac.
- `bun run check:guards --base origin/dev` before calling a change done.
