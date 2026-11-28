export * as CapabilityScheduleOperator from "./management"

import { Capability } from "@orchestra/schema/capability"
import type { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { Effect } from "effect"
import type { ScheduledTaskCapability } from "../../scheduled-task/capability"
import type { ScheduledTaskShared } from "../../scheduled-task/shared"
import { pureAuthorityRejection } from "../artifact/management-shared"
import type { CapabilityOperatorContract } from "../operator/contract"

type Placement = CapabilityOperatorContract.Placement
export type Error = Capability.Failure | ScheduledTaskShared.InvalidError | ScheduledTaskShared.RunError

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
    return { binding, owner: found.owner }
  })

  const list = Effect.fn("CapabilityScheduleOperator.list")(function* (placement: Placement) {
    const target = { action: "schedule.list", placement }
    const binding = yield* authorize(target)
    const items = (yield* schedules.placed(placement)).map((item) => ({ schedule: item.schedule,
      sessionID: item.owner.sessionID, agentID: item.owner.agentID }))
    yield* operators.validate(binding, target).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(denied())))
    return { items, coverage: "live" as const } satisfies CapabilityScheduleManagement.Page
  })

  const pause = Effect.fn("CapabilityScheduleOperator.pause")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.pause", placement, id)
    return yield* schedules.pause(resolved.owner, id).pipe(Effect.catchTag("ScheduledTask.NotFoundError", gone))
  })

  // A past once or an exhausted repeat fails as InvalidError; the caller maps it to a conflict.
  const resume = Effect.fn("CapabilityScheduleOperator.resume")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.resume", placement, id)
    return yield* schedules.resume(resolved.owner, id).pipe(Effect.catchTag("ScheduledTask.NotFoundError", gone))
  })

  const remove = Effect.fn("CapabilityScheduleOperator.remove")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.delete", placement, id)
    yield* schedules.remove(resolved.owner, id).pipe(Effect.catchTag("ScheduledTask.NotFoundError", gone))
    return { id, removed: true as const } satisfies CapabilityScheduleManagement.Removed
  })

  // Deduped on the request idempotency key, so a retry returns the Session the first attempt admitted. Like the
  // tool path, a manual run never moves the next slot or counts toward repeat.
  const run = Effect.fn("CapabilityScheduleOperator.run")(function* (placement: Placement, id: ScheduledTask.ID) {
    const resolved = yield* resolve("schedule.run", placement, id)
    if (!resolved.binding.idempotencyKey) return yield* new Capability.Failure({ code: "unsupported_operation",
      message: "Schedule run requires an idempotency key" })
    const started = yield* schedules.run(resolved.owner, id,
      `operator:${resolved.binding.principal}:${resolved.binding.idempotencyKey}`).pipe(
      Effect.catchTag("ScheduledTask.NotFoundError", gone))
    return { id, sessionID: started.sessionID, reused: started.reused } satisfies CapabilityScheduleManagement.Started
  })

  return Object.freeze({ list, pause, resume, remove, run })
}

function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Schedule is unavailable" })
}

// Deleted between the owner lookup and the write.
const gone = () => Effect.fail(denied())
