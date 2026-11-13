# E10: absolute execution deadline contract

This is the lead's plan for one preparatory stage. It does not authorize the native-process factory or codec, close E10 or claim preemption of parent-thread CPU work. The private parser and process capability have separate qualifications.

## Frozen behavior

Allocate an absolute `performance.now()` deadline inside each `executeWithLimits` suspension when `limits.timeoutMs` is defined. It belongs to that execution, never a process-global reference. An untimed execution retains its current behavior. All timed work uses one remaining budget measured from this deadline; no tool or operation resets it.

The internal admission guard is an `Effect.Effect<void>` with no error channel or new service requirement:

```ts
const deadline = limits.timeoutMs === undefined ? undefined : performance.now() + limits.timeoutMs
const guard = Effect.suspend(() =>
  deadline !== undefined && performance.now() >= deadline ? Effect.never : Effect.void,
)
```

Pass this guard as an optional final internal parameter to `ToolRuntime.make`; callers that omit it use `Effect.void`. Execute it at the beginning of `invoke`, before argument copying, decoding or the call ledger. Execute it again immediately after the existing `onToolCallStart` hook and before entering either the described tool's `run` or the external callable. Preserve the existing host environment and Scope, hook ordering and ledger behavior. Existing tool-call-limit failures remain catchable.

Build the final successful result inside the timed program, then execute the guard before returning that result. Keep the existing outer `Effect.timeoutOrElse` as the only producer of `TimeoutExceeded`, using `Math.max(0, deadline - performance.now())` when constructing the race inside the execution suspension. **For timed executions, prepend `Effect.yieldNow` to the program inside that race, before parsing or any other user work.** The pinned Effect implementation starts the program child immediately before starting the timer child; its Yield primitive schedules resumption and returns, allowing the race to start the timer before user work resumes. Without that initial yield, a synchronous first hook can consume the budget before the timer starts and grant a second stale wait. This ordering is part of the acceptance contract, not a general scheduling assumption. Caller interruption must still propagate as interruption. Add no public diagnostic kind, fatal exception or user-catchable expiry marker. Late synchronous work cannot let a success or a new host-tool body escape before the timer gets its turn.

This guard deliberately yields forever after expiry until the outer timer interrupts it. A user `catch` or `finally` cannot catch a normal expiry failure, because none is emitted. It does not promise that no additional pure interpreted JavaScript can run: existing Promise loser-interruption conversion is unchanged. It does not make existing host finalizers interruptible or shorten their cleanup.

“Final successful result” includes the existing `boundOutput` transformation when an output limit is configured. Construct and bound that successful result inside the covered program before the final guard. The outer result mapping may continue bounding failure results as before, but must not do another success transformation after the guard. Preserve truncation shape, logs and tool calls exactly; output serialization itself is still synchronous and cannot be preempted while it runs.

The completed program's **non-interruption failure** also passes the deadline guard before being re-emitted to the existing outer normalization. Otherwise a synchronous host refusal after expiry can win the race before the timer runs and escape as a different error. Capture that completed outcome inside the timed program, propagate pure caller interruption immediately, run the same guard, then re-emit its original success or Cause unchanged. No new user-catchable marker or host Scope is introduced. Add an actual uncaught late host-refusal witness alongside the existing caught-refusal case before source authorization.

## Acceptance and execution order

First add a separate acceptance file alongside existing CodeMode runtime tests. Keep all original tests unchanged. Use the actual public executor, actual tool descriptors/external callable paths and actual hooks; no copied interpreter, global clock patch or fake timer. Hosted tests must cover both described and external host bodies after a start hook blocks synchronously past the budget, a newly requested host call after a user callback blocks past the budget, late successful completion becoming `TimeoutExceeded`, catch/finally attempts to invoke another host body after expiry, independent concurrent timed executions, untimed behavior and caller interruption. Include a synchronous first activity whose duration exceeds the initial timeout, and independently assert that settlement after it yields does not wait another full timeout budget; allow scheduling tolerance without claiming preemption during the synchronous activity. Existing real tool service/Scope, eager parallelism, catchable tool limit and 100ms controls remain mandatory regressions.

Independent review must confirm these assertions test actual entry and outcomes, with bounded owned containment that does not masquerade as product success. Run positive controls and behavioral RED through official hosted CI before source authorization. Typechecking remains serial. The source stage changes only `interpreter/runtime.ts` and `tool-runtime.ts`, plus its new acceptance and documentation; native representation and process adapters remain outside this stage.

The public tool-tree type accepts described tools, so do not widen it or cast raw callables into public options for acceptance. Public executor cases exercise described tools. The actual internal `ToolRuntime.make` supports external callables; use that API directly for its branch controls and admission-guard witnesses. Root committed the optional fifth `Effect.Effect<void>` guard argument as a compilable, behavior-neutral scaffold in `76ccf04378`; its CodeMode typecheck passed. The scaffold intentionally does not execute the guard yet, allowing a legitimate behavioral RED before implementation. Internal tests may supply an observed blocking Effect to verify entry/after-hook guard integration; they must not duplicate the absolute-clock algorithm. The public executor tests own the deadline proof.

## Later native-operation condition

The isolated native-operation stage must capture its complete outcome, join the owned helper Scope, release its own busy latch, then execute this guard **before** turning any native success or native error into a catchable interpreter value. A post-reply guard must never wait for its own latch. The guard at host entry will also wait for the per-execution native latch, then reevaluate the absolute deadline. Only the child scope is new; host tool Scopes remain unchanged. The lead must freeze the exact wire, typed leaf port and acceptance before authorizing that later stage.
