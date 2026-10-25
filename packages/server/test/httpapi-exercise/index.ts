/**
 * End-to-end exerciser for the V2 Effect HttpApi routes.
 *
 * This is a route-coverage harness, not a normal unit test file: every route in `@orchestra/server/api` has a small
 * scenario that proves the route decodes requests, resolves the right Location, mutates storage when expected, and
 * returns the expected response shape.
 *
 * Each scenario builds the whole server from `createRoutes` with its own in-memory database (see `backend.ts`), so
 * this must never point at a developer's real session database.
 *
 * DSL shape:
 * - `http.protected.get/post/...` starts a scenario for one OpenAPI route key.
 * - `.seeded(...)` creates typed per-scenario state using Effect helpers on `ctx`.
 * - `.at(...)` builds the request from that typed state.
 * - `.json(...)` / `.jsonEffect(...)` assert response shape and optional side effects.
 */
import "./environment"
import { Api } from "@orchestra/server/api"
import { Effect } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { array, check, data, isRecord, locationData, object } from "./assertions"
import { controlledPtyInput, cursor, http, route } from "./dsl"
import { cleanupExercisePaths, exerciseConfigDirectory, exerciseDataDirectory, exerciseGlobalRoot } from "./environment"
import { color, printHeader, printResults } from "./report"
import { coverageResult, parseOptions, routeKey, routeKeys, selectedScenarios } from "./routing"
import { runScenario } from "./runner"
import { type ExerciseApp } from "./backend"
import { type Scenario } from "./types"
import { globalConfigScenarios } from "./global-config"
import { vcsScenarios } from "./vcs"
import { skillScenarios } from "./skill"
import { relayScenarios } from "./relay"
import { guardrailScenarios } from "./guardrail"
import { catalogScenarios } from "./catalog"
import { researchArtifactScenarios } from "./research-artifact"
import { actionsBindingScenarios } from "./actions-binding"
import { actionsReadScenarios } from "./actions-read"
import { actionsOperationScenarios } from "./actions-operation"
import { actionsCommandScenarios } from "./actions-command"
import { actionsProviderBoundaryScenarios } from "./actions-provider-boundary"
import { actionsSourceScenarios } from "./actions-source"
import { actionsResourceScenarios } from "./actions-resource"
import { actionsTransferScenarios } from "./actions-transfer"
import { actionsSubagentModelsScenarios } from "./actions-subagent-models"
import { actionsFailureScenarios } from "./actions-failures"
import { sessionSettingsScenarios } from "./session-settings"
import { scheduleScenarios } from "./schedule"
import { capabilityScenarios } from "./capability"
import { projectScenarios } from "./project"
import { providerScenarios } from "./provider"
import { mcpScenarios } from "./mcp"
import { integrationScenarios } from "./integration"
import { credentialScenarios } from "./credential"
import { sessionActivityScenarios } from "./session-activity"
import { sessionOperationScenarios } from "./session-operations"

