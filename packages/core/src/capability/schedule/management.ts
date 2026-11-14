export * as CapabilityScheduleOperator from "./management"

import { Capability } from "@orchestra/schema/capability"
import type { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { Cause, Effect } from "effect"
import { dieFailures } from "../../effect/cause"
import { failureCause } from "../../scheduled-task/failure-cause"
import type { ScheduledTaskCapability } from "../../scheduled-task/capability"
import { ScheduledTaskShared } from "../../scheduled-task/shared"
import { pureAuthorityRejection } from "../artifact/management-shared"
import type { CapabilityOperatorContract } from "../operator/contract"

type Placement = CapabilityOperatorContract.Placement
export type Error = Capability.Failure | ScheduledTaskShared.InvalidError | ScheduledTaskShared.RunError | ScheduledTaskShared.NotFoundError

/**
 * Operator management of capability schedules in one placement. Each call needs operator authority for the action;
 * the owner is resolved from the stored row and Core re-checks it on every write. Create and edit stay agent-only.
 */
export function make(options: { operators: CapabilityOperatorContract.Interface; schedules: ScheduledTaskCapability.Interface }) {
  const operators = Object.freeze({ ...options.operators })
  const schedules = options.schedules

  const authorize = (target: CapabilityOperatorContract.Target) => operators.require(target).pipe(
    Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(denied())))

  // Unknown, foreign-placement and denied schedules share one constant failure: no existence oracle.
  const resolve = Effect.fn("CapabilityScheduleOperator.resolve")(function* (action: string, placement: Placement,
    id: ScheduledTask.ID) {
    const target = { action, placement, resource: { kind: "schedule", id } }
    const binding = yield* authorize(target)
    const found = (yield* schedules.placed(placement)).find((item) => item.schedule.id === id)
    if (!found) return yield* denied()
    return { binding, target, owner: found.owner }
  })

  const list = Effect.fn("CapabilityScheduleOperator.list")(function* (placement: Placement) {
    const target = { action: "schedule.list", placement }
    const binding = yield* authorize(target)
    const items = (yield* schedules.placed(placement)).map((item) => ({ schedule: item.schedule,
      sessionID: item.owner.sessionID, agentID: item.owner.agentID }))
    yield* operators.validate(binding, target).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(denied())))
    return { items, coverage: "live" as const } satisfies CapabilityScheduleManagement.Page
  })

  const commitCheck = (binding: CapabilityOperatorContract.Binding, target: CapabilityOperatorContract.Target) => {
    const captured: { own?: Capability.Failure } = {}
    const beforeCommit = operators.validate(binding, target).pipe(Effect.catchCause((cause) => {
      if (cause.reasons.length !== 1 || !pureAuthorityRejection(cause)) return Effect.failCause(dieFailures(cause))
      const own = denied()
      captured.own = own
      return Effect.die(own)
    }))
    const normalize = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.catchCause((cause): Effect.Effect<never, E | Capability.Failure> => {
      if (captured.own && isOwnDenial(cause, captured.own)) return Effect.fail(captured.own)
      const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
      return reason?._tag === "Fail" && reason.error instanceof ScheduledTaskShared.NotFoundError
        ? Effect.fail(denied())
        : Effect.failCause(cause)
    }))
    return { options: { beforeCommit }, normalize }
  }

  const pause = Effect.fn("CapabilityScheduleOperator.pause")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.pause", placement, id)
    const check = commitCheck(resolved.binding, resolved.target)
    return yield* schedules.pause(resolved.owner, id, check.options).pipe(check.normalize)
  })

  // A past once or an exhausted repeat fails as InvalidError; the caller maps it to a conflict.
  const resume = Effect.fn("CapabilityScheduleOperator.resume")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.resume", placement, id)
    const check = commitCheck(resolved.binding, resolved.target)
    return yield* schedules.resume(resolved.owner, id, check.options).pipe(check.normalize)
  })

  const remove = Effect.fn("CapabilityScheduleOperator.remove")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.delete", placement, id)
    const check = commitCheck(resolved.binding, resolved.target)
    yield* schedules.remove(resolved.owner, id, check.options).pipe(check.normalize)
    return { id, removed: true as const } satisfies CapabilityScheduleManagement.Removed
  })

  // Deduped on the request idempotency key, so a retry returns the Session the first attempt admitted. Like the
  // tool path, a manual run never moves the next slot or counts toward repeat.
  const run = Effect.fn("CapabilityScheduleOperator.run")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.run", placement, id)
    if (!resolved.binding.idempotencyKey) return yield* new Capability.Failure({ code: "unsupported_operation",
      message: "Schedule run requires an idempotency key" })
    const check = commitCheck(resolved.binding, resolved.target)
    const started = yield* schedules.run(resolved.owner, id,
      `operator:${resolved.binding.principal}:${resolved.binding.idempotencyKey}`, check.options).pipe(check.normalize)
    return { id, sessionID: started.sessionID, reused: started.reused } satisfies CapabilityScheduleManagement.Started
  })

  return Object.freeze({ list, pause, resume, remove, run })
}

function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Schedule is unavailable" })
}

function isOwnDenial<E>(cause: Cause.Cause<E>, own: Capability.Failure) {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  if (reason?._tag === "Die") return reason.defect === own
  if (reason?._tag !== "Fail" || !(reason.error instanceof ScheduledTaskShared.RunError)) return false
  const original = failureCause(reason.error)
  const failed = original?.reasons.length === 1 ? original.reasons[0] : undefined
  return failed?._tag === "Die" && failed.defect === own
}
