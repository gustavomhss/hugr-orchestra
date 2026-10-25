import { CapabilityScheduleOperator } from "@orchestra/core/capability/schedule/management"
import { Location } from "@orchestra/core/location"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ConflictError } from "@orchestra/protocol/errors"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { capabilityError } from "../middleware/capability-authorization"
import { ServerOperator } from "../operator"

export const CapabilitySchedulesHandler = HttpApiBuilder.group(Api, "server.capability.schedules", (handlers) =>
  Effect.gen(function* () {
    const operators = yield* ServerOperator.Service
    const tasks = yield* ScheduledTask.Service
    const management = CapabilityScheduleOperator.make({ operators, schedules: tasks.capability })
    const placement = Effect.gen(function* () {
      const location = yield* Location.Service
      return { projectID: location.project.id,
        location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }
    })
    return handlers
      .handle("capability.schedule.list", () => placement.pipe(Effect.flatMap(management.list), scheduleResponse))
      .handle("capability.schedule.pause", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.pause(at, params.scheduleID)), scheduleResponse))
      .handle("capability.schedule.resume", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.resume(at, params.scheduleID)), scheduleResponse))
      .handle("capability.schedule.run", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.run(at, params.scheduleID)), scheduleResponse))
      .handle("capability.schedule.remove", ({ params }) =>
        placement.pipe(Effect.flatMap((at) => management.remove(at, params.scheduleID)), scheduleResponse))
  }),
)

/** Unknown, foreign and denied schedules collapse to one constant 403; Core detail never reaches the response. */
function scheduleResponse<A, R>(effect: Effect.Effect<A, CapabilityScheduleOperator.Error, R>) {
  return effect.pipe(Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason) => {
    if (reason._tag !== "Fail") return [reason]
    return Cause.fail(mapError(reason.error)).reasons.map((next) =>
      next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
  })))))
}

function mapError(error: CapabilityScheduleOperator.Error) {
  if (error instanceof Capability.Failure) return capabilityError(error)
  if (error._tag === "ScheduledTask.InvalidError") return new ConflictError({ message: "Schedule cannot resume" })
  return new ConflictError({ message: "Schedule run did not start" })
}
