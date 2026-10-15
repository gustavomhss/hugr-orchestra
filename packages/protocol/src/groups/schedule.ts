import { Location } from "@orchestra/schema/location"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidRequestError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

export class ScheduleNotFoundError extends Schema.TaggedErrorClass<ScheduleNotFoundError>()(
  "ScheduleNotFoundError",
  {
    scheduleID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ScheduleRunError extends Schema.TaggedErrorClass<ScheduleRunError>()(
  "ScheduleRunError",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}

const params = { scheduleID: ScheduledTask.ID }

export const ScheduleGroup = HttpApiGroup.make("server.schedule")
  .add(
    HttpApiEndpoint.get("schedule.list", "/api/schedule", {
      query: LocationQuery,
      success: Location.response(Schema.Array(ScheduledTask.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.list",
          summary: "List scheduled tasks",
          description: "List the location's scheduled tasks with the outcome of each task's latest run.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("schedule.create", "/api/schedule", {
      query: LocationQuery,
      payload: ScheduledTask.CreateInput,
      success: Location.response(ScheduledTask.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.create",
          summary: "Create scheduled task",
          description:
            "Schedule a prompt for the location. The server runs due slots itself; creating with an ID the location already has returns that task unchanged.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("schedule.update", "/api/schedule/:scheduleID", {
      params,
      query: LocationQuery,
      payload: ScheduledTask.UpdateInput,
      success: Location.response(ScheduledTask.Info),
      error: [ScheduleNotFoundError, InvalidRequestError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.update",
          summary: "Update scheduled task",
          description: "Edit, pause or resume a scheduled task.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("schedule.remove", "/api/schedule/:scheduleID", {
      params,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: ScheduleNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.remove",
          summary: "Remove scheduled task",
          description: "Remove a scheduled task and its run history.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("schedule.run", "/api/schedule/:scheduleID/run", {
      params,
      query: LocationQuery,
      success: Location.response(ScheduledTask.RunResult),
      error: [ScheduleNotFoundError, ScheduleRunError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.run",
          summary: "Run scheduled task now",
          description:
            "Admit the task's prompt into a Session now. Serves the due slot when no run holds it, otherwise starts an extra run. A failed run is not recorded.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "schedule", description: "Scheduled task routes." }))
