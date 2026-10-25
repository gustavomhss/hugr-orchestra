import { SessionProcess } from "@orchestra/core/session-process"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { TaskBackground } from "@orchestra/core/tool/task-background"
import { describe, expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AppProcess } from "@orchestra/core/process"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionTable } from "@orchestra/core/session/sql"
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

const api = HttpApi.make("server")
  .add(makeSessionGroup(SessionLocationMiddleware))
  .middleware(Authorization)
  .middleware(SchemaErrorMiddleware)
const services = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const database = Database.layerFromPath(path.join(directory, "permission.sqlite"))
    return AppNodeBuilder.build(
      LayerNode.group([
        Database.node,
        SessionV2.node,
        SessionProjector.node,
        SessionSubagentModels.node,
        SessionProcess.node,
        MoveSession.node,
        TaskBackground.node,
        SessionExecution.node,
        LocationServiceMap.node,
        AppProcess.node,
        FSUtil.node,
      ]),
      [
        [Database.node, database],
        [EventV2.node, EventV2.layerWith().pipe(Layer.provide(database))],
        [SessionExecution.node, SessionExecutionLocal.node],
      ],
    )
  }),
)
const observedLocation = Layer.effect(SessionLocationMiddleware, Effect.gen(function* () {
  const middleware = yield* SessionLocationMiddleware
  return SessionLocationMiddleware.of((effect, options) => middleware(effect, options).pipe(
    Effect.tapCause((cause) => Effect.sync(() => console.error("permission Session Location failure", Cause.pretty(cause)))),
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
      Effect.tapCause((cause) => Effect.sync(() => console.error("permission HTTP router failure", Cause.pretty(cause)))),
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
      Effect.flatMap((body) => Effect.sync(() => console.error("permission HTTP 5xx response", {
        method: init?.method ?? "GET",
        route,
        status: response.status,
        body,
      }))),
      Effect.catchCause((cause) => Effect.logError("permission HTTP 5xx body read failed", cause)),
    )),
  )
}

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
    .values({ id, project_id: ProjectV2.ID.global, slug: id, directory, title: "Permission HTTP", version: "test" })
    .run()
  return id
})

describe("session permission rules HttpApi", () => {
  it.live("GET returns stored rules, POST commits and updates DB/event", () =>
    Effect.gen(function* () {
      const id = yield* persistedSession
      const database = yield* Database.Service
      const route = `/api/session/${id}/permission-rules`
      const initial = yield* request(route)
      expect(initial.status).toBe(200)
      expect(yield* initial.json).toEqual({ data: [] })

      const rules = [{ permission: "bash", pattern: "*", action: "allow" }]
      const ack = yield* request(route, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permission: rules }),
      })
      expect(ack.status).toBe(200)
      expect(yield* ack.json).toEqual({ data: rules })

      const row = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
      expect(JSON.stringify(row?.permission)).toBe(JSON.stringify(rules))

      const events = yield* database.db
        .select()
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, id))
        .orderBy(EventTable.seq)
        .all()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: Event.versionedType(SessionEvent.PermissionChanged.type, 1),
        data: { sessionID: id, permission: rules },
      })

      const readback = yield* request(route)
      expect(readback.status).toBe(200)
      expect(yield* readback.json).toEqual({ data: rules })
    }),
  )

  it.live("returns typed SessionNotFoundError for GET and POST", () =>
    Effect.gen(function* () {
      const id = SessionV2.ID.create()
      for (const method of ["GET", "POST"]) {
        const response = yield* request(`/api/session/${id}/permission-rules`, {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify({ permission: [] }) } : {}),
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
})
