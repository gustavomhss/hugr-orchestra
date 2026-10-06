import { array, check, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

// Home KPI aggregate over the routed project's sessions.
export const sessionActivityScenarios: Scenario[] = [
  http.protected
    .get("/session/activity", "session.activity")
    .seeded((ctx) => ctx.session({ title: "Activity session" }))
    .at((ctx) => ({ path: "/session/activity?period=7d", headers: ctx.headers() }))
    .json(200, (body) => {
      object(body)
      array(body.edges)
      array(body.days)
      array(body.activeMs)
      array(body.sessions)
      array(body.facts)
      check(body.edges.length === 9, "a 7d period should have the previous window and seven daily bars")
      check(body.activeMs.length === 8, "wall clock should be reported per bucket")
    }),
  http.protected
    .get("/session/activity", "session.activity")
    .at((ctx) => ({ path: "/session/activity?period=12d", headers: ctx.headers() }))
    .status(400, undefined, "status"),
]