export const scenarios: Scenario[] = [
  ...globalConfigScenarios,
  ...vcsScenarios,
  ...skillScenarios,
  ...relayScenarios,
  ...guardrailScenarios,
  ...catalogScenarios,
  ...researchArtifactScenarios,
  ...actionsBindingScenarios,
  ...actionsReadScenarios,
  ...actionsOperationScenarios,
  ...actionsCommandScenarios,
  ...actionsProviderBoundaryScenarios,
  ...actionsSourceScenarios,
  ...actionsResourceScenarios,
  ...actionsTransferScenarios,
  ...actionsSubagentModelsScenarios,
  ...actionsFailureScenarios,
  ...sessionSettingsScenarios,
  ...scheduleScenarios,
  ...capabilityScenarios,
  ...mcpScenarios,
  ...sessionActivityScenarios,
  ...sessionOperationScenarios,
  ...projectScenarios,
  http.protected
    .post("/experimental/project/{projectID}/copy/generate-name", "experimental.projectCopy.generateName")
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/experimental/project/{projectID}/copy/generate-name", { projectID: ctx.state.id }),
      headers: ctx.headers(),
      body: {},
    }))
    .json(200, (body) => {
      object(body)
      check(typeof body.name === "string" && body.name.length > 0, "generated copy name should be non-empty")
    }),
  http.protected
    .post("/experimental/project/{projectID}/copy", "experimental.projectCopy.create")
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/experimental/project/{projectID}/copy", { projectID: ctx.state.id }),
      headers: ctx.headers(),
      body: {},
    }))
    .status(400),
  http.protected
    .delete("/experimental/project/{projectID}/copy", "experimental.projectCopy.remove")
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/experimental/project/{projectID}/copy", { projectID: ctx.state.id }),
      headers: ctx.headers(),
      body: {},
    }))
    .status(400),
  http.protected
    .post("/experimental/project/{projectID}/copy/refresh", "experimental.projectCopy.refresh")
    .mutating()
    .seeded((ctx) => ctx.project())
    .at((ctx) => ({
      path: route("/experimental/project/{projectID}/copy/refresh", { projectID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .status(204, undefined, "status"),
  ...providerScenarios,
  http.protected.get("/api/health", "v2.health.get").json(200, (body) => {
    object(body)
    check(body.healthy === true && typeof body.pid === "number" && body.pid > 0, "v2 health must identify the ready process")
  }),
  http.protected.get("/api/location", "v2.location.get").json(200, object),
  http.protected.get("/api/agent", "v2.agent.list").json(200, locationData(array)),
  http.protected
    .get("/api/agent/{agentID}/file", "v2.agent.file.get")
    .at((ctx) => ({ path: route("/api/agent/{agentID}/file", { agentID: "httpapi-missing" }), headers: ctx.headers() }))
    .json(200, object),
  http.protected
    .put("/api/agent/{agentID}/file", "v2.agent.file.update")
    .at((ctx) => ({
      path: route("/api/agent/{agentID}/file", { agentID: "not a name" }),
      headers: ctx.headers(),
      body: { description: "rejected before any write" },
    }))
    .status(400, undefined, "status"),
  http.protected.get("/api/model", "v2.model.list").json(200, locationData(array)),
  http.protected.get("/api/provider", "v2.provider.list").json(200, locationData(array)),
  ...integrationScenarios,
  ...credentialScenarios,
  http.protected
    .get("/api/event", "v2.event.subscribe")
    .stream()
    .status(
      200,
      (_ctx, result) =>
        Effect.sync(() => {
          check(result.contentType.includes("text/event-stream"), "v2 event should be an SSE stream")
          check(result.text.includes("server.connected"), "v2 event should emit initial connection event")
          check(!result.text.includes('"location"'), "v2 connection event should not be scoped to a location")
        }),
      "status",
    ),
  http.protected
    .get("/api/fs/read", "v2.fs.read")
    .seeded((ctx) => ctx.file("hello.txt", "hello\n"))
    .at((ctx) => ({ path: "/api/fs/read?path=hello.txt", headers: ctx.headers() }))
    .status(
      200,
      (_ctx, result) =>
        Effect.sync(() => {
          check(result.text === "hello\n", "v2 fs read should return the file body")
          check(result.contentType.includes("text/plain"), "v2 fs read should return the file content type")
        }),
      "status",
    ),
  http.protected.get("/api/fs/list", "v2.fs.list").json(200, locationData(array)),
  http.protected
    .get("/api/fs/find", "v2.fs.find")
    .seeded((ctx) => ctx.file("hello.txt", "hello\n"))
    .at((ctx) => ({ path: "/api/fs/find?query=hello&type=file", headers: ctx.headers() }))
    .json(200, locationData(array)),
  http.protected.get("/api/pty", "v2.pty.list").json(200, locationData(array)),
  http.protected
    .post("/api/pty", "v2.pty.create")
    .mutating()
    .at((ctx) => ({ path: "/api/pty", headers: ctx.headers(), body: controlledPtyInput("HTTP API V2 PTY") }))
    .json(200, locationData(object)),
  http.protected
    .get("/api/pty/{ptyID}", "v2.pty.get")
    .at((ctx) => ({ path: route("/api/pty/{ptyID}", { ptyID: "pty_httpapi_missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .put("/api/pty/{ptyID}", "v2.pty.update")
    .mutating()
    .at((ctx) => ({
      path: route("/api/pty/{ptyID}", { ptyID: "pty_httpapi_missing" }),
      headers: ctx.headers(),
      body: { title: "missing" },
    }))
    .json(404, object, "status"),
  http.protected
    .delete("/api/pty/{ptyID}", "v2.pty.remove")
    .mutating()
    .at((ctx) => ({ path: route("/api/pty/{ptyID}", { ptyID: "pty_httpapi_missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .post("/api/pty/{ptyID}/connect-token", "v2.pty.connectToken")
    .at((ctx) => ({
      path: route("/api/pty/{ptyID}/connect-token", { ptyID: "pty_httpapi_missing" }),
      headers: { ...ctx.headers(), "x-orchestra-ticket": "1" },
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/pty/{ptyID}/connect", "v2.pty.connect")
    .at((ctx) => ({
      path: route("/api/pty/{ptyID}/connect", { ptyID: "pty_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .status(404, undefined, "none"),
  http.protected
    .get("/api/provider/{providerID}", "v2.provider.get")
    .at((ctx) => ({ path: route("/api/provider/{providerID}", { providerID: "missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected.get("/api/lsp", "v2.lsp.status").json(200, locationData(array)),
  http.protected.get("/api/permission/request", "v2.permission.request.list").json(200, (body) => {
    object(body)
    object(body.location)
    array(body.data)
  }),
  http.protected.get("/api/question/request", "v2.question.request.list").json(200, (body) => {
    object(body)
    object(body.location)
    array(body.data)
  }),
  http.protected
    .post("/api/session/{sessionID}/permission", "v2.session.permission.create")
    .seeded((ctx) => ctx.session({ title: "Permission create owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/permission", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
      body: { action: "read", resources: [".env"] },
    }))
    .json(200, (body) => {
      object(body)
      object(body.data)
      check(typeof body.data.id === "string", "permission create should return an ID")
      check(body.data.effect === "ask", "permission create should create a pending request")
    }),
  http.protected
    .get("/api/session/{sessionID}/permission", "v2.session.permission.list")
    .seeded((ctx) => ctx.session({ title: "Permission list owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/permission", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, data(array)),
  http.protected
    .get("/api/session/{sessionID}/permission/{requestID}", "v2.session.permission.get")
    .seeded((ctx) => ctx.session({ title: "Permission get owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/permission/{requestID}", {
        sessionID: ctx.state.id,
        requestID: "per_httpapi_missing",
      }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/question", "v2.session.question.list")
    .seeded((ctx) => ctx.session({ title: "Question list owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/question", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, data(array)),
  http.protected
    .post("/api/session/{sessionID}/permission/{requestID}/reply", "v2.session.permission.reply")
    .seeded((ctx) => ctx.session({ title: "Permission owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/permission/{requestID}/reply", {
        sessionID: ctx.state.id,
        requestID: "per_httpapi_missing",
      }),
      headers: ctx.headers(),
      body: { reply: "once" },
    }))
    .json(404, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/question/{requestID}/reply", "v2.session.question.reply")
    .seeded((ctx) => ctx.session({ title: "Question reply owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/question/{requestID}/reply", {
        sessionID: ctx.state.id,
        requestID: "que_httpapi_missing",
      }),
      headers: ctx.headers(),
      body: { answers: [] },
    }))
    .json(404, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/question/{requestID}/reject", "v2.session.question.reject")
    .seeded((ctx) => ctx.session({ title: "Question reject owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/question/{requestID}/reject", {
        sessionID: ctx.state.id,
        requestID: "que_httpapi_missing",
      }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected.get("/api/permission/saved", "v2.permission.saved.list").json(200, (body) => {
    object(body)
    array(body.data)
  }),
  http.protected
    .delete("/api/permission/saved/{id}", "v2.permission.saved.remove")
    .at((ctx) => ({ path: route("/api/permission/saved/{id}", { id: "psv_httpapi_missing" }), headers: ctx.headers() }))
    .status(204, undefined, "status"),
  http.protected
    .get("/api/session", "v2.session.list")
    .at((ctx) => ({ path: "/api/session?roots=true", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        array(body.data)
        object(body.cursor)
      },
      "none",
    ),
  http.protected
    .get("/api/session", "v2.session.list.filters")
    .at((ctx) => ({
      path: `/api/session?${new URLSearchParams({
        limit: "2",
        order: "asc",
        path: ".",
        roots: "false",
        start: "0",
        search: "missing",
        directory: ctx.directory ?? "",
      })}`,
      headers: ctx.headers(),
    }))
    .json(
      200,
      (body) => {
        object(body)
        array(body.data)
        object(body.cursor)
      },
      "none",
    ),
  http.protected
    .get("/api/session", "v2.session.list.cursor")
    .at((ctx) => ({
      path: `/api/session?${new URLSearchParams({
        limit: "2",
        cursor: cursor({
          order: "desc",
          directory: ctx.directory,
          anchor: { id: "ses_httpapi_missing", time: 0, direction: "next" },
        }),
      })}`,
      headers: ctx.headers(),
    }))
    .json(
      200,
      (body) => {
        object(body)
        array(body.data)
        object(body.cursor)
      },
      "none",
    ),
  http.protected
    .get("/api/session", "v2.session.list.cursor.invalid")
    .at((ctx) => ({
      path: `/api/session?${new URLSearchParams({
        cursor: "invalid",
      })}`,
      headers: ctx.headers(),
    }))
    .status(400, undefined, "none"),
  http.protected.get("/api/session/active", "v2.session.active").json(200, data(object), "none"),
  http.protected
    .get("/api/session/{sessionID}", "v2.session.get")
    .seeded((ctx) => ctx.session({ title: "Session get" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, data(object)),
  http.protected
    .post("/api/session/{sessionID}/agent", "v2.session.switchAgent")
    .seeded((ctx) => ctx.session({ title: "Switch agent" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/agent", { sessionID: ctx.state.id }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { agent: "reviewer" },
    }))
    .status(204, undefined, "none"),
  http.protected
    .post("/api/session/{sessionID}/model", "v2.session.switchModel")
    .seeded((ctx) => ctx.session({ title: "Switch model" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/model", { sessionID: ctx.state.id }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { model: { providerID: "opencode", id: "big-pickle" } },
    }))
    .status(204, undefined, "none"),
  http.protected
    .get("/api/session/{sessionID}/context", "v2.session.context")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/context", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/message/{messageID}/diff", "v2.session.message.diff")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/message/{messageID}/diff", {
        sessionID: "ses_httpapi_missing",
        messageID: "msg_httpapi_missing",
      }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/revert/stage", "v2.session.revert.stage")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/revert/stage", { sessionID: "ses_httpapi_missing" }),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { messageID: "msg_httpapi_missing" },
    }))
    .json(404, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/revert/clear", "v2.session.revert.clear")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/revert/clear", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/revert/commit", "v2.session.revert.commit")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/revert/commit", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/message", "v2.session.messages")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/message", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/message", "v2.session.messages.params")
    .at((ctx) => ({
      path: `${route("/api/session/{sessionID}/message", { sessionID: "ses_httpapi_missing" })}?${new URLSearchParams({
        limit: "2",
        order: "asc",
      })}`,
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/message", "v2.session.messages.cursor")
    .at((ctx) => ({
      path: `${route("/api/session/{sessionID}/message", { sessionID: "ses_httpapi_missing" })}?${new URLSearchParams({
        limit: "2",
        directory: ctx.directory ?? "",
        cursor: cursor({ id: "msg_httpapi_missing", time: 0, order: "desc", direction: "next" }),
      })}`,
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/message", "v2.session.messages.cursor.invalid")
    .seeded((ctx) => ctx.session({ title: "Invalid message cursor owner" }))
    .at((ctx) => ({
      path: `${route("/api/session/{sessionID}/message", { sessionID: ctx.state.id })}?${new URLSearchParams({
        cursor: cursor({ id: "msg_httpapi_missing", time: 0, order: "desc", direction: "next" }),
        order: "asc",
      })}`,
      headers: ctx.headers(),
    }))
    .status(400, undefined, "none"),
  http.protected
    .get("/api/session/{sessionID}/history", "v2.session.history")
    .seeded((ctx) => ctx.session({ title: "Session history" }))
    .at((ctx) => ({
      path: `${route("/api/session/{sessionID}/history", { sessionID: ctx.state.id })}?${new URLSearchParams({
        after: "0",
        limit: "2",
      })}`,
      headers: ctx.headers(),
    }))
    .json(
      200,
      (body) => {
        object(body)
        array(body.data)
        check(typeof body.hasMore === "boolean", "Expected a history exhaustion signal")
      },
      "none",
    ),
  http.protected
    .get("/api/session/{sessionID}/history", "v2.session.history.missing")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/history", { sessionID: "ses_httpapi_missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/history", "v2.session.history.invalid")
    .seeded((ctx) => ctx.session({ title: "Invalid history sequence" }))
    .at((ctx) => ({
      path: `${route("/api/session/{sessionID}/history", { sessionID: ctx.state.id })}?after=-1`,
      headers: ctx.headers(),
    }))
    .json(400, object, "status"),
  http.protected
    .get("/api/session/{sessionID}/event", "v2.session.events.missing")
    .at((ctx) => ({
      path: `${route("/api/session/{sessionID}/event", { sessionID: "ses_httpapi_missing" })}?after=0`,
      headers: ctx.headers(),
    }))
    .status(404, undefined, "status"),
  http.protected
    .post("/api/session/{sessionID}/interrupt", "v2.session.interrupt")
    .seeded((ctx) => ctx.session({ title: "Interrupt session" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/interrupt", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .status(204, undefined, "none"),
  http.protected
    .get("/api/session/{sessionID}/message/{messageID}", "v2.session.message.missing")
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/message/{messageID}", {
        sessionID: "ses_httpapi_missing",
        messageID: "msg_httpapi_missing",
      }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .post("/api/session/{sessionID}/background", "v2.session.background")
    .seeded((ctx) => ctx.session({ title: "Background owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/background", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
    }))
    .json(200, (body) => {
      object(body)
      check(body.data === 0, "a session with no foreground subagents moves nothing to the background")
    }),
  http.protected
    .post("/api/session/{sessionID}/prompt", "v2.session.prompt.invalid")
    .seeded((ctx) => ctx.session({ title: "Invalid prompt owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/prompt", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
      body: {},
    }))
    .status(400, undefined, "none"),
]

export function main(args: readonly string[]) {
  return Effect.gen(function* () {
    const shared: { auth: ExerciseApp | undefined } = { auth: undefined }
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        await shared.auth?.dispose().catch(() => undefined)
        await cleanupExercisePaths()
      }),
    )
    const options = parseOptions(args)
    const apiRoutes = routeKeys(OpenApi.fromApi(Api))
    const selected = selectedScenarios(options, scenarios)
    const missing = apiRoutes.filter((route) => !scenarios.some((scenario) => route === routeKey(scenario)))
    const extra = scenarios.filter((scenario) => !apiRoutes.includes(routeKey(scenario)))

    printHeader(options, apiRoutes, selected, missing, extra, { database: ":memory:", global: exerciseGlobalRoot })

    const results =
      options.mode === "coverage"
        ? selected.map(coverageResult)
        : yield* Effect.forEach(
            selected,
            (scenario) =>
              Effect.gen(function* () {
                if (options.progress) console.log(`${color.dim}RUN ${routeKey(scenario)} ${scenario.name}${color.reset}`)
                return yield* runScenario(options, shared)(scenario)
              }),
            { concurrency: 1 },
          )
    printResults(results, missing, extra)

    if (results.some((result) => result.status === "fail"))
      return yield* Effect.fail(new Error("one or more scenarios failed"))
    if (options.failOnSkip && results.some((result) => result.status === "skip"))
      return yield* Effect.fail(new Error("one or more scenarios are skipped"))
    if (options.failOnMissing && missing.length > 0)
      return yield* Effect.fail(new Error("one or more routes have no scenario"))
    return undefined
  }).pipe(Effect.scoped)
}

