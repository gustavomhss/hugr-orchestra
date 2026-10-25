import { array, check, object } from "./assertions"
import { http, route } from "./dsl"
import type { ScenarioContext, Scenario } from "./types"

// Capability routes (/api/capability). They refuse anonymous calls, so every scenario runs against a server with
// Basic auth configured. Reads use missing IDs and mutations send an empty payload, so no scenario creates a
// connection, target, binding or schedule run; the server tests cover those flows against seeded state.
const missingSchedule = route("/api/capability/schedules/{scheduleID}", { scheduleID: "tsk_httpapi_missing" })
const missingArtifact = route("/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}", {
  sessionID: "ses_httpapi_missing",
  artifactID: "cart_00000000000000000000000000",
  revision: "1",
})
const missingConnection = route("/api/capability/connections/{connectionID}", {
  connectionID: "cconn_00000000000000000000000000",
})
const missingTarget = route("/api/capability/targets/{targetID}", { targetID: "ctgt_00000000000000000000000000" })

const capability = {
  get: (path: string, name: string) => http.protected.get(path, name).withBasicAuth(),
  post: (path: string, name: string) => http.protected.post(path, name).withBasicAuth(),
  put: (path: string, name: string) => http.protected.put(path, name).withBasicAuth(),
  delete: (path: string, name: string) => http.protected.delete(path, name).withBasicAuth(),
}

function mutation(ctx: ScenarioContext, path: string) {
  return { path, headers: ctx.headers({ "idempotency-key": "httpapi-capability" }), body: {} }
}

function page(body: unknown) {
  object(body)
  array(body.items)
}

function denied(body: unknown) {
  object(body)
  check(body._tag === "ForbiddenError", "a missing capability record should be denied without saying whether it exists")
}

function invalid(body: unknown) {
  object(body)
  check(body._tag === "InvalidRequestError", "an empty capability payload should be a typed validation error")
}

export const capabilityScenarios: Scenario[] = [
  capability.get("/api/capability/operator", "v2.capability.operator.inspect").json(200, (body) => {
    object(body)
    check(body.origin === "configured-auth", "Basic auth should authenticate as the configured operator")
    check(typeof body.requestID === "string" && typeof body.scopeHash === "string", "operator should describe the request frame")
  }, "status"),

  capability.get("/api/capability/schedules", "v2.capability.schedule.list").json(200, page, "status"),
  ...(["pause", "resume", "run"] as const).map((action) =>
    capability
      .post(`/api/capability/schedules/{scheduleID}/${action}`, `v2.capability.schedule.${action}`)
      .at((ctx) => ({ path: `${missingSchedule}/${action}`, headers: ctx.headers({ "idempotency-key": "httpapi-capability" }) }))
      .json(403, denied, "status"),
  ),
  capability
    .delete("/api/capability/schedules/{scheduleID}", "v2.capability.schedule.remove")
    .at((ctx) => ({ path: missingSchedule, headers: ctx.headers({ "idempotency-key": "httpapi-capability" }) }))
    .json(403, denied, "status"),

  capability
    .get("/api/capability/sessions/{sessionID}/artifacts", "v2.capability.artifact.list")
    .at((ctx) => ({
      path: route("/api/capability/sessions/{sessionID}/artifacts", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .json(403, denied, "status"),
  capability
    .get("/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}", "v2.capability.artifact.get")
    .at((ctx) => ({ path: missingArtifact, headers: ctx.headers() }))
    .json(403, denied, "status"),
  capability
    .get("/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}/content", "v2.capability.artifact.content")
    .at((ctx) => ({ path: `${missingArtifact}/content`, headers: ctx.headers() }))
    .json(403, denied, "status"),
  capability
    .post(
      "/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}/content-ticket",
      "v2.capability.artifact.contentTicket",
    )
    .at((ctx) => ({ path: `${missingArtifact}/content-ticket`, headers: ctx.headers() }))
    .json(403, denied, "status"),
  capability
    .post("/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}/share", "v2.capability.artifact.share")
    .at((ctx) => mutation(ctx, `${missingArtifact}/share`))
    .json(400, invalid, "status"),
  capability
    .put("/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}/pin", "v2.capability.artifact.pin")
    .at((ctx) => mutation(ctx, `${missingArtifact}/pin`))
    .json(400, invalid, "status"),
  capability
    .delete(
      "/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}",
      "v2.capability.artifact.removeReference",
    )
    .at((ctx) => ({ path: missingArtifact, headers: ctx.headers({ "idempotency-key": "httpapi-capability" }) }))
    .json(403, denied, "status"),
  // A content ticket is its own credential: an unknown one is refused before any artifact lookup.
  http.ticketBypass
    .get("/api/capability/content/{ticket}", "v2.capability.content.read")
    .at((ctx) => ({ path: route("/api/capability/content/{ticket}", { ticket: "httpapi-unknown" }), headers: ctx.headers() }))
    .status(401, undefined, "status"),

  capability.get("/api/capability/connections", "v2.capability.connection.list").json(200, page, "status"),
  capability
    .get("/api/capability/connections/{connectionID}", "v2.capability.connection.get")
    .at((ctx) => ({ path: missingConnection, headers: ctx.headers() }))
    .json(403, denied, "status"),
  capability
    .get("/api/capability/connections/{connectionID}/targets", "v2.capability.connection.targets")
    .at((ctx) => ({ path: `${missingConnection}/targets`, headers: ctx.headers() }))
    .json(403, denied, "status"),
  capability
    .get("/api/capability/targets/{targetID}", "v2.capability.target.get")
    .at((ctx) => ({ path: missingTarget, headers: ctx.headers() }))
    .json(403, denied, "status"),
  capability
    .get("/api/capability/targets/{targetID}/bindings", "v2.capability.binding.list")
    .at((ctx) => ({ path: `${missingTarget}/bindings`, headers: ctx.headers() }))
    .json(403, denied, "status"),
  ...(
    [
      ["/api/capability/connections/connect", "v2.capability.connection.connect"],
      ["/api/capability/connections/disconnect", "v2.capability.connection.disconnect"],
      ["/api/capability/targets", "v2.capability.target.create"],
      ["/api/capability/targets/retarget", "v2.capability.target.retarget"],
      ["/api/capability/targets/remove", "v2.capability.target.remove"],
      ["/api/capability/bindings", "v2.capability.binding.put"],
      ["/api/capability/bindings/remove", "v2.capability.binding.remove"],
    ] as const
  ).map(([path, name]) =>
    capability
      .post(path, name)
      .at((ctx) => mutation(ctx, path))
      .json(400, invalid, "status"),
  ),
]
