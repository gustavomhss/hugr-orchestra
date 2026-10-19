import { describe, expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { ServerAuth } from "@orchestra/server/auth"
import { SessionHandler } from "@orchestra/server/handlers/session"
import { Authorization, authorizationLayer } from "@orchestra/server/middleware/authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "@orchestra/server/middleware/schema-error"
import { SessionLocationMiddleware, sessionLocationLayer } from "@orchestra/server/middleware/session-location"
import { Event } from "@orchestra/schema/event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { eq } from "drizzle-orm"
import { Cause, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Mount the production Session group and handler without the host route tree's unknown router requirements.
const api = HttpApi.make("server")
  .add(makeSessionGroup(SessionLocationMiddleware))
  .middleware(Authorization)
  .middleware(SchemaErrorMiddleware)
const services = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const database = Database.layerFromPath(path.join(directory, "policy.sqlite"))
    return AppNodeBuilder.build(
      LayerNode.group([Database.node, SessionV2.node, SessionExecution.node, SessionSubagentModels.node, LocationServiceMap.node]),
      [
        [Database.node, database],
        // One closed canonical producer prevents DB replacement from cloning Event descriptors across registry branches.
        [EventV2.node, EventV2.layerWith().pipe(Layer.provide(database))],
        [SessionExecution.node, SessionExecutionLocal.node],
      ],
    )
  }),
)
const observedLocation = Layer.effect(SessionLocationMiddleware, Effect.gen(function* () {
  const middleware = yield* SessionLocationMiddleware
  return SessionLocationMiddleware.of((effect, options) => middleware(effect, options).pipe(
    Effect.tapCause((cause) => Effect.sync(() => console.error("policy Session Location failure", Cause.pretty(cause)))),
  ))
})).pipe(Layer.provide(sessionLocationLayer))
const routes = HttpApiBuilder.layer(api).pipe(
  Layer.provide(SessionHandler),
  Layer.provide([observedLocation, authorizationLayer, schemaErrorLayer]),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
  Layer.provideMerge(services),
)
const it = testEffect(
  HttpRouter.serve(routes, {
    disableListenLog: true,
    disableLogger: false,
    middleware: (effect) => effect.pipe(
      Effect.tapCause((cause) => Effect.sync(() => console.error("policy HTTP router failure", Cause.pretty(cause)))),
    ),
  }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
  ),
)

function request(route: string, init?: RequestInit) {
  const url = new URL(route, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
    Effect.tap((response) => response.status < 500 ? Effect.void : response.text.pipe(
      Effect.flatMap((body) => Effect.sync(() => console.error("policy HTTP 5xx response", {
        method: init?.method ?? "GET",
        route,
        status: response.status,
        body,
      }))),
      Effect.catchCause((cause) => Effect.logError("policy HTTP 5xx body read failed", cause)),
    )),
  )
}

