import { object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// V2 Session operations beside prompts: compaction, waiting, forking, moving, shell, skills, synthetic context and
// generation. Operations on a missing Session are refused before anything runs.
export const sessionOperationScenarios: Scenario[] = [
  http.protected
    .post("/api/session/{sessionID}/compact", "v2.session.compact")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/compact", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .status(404, undefined, "status"),
  ...(
    [
      ["fork", "v2.session.fork", {}],
      ["move", "v2.session.move", { location: { directory: "/" } }],
      ["shell", "v2.session.shell", { command: "pwd" }],
      ["skill", "v2.session.skill", { skill: "httpapi-missing" }],
      ["generate", "v2.session.generate", { prompt: "hello" }],
    ] as const
  ).map(([operation, name, body]) =>
    http.protected
      .post(`/api/session/{sessionID}/${operation}`, name)
      .at((ctx) => ({
        path: route(`/api/session/{sessionID}/${operation}`, { sessionID: "ses_httpapi_missing" }),
        headers: { ...ctx.headers(), "content-type": "application/json" },
        body,
      }))
      .status(404, undefined, "status"),
  ),
  http.protected
    .post("/api/session/{sessionID}/synthetic", "v2.session.synthetic")
    .seeded((ctx) => ctx.session({ title: "Synthetic owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/synthetic", { sessionID: ctx.state.id }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { text: "Recorded context", resume: false },
    }))
    .json(200, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/wait", "v2.session.wait")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/wait", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .status(404, undefined, "status"),
  http.protected
    .get("/api/session/{sessionID}/todo", "v2.session.todo")
    .seeded((ctx) => ctx.session({ title: "Todo owner" }))
    .at((ctx) => ({ path: route("/api/session/{sessionID}/todo", { sessionID: ctx.state.id }), headers: ctx.headers() }))
    .json(200, object, "status"),
]
