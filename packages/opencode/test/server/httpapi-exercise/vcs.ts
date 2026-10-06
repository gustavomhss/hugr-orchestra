import { Effect } from "effect"
import { array, check, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

export const vcsScenarios: Scenario[] = [
  http.protected.get("/vcs", "vcs.get").json(),
  http.protected.get("/vcs/status", "vcs.status").json(200, array),
  http.protected
    .get("/vcs/diff", "vcs.diff")
    .at((ctx) => ({ path: "/vcs/diff?mode=git", headers: ctx.headers() }))
    .json(200, array),
  http.protected.get("/vcs/diff/raw", "vcs.diff.raw").status(
    200,
    (_ctx, result) =>
      Effect.sync(() => {
        check(typeof result.text === "string", "raw VCS diff should return text")
      }),
    "status",
  ),
  http.protected
    .post("/vcs/apply", "vcs.apply")
    .inProject({ git: false })
    .at((ctx) => ({ path: "/vcs/apply", headers: ctx.headers(), body: { patch: "" } }))
    .status(400, undefined, "status"),
  http.protected
    .get("/vcs/activity", "vcs.activity")
    .at((ctx) => ({ path: "/vcs/activity?since=0", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        object(body.totals)
        array(body.days)
        array(body.recent)
        check(body.repository === true, "vcs activity should report the git-backed project as a repository")
        check(body.totals.commits === 1, "vcs activity should count the fixture root commit")
        check(body.recent.length === 1, "vcs activity should list the fixture root commit as recent")
        check(
          body.ahead === null && body.behind === null,
          "vcs activity should report null divergence without upstream",
        )
      },
      "status",
    ),
  http.protected
    .get("/vcs/activity", "vcs.activity")
    .at((ctx) => ({ path: "/vcs/activity?since=2000&until=1000", headers: ctx.headers() }))
    .status(400, undefined, "status"),
]
