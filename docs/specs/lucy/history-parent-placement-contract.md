# History child placement acceptance

## Contract

`Session.create(input, options)` gains one optional, host-only field on its second argument: `inheritParentPlacement`. It is not a model input, event payload, stored Session attribute or permission grant. Omission and `false` preserve existing live project resolution.

For a new Session, `true` requires an existing parent outside closing admission and an exactly equal Location: both `directory` and `workspaceID`. Creation captures the parent's `projectID`, Location and persisted `SessionTable.path` under topology admission, then revalidates that tuple inside the existing admission gate and event transaction before publishing. It uses the captured parent's placement without a new live `Project.resolve` for that child.

The existing names differ across the boundary: `Session.Info.subpath` exposes the public relative path; `SessionEvent.Created.data.subdirectory` is the optional event field; the projector persists that field in `SessionTable.path`. `Info` normalizes both an empty stored path and `null` to `undefined`. Capture and revalidation therefore preserve the raw stored path, including the empty/null distinction, without inventing a public `Info.subdirectory` field. The nested-directory acceptance reads `Info.subpath` and keeps the event assertion on `data.subdirectory`.

A missing, closing, mismatched or moved parent is unavailable for this admission and produces the existing typed `Session.NotFoundError` naming that parent. A new root request with `true` produces `Session.NotFoundError` naming the requested/generated child ID. Neither refusal publishes a child event or leaves a child row. Existing Session ID adoption remains unchanged: a retry returns the recorded identity rather than reassigning it from new arguments or this option.

Initial production use is confined to the two engagement child-creation paths whose identity failures were observed under Git history overlays. Fix-review creation keeps its existing behavior until a separately supported change is needed. Lucy's ownership verification remains unchanged.

## Native acceptance

`packages/core/test/session-parent-placement.test.ts` uses the real Session, Project, Event projector, SQL database and native Git through `AppProcess`. Its two actual commits establish different root identities when a real shallow marker or graft removes the earlier parent from Git's visible ancestry. Each overlay case proves the changed identity through real `Project.resolve` before asserting inheritance.

The seven cases cover:

- Two overlay cases: inherited placement under shallow/graft state, with default root, default child, explicit `false`, and different-location controls executed before the new assertion.
- A root request with `true`, refused without a durable row or event.
- A missing parent, refused without a durable row or event after a real positive child control.
- Separate directory and workspace mismatch refusals, each with successful default creation at the mismatched Location.
- Adoption of an existing Session ID, preserving the original row and its single creation event even when retry arguments name another parent and Location.

The new option is passed through a variable containing the already-supported `beforeCommit: Effect.void`; these tests therefore compile against the API before the new option exists. No production cast, stubbed Session, substituted Project, fabricated Git result or provider response is needed. `SessionExecution.noopLayer` is the existing create-test execution fixture: the tests request no drain or LLM, and all creation, project resolution, persistence and publication remain real.

## Limits and qualification

This supplemental acceptance was authored after the Main round-two A05 run exposed three engagement identity failures under overlays. It is a separate gate, not part of the earlier frozen history regression chronology. Before production changes, the frozen supplement must compile and produce causal assertion failures against the unchanged Session implementation on the hosted matrix. The original `session-create.test.ts` and `session-removal-admission.test.ts` provide preservation coverage after the change.

The first hosted baseline, run `46178075785` at source `27075b4189c0f32c6bdf18dec84c8d9b44f934ac` and snapshot `d3e668c9976e1b856c2e26bf38f72d3c14ac3a1e`, was invalid preparation: package typing failed before tests on all three hosts because seven test observations incorrectly used `Info.subdirectory`. No behavior ran and no production gate closed. The repair changes only those public observations to the existing `Info.subpath`, while preserving the event field, inputs and assertions. The repaired bytes require a new freeze and hosted baseline; the earlier source-only reviews did not establish compilation.

The supplement does not establish a race in which the parent moves between capture and the final transaction. The current `beforeCommit` checkpoint runs inside publication and the admission/transaction scope, so treating it as a pre-transaction race would be inaccurate and could deadlock. The implementation still must revalidate the captured tuple and closing state before publishing. Independent source review and the existing removal-admission regressions are required; a later focused race test needs a real observable pre-transaction boundary rather than a fabricated Session/Event/SQL implementation.

These tests also do not qualify the scoped-history directory-enumeration allocation bound or the separate A05 deadline supplement.
