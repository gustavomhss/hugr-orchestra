import { Effect } from "effect"
import path from "path"
import { check, object } from "./assertions"
import { http } from "./dsl"
import { exerciseConfigDirectory } from "./environment"
import type { Scenario } from "./types"

export const globalConfigScenarios: Scenario[] = [
  // The app's folder picker starts at the home directory this route names.
  http.protected.get("/api/location/paths", "v2.location.paths").json(200, (body) => {
    object(body)
    check(typeof body.home === "string" && body.home.length > 0, "v2 location paths must name the server home")
  }),
]
