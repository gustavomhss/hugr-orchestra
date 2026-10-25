import { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, UnknownError } from "../errors"
import { CapabilityAuthorization } from "../middleware/capability-authorization"
import { LocationQuery, locationQueryOpenApi } from "./location"

const path = "/api/capability/schedules"
const item = `${path}/:scheduleID`
const params = { scheduleID: ScheduledTask.ID }
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })
// Agent-created schedules only: create and edit stay with the owning agent's schedule_manage tool.
const errors = [ConflictError, UnknownError]

export const CapabilitySchedulesGroup = HttpApiGroup.make("server.capability.schedules")
  .add(
    HttpApiEndpoint.get("capability.schedule.list", path, {
      query: LocationQuery, success: CapabilityScheduleManagement.Page, error: errors,
    }).annotateMerge(OpenApi.annotations({
      summary: "List agent schedules",
      description: "Every schedule created by an agent in this location, with its owning Session and agent.",
    })),
    HttpApiEndpoint.post("capability.schedule.pause", `${item}/pause`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Schedule, error: errors,
    }),
    HttpApiEndpoint.post("capability.schedule.resume", `${item}/resume`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Schedule, error: errors,
    }).annotateMerge(OpenApi.annotations({ description: "409 when the repeat limit is used up or a once lies in the past." })),
    HttpApiEndpoint.post("capability.schedule.run", `${item}/run`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Started, error: errors,
    }).annotateMerge(OpenApi.annotations({
      description: "Start a run now without moving the next slot. A retry with the same idempotency key returns the same Session.",
    })),
    HttpApiEndpoint.delete("capability.schedule.remove", item, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Removed, error: errors,
    }),
  )
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilitySchedulesGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilitySchedulesGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
