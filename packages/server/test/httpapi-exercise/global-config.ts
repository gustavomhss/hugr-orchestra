import { Effect } from "effect"
import path from "path"
import { array, check, object } from "./assertions"
import { http } from "./dsl"
import { exerciseConfigDirectory, exerciseGlobalRoot } from "./environment"
import type { Scenario } from "./types"

export const globalConfigScenarios: Scenario[] = [
  // The app's folder picker starts at the home directory this route names.
  http.protected.get("/api/location/paths", "v2.location.paths").json(200, (body) => {
    object(body)
    check(typeof body.home === "string" && body.home.length > 0, "v2 location paths must name the server home")
  }),
  // Trust is stored in the isolated global config, so these routes are not scoped to a Location.
  http.protected.get("/api/trust", "v2.trust.list").global().json(200, array),
  http.protected
    .post("/api/trust/approve", "v2.trust.approve")
    .global()
    .at(() => ({ path: "/api/trust/approve", body: { directory: exerciseGlobalRoot } }))
    .status(204, undefined, "status"),
  http.protected
    .post("/api/trust/revoke", "v2.trust.revoke")
    .global()
    .at(() => ({ path: "/api/trust/revoke", body: { directory: exerciseGlobalRoot } }))
    .status(204, undefined, "status"),
]
