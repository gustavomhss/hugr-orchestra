import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { Effect } from "effect"
import { check, data, object, stable } from "./assertions"
import { http, route } from "./dsl"
import type { Scenario, ScenarioContext } from "./types"

const policyPath = "/api/session/{sessionID}/subagent-models"
const archivePath = "/api/session/{sessionID}/archive"
const missingID = "ses_httpapi_settings_missing"
const inherit = { mode: "inherit" }
const policies = [
  SessionSubagentModels.Policy.make({
    mode: "allowlist",
    models: [Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("child-model") })],
  }),
  SessionSubagentModels.Policy.make({ mode: "allowlist", models: [] }),
  SessionSubagentModels.inherit,
]

// Sessions are created and observed through HTTP only. V2 has no HTTP way to parent a Session, so the parent-ceiling
// and durable-event checks live in Core's own tests.
export const sessionSettingsScenarios: Scenario[] = [
  http.protected
    .post("/api/session", "v2.session.create")
    .at((ctx) => ({
      path: "/api/session",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: {},
    }))
    .json(200, data(object)),
  http.protected
    .get(policyPath, "v2.session.settings.policy.get.default")
    .seeded((ctx) => ctx.session())
    .at((ctx) => ({ path: route(policyPath, { sessionID: ctx.state.id }), headers: ctx.headers() }))
    .json(200, (body) => {
      check(stable(body) === stable({ data: inherit }), "a new Session should inherit its subagent model policy")
    }),
  ...policies.map((policy, index) =>
    http.protected
      .post(policyPath, `v2.session.settings.policy.set.${index}`)
      .mutating()
      .seeded((ctx) => ctx.session())
      .at((ctx) => ({
        path: route(policyPath, { sessionID: ctx.state.id }),
        headers: ctx.headers(),
        body: { policy },
      }))
      .jsonEffect(
        200,
        (body, ctx) =>
          Effect.gen(function* () {
            check(
              stable(body) === stable({ data: policy }),
              "POST should return the exact stored policy, preserving empty allowlist versus inherit",
            )
            const read = yield* ctx.observe("get", route(policyPath, { sessionID: ctx.state.id }))
            check(
              read.status === 200 && stable(read.body) === stable({ data: policy }),
              "a fresh HTTP GET should read the committed policy",
            )
          }),
        "status",
      ),
  ),
  ...[
    { method: "GET" as const, path: policyPath, body: undefined, name: "policy.get" },
    { method: "POST" as const, path: policyPath, body: { policy: { mode: "inherit" } }, name: "policy.set" },
    { method: "POST" as const, path: archivePath, body: { archived: true }, name: "archive" },
  ].map((input) =>
    (input.method === "GET" ? http.protected.get : http.protected.post)(
      input.path,
      `v2.session.settings.${input.name}.missing`,
    )
      .at((ctx) => ({ path: route(input.path, { sessionID: missingID }), headers: ctx.headers(), body: input.body }))
      .json(
        404,
        (body) => {
          check(
            stable(body) ===
              stable({
                _tag: "SessionNotFoundError",
                sessionID: missingID,
                message: `Session not found: ${missingID}`,
              }),
            "missing Session should return the exact declared 404",
          )
        },
        "status",
      ),
  ),
  ...[{}, { policy: { mode: "all" } }, { policy: { mode: "allowlist", models: [{ id: "child-model" }] } }].map(
    (payload, index) =>
      http.protected
        .post(policyPath, `v2.session.settings.policy.invalid.${index}`)
        .seeded((ctx) => ctx.session())
        .at((ctx) => ({
          path: route(policyPath, { sessionID: ctx.state.id }),
          headers: ctx.headers(),
          body: payload,
        }))
        .jsonEffect(
          400,
          (body, ctx) =>
            Effect.gen(function* () {
              invalidPayload(body)
              const read = yield* ctx.observe("get", route(policyPath, { sessionID: ctx.state.id }))
              check(
                read.status === 200 && stable(read.body) === stable({ data: inherit }),
                "malformed payload should leave the stored policy intact",
              )
            }),
          "status",
        ),
  ),
  ...[{}, { archived: "true" }].map((payload, index) =>
    http.protected
      .post(archivePath, `v2.session.settings.archive.invalid.${index}`)
      .seeded((ctx) => ctx.session())
      .at((ctx) => ({
        path: route(archivePath, { sessionID: ctx.state.id }),
        headers: ctx.headers(),
        body: payload,
      }))
      .jsonEffect(
        400,
        (body, ctx) =>
          Effect.gen(function* () {
            invalidPayload(body)
            const read = yield* ctx.observe("get", `/api/session/${ctx.state.id}`)
            object(read.body)
            object(read.body.data)
            object(read.body.data.time)
            check(
              !Object.hasOwn(read.body.data.time, "archived"),
              "malformed archive payload should leave visibility intact",
            )
          }),
        "status",
      ),
  ),
  http.protected
    .post(archivePath, "v2.session.settings.archive.lifecycle")
    .mutating()
    .seeded(seed)
    .at((ctx) => ({
      path: route(archivePath, { sessionID: ctx.state.child.id }),
      headers: ctx.headers(),
      body: { archived: true },
    }))
    .status(
      204,
      (ctx, result) =>
        Effect.gen(function* () {
          check(result.text === "", "archive should return an empty 204 response")
          const archived = yield* ctx.observe("get", `/api/session/${ctx.state.child.id}`)
          check(archived.status === 200, "archived Session should remain directly readable")
          object(archived.body)
          object(archived.body.data)
          object(archived.body.data.time)
          check(
            typeof archived.body.data.time.archived === "number",
            "wire Session should expose a numeric archived timestamp",
          )
          const visible = yield* ctx.observe("get", "/api/session?order=asc")
          check(visible.status === 200, "default list should succeed")
          object(visible.body)
          check(
            ids(visible.body.data).join() === ctx.state.parent.id,
            "default list should exclude the archived child before pagination",
          )
          const first = yield* ctx.observe("get", "/api/session?order=asc&includeArchived=true&limit=1")
          check(first.status === 200, "includeArchived first page should succeed")
          object(first.body)
          check(
            ids(first.body.data).join() === ctx.state.parent.id,
            "first page should contain the oldest Session",
          )
          object(first.body.cursor)
          check(
            typeof first.body.cursor.next === "string" && first.body.cursor.next.length > 0,
            "first page should return a nonempty continuation cursor",
          )
          const next = yield* ctx.observe(
            "get",
            `/api/session?${new URLSearchParams({ limit: "1", cursor: first.body.cursor.next })}`,
          )
          check(next.status === 200, "cursor-only continuation should succeed")
          object(next.body)
          check(
            ids(next.body.data).join() === ctx.state.child.id,
            "cursor should retain includeArchived and return the archived child",
          )
          const restored = yield* ctx.observe("post", route(archivePath, { sessionID: ctx.state.child.id }), {
            archived: false,
          })
          check(restored.status === 204 && restored.text === "", "restore should return an empty 204 response")
          const read = yield* ctx.observe("get", `/api/session/${ctx.state.child.id}`)
          check(read.status === 200, "restored Session should remain readable")
          object(read.body)
          object(read.body.data)
          object(read.body.data.time)
          check(
            !Object.hasOwn(read.body.data.time, "archived"),
            "restored wire Session should omit the archived timestamp",
          )
          const listed = yield* ctx.observe("get", "/api/session?order=asc")
          object(listed.body)
          check(
            ids(listed.body.data).join() === [ctx.state.parent.id, ctx.state.child.id].join(),
            "restore should put the child back in the default list",
          )
        }),
      "status",
    ),
]

function ids(value: unknown) {
  check(Array.isArray(value), "list data should be an array")
  return value.map((item) => {
    object(item)
    check(typeof item.id === "string", "listed Session should have an id")
    return item.id
  })
}

function invalidPayload(body: unknown) {
  object(body)
  check(
    body._tag === "InvalidRequestError" && body.kind === "Payload",
    "malformed payload should return the declared payload validation error",
  )
}

function seed(ctx: ScenarioContext) {
  return Effect.gen(function* () {
    const parent = yield* ctx.session()
    const child = yield* ctx.session()
    return { parent, child }
  })
}
