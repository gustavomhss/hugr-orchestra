import { Effect } from "effect"
import { oauthProject } from "./fixtures/oauth-project"
import { array, check, locationData, object, stable } from "./assertions"
import { http, route } from "./dsl"
import { type CallResult, type Scenario, type ScenarioContext } from "./types"

// The real plugin supplies deterministic OAuth callbacks; all attempt state and credentials belong to Core.
const canonicalPath = "/api/integration/attempt/{attemptID}"
const aliasPath = "/api/integration/{integrationID}/connect/oauth/{attemptID}"

export const integrationScenarios: Scenario[] = [
  http.protected.get("/api/integration", "v2.integration.list").json(200, locationData(array)),
  http.protected
    .get("/api/integration/{integrationID}", "v2.integration.get")
    .at((ctx) => ({
      path: route("/api/integration/{integrationID}", { integrationID: "missing" }),
      headers: ctx.headers(),
    }))
    .json(200, object),
  http.protected
    .post("/api/integration/{integrationID}/connect/key", "v2.integration.connect.key")
    .at((ctx) => ({
      path: route("/api/integration/{integrationID}/connect/key", { integrationID: "missing" }),
      headers: ctx.headers(),
      body: { key: "test" },
    }))
    .status(204, undefined, "status"),
  http.protected
    .post("/api/integration/{integrationID}/connect/oauth", "v2.integration.connect.oauth")
    .at((ctx) => ({
      path: route("/api/integration/{integrationID}/connect/oauth", { integrationID: "missing" }),
      headers: ctx.headers(),
      body: { methodID: "missing", inputs: {} },
    }))
    .status(500, undefined, "status"),
  http.protected
    .get("/api/integration/attempt/{attemptID}", "v2.integration.attempt.status")
    .at((ctx) => ({
      path: route("/api/integration/attempt/{attemptID}", { attemptID: "con_missing" }),
      headers: ctx.headers(),
    }))
    .json(400, refusal("integration_attempt_not_found"), "status"),
  http.protected
    .post("/api/integration/attempt/{attemptID}/complete", "v2.integration.attempt.complete")
    .at((ctx) => ({
      path: route("/api/integration/attempt/{attemptID}/complete", { attemptID: "con_missing" }),
      headers: ctx.headers(),
      body: {},
    }))
    .json(400, refusal("integration_authorization"), "status"),
  http.protected
    .delete("/api/integration/attempt/{attemptID}", "v2.integration.attempt.cancel")
    .at((ctx) => ({
      path: route("/api/integration/attempt/{attemptID}", { attemptID: "con_missing" }),
      headers: ctx.headers(),
    }))
    .status(204, undefined, "status"),
  http.protected
    .get(canonicalPath, "v2.integration.attempt.status.pending")
    .inProject(oauthProject)
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(canonicalPath, ctx.state), headers: ctx.headers() }))
    .json(200, pendingAttempt),
  http.protected
    .post(`${canonicalPath}/complete`, "v2.integration.attempt.complete.success")
    .inProject(oauthProject)
    .mutating()
    .seeded(startOAuth)
    .at((ctx) => ({
      path: route(`${canonicalPath}/complete`, ctx.state),
      headers: ctx.headers(),
      body: { code: "ok" },
    }))
    .status(204, (ctx, result) => completedAttempt(ctx, ctx.state.attemptID, result)),
  http.protected
    .delete(canonicalPath, "v2.integration.attempt.cancel.pending")
    .inProject(oauthProject)
    .mutating()
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(canonicalPath, ctx.state), headers: ctx.headers() }))
    .status(204, (ctx, result) => cancelledAttempt(ctx, ctx.state.attemptID, result)),
  http.protected
    .get(aliasPath, "v2.integration.oauth.status")
    .inProject(oauthProject)
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(aliasPath, ctx.state), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) =>
      Effect.gen(function* () {
        pendingAttempt(body)
        const canonical = yield* oauthRequest(ctx, "get", route(canonicalPath, ctx.state))
        check(canonical.status === 200, "canonical status should expose the alias attempt")
        pendingAttempt(canonical.body)
        check(stable(body) === stable(canonical.body), "canonical and alias status should share attempt state")
      }),
    ),
  http.protected
    .post(`${aliasPath}/complete`, "v2.integration.oauth.complete")
    .inProject(oauthProject)
    .mutating()
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(`${aliasPath}/complete`, ctx.state), headers: ctx.headers(), body: { code: "ok" } }))
    .status(204, (ctx, result) => completedAttempt(ctx, ctx.state.attemptID, result)),
  http.protected
    .delete(aliasPath, "v2.integration.oauth.cancel")
    .inProject(oauthProject)
    .mutating()
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(aliasPath, ctx.state), headers: ctx.headers() }))
    .status(204, (ctx, result) => cancelledAttempt(ctx, ctx.state.attemptID, result)),
  http.protected
    .get(aliasPath, "v2.integration.oauth.status.wrongOwner")
    .inProject(oauthProject)
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(aliasPath, { ...ctx.state, integrationID: "compat-b" }), headers: ctx.headers() }))
    .jsonEffect(400, (body, ctx) => rejectedOwner(body, ctx, ctx.state.attemptID), "status"),
  http.protected
    .post(`${aliasPath}/complete`, "v2.integration.oauth.complete.wrongOwner")
    .inProject(oauthProject)
    .seeded(startOAuth)
    .at((ctx) => ({
      path: route(`${aliasPath}/complete`, { ...ctx.state, integrationID: "compat-b" }),
      headers: ctx.headers(),
      body: { code: "ok" },
    }))
    .jsonEffect(400, (body, ctx) => rejectedOwner(body, ctx, ctx.state.attemptID), "status"),
  http.protected
    .delete(aliasPath, "v2.integration.oauth.cancel.wrongOwner")
    .inProject(oauthProject)
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(aliasPath, { ...ctx.state, integrationID: "compat-b" }), headers: ctx.headers() }))
    .jsonEffect(400, (body, ctx) => rejectedOwner(body, ctx, ctx.state.attemptID), "status"),
  http.protected
    .post(`${aliasPath}/complete`, "v2.integration.oauth.complete.codeRequired")
    .inProject(oauthProject)
    .seeded(startOAuth)
    .at((ctx) => ({ path: route(`${aliasPath}/complete`, ctx.state), headers: ctx.headers(), body: {} }))
    .jsonEffect(
      400,
      (body, ctx) =>
        Effect.gen(function* () {
          refusal("integration_code_required")(body)
          yield* checkAttempt(ctx, ctx.state.attemptID, "pending")
          yield* checkConnections(ctx, "compat-a", 0)
        }),
      "status",
    ),
]

