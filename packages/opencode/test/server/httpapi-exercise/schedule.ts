import { array, check, locationData, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Scheduled task routes (/api/schedule). The created task is paused and far in the future, and the routes that
// act on a task use a missing ID, so the server's scheduler never starts a run during the exercise.
const missing = route("/api/schedule/{scheduleID}", { scheduleID: "tsk_httpapi_missing" })

function notFound(body: unknown) {
  object(body)
  check(body._tag === "ScheduleNotFoundError", "missing scheduled tasks should be typed not-found errors")
}

export const scheduleScenarios: Scenario[] = [
  http.protected.get("/api/schedule", "v2.schedule.list").json(200, locationData(array)),
  http.protected
    .post("/api/schedule", "v2.schedule.create")
    .mutating()
    .at((ctx) => ({
      path: "/api/schedule",
      headers: ctx.headers(),
      body: {
        name: "httpapi-schedule",
        prompt: "Exercise the scheduled task routes.",
        agent: "build",
        cadence: "once",
        next: Date.UTC(2099, 0, 1, 9, 30),
        timezone: "UTC",
        enabled: false,
      },
    }))
    .json(
      200,
      locationData((value) => {
        object(value)
        check(value.name === "httpapi-schedule", "schedule create should return the created task")
        check(value.minute === 570, "schedule create should derive the time of day in the task's zone")
        check(value.enabled === false && value.runs === 0, "a paused new task should not have run")
      }),
      "status",
    ),
  http.protected
    .patch("/api/schedule/{scheduleID}", "v2.schedule.update")
    .at((ctx) => ({ path: missing, headers: ctx.headers(), body: { enabled: false } }))
    .json(404, notFound, "status"),
  http.protected
    .delete("/api/schedule/{scheduleID}", "v2.schedule.remove")
    .at((ctx) => ({ path: missing, headers: ctx.headers() }))
    .json(404, notFound, "status"),
  http.protected
    .post("/api/schedule/{scheduleID}/run", "v2.schedule.run")
    .at((ctx) => ({ path: `${missing}/run`, headers: ctx.headers() }))
    .json(404, notFound, "status"),
]
