---
name: session-core-maintenance
description: Maintaining the V2 session run coordinator - wake, interrupt and failure semantics and the tests that pin them. Use when changing packages/core/src/session/run-coordinator.ts or session/execution/local.ts.
---

# Session core maintenance

Code: `packages/core/src/session/run-coordinator.ts` (per-Session serialization), `session/execution.ts` and `session/execution/local.ts` (routing to the runner). Spec: `docs/specs/v2/session.md`.

## Wake and interrupt

- `wake` while a drain runs only sets `pendingWake`. It reports durable inbox work admitted after the drain began, and the coordinator cannot see the inbox, so that flag is the only thing that will promote it.
- `interrupt` stops the drain and leaves the inbox alone. A wake recorded before or during the interrupt still runs one follow-up (`settle` creates the successor). Do not clear `pendingWake` in `stop`: the steer would stay pending until an unrelated wake. `{ discardPending: true }` exists for a Session being removed; `V2Session.remove` should pass it.
- A wake for a Session that no longer exists is a no-op in `local.ts`; only a forced `run` of a missing Session is a defect.
- A failed drain also gets one successor when a wake arrived meanwhile. The successor is a normal non-forced drain, so it promotes new inputs only. Inputs already pending before the drain began are not re-woken after a failure: that would retry provider work, which needs the recovery design named in the spec.

## Tests

`packages/core/test/session-run-coordinator.test.ts` pins each rule with gates, no sleeps:

- "runs one follow-up for a wake recorded during it" and "promotes a steer admitted mid-drain after the drain is interrupted" (interrupt)
- "drops a wake ... with discardPending"
- "promotes an input admitted mid-drain with exactly one successor when the drain fails" and "does not chain successors when the successor of a failed drain fails too" (failure)

Run them with `bun run test:ci core test/session-run-coordinator.test.ts`.
