# H8 source contract — ROOT freeze, independently approved before execution

Baseline c647f21975158ad21e0b7e45a8d7f240eaefcdef; existing 30-case main SHA2565506e35b17fe498ec48fa753f6ecbb1d548b124efe47579991f066aacd1cf74f unchanged. 5 controls GREEN both43278533576; 13 original RED both composition12@43279974654 plus1@43282798153. Earlier writer boundary setup miss is excluded; rollback/provider tails remain unexecuted. House independently approved this contract; Root authorized implementation only after that review.

Owned source paths under packages/core/src: capability/schedule/management.ts; scheduled-task/capability.ts; scheduled-task/shared.ts; scheduled-task.ts; NEW scheduled-task/failure-cause.ts; NEW effect/cause.ts; session.ts; session/input.ts; event.ts. Add separate direct safety test file(s), never mutate existing30-case main. Update actual schedule guide with the checkpoint/empty-session limits. No Protocol, DTO, generated code, dependency or process spawn change.

Exact private callable anchor:
```ts
// session.ts: export next to Interface, second optional argument of create AND prompt.
export interface CommitOptions {
  readonly beforeCommit?: Effect.Effect<void>
}
// ScheduledTaskCapability.Interface pause/resume/remove third optional argument:
options?: SessionV2.CommitOptions
// run fourth argument AFTER manualKey. api.ops.dispatch second optional argument.
// Main scheduled-task.ts keeps admitted boolean as argument TWO:
const dispatch = (claimed: Claim, admitted = false, options?: SessionV2.CommitOptions) => /* current body */
// cap.api adapter preserves automatic/takeover callers:
cap.api({ dispatch: (claimed, options) => dispatch(claimed, false, options), settle })
// SessionInput.admit fourth optional argument is Effect.Effect<void>, not CommitOptions.
```

Placement: resolve returns binding AND exact target. Management owns one per-call state cell holding optional exact own Capability.Failure. Internal check runs operators.validate(binding,target), handles FULL cause before any mapError/tapError/orDie. Only reasons.length===1 AND existing pureAuthorityRejection accepts -> create/capture own denied(), Effect.die(exactOwn). ALL other causes -> Effect.failCause(dieFailures(cause)), no cell, no loss. Existing unrelated pureAuthorityRejection call sites unchanged.

Scheduled change runs beforeCommit LAST inside actual IMMEDIATE after owned/edit SQL, only if edit returned no InvalidError; missing/invalid remain original. A successful valid resume no-op also checks (explicit Root decision: prevents stale management success without adding SQL). remove checks after actual delete before commit. NEW manual claim checks after claimSQL before return/commit; prior receipts skip guard. Dispatch passes same options to actual Session.create and prompt, never to settle/advisory/provider. Automatic/takeover dispatch has no options.

Session.create only NEW Created publication supplies commit callback `() => options.beforeCommit`; after actual projectors before event/sequence insertion in Event transaction. Existing Session adoption skips. SessionInput.admit does find/exact retry and historical reconciliation FIRST, only NEW PromptAdmitted publication supplies commit callback. Prompt passes optional Effect as fourth argument. Do not check in hooks, retries, settle, provider or future nested prompts. Created denial leaves no new Session; later Prompt denial may retain the already legitimately committed empty Session. No undo of arbitrary hooks; no post-checkpoint linearizability promise.

Exact lossless conversion helper (synchronous; preserve each error/annotation and non-Fail reason identity/order):
```ts
import { Cause } from "effect"
export function dieFailures<E>(cause: Cause.Cause<E>): Cause.Cause<never> {
  return Cause.fromReasons(cause.reasons.map((reason) =>
    reason._tag === "Fail"
      ? Cause.makeDieReason(reason.error).annotate(reason.annotations)
      : reason))
}
```
Apply at exactly THREE boundaries: new authority check; EventV2 actual transaction `.pipe(order.guard(box), ...)` replaces outer orDie; ScheduledTaskShared.store immediate transaction replaces outer orDie. Leave unrelated SQL orDie unchanged.

Whole-cause preservation: Session.create adoption only EXACT one Die whose defect instanceof SessionAlreadyProjected, else failCause(original); no stored Session -> failCause(original). SessionInput.admit reconciliation only EXACT one Die; if exact retry exists return it, else failCause(original). Session.prompt LifecycleConflict remap only EXACT one Die; any extra reason preserved. Management existing four NotFound remappers only EXACT one Fail NotFound; otherwise preserve full original cause. No catchTag/catchDefect collapse at these seams.

Private provenance anchor NEW scheduled-task/failure-cause.ts:
```ts
import type { Cause } from "effect"
const causes = new WeakMap<object, Cause.Cause<unknown>>()
export function rememberFailureCause<T extends object>(value: T, cause: Cause.Cause<unknown>): T {
  causes.set(value, cause)
  return value
}
export function failureCause(value: object): Cause.Cause<unknown> | undefined {
  return causes.get(value)
}
```
Dispatch catchCause first performs actual durable-input lookup; if admitted return truthful started. Lookup failure propagates. Otherwise return EXACT failed outcome object remembered with original Cause. Capability.run after SUCCESSFUL settle creates final EXACT RunError, transfers remembered cause from exact failed object if present, then fails that exact RunError. No spread/recreate, JSON fields or provenance for historical receipts. Settle errors propagate unchanged. Management can normalize only EXACT single Die.defect===capturedOwn OR EXACT single Fail RunError whose private original cause is EXACT single Die capturedOwn. Mixed reasons, interruption, alien errors and historical/no-provenance errors remain whole. Already-durable started wins.

Required new direct safety acceptance before final GREEN: dieFailures with multiple Fail + Die + Interrupt and reason annotations/identity; two distinct auth Fail reasons must not become403; real validate.onExit alien Die after revoke remains mixed; exact new CommitOptions Session create/adopt, prompt exact retry/no guard, new admission guard rollback; original failed outcome -> exact RunError private provenance, absent for historical/spread; invalid/missing/noSQL semantics; durable-admission then wake failure returns truthful started; settle/cleanup failure never normalized. Existing30 cases frozen and full run after source. No tests locally.

Execution after explicit GO: Step0 exact HEAD check; implement source anchor in one conventional fix(core) commit, add direct safety tests separate test(core) commit, guide docs(core) commit. Return source freeze + complete diff/hash manifest + type lease request before any compiler/CI. Root/House cold-review ALL changed paths. Then single warm `bun typecheck` packages/core with GOMAXPROCS2/private cache and official scoped test:ci paths --os both; Root controls dispatch/push slots. No push/PR/merge by agent. Global guards root before completion. Not closed until behavioral tails and safety cases pass.

Type-channel clarification after source inspection: Core CapabilityScheduleOperator.Error also includes the existing ScheduledTaskShared.NotFoundError, permitting mixed NotFound causes to propagate honestly instead of a cast or collapsed catchTag. Exact single NotFound still maps to hidden403. No Protocol/Schema/HttpApi error addition; existing Server per-reason fallback remains unchanged and will be typechecked after integration.