function startOAuth(ctx: ScenarioContext) {
  return Effect.gen(function* () {
    // Plugin registration is asynchronous. Observe discovery before starting a real attempt.
    for (let retry = 0; ; retry++) {
      const found = yield* oauthRequest(ctx, "get", "/api/integration/compat-a")
      check(found.status === 200, "OAuth fixture discovery should return JSON")
      object(found.body)
      if (found.body.data) break
      check(retry < 99, "OAuth fixture integration did not load")
      yield* Effect.sleep("10 millis")
    }
    const result = yield* oauthRequest(ctx, "post", "/api/integration/compat-a/connect/oauth", {
      methodID: "code",
      inputs: {},
    })
    check(result.status === 200, "OAuth connect should return an attempt")
    locationData((attempt: unknown) => {
      object(attempt)
      check(
        typeof attempt.attemptID === "string" && attempt.attemptID.startsWith("con_"),
        "attempt should have a canonical ID",
      )
      check(attempt.mode === "code", "fixture should start a code attempt")
      check(attempt.url === "https://example.test/oauth", "attempt should expose the fixture authorization URL")
      check(attempt.instructions === "Enter synthetic code", "attempt should expose authorization instructions")
      attemptTime(attempt.time)
    })(result.body)
    object(result.body)
    object(result.body.data)
    check(typeof result.body.data.attemptID === "string", "attempt ID should be a string")
    return { integrationID: "compat-a", attemptID: result.body.data.attemptID }
  })
}

