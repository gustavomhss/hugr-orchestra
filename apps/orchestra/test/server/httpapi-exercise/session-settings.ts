import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { Session } from "@orchestra/schema/session"
import type { SessionV2 } from "@orchestra/core/session"
import type { Interface } from "@orchestra/core/session/subagent-models"
import { DateTime, Effect, Layer, Schema, Scope } from "effect"
import { check, data, object, stable } from "./assertions"
import { call } from "./backend"
import { http, route } from "./dsl"
import { runtime } from "./runtime"
import type { Scenario, ScenarioContext } from "./types"

const policyPath = "/api/session/{sessionID}/subagent-models"
const archivePath = "/api/session/{sessionID}/archive"
const missingID = "ses_httpapi_settings_missing"
const parentPolicy = SessionSubagentModels.Policy.make({
  mode: "allowlist",
  models: [Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("parent-model") })],
})
const policies = [
  SessionSubagentModels.Policy.make({
    mode: "allowlist",
    models: [Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("child-model") })],
  }),
  SessionSubagentModels.Policy.make({ mode: "allowlist", models: [] }),
  SessionSubagentModels.inherit,
]

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
    .get(policyPath, "v2.session.settings.policy.get.parent")
    .seeded(seed)
    .at((ctx) => ({ path: route(policyPath, { sessionID: ctx.state.parent.id }), headers: ctx.headers() }))
    .json(200, (body) => {
      check(
        stable(body) === stable({ data: parentPolicy }),
        "GET should return the parent's exact stored outgoing policy",
      )
    }),
  http.protected
    .get(policyPath, "v2.session.settings.policy.get.child")
    .seeded(seed)
    .at((ctx) => ({ path: route(policyPath, { sessionID: ctx.state.child.id }), headers: ctx.headers() }))
    .json(200, (body) => {
      check(
        stable(body) === stable({ data: { mode: "inherit" } }),
        "GET should return the child's own policy, not its ancestor ceiling",
      )
    }),
  ...policies.map((policy, index) =>
    http.protected
      .post(policyPath, `v2.session.settings.policy.set.${index}`)
      .mutating()
      .seeded(seed)
      .at((ctx) => ({
        path: route(policyPath, { sessionID: ctx.state.child.id }),
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
            const read = yield* request(ctx, "GET", route(policyPath, { sessionID: ctx.state.child.id }))
            check(
              read.status === 200 && stable(read.body) === stable({ data: policy }),
              "a fresh HTTP GET should read the committed policy",
            )
            yield* withCurrentSessions(ctx, (sessions, models) =>
              Effect.gen(function* () {
                check(
                  stable(yield* models.get(ctx.state.child.id)) === stable(policy),
                  "Core should observe the HTTP policy mutation",
                )
                check(
                  stable(yield* models.forSession(ctx.state.child.id)) === stable([parentPolicy]),
                  "child policy must not erase its parent's allowlist",
                )
                const history = yield* sessions.history({ sessionID: ctx.state.child.id, limit: 100 })
                check(
                  history.events.length === 1,
                  "one policy replacement should publish exactly one durable Session event",
                )
                const event = history.events[0]
                check(
                  event.type === "session.next.subagent.models.changed",
                  "policy replacement should publish its canonical event",
                )
                check(
                  event.data.sessionID === ctx.state.child.id && stable(event.data.policy) === stable(policy),
                  "durable event should bind the child and exact policy",
                )
                check(
                  stable(event.durable) === stable({ aggregateID: ctx.state.child.id, seq: 1, version: 1 }),
                  "policy event should have the child's durable sequence and version",
                )
                check(
                  (yield* sessions.messages({ sessionID: ctx.state.child.id })).length === 0,
                  "policy metadata should not create a visible transcript message",
                )
              }),
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
        .seeded(seed)
        .at((ctx) => ({
          path: route(policyPath, { sessionID: ctx.state.parent.id }),
          headers: ctx.headers(),
          body: payload,
        }))
        .jsonEffect(
          400,
          (body, ctx) =>
            Effect.gen(function* () {
              invalidPayload(body)
              yield* withCurrentSessions(ctx, (sessions, models) =>
                Effect.gen(function* () {
                  check(
                    stable(yield* models.get(ctx.state.parent.id)) === stable(parentPolicy),
                    "malformed payload should leave the stored allowlist intact",
                  )
                  check(
                    (yield* sessions.history({ sessionID: ctx.state.parent.id, limit: 100 })).events.length === 1,
                    "malformed policy should not admit another durable event",
                  )
                }),
              )
            }),
          "status",
        ),
  ),
  ...[{}, { archived: "true" }].map((payload, index) =>
    http.protected
      .post(archivePath, `v2.session.settings.archive.invalid.${index}`)
      .seeded(seed)
      .at((ctx) => ({
        path: route(archivePath, { sessionID: ctx.state.child.id }),
        headers: ctx.headers(),
        body: payload,
      }))
      .jsonEffect(
        400,
        (body, ctx) =>
          Effect.gen(function* () {
            invalidPayload(body)
            yield* withCurrentSessions(ctx, (sessions) =>
              Effect.gen(function* () {
                check(
                  (yield* sessions.get(ctx.state.child.id)).time.archived === undefined,
                  "malformed archive payload should leave visibility intact",
                )
                check(
                  (yield* sessions.history({ sessionID: ctx.state.child.id, limit: 100 })).events.length === 0,
                  "malformed archive payload should publish no event",
                )
              }),
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
          const archived = yield* request(ctx, "GET", `/api/session/${ctx.state.child.id}`)
          check(archived.status === 200, "archived Session should remain directly readable")
          object(archived.body)
          object(archived.body.data)
          object(archived.body.data.time)
          check(
            typeof archived.body.data.time.archived === "number",
            "wire Session should expose a numeric archived timestamp",
          )
          const archivedAt = archived.body.data.time.archived
          const query = new URLSearchParams({ directory: ctx.directory ?? "", order: "asc" })
          const visible = yield* request(ctx, "GET", `/api/session?${query}`)
          check(visible.status === 200, "default list should succeed")
          object(visible.body)
          check(
            stable(visible.body.data) === stable([Schema.encodeSync(Session.Info)(ctx.state.parent)]),
            "default list should exclude the archived child before pagination",
          )
          const first = yield* request(ctx, "GET", `/api/session?${query}&includeArchived=true&limit=1`)
          check(first.status === 200, "includeArchived first page should succeed")
          object(first.body)
          check(
            stable(first.body.data) === stable([Schema.encodeSync(Session.Info)(ctx.state.parent)]),
            "first page should contain the oldest parent",
          )
          object(first.body.cursor)
          check(
            typeof first.body.cursor.next === "string" && first.body.cursor.next.length > 0,
            "first page should return a nonempty continuation cursor",
          )
          const next = yield* request(
            ctx,
            "GET",
            `/api/session?${new URLSearchParams({ limit: "1", cursor: first.body.cursor.next })}`,
          )
          check(next.status === 200, "cursor-only continuation should succeed")
          object(next.body)
          check(
            stable(next.body.data) === stable([archived.body.data]),
            "cursor should retain includeArchived and return the archived child",
          )
          const restored = yield* request(ctx, "POST", route(archivePath, { sessionID: ctx.state.child.id }), {
            archived: false,
          })
          check(restored.status === 204 && restored.text === "", "restore should return an empty 204 response")
          const read = yield* request(ctx, "GET", `/api/session/${ctx.state.child.id}`)
          check(read.status === 200, "restored Session should remain readable")
          object(read.body)
          object(read.body.data)
          object(read.body.data.time)
          check(
            !Object.hasOwn(read.body.data.time, "archived"),
            "restored wire Session should omit the archived timestamp",
          )
          const listed = yield* request(ctx, "GET", `/api/session?${query}`)
          check(listed.status === 200, "restored default list should succeed")
          object(listed.body)
          check(
            stable(listed.body.data) === stable([Schema.encodeSync(Session.Info)(ctx.state.parent), read.body.data]),
            "restore should put the child back in the default list",
          )
          yield* withCurrentSessions(ctx, (sessions) =>
            Effect.gen(function* () {
              const history = yield* sessions.history({ sessionID: ctx.state.child.id, limit: 100 })
              check(history.events.length === 2, "archive and restore should each record one durable event")
              const [archive, restore] = history.events
              check(
                archive.type === "session.next.archive.changed" && restore.type === "session.next.archive.changed",
                "archive lifecycle should use canonical durable events",
              )
              check(
                archive.data.sessionID === ctx.state.child.id && restore.data.sessionID === ctx.state.child.id,
                "archive events should belong to the requested child",
              )
              check(
                archive.data.archived !== null && DateTime.toEpochMillis(archive.data.archived) === archivedAt,
                "archive event should retain the projected timestamp",
              )
              check(restore.data.archived === null, "restore event should clear archive state")
              check(
                (yield* sessions.messages({ sessionID: ctx.state.child.id })).length === 0,
                "archive metadata should not create transcript messages",
              )
            }),
          )
        }),
      "status",
    ),
]

function invalidPayload(body: unknown) {
  object(body)
  check(
    body._tag === "InvalidRequestError" && body.kind === "Payload",
    "malformed payload should return the declared payload validation error",
  )
}

function request(ctx: ScenarioContext, method: "GET" | "POST", path: string, body?: unknown) {
  return call(
    (method === "GET" ? http.protected.get : http.protected.post)(path, "session settings follow-up")
      .at(() => ({ path, headers: ctx.headers(), body }))
      .ok(),
    { ...ctx, state: undefined },
  )
}

function seed(ctx: ScenarioContext) {
  return withCurrentSessions(ctx, (sessions, models) =>
    Effect.gen(function* () {
      check(ctx.directory !== undefined, "Session settings fixture needs an isolated Git project")
      const location = { directory: AbsolutePath.make(ctx.directory) }
      const parent = yield* sessions.create({ id: Session.ID.create(), location })
      yield* models.set(parent.id, parentPolicy)
      const child = yield* sessions.create({ id: Session.ID.create(), location, parentID: parent.id })
      check(child.parentID === parent.id, "Core creation should persist the parent chain")
      check(
        stable(yield* models.forSession(child.id)) === stable([parentPolicy]),
        "Core fixture should bind the parent's allowlist to the child",
      )
      return { parent: yield* sessions.get(parent.id), child }
    }),
  )
}

function withCurrentSessions<A, E>(
  ctx: ScenarioContext,
  use: (sessions: SessionV2.Interface, models: Interface) => Effect.Effect<A, E>,
) {
  return Effect.gen(function* () {
    // Load native services only after the CLI has installed its isolated database and XDG roots.
    const { SessionV2 } = yield* Effect.promise(() => import("@orchestra/core/session"))
    const { SessionSubagentModels } = yield* Effect.promise(() => import("@orchestra/core/session/subagent-models"))
    const { SessionExecution } = yield* Effect.promise(() => import("@orchestra/core/session/execution"))
    const { SessionExecutionLocal } = yield* Effect.promise(() => import("@orchestra/core/session/execution/local"))
    const { LocationServiceMap, buildLocationServiceMap } = yield* Effect.promise(
      () => import("@orchestra/core/location-services"),
    )
    const { LayerNode } = yield* Effect.promise(() => import("@orchestra/core/effect/layer-node"))
    const { AppNodeBuilderV1 } = yield* Effect.promise(() => import("../../../src/effect/app-node-builder-v1"))
    const { ArsenalNative } = yield* Effect.promise(() => import("@orchestra/maestro/arsenal-native"))
    const modules = yield* Effect.promise(() => runtime())
    const scope = yield* Scope.Scope
    const services = yield* Layer.buildWithMemoMap(
      AppNodeBuilderV1.build(LayerNode.group([SessionV2.node, SessionSubagentModels.node]), [
        [LocationServiceMap.node, buildLocationServiceMap(ArsenalNative.nativeRegistryReplacements)],
        [SessionExecution.node, SessionExecutionLocal.node],
      ]),
      modules.memoMap,
      scope,
    )
    return yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const models = yield* SessionSubagentModels.Service
      return yield* use(sessions, models)
    }).pipe(Effect.provide(services))
  }).pipe(Effect.orDie, Effect.scoped)
}
