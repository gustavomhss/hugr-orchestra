import { array, check, isRecord, locationData, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Relay authoring, publish and installed-hook routes (V2 /api/relay). Each route proves it decodes its request, runs in
// the project's Location and answers with its envelope or its typed refusal; the stateful flows are in
// test/server/httpapi-relay.test.ts.
const document = "/api/relay/document/{documentID}"
const missing = { documentID: "httpapi-missing" }
const hook = "/api/relay/hook/{installID}"
const absent = { installID: "h-httpapi-missing" }

function refusal(tag: string, code: string) {
  return (body: unknown) => {
    object(body)
    check(body._tag === tag, `expected ${tag}, got ${String(body._tag)}`)
    check(body.code === code, `expected code ${code}, got ${String(body.code)}`)
  }
}

function created(value: unknown) {
  object(value)
  check(value.name === "HTTP API workflow", "the created document should be returned")
  check(typeof value.checksum === "string" && value.versionCounter === 1, "a new document should be at version 1")
}

export const relayScenarios: Scenario[] = [
  http.protected.get("/api/relay/document", "v2.relay.document.list").json(
    200,
    locationData((value) => {
      array(value)
      check(
        value.some((item) => isRecord(item) && item.id === "relay-design" && item.runnable === false),
        "the seeded design profile should be listed and not runnable",
      )
    }),
  ),
  http.protected
    .post("/api/relay/document", "v2.relay.document.create")
    .mutating()
    .at((ctx) => ({ path: "/api/relay/document", headers: ctx.headers(), body: { name: "HTTP API workflow" } }))
    .json(200, locationData(created), "status"),
  http.protected
    .get(document, "v2.relay.document.get")
    .at((ctx) => ({ path: route(document, missing), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .patch(document, "v2.relay.document.update")
    .at((ctx) => ({ path: route(document, missing), headers: ctx.headers(), body: { versionId: "v", name: "x" } }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .delete(document, "v2.relay.document.remove")
    .at((ctx) => ({ path: route(document, missing), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .get(`${document}/version`, "v2.relay.document.versions")
    .at((ctx) => ({ path: route(`${document}/version`, missing), headers: ctx.headers() }))
    .json(200, locationData(array)),
  http.protected
    .get(`${document}/version/{versionID}`, "v2.relay.document.version")
    .at((ctx) => ({
      path: route(`${document}/version/{versionID}`, { ...missing, versionID: "httpapi-missing" }),
      headers: ctx.headers(),
    }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .get(`${document}/sprint`, "v2.relay.document.sprint")
    .at((ctx) => ({ path: route(`${document}/sprint`, missing), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .get(`${document}/export`, "v2.relay.document.export")
    .at((ctx) => ({ path: route(`${document}/export`, missing), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .post(`${document}/check`, "v2.relay.document.check")
    .at((ctx) => ({ path: route(`${document}/check`, missing), headers: ctx.headers(), body: {} }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected.get("/api/relay/node-types", "v2.relay.document.nodeTypes").json(
    200,
    locationData((value) => {
      object(value)
      array(value.workflow)
      array(value.hook)
    }),
  ),
  http.protected.get("/api/relay/scope", "v2.relay.scope.list").json(200, locationData(array)),
  http.protected
    .post("/api/relay/scope", "v2.relay.scope.create")
    .mutating()
    .at((ctx) => ({ path: "/api/relay/scope", headers: ctx.headers(), body: { name: "HTTP API scope" } }))
    .json(
      200,
      locationData((value) => {
        object(value)
        check(value.name === "HTTP API scope", "the created scope should be returned")
      }),
      "status",
    ),
  http.protected
    .patch("/api/relay/scope/{scopeID}", "v2.relay.scope.update")
    .at((ctx) => ({
      path: route("/api/relay/scope/{scopeID}", { scopeID: "httpapi-missing" }),
      headers: ctx.headers(),
      body: { name: "Renamed" },
    }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .delete("/api/relay/scope/{scopeID}", "v2.relay.scope.remove")
    .at((ctx) => ({
      path: route("/api/relay/scope/{scopeID}", { scopeID: "httpapi-missing" }),
      headers: ctx.headers(),
    }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .post(`${document}/publish`, "v2.relay.publish.publish")
    .at((ctx) => ({ path: route(`${document}/publish`, missing), headers: ctx.headers(), body: { versionId: "v" } }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .post(`${document}/unpublish`, "v2.relay.publish.unpublish")
    .at((ctx) => ({ path: route(`${document}/unpublish`, missing), headers: ctx.headers(), body: {} }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected.get("/api/relay/hook", "v2.relay.hook.list").json(
    200,
    locationData((value) => {
      object(value)
      array(value.installs)
    }),
  ),
  http.protected
    .post("/api/relay/hook", "v2.relay.hook.install")
    .at((ctx) => ({ path: "/api/relay/hook", headers: ctx.headers(), body: { document: "httpapi-missing" } }))
    .json(404, refusal("RelayNotFoundError", "not-found"), "status"),
  http.protected
    .post(`${hook}/update`, "v2.relay.hook.update")
    .at((ctx) => ({ path: route(`${hook}/update`, absent), headers: ctx.headers(), body: {} }))
    .json(404, refusal("RelayNotFoundError", "install-missing"), "status"),
  http.protected
    .post(`${hook}/enable`, "v2.relay.hook.enable")
    .at((ctx) => ({ path: route(`${hook}/enable`, absent), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "install-missing"), "status"),
  http.protected
    .post(`${hook}/disable`, "v2.relay.hook.disable")
    .at((ctx) => ({ path: route(`${hook}/disable`, absent), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "install-missing"), "status"),
  http.protected
    .patch("/api/relay/hook/order", "v2.relay.hook.order")
    .at((ctx) => ({ path: "/api/relay/hook/order", headers: ctx.headers(), body: { installIDs: ["h-unknown"] } }))
    .json(409, refusal("RelayConflictError", "order-mismatch"), "status"),
  http.protected
    .delete(hook, "v2.relay.hook.uninstall")
    .at((ctx) => ({ path: route(hook, absent), headers: ctx.headers() }))
    .json(404, refusal("RelayNotFoundError", "install-missing"), "status"),
  http.protected
    .get(`${hook}/decisions`, "v2.relay.hook.decisions")
    .at((ctx) => ({ path: route(`${hook}/decisions`, absent), headers: ctx.headers() }))
    .json(200, locationData(array)),
  http.protected
    .post("/api/relay/hook/repair", "v2.relay.hook.repair")
    .at((ctx) => ({ path: "/api/relay/hook/repair", headers: ctx.headers(), body: { confirm: true } }))
    .json(409, refusal("RelayConflictError", "repair-not-needed"), "status"),
]