// A migrated Session gives the real middleware its stored Location without admitting a prompt or resolving a model.
const persistedSession = Effect.gen(function* () {
  const directory = yield* tmpdirScoped()
  const database = yield* Database.Service
  const id = SessionV2.ID.create()
  yield* database.db
    .insert(ProjectTable)
    .values({ id: ProjectV2.ID.global, worktree: AbsolutePath.make(directory), sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(SessionTable)
    .values({ id, project_id: ProjectV2.ID.global, slug: id, directory, title: "Policy HTTP", version: "test" })
    .run()
  return id
})

describe("session subagent model policy HttpApi", () => {
  it.live("ACKs normalized durable policy, exposes events and Session readback, and distinguishes deny-all from inherit", () =>
    Effect.gen(function* () {
      const id = yield* persistedSession
      const database = yield* Database.Service
      const route = `/api/session/${id}/subagent-models`
      const initial = yield* request(route)
      expect(initial.status).toBe(200)
      expect(yield* initial.json).toEqual({ data: { mode: "inherit" } })

      const normalized = {
        mode: "allowlist",
        models: [
          { providerID: "provider", id: "model" },
          { providerID: "other", id: "model" },
        ],
      }
      const changes = [
        {
          input: {
            mode: "allowlist",
            models: [
              { providerID: "provider", id: "model", variant: "fast" },
              { providerID: "provider", id: "model", variant: "deep" },
              { providerID: "other", id: "model" },
            ],
          },
          expected: normalized,
        },
        { input: { mode: "allowlist", models: [] }, expected: { mode: "allowlist", models: [] } },
        { input: { mode: "inherit" }, expected: { mode: "inherit" } },
      ]
      // Invalid caller Location must not override the stored Session Location on either policy route.
      const headers = { "x-orchestra-directory": "relative/wrong-location", "x-orchestra-workspace": "invalid" }
      for (const change of changes) {
        const ack = yield* request(route, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ policy: change.input }),
        })
        expect(ack.status).toBe(200)
        expect(yield* ack.json).toEqual({ data: change.expected })

        // No wait or polling: a successful ACK must already have committed both projection and event.
        const row = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
        if (change.expected.mode === "inherit") expect(row?.subagent_models).toBeNull()
        if (change.expected.mode === "allowlist") expect(
          Schema.decodeUnknownSync(Schema.fromJsonString(SessionSubagentModels.Policy))(row?.subagent_models),
        ).toEqual(Schema.decodeUnknownSync(SessionSubagentModels.Policy)(change.expected))
        const events = yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, id))
          .orderBy(EventTable.seq)
          .all()
        expect(events.at(-1)).toMatchObject({
          type: Event.versionedType(SessionEvent.SubagentModelsChanged.type, 1),
          data: { sessionID: id, policy: change.expected },
        })

        const policy = yield* request(route, { headers })
        expect(policy.status).toBe(200)
        expect(yield* policy.json).toEqual({ data: change.expected })
        const session = yield* request(`/api/session/${id}`, { headers })
        expect(session.status).toBe(200)
        const info = yield* session.json
        if (change.expected.mode === "inherit") expect(info).not.toHaveProperty("data.subagentModels")
        if (change.expected.mode !== "inherit") expect(info).toMatchObject({ data: { subagentModels: change.expected } })
      }

      const history = yield* request(`/api/session/${id}/history`)
      expect(history.status).toBe(200)
      const page = yield* history.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ data: Schema.Array(SessionEvent.Durable) }))),
      )
      expect(page.data.map((event) => event.durable?.seq)).toEqual([0, 1, 2])
      expect(page.data.map((event) => event.data)).toEqual(
        changes.map((change) => expect.objectContaining({ sessionID: id, policy: change.expected })),
      )
    }),
  )

  it.live("returns typed SessionNotFoundError for GET and POST", () =>
    Effect.gen(function* () {
      const id = SessionV2.ID.create()
      for (const method of ["GET", "POST"]) {
        const response = yield* request(`/api/session/${id}/subagent-models`, {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify({ policy: { mode: "inherit" } }) } : {}),
        })
        expect(response.status).toBe(404)
        expect(yield* response.json).toEqual({
          _tag: "SessionNotFoundError",
          sessionID: id,
          message: `Session not found: ${id}`,
        })
      }
    }),
  )

  it.live("maps corrupt canonical storage to typed ServiceUnavailableError", () =>
    Effect.gen(function* () {
      const id = yield* persistedSession
      const database = yield* Database.Service
      yield* database.db.update(SessionTable).set({ subagent_models: "null" }).where(eq(SessionTable.id, id)).run()
      const response = yield* request(`/api/session/${id}/subagent-models`)
      expect(response.status).toBe(503)
      expect(yield* response.json).toEqual({
        _tag: "ServiceUnavailableError",
        service: "session-subagent-models",
        message: "Session model policy storage is unavailable",
      })
      const row = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
      expect(row?.subagent_models).toBe("null")
    }),
  )
})