function oauthRequest(ctx: ScenarioContext, method: "get" | "post" | "delete", path: string, body?: unknown) {
  return ctx.observe(method, path, body)
}

function refusal(kind: string) {
  return (body: unknown) => {
    object(body)
    check(body._tag === "InvalidRequestError", "OAuth refusal should use the typed transport error")
    check(body.kind === kind, `OAuth refusal should report ${kind}`)
    check(typeof body.message === "string" && body.message.length > 0, "OAuth refusal should explain the failure")
  }
}

function attemptTime(time: unknown) {
  object(time)
  check(typeof time.created === "number" && Number.isFinite(time.created), "attempt should report creation time")
  check(typeof time.expires === "number" && time.expires > time.created, "attempt should expire after creation")
}

function pendingAttempt(body: unknown) {
  locationData((value: unknown) => {
    object(value)
    check(value.status === "pending", "OAuth attempt should remain pending")
    attemptTime(value.time)
  })(body)
}

function checkAttempt(ctx: ScenarioContext, attemptID: string, expected: "pending" | "complete") {
  return Effect.gen(function* () {
    for (const path of [
      route(canonicalPath, { attemptID }),
      route(aliasPath, { integrationID: "compat-a", attemptID }),
    ]) {
      const result = yield* oauthRequest(ctx, "get", path)
      check(result.status === 200, "canonical and alias status should both return the attempt")
      locationData((value: unknown) => {
        object(value)
        check(value.status === expected, `OAuth attempt should be ${expected}`)
        attemptTime(value.time)
      })(result.body)
    }
  })
}

function checkConnections(ctx: ScenarioContext, integrationID: string, count: number) {
  return Effect.gen(function* () {
    const result = yield* oauthRequest(ctx, "get", `/api/integration/${integrationID}`)
    check(result.status === 200, "integration discovery should expose connections")
    locationData((value: unknown) => {
      object(value)
      check(value.id === integrationID, "connections should belong to the requested integration")
      array(value.connections)
      check(value.connections.length === count, `integration ${integrationID} should have ${count} connections`)
      value.connections.forEach((connection) => {
        object(connection)
        check(
          connection.type === "credential" && typeof connection.id === "string",
          "OAuth should store a credential connection",
        )
      })
    })(result.body)
  })
}

function completedAttempt(ctx: ScenarioContext, attemptID: string, result: CallResult) {
  return Effect.gen(function* () {
    check(result.text === "", "OAuth completion should return NoContent")
    yield* checkAttempt(ctx, attemptID, "complete")
    yield* checkConnections(ctx, "compat-a", 1)
    yield* checkConnections(ctx, "compat-b", 0)
  })
}

function cancelledAttempt(ctx: ScenarioContext, attemptID: string, result: CallResult) {
  return Effect.gen(function* () {
    check(result.text === "", "OAuth cancellation should return NoContent")
    for (const path of [
      route(canonicalPath, { attemptID }),
      route(aliasPath, { integrationID: "compat-a", attemptID }),
    ]) {
      const result = yield* oauthRequest(ctx, "get", path)
      check(result.status === 400, "cancellation should remove canonical and alias attempt state")
      refusal("integration_attempt_not_found")(result.body)
    }
    const again = yield* oauthRequest(ctx, "delete", route(canonicalPath, { attemptID }))
    check(again.status === 204 && again.text === "", "canonical cancellation should remain idempotent NoContent")
    yield* checkConnections(ctx, "compat-a", 0)
    yield* checkConnections(ctx, "compat-b", 0)
  })
}

function rejectedOwner(body: unknown, ctx: ScenarioContext, attemptID: string) {
  return Effect.gen(function* () {
    refusal("integration_attempt_owner")(body)
    yield* checkAttempt(ctx, attemptID, "pending")
    yield* checkConnections(ctx, "compat-a", 0)
    yield* checkConnections(ctx, "compat-b", 0)
  })
}
