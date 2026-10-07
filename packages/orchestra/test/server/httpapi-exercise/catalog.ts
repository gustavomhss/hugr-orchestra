import { array, check, locationData, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

// V2 location catalog routes: commands, references and the project behaviors every Session receives as system
// context. Split from index.ts so the route-coverage harness stays under the file size cap.
const behavior = { id: "httpapi-behavior", name: "Exercise", instructions: "Answer in one sentence." }

export const catalogScenarios: Scenario[] = [
  http.protected.get("/api/command", "v2.command.list").json(200, locationData(array)),
  http.protected.get("/api/reference", "v2.reference.list").json(200, object),
  http.protected
    .put("/api/behavior", "v2.behavior.set")
    .mutating()
    .at((ctx) => ({ path: "/api/behavior", headers: ctx.headers(), body: { behaviors: [behavior] } }))
    .json(
      200,
      locationData((value) => {
        array(value)
        check(value.length === 1, "behavior set should return the stored set")
        object(value[0])
        check(value[0].id === behavior.id, "behavior set should keep the behavior id")
      }),
      "status",
    ),
  http.protected
    .put("/api/behavior", "v2.behavior.set.duplicate")
    .at((ctx) => ({ path: "/api/behavior", headers: ctx.headers(), body: { behaviors: [behavior, behavior] } }))
    .json(
      400,
      (body) => {
        object(body)
        check(body._tag === "InvalidRequestError", "duplicate behavior ids should be rejected as invalid requests")
      },
      "status",
    ),
]
