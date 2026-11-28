# Scoped TypeScript probe: shared R8 permit

Status: focused R8 correction qualified by hosted causal RED, GREEN and
preservation tests. This is not the final Lucy campaign acceptance.

Discovery: PR #1676 merged as `c585d7ae79e676f2aca89bf86aa8770cf03a1468`;
its reviewed source is `3c584c7eae4cf6e3e0d60976db88c17a0e977213`.
Integration baseline: `c3ed848aef3c0883097eb8611bbd8eb1090f41f1`.
The reviewed scoped compiler, ResearchProcess, Omni spawner and existing
cancellation fixtures are unchanged at this baseline. Hosted acceptance must
run against the integrated current source, including native Omni updates.

## Problem

At the baseline, `ReviewProbe.run` acquires one process-global review-probe permit
before its closed runner and retains it through cleanup. `ReviewScopedTypecheck.run`
calls `ResearchProcess.run` directly. The native Session permit is
acquired later, so neither it nor the per-engagement four-attempt counter
limits concurrent scoped compilers across requests.

R8's existing review-probe cap is one. The separate research-probe semaphore
and the native Session semaphore are not substitutes for this shared permit.

## Required behavior

1. Existing review probes and scoped TypeScript probes share the same existing
   process-global R8 permit. Do not introduce another independent semaphore or
   increase the cap.
2. Acquisition is interruptible and has a finite queue wait. An unavailable
   permit produces an unavailable result, not native execution or acquisition
   of a runtime. Preserve the caller's cumulative deadline.
3. Hold the permit through actual process supervision and scratch cleanup.
   No later review probe starts before the previous holder releases it.
4. Cancelling a waiter neither interrupts the owner nor releases a permit the
   waiter did not acquire. The next independent request can proceed after the
   real owner finishes, without a leaked permit.
5. Keep the existing `ReviewProbe.ObservePermit` events truthful for both
   callers: `waiting`, then `acquired` and `released` only when ownership was
   actually obtained. No simulated events may stand in for admission.
6. Preserve scoped source identity, no-acquire preparation, confinement,
   compiler arguments, complete output, bounded execution and replay semantics.
   This correction adds no runner or platform and does not resolve the separate
   question of revalidating cache bytes against original artifact pins.

## Frozen behavioral packet

File: `packages/core/test/review-toolkit/scoped-typecheck-concurrency.test.ts`.

Two Linux x64 cases use real prepared TypeScript, the real existing review-probe
API, real Git snapshots, the existing sandbox and actual AppProcess
spawns. Both first run successful compiler and script controls. The first
holds the existing runner's actual cleanup; the second holds the return of an
already-started scoped compiler's native handle. Neither fixture substitutes
compiler output, process results, filesystem cleanup or the semaphore.

- **Legacy owner to scoped waiter:** a compiler must reach the existing
  permit wait before a spawn. Releasing actual cleanup then permits its real
  successful compilation. Event order proves cleanup before release before
  the second acquisition and spawn.
- **Scoped owner, cancelled scoped waiter, legacy follower:** a waiting
  compiler is interrupted without spawning or releasing the owner's permit.
  The old runner stays queued until the real scoped owner finishes; its real
  execution succeeds afterward.

The baseline has no shared scoped admission, so an actual scoped spawn wins
the rendezvous and the `waiting` assertion fails. A prerequisite, typecheck,
timeout, or early not-run failure is preparation failure, not qualifying RED.
Unsupported hosts retain active `unsupported-platform` checks; these do not
qualify the Linux concurrency behavior. There are no skipped tests.

## Hosted gates

Run the package typecheck and the two new cases in the official Linux
`test:ci` path. Freeze source and test bytes for RED. Only after causal RED,
implement the shared permit and require both cases GREEN plus the existing
`scoped-typecheck`, `probe-cancellation`, and `probe-dispatch` regressions.
Retain run IDs, exact source/snapshot comparisons, results, Omni control and
cleanup evidence. No tests, runtime probes or package typechecks run locally.

## Observed qualification

The frozen test file SHA-256 is
`c4d748585c15962ccf8017d4885f297d9bfe7d4dfb4e86120fe17e4b5063f609`.
It is unchanged across the following runs.

- RED source `52c90031870f9b141f175498e0eefd2e484f4677`, snapshot
  `ef8306bc01fc4d499d14bd5ab7a4e3c0a4330c73`,
  [run 46164127662](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164127662):
  Core types passed; both tests failed at Expected `waiting` / Received `spawned`
  after real positive controls. Zero passes, two causal failures, 13 assertions,
  24 Omni spawns and zero delegated spawns. No skipped tests or setup failure.
- GREEN source `41fc96544ba25ecd37e51101879b32992edb06a1`, snapshot
  `91a08f3a08fbe467b047d7164ee0ef4da744b7b3`,
  [run 46164792753](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164792753):
  Core types and all 15 tests passed, with 195 assertions, 193 Omni spawns,
  zero delegated spawns and no skipped tests. This includes both frozen cases
  and the existing scoped-typecheck, probe-cancellation and probe-dispatch files.

Both snapshots differ from their source only in the CI request and an additive
package typecheck step. Both cleanup jobs passed. GREEN includes current dev
`8bd743bdb0ace333a700d010c4ad61022bbc03fb`, preserving concurrent Activity/Omni
changes. Guards and the Atlas own-snapshot guard passed on the GREEN source.
Root and independent source review confirmed one unchanged semaphore, finite
interruptible acquisition and cleanup before permit release. Linux x64 was
executed; this correction does not add or qualify another platform.
