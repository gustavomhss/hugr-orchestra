import { Location } from "@orchestra/core/location"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ConflictError, InvalidRequestError } from "@orchestra/protocol/errors"
import { ScheduleNotFoundError, ScheduleRunError } from "@orchestra/protocol/groups/schedule"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ScheduleHandler = HttpApiBuilder.group(Api, "server.schedule", (handlers) =>
  Effect.gen(function* () {
    const tasks = yield* ScheduledTask.Service

    return handlers
      .handle(
        "schedule.list",
        Effect.fn(function* () {
          const location = yield* Location.Service
          return yield* response(tasks.list(location.directory))
        }),
      )
      .handle(
        "schedule.create",
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return yield* response(tasks.create(location.directory, ctx.payload)).pipe(
            Effect.catchTags({
              "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
              "ScheduledTask.ConflictError": (error) =>
                Effect.fail(
                  new ConflictError({
                    message: `Scheduled task ${error.id} belongs to another directory`,
                    resource: error.id,
                  }),
                ),
            }),
          )
        }),
      )
      .handle(
        "schedule.update",
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return yield* response(tasks.update(location.directory, ctx.params.scheduleID, ctx.payload)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
            }),
          )
        }),
      )
      .handle(
        "schedule.remove",
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          yield* tasks
            .remove(location.directory, ctx.params.scheduleID)
            .pipe(Effect.catchTag("ScheduledTask.NotFoundError", (error) => Effect.fail(notFound(error))))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "schedule.run",
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return yield* response(tasks.run(location.directory, ctx.params.scheduleID)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.RunError": (error) => Effect.fail(new ScheduleRunError({ message: error.reason })),
            }),
          )
        }),
      )
  }),
)

function notFound(error: ScheduledTask.NotFoundError) {
  return new ScheduleNotFoundError({ scheduleID: error.id, message: `Scheduled task not found: ${error.id}` })
}

function invalid(error: ScheduledTask.InvalidError) {
  return new InvalidRequestError({ message: error.message, field: error.field })
}
