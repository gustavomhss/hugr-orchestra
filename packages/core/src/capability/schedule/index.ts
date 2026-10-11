export * as CapabilitySchedule from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Cause, Clock, Context, Effect, Exit } from "effect"
import { Location } from "../../location"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { ScheduledTaskPort } from "../../scheduled-task/port"
import { ScheduledTaskCapabilityModel } from "../../scheduled-task/capability-model"
import { ScheduledTaskModel } from "../../scheduled-task/model"
import { Tool } from "../../tool/tool"
import { CapabilityInvocation } from "../invocation"
import { CapabilityPolicy } from "../policy"
import { CapabilityScheduleContract } from "./contract"

export const name = "schedule_manage"
// Also the per-owner cap on schedules, so list always returns every schedule its caller owns.
const LIST_LIMIT = 64

/** Location producer only. The lead registers this canonical leaf through capability/tools. */
export const make = () => Effect.gen(function* () {
  const location = yield* Location.Service
  const policy = yield* CapabilityPolicy.make
  const schedules = { capability: yield* ScheduledTaskPort.Service }
  const placement = { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }

  // The owner is always the issued invocation owner; input never names one.
  const bound = Effect.fn("CapabilitySchedule.bound")(function* (context: Tool.Context) {
    const binding = yield* CapabilityInvocation.require(context, placement)
    if (binding.rootToolName !== name) return yield* failure("invocation_binding_mismatch")
    return binding
  })

  // Owner-scoped read: an unknown ID and another owner's ID are the same NotFound, so both deny identically.
  const owned = (owner: Capability.Owner, id: ScheduledTask.ID) =>
    schedules.capability.get(owner, id).pipe(Effect.catchTag("ScheduledTask.NotFoundError", missing))

  // The dispatcher owns its write transaction, so the permit is rechecked under the writer lock (a configured deny
  // that appeared after approval still revokes it) immediately before the Service call; approval never holds a lock.
  const authorized = Effect.fn("CapabilitySchedule.authorized")(function* (context: Tool.Context, id: string,
    target: { name: string; cadence: CapabilityScheduleContract.Cadence }) {
    // The name lets the approver see which schedule is meant; the ID and cadence kind are what rules match on.
    const permit = yield* policy.authorize(context, { action: "schedule.manage",
      resources: [id, `cadence:${target.cadence.kind}`, `name:${target.name.slice(0, 64)}`] })
    // SQL failure is a defect here, as it is inside the dispatcher's own transactions.
    yield* policy.commit(permit, () => Effect.void).pipe(Effect.catchTag("SqlError", Effect.die))
  })

  const run = Effect.fn("CapabilitySchedule.run")(function* (input: CapabilityScheduleContract.Input,
    context: Tool.Context): Effect.fn.Return<CapabilityScheduleContract.Output, Capability.Failure> {
    const binding = yield* bound(context)
    const owner = binding.owner
    if (input.action === "list")
      return { action: "list", items: (yield* schedules.capability.list(owner)).slice(0, LIST_LIMIT) }
    if (input.action === "create") {
      // Counted before asking; concurrent creates may overshoot by the calls in flight.
      if ((yield* schedules.capability.list(owner)).length >= LIST_LIMIT) return yield* failure("quota_exceeded")
      const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      yield* validate({ cadence: input.cadence, timezone, enabled: input.enabled ?? true }, yield* Clock.currentTimeMillis)
      yield* authorized(context, "new", input)
      const created = yield* schedules.capability.create(owner, { name: input.name, prompt: input.prompt,
        cadence: input.cadence, timezone, catchUp: input.catchUp, repeat: input.repeat, enabled: input.enabled })
        .pipe(Effect.catchTag("ScheduledTask.InvalidError", invalid))
      return { action: "create", schedule: created }
    }
    const current = yield* owned(owner, input.id)
    if (input.action === "get") return { action: "get", schedule: current }
    if (input.action === "update") {
      // The dispatcher recomputes the first slot on every revision, so the resulting definition must still fire.
      const cadence = input.cadence ?? current.cadence
      yield* validate({ cadence, timezone: input.timezone ?? current.timezone, enabled: current.enabled },
        yield* Clock.currentTimeMillis)
      yield* authorized(context, input.id, { name: input.name ?? current.name, cadence })
      const schedule = yield* schedules.capability.update(owner, input.id, { name: input.name, prompt: input.prompt,
        cadence: input.cadence, timezone: input.timezone, catchUp: input.catchUp, repeat: input.repeat })
        .pipe(Effect.catchTag("ScheduledTask.InvalidError", invalid), Effect.catchTag("ScheduledTask.NotFoundError", missing))
      return { action: "update", schedule }
    }
    // Resuming needs runs left and a future slot; refuse before asking rather than after approval.
    if (input.action === "resume" && !current.enabled) {
      if (current.repeat !== undefined && current.runs >= current.repeat) return yield* failure("unsupported_schema")
      yield* validate({ ...current, enabled: true }, yield* Clock.currentTimeMillis)
    }
    yield* authorized(context, input.id, current)
    if (input.action === "delete") {
      yield* schedules.capability.remove(owner, input.id).pipe(Effect.catchTag("ScheduledTask.NotFoundError", missing))
      return { action: "delete", id: input.id }
    }
    if (input.action === "pause") return { action: "pause", schedule: yield* schedules.capability.pause(owner, input.id)
      .pipe(Effect.catchTag("ScheduledTask.NotFoundError", missing)) }
    if (input.action === "resume") return { action: "resume", schedule: yield* schedules.capability.resume(owner, input.id)
      .pipe(Effect.catchTag("ScheduledTask.InvalidError", invalid), Effect.catchTag("ScheduledTask.NotFoundError", missing)) }
    // A retry of the same tool call carries the same key, so it returns the Session the first attempt admitted.
    const started = yield* schedules.capability.run(owner, input.id,
      `invocation:${binding.invocation.assistantMessageID}:${binding.invocation.callID}`).pipe(
      Effect.catchTag("ScheduledTask.NotFoundError", missing),
      // Dispatch failed or the owner vanished; the dispatcher cannot prove nothing was admitted, so the outcome is unknown.
      Effect.catchTag("ScheduledTask.RunError", () => Effect.fail(failure("outcome_unknown"))))
    return { action: "run", id: input.id, sessionID: started.sessionID, reused: started.reused }
  })

  const toolErrors = <A>(effect: Effect.Effect<A, Capability.Failure>) => effect.pipe(
    Effect.exit,
    Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(
      Cause.fromReasons<Tool.Failure>(exit.cause.reasons.flatMap((reason) => reason._tag === "Fail"
        ? Cause.fail(new Tool.Failure({ message: reason.error.code })).reasons
          .map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
        : [reason])))),
  )
  const tools = {
    [name]: Tool.make({
      description: `Manage scheduled prompts that run as fresh Sessions with your agent in this placement. \
Actions: create, list, get, update (any change starts a new revision), pause, resume, delete, run (now, without moving the next slot). \
Cadence kinds: once {at epoch ms}, interval {minutes >= 5}, daily {time HH:MM}, weekly {day 0-6, time}, cron {five-field expression}. \
Wall-clock fields use timezone (IANA; defaults to the host zone).`,
      input: CapabilityScheduleContract.Input, output: CapabilityScheduleContract.Output,
      execute: (input, context) => run(input, context).pipe(toolErrors),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }],
    }),
  }
  return { tools }
})

// The definition must name a real zone and fire at least once from now; otherwise no row is written and no one is asked.
// Mirrors the dispatcher's first-slot rule: a paused once may lie in the past, anything else must fire from now.
function validate(input: { cadence: CapabilityScheduleContract.Cadence; timezone: string; enabled: boolean }, now: number) {
  if (!ScheduledTaskModel.validZone(input.timezone)) return Effect.fail(failure("unsupported_schema"))
  if (input.cadence.kind === "cron" && !ScheduledTaskCapabilityModel.parseCron(input.cadence.expression))
    return Effect.fail(failure("unsupported_schema"))
  if (input.cadence.kind === "once" && !input.enabled) return Effect.void
  const slot = ScheduledTaskCapabilityModel.nextAfter({ cadence: input.cadence, timezone: input.timezone, next: now,
    enabled: true, catchUp: "latest" }, now)
  return slot === undefined ? Effect.fail(failure("unsupported_schema")) : Effect.void
}

const invalid = () => Effect.fail(failure("unsupported_schema"))
const missing = () => Effect.fail(failure("target_denied"))

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Schedule action is unavailable" })
}
