import { array, check, data, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Home KPI aggregate, background-process and subagent-model policy routes over the routed project's sessions.
export const sessionActivityScenarios: Scenario[] = [
  http.protected
    .get("/api/session/{sessionID}/subagent-models", "v2.session.getSubagentModels")
    .seeded((ctx) => ctx.session({ title: "Subagent models get" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/subagent-models", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, data(object)),
  http.protected
    .post("/api/session/{sessionID}/subagent-models", "v2.session.setSubagentModels")
    .seeded((ctx) => ctx.session({ title: "Subagent models set" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/subagent-models", { sessionID: ctx.state.id }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { policy: { mode: "allowlist", models: [] } },
    }))
    .json(200, data(object)),
  http.protected
    .get("/api/session/{sessionID}/permission-rules", "v2.session.getPermission")
    .seeded((ctx) => ctx.session({ title: "Permission rules get" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/permission-rules", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, data(array)),
  http.protected
    .post("/api/session/{sessionID}/permission-rules", "v2.session.setPermission")
    .seeded((ctx) => ctx.session({ title: "Permission rules set" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/permission-rules", { sessionID: ctx.state.id }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { permission: [{ permission: "bash", pattern: "*", action: "allow" }] },
    }))
    .json(200, data(array)),
  http.protected
    .get("/api/session/{sessionID}/processes", "v2.session.processes")
    .seeded((ctx) => ctx.session({ title: "Processes get" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/processes", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, data(array)),
  http.protected
    .post("/api/session/{sessionID}/processes/{processID}/stop", "v2.session.processStop")
    .seeded((ctx) => ctx.session({ title: "Processes stop" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/processes/{processID}/stop", {
        sessionID: ctx.state.id,
        processID: "missing-process",
      }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
]
