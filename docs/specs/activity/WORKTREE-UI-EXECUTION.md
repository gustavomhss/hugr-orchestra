# WP-W3 UI acceptance anchor

This is W3-A acceptance preparation, not a working manual-reading interface.
W1 is complete; W2's hosted red is verified and W2 implementation is next.
W3-B still requires its own verified hosted red and W2 integration.
PLAN.md retains the six explicit fields for WP-W3 and each task.

## Frozen source and ownership

App src/orchestra/chapters/activity/worktree-reading.ts exports WorktreeReading.
make accepts the two actual generated Activity Client methods, an optional
monotonic clock and optional error reporter. Controller exposes its actual store
through state, refresh/read/tick/dispose. matching filters canonical record
references by directory/projectID. Both anchors explicitly throw unavailable;
ActivityWorktrees does not import them yet. Current user behavior is unchanged.
WORKTREE-UI-PREPARATION.md records exact status, lifetime/handshake and filter
decisions plus the separate isolated rendered gate.

Acceptance source is split into bounded reviewed units:

- test-browser/activity-worktree.test.ts: seven W09/W12 request, ordering,
  lifetime, disposal and per-target-error cases, 361 lines; authored by a worker.
- test-browser/activity-worktree-reading.test.ts: two W10 reading/protocol cases
  and W11 filtering, 165 lines; lead-owned.
- test-browser/activity-worktree-stale.test.ts: W12 same-ID old-context outcomes
  cannot settle a replacement target's busy/failed status, 41 lines; lead-owned.
- test-browser/activity-worktree-fixture.ts: actual generated Promise Client
  over a deferred transport, injected clock/reporter and bounded request gates.
  This proves controller/store admission, not actual HTTP, DOM or mounting.
- Existing activity/copy.test.ts adds real EN/BR translator assertions for
  source, row action path, entry/gap counts, age, exact tab names and vocabulary.
  Two additive typed copy keys are prepared for the eventual component.

Lead owns fixture, anchor, reading/stale/copy tests, page/localization and mapping;
the worker owns only its request/lifetime test file. No shared-file writes were
delegated. Production request admission/UI implementation remains separate.

## Review and local checks

Each bounded source unit received independent quality approval. The first
quality review found vacuous attempt/failed-status reset assertions; the case
now establishes both before replacement and proves they clear. Coverage review
found a missing same-ID old-context completion oracle; the new W12 stale case
protects both a new busy action and a current failed action. Reading/copy review
required explicit entry/gap/age substitutions and zero/partial/empty/filter/owner
rendered steps. Those gaps were closed. Both disjoint coverage scopes then
received two consecutive fresh clean reviews. No review claims runtime success.

App package bun typecheck passed, as did scoped formatting and diff checks.
Guardrails passed with 0 gates and the existing reviewed R0 migration-ignore
warning. A mistaken root typecheck was stopped with its owned descendant checks;
the package-scoped App rerun passed. No local tests, owner app/server restart or
database migration occurred. Relay arms exist but the hook is unconfigured;
manual review/gates are the evidence, not mechanical enforcement.

## Hosted baseline request

Proposed exact pack, Linux and the repository's separate Solid/browser lanes:

```sh
bun run test:ci app test-browser/activity-worktree.test.ts test-browser/activity-worktree-reading.test.ts test-browser/activity-worktree-stale.test.ts test-browser/activity-snapshot.test.ts src/orchestra/chapters/activity/copy.test.ts src/orchestra/chapters/activity/reading.test.ts src/orchestra/chapters/activity/inventory.test.ts --os linux
```

The eleven new controller/filter cases must fail for the explicit unavailable
anchors. The existing process-store, reading, inventory and copy cases remain
the regression floor, and additive translation cases should pass. Inspect actual
named outcomes and focused Omni control before accepting that baseline; no
controller case spawns through Omni or proves native behavior. Capture/fetch
the snapshot and compare the complete App tree, including the typed copy keys.

Acceptance commits: 5d5024e89d (lead unit) and a57402023d (request/lifetime unit).
Requested App tree: 04f66395d9d666268842a0e4c4bc86b175f152f6.
The reviewed pack is now active in test:ci; log /tmp/activity-worktree-ui-red-ci.log,
exit /tmp/activity-worktree-ui-red-ci.exit. Do not start a duplicate request.
No hosted W3 result exists yet. Rendered actual-HTTP EN/BR/narrow/keyboard/source/
error observations remain explicitly pending until W2 and W3 implementation.
