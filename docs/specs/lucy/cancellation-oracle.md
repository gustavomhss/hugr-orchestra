# Cancellation oracle readiness — proposed, not verified

Baseline `750a23b8ed`; delayed-undo candidate `6a99d681ef3c990b96021971eaa8d002f5e843f5`;
graph join examined at `4897b2bb49`. This is a proposal for lead freeze,
not permission to modify production or tests, and not runtime evidence.

## Actual seams and public scheduling surface

- `ReviewSnapshot.Writer` is a `Context.Reference` of
  `(file: string, content: string | Uint8Array) => Promise<void>`; `writeSnapshot`
  awaits it. `withSnapshotMutation` uses `Effect.acquireUseRelease(change, use,
  () => undo)`. `ReviewProbe.run` owns a shared `HOST` permit through an Effect
  scope. The actual regress path uses that writer for forward and undo writes.
- The worktree has no installed Effect dependency. The canonical repository's
  installed `packages/core/node_modules/effect` is `4.0.0-beta.83`, matching
  this baseline's root package pin. Its `dist/Scheduler.d.ts` exports
  `Scheduler.Scheduler` (a `Context.Reference`), `Scheduler.MixedScheduler`,
  `Scheduler.SchedulerDispatcher` with `scheduleTask(task, priority)` and `flush()`;
  `MixedScheduler.makeDispatcher()` returns a dispatcher. `flush` drains already
  queued Effect tasks synchronously, not arbitrary future Promise reactions or IO.
  This is not evidence that the runtime uses a particular captured dispatcher.
- `effect/testing` exports `TestClock`; its `TestClock.layer()`, `adjust(duration)`,
  `setTime(timestamp)` and `withLive` control Effect clock sleeps. Repository
  examples: `packages/core/test/lib/effect.ts:52` provides `TestClock.layer()`;
  `test/actions-transport-gitlab-http.test.ts:152` uses `TestClock.adjust`.
  `test/fixture/actions-transport.ts:98` explicitly distinguishes clock advance
  from OS exit callback. `dist/testing` contains no declared test scheduler.
- `6a99` pauses before the real undo `Bun.write`, then uses `interruptUnsafe`,
  `yieldNow` and `pollUnsafe`. Those polls do not causally force the parent
  permit finalizer to have had its opportunity before opening the gate.
- `DependencyShadow.project` at `4897b2bb49` stores the native `projectGraph`
  Promise and joins it in `Effect.onInterrupt`; publication uses actual `mkdir`,
  `link` and `symlink`. This is a separate physical-publication/cleanup ordering
  claim, not the review-probe HOST permit claim. Its rechecks are not OS-atomic.

## Lead decision needed: deterministic checkpoint seam

No inspected public API establishes quiescence across Effect task dispatch,
native Promise microtasks and filesystem callbacks. A custom scheduler may be
possible, but its integration with actual probe fibers and native continuations
has not been established. Neither `flush`, `TestClock.adjust`, `yieldNow`, a
sleep, an empty poll nor observing a release only after opening the gate proves
that the detached-undo mutant had an opportunity to release *before* the gate.

Proposed smallest seam to freeze and validate, not an existing API:

```
type CancellationOracle = {
  checkpoint: (point: "undo-promise-pending" | "before-host-release" |
    "publish-promise-pending" | "before-scratch-remove") => Promise<void>
}
```

Provide it as an opt-in scoped `Context.Reference` with a no-op default, placed
at the actual boundaries rather than replacing `Writer`, `HOST`, publication or
scratch cleanup. `before-host-release` must run immediately before the real
permit release, `before-scratch-remove` immediately before real removal; they
record the already-observed completion state synchronously before any await.
The pending checkpoints must signal only after the real Promise is installed.
They are instrumentation, not a synthetic permit or substitute graph. Exact
placement, error handling, and whether this seam is acceptable require lead
approval. Instrumentation by itself does **not** establish a negative proof:
the lead must additionally freeze a deterministic dispatcher/continuation
handshake that forces the actual interrupted parent through all runnable release
work while the native write remains gated. If that cannot be demonstrated from
the real Effect runtime, the mutant-killing pre-gate oracle remains blocked.

## Required undo experiment after freeze

1. Real owned repo and actual public regress; test both reverted hunk and borrowed
   base test. A scoped one-shot Writer performs forward `Bun.write`, then signals
   the second call and holds **before** the real undo write. Verify temporary
   bytes with an outside reader. Interrupt only after this signal.
2. Force and acknowledge interrupt delivery and drive the actual parent release
   boundary using the frozen handshake, not a fixed number of yields or time.
   Start a real second probe; record its real admission and permit boundary.
   Before opening the gate, the deliberately detached-undo mutation must reach
   actual `before-host-release` with restoration incomplete and fail there.
   This failure must be observed before opening the gate, not inferred from a
   later read. A test timeout is a bounded failure, not a positive proof.
3. Correct implementation must hold the permit while the writer is gated. Open
   the gate; await actual `Bun.write` completion and read restored bytes before
   permitting the real HOST release. Await the original fiber's interrupted Exit;
   the real queued probe must run on its own correct HEAD/BASE marker, never the
   temporary marker. Assert reviewed worktree bytes/link targets unchanged and
   snapshots removed after scoped cleanup. Gate release belongs in an ensuring
   path that runs before scoped child interruption/join, even on test failure.
4. Positive-control the actual release observer with a safe deliberately
   ungated run and the writer signal with a real write; mutation-test detached
   undo and an interruptible undo independently. Record real jail availability;
   a skipped jail is not evidence. Fake runners alone do not meet this oracle.

## Graph publication experiment after freeze

Use an owned dependency fixture, actual snapshot/project and an instrumented
real publish operation whose native Promise is held before a selected filesystem
operation finishes. Confirm the operation was reached, interrupt its owner, and
force the parent cleanup boundary with the same proven continuation handshake.
The no-join mutant must hit `before-scratch-remove` while publication is pending
and fail **before** the gate opens. For the correct join, release the gate, await
the actual filesystem operation and the complete `projectGraph` Promise, then
observe scratch removal and check no later graph writes and unchanged external
owned bytes/modes/link targets. Positive-control actual publication and cleanup;
test errors as well as interruption. A test-only observer after removal is too late
to establish causality. Do not claim OS-atomic source identity or general
filesystem hermeticity from this ordering test.

No tests, CI, scheduler experiments, binaries or runtime were executed here.
