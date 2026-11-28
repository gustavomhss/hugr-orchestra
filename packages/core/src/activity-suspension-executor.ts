export * as ActivitySuspensionExecutor from "./activity-suspension-executor"

import { Effect, Option } from "effect"
import type { ActivitySuspensionLedger } from "./activity-suspension-ledger"

type Request = Readonly<{
  scope: ActivitySuspensionLedger.Scope
  members: readonly string[]
}> & (Readonly<{ action: "suspend" }> | Readonly<{ action: "resume"; markID: string }>)

/** A native authority must verify the live tree and its selected members at admission and settle within its deadline. */
export type Control = (
  scope: ActivitySuspensionLedger.Scope,
  attempt: ActivitySuspensionLedger.Attempt,
) => Promise<readonly ActivitySuspensionLedger.Outcome[]>

/** The caller owns human authorization. A restart or interruption never retries a recorded attempt. */
export function execute(ledger: ActivitySuspensionLedger.Interface, control: Control, request: Request) {
  // A disconnected caller can no longer cancel the receipt once the effect is admitted.
  return Effect.gen(function* () {
    const mark = yield* (request.action === "suspend" ? ledger.beginSuspend(request) : ledger.beginResume(request))
    if (!mark?.pending) return undefined
    const attempt = mark.pending
    const receipt = yield* Effect.option(Effect.tryPromise(() => control(mark.scope, attempt)))
    const settle = (outcomes: readonly ActivitySuspensionLedger.Outcome[]) => ledger.settle({
      scope: mark.scope, markID: mark.markID, attemptID: attempt.id, outcomes,
    })
    if (Option.isSome(receipt)) {
      const settled = yield* settle(receipt.value)
      if (settled) return settled
    }
    return yield* settle(attempt.members.map((memberID) => ({ memberID, effect: "unknown" })))
  }).pipe(Effect.uninterruptible)
}
