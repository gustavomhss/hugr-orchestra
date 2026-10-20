import { array, check, isRecord, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Lean dashboard routes (/project/lean). Preferences persist under the exercise's isolated Global data root and the
// history comes from its isolated database, so a fresh scenario has an empty, complete, selected-profile view.
function scoped(body: unknown, directory: string | undefined) {
  object(body)
  object(body.scope)
  check(body.scope.directory === directory, "Lean scope should resolve from the scenario directory")
  check(typeof body.scope.profileID === "string" && body.scope.profileID.length > 0, "Lean scope needs a profile")
  return body
}

function dashboard(body: unknown, directory: string | undefined) {
  const value = scoped(body, directory)
  check(value.coverage === "saved-profile-history", "Lean dashboard should name its saved-history coverage")
  array(value.items)
  return value
}

export const leanScenarios: Scenario[] = [
  http.protected.get("/project/lean", "project.lean").json(200, (body, ctx) => { dashboard(body, ctx.directory) }, "status"),
  http.protected
    .patch("/project/lean", "project.leanUpdate")
    .mutating()
    .at((ctx) => ({ path: "/project/lean", headers: ctx.headers(), body: { itemID: "cargo", enabled: false } }))
    .json(
      200,
      (body, ctx) => {
        const value = dashboard(body, ctx.directory)
        const items = value.items
        array(items)
        const cargo = items.find((item) => isRecord(item) && item.id === "cargo")
        object(cargo)
        check(cargo.enabled === false, "Lean item update should persist the disabled item")
      },
      "status",
    ),
  http.protected
    .get("/project/lean/history/{itemID}", "project.leanHistory")
    .at((ctx) => ({ path: route("/project/lean/history/{itemID}", { itemID: "cargo" }), headers: ctx.headers() }))
    .json(
      200,
      (body, ctx) => {
        const value = scoped(body, ctx.directory)
        check(value.itemID === "cargo", "Lean history should answer for the requested item")
        array(value.executions)
        check(value.complete === true, "an empty bounded history is complete")
      },
      "status",
    ),
  // V2: the same dashboard in the requested Location, wrapped with that Location.
  http.protected
    .get("/api/lean", "v2.lean.get")
    .json(200, (body, ctx) => { object(body); object(body.location); dashboard(body.data, ctx.directory) }, "status"),
  http.protected
    .patch("/api/lean", "v2.lean.update")
    .mutating()
    .at((ctx) => ({ path: "/api/lean", headers: ctx.headers(), body: { itemID: "cargo", enabled: false } }))
    .json(
      200,
      (body, ctx) => {
        object(body)
        const value = dashboard(body.data, ctx.directory)
        const items = value.items
        array(items)
        const cargo = items.find((item) => isRecord(item) && item.id === "cargo")
        object(cargo)
        check(cargo.enabled === false, "V2 Lean item update should persist the disabled item")
      },
      "status",
    ),
  http.protected
    .get("/api/lean/history/{itemID}", "v2.lean.history")
    .at((ctx) => ({ path: route("/api/lean/history/{itemID}", { itemID: "cargo" }), headers: ctx.headers() }))
    .json(
      200,
      (body, ctx) => {
        object(body)
        const value = scoped(body.data, ctx.directory)
        check(value.itemID === "cargo", "V2 Lean history should answer for the requested item")
        array(value.executions)
      },
      "status",
    ),
]
