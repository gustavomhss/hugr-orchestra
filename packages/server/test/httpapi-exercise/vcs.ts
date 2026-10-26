import { Effect } from "effect"
import { array, check, locationData, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

export const vcsScenarios: Scenario[] = [
  // V2: the same answers in the requested location.
  http.protected.get("/api/vcs", "v2.vcs.get").json(200, locationData(object)),
  http.protected.get("/api/vcs/status", "v2.vcs.status").json(200, locationData(array)),
  http.protected
    .get("/api/vcs/diff", "v2.vcs.diff")
    .at((ctx) => ({ path: "/api/vcs/diff?mode=working", headers: ctx.headers() }))
    .json(200, locationData(array)),
  http.protected
    .get("/api/vcs/activity", "v2.vcs.activity")
    .at((ctx) => ({ path: "/api/vcs/activity?since=0&until=1", headers: ctx.headers() }))
    .json(200, locationData(object)),
  http.protected
    .get("/api/activity/session", "v2.activity.session")
    .at((ctx) => ({ path: "/api/activity/session?period=7d", headers: ctx.headers() }))
    .json(200, locationData(object)),
]
