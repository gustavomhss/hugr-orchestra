# WP-W3 UI acceptance anchor

This is W3-A acceptance preparation, not a working manual-reading interface.
Current receipt: hosted red 43288085468 is verified against exact source. Solid
lane passed all 17 cases; browser lane passed the three existing store cases and
failed all eleven new controller/filter cases for the explicit unavailable anchors.
Focused Omni control is not applicable (zero spawns/delegated). W3-A is complete;
W3-B may author the frozen disjoint implementation. Subsequent pending-request
wording is historical. W2 green still gates closure and actual-HTTP rendered proof.
W1 is complete; W2's hosted red is verified and its candidate is implemented
and independently reviewed; hosted green remains pending.
W3-B dispatch requires its own verified hosted red and the frozen API/Client;
W2 integration still gates W3 closure and actual-HTTP rendered acceptance.
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

## Frozen W3-B execution decisions, not dispatch permission

W3's own hosted red still precedes runtime dispatch. W2's API/Client contract is
frozen and its implementation is independently reviewed, so its pending green
does not block disjoint controller/component authoring after that red. This
follows PLAN.md's existing overlap rule: dependencies with frozen contracts gate
integration order, not dispatch. W2 must pass before W3 closes or its actual-HTTP
rendered gate begins; no test/review/completion requirement is removed.
Once W3's red is verified, the controller worker owns only activity/worktree-reading.ts;
the lead owns worktrees.tsx, copy, guide, any narrow CSS/page changes and rendered
inspection. Their only shared seam is the existing Controller/State signature.
The worker does not change tests, Client, Server, Schema or component files.

Controller implementation decisions:

1. Use one actual Solid createStore for the public State. Keep request ownership
   in a private context epoch, disposed flag, AbortController set and per-scope
   pending promises. Constructing/ticking starts no request or timer.
2. Coalesce inventory and same-ID reads separately. Read only IDs present in the
   accepted snapshot; different rows remain independent. Each actual request has
   a distinct owned signal. Starting a request clears only that scope's failure.
3. Check context ownership before decoding/publishing/reporting/settling status.
   Decode using the canonical WorktreeSnapshot schema; report the actual generated
   Client error wrapper unchanged. Compare decimal revisions exactly with BigInt.
4. Adopt the first valid snapshot, including revision zero. Within one instance,
   greater revisions admit the entire immutable snapshot and one monotonic
   receivedAt anchor; equal/older ones settle their operation without changing
   readings, membership or age anchors. Same-instance keyed reconciliation may
   preserve row identity; new lifetimes replace the whole snapshot property.
5. On a different instance, advance the epoch synchronously, abort every old
   signal, clear old flights/status/readings, and start one fresh GET handshake.
   Coalesced refreshes join it. Only the new-context handshake establishes its
   instance. Old finalizers must never delete/settle new same-ID flights/status.
   Failed handshakes stay unavailable with deliberate refresh retry.
6. A GET error superseded by a newer admitted snapshot is obsolete. Other current
   failures set only their own scope's error, retain data/anchors and report once.
   Another row's success cannot clear that failure. Completed statuses for retired
   row IDs may be pruned with inventory membership; retain active scopes until
   settled. Disposal aborts/retire ownership and suppresses all later updates.
7. Default clock is performance.now; default reporting is console.error with
   Activity context. tick changes monotonic now only. matching preserves canonical
   row references/order and matches trimmed case-insensitive directory/projectID.

The component captures one resolved SDK object per reactive server context.
Its generated-method wrappers await that captured SDK's ready promise, check the
owned signal, then call the same captured client's method. It never reads sdk()
again after awaiting. Context/category cleanup aborts the controller and removes
its owned age timer. Mount/Refresh issue inventory only; row buttons issue reads.
Use source/age/attempt data from the admitted snapshot, preserving explicit unread,
zero, partial, blank owner, uncollapsed and unproved values. The project column and
filter use canonical projectID. Keep shared kit typography/horizontal scrolling;
inline errors and keyboard labels remain tied to the actual target.

## Verified UI baseline

Run [43288085468](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43288085468)
completed with Solid 17 pass/0 fail/109 expects and browser 3 pass/11 expected
failures/11 expects. All eleven new request/filter cases fail for missing request
admission/filtering; all existing cases and both additive locale cases pass.
There are no skips. Browser focused Omni control explicitly reports not applicable,
zero actual spawns and zero delegated; this proves no native behavior.

Fetched snapshot ff6887b900710e4a63eb9d3099b881690c50d73d matches App tree
04f66395d9d666268842a0e4c4bc86b175f152f6. Supporting Client/Protocol/Schema trees
also match current source; all 31 named outcomes and both lane boundaries are in
worktree-ui-baseline.json. No acceptance case or anchor changed after capture.
The actual HTTP/DOM/rendered observations remain pending, separate from this proof.

All first-wave executable red baselines now exist; first-wave dispatch readiness
is true, with implementation in progress. This is not completion: only R0/W1
are closed. W2 and W3 retain their independent green, review and integration gates.
