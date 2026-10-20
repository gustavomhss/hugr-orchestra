import { SessionProcess } from "@orchestra/core/session-process"
import { expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionV2 } from "@orchestra/core/session"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionExecution } from "@orchestra/core/session/execution"
import { makeSessionGroup, SessionsCursor } from "../../protocol/src/groups/session"
import { SchemaErrorMiddleware } from "../../protocol/src/middleware/schema-error"
import { Session } from "@orchestra/schema/session"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ChildProcess } from "effect/unstable/process"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { ServerAuth } from "../../server/src/auth"
import { SessionHandler } from "../../server/src/handlers/session"
import { authorizationLayer } from "../../server/src/middleware/authorization"
import { SessionLocationMiddleware, sessionLocationLayer } from "../../server/src/middleware/session-location"
import { schemaErrorLayer } from "../../server/src/middleware/schema-error"

const services = AppNodeBuilder.build(
  LayerNode.group([Database.node, LocationServiceMap.node, AppProcess.node, FSUtil.node, SessionV2.node, SessionExecution.node, SessionSubagentModels.node, SessionProcess.node]),
  [[SessionExecution.node, SessionExecution.noopLayer]],
)
// Serve the actual Session group, handler and middleware over TCP; other API groups are outside this fixture.
const routes = HttpApiBuilder.layer(
  HttpApi.make("server").add(makeSessionGroup(SessionLocationMiddleware)).middleware(SchemaErrorMiddleware),
).pipe(
  Layer.provide(SessionHandler),
  Layer.provide(sessionLocationLayer),
  Layer.provide(schemaErrorLayer),
  Layer.provide(authorizationLayer),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
)
const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  ),
)
const Info = Schema.Struct({ data: Session.Info })
const Page = Schema.Struct({
  data: Schema.Array(Session.Info),
  cursor: Schema.Struct({ previous: Schema.optional(Schema.String), next: Schema.optional(Schema.String) }),
})
const request = (path: string, init?: RequestInit) => {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}
const post = (path: string, body: unknown) =>
  request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

it.live(
  "real HTTP archive CRUD preserves direct reads and durable history; missing and malformed writes fail",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const process = yield* AppProcess.Service
      yield* process
        .run(ChildProcess.make("git", ["init"], { cwd: tmp.path }))
        .pipe(Effect.flatMap(AppProcess.requireSuccess))
      const createdResponse = yield* post("/api/session", { location: { directory: tmp.path } })
      expect(createdResponse.status).toBe(200)
      const created = (yield* HttpClientResponse.schemaBodyJson(Info)(createdResponse)).data
      const archive = `/api/session/${created.id}/archive`
      const initial = yield* request(`/api/session?directory=${encodeURIComponent(tmp.path)}`)
      expect((yield* HttpClientResponse.schemaBodyJson(Page)(initial)).data.map((item) => item.id)).toEqual([
        created.id,
      ])
      expect((yield* post(archive, { archived: true })).status).toBe(204)
      expect((yield* post(archive, { archived: true })).status).toBe(204)
      const direct = yield* request(`/api/session/${created.id}`)
      expect(direct.status).toBe(200)
      expect((yield* HttpClientResponse.schemaBodyJson(Info)(direct)).data.time.archived).toBeDefined()
      const hidden = yield* request(`/api/session?directory=${encodeURIComponent(tmp.path)}`)
      expect((yield* HttpClientResponse.schemaBodyJson(Page)(hidden)).data).toEqual([])
      const included = yield* request(`/api/session?directory=${encodeURIComponent(tmp.path)}&includeArchived=true`)
      expect((yield* HttpClientResponse.schemaBodyJson(Page)(included)).data.map((item) => item.id)).toEqual([
        created.id,
      ])
      expect((yield* post(archive, { archived: false })).status).toBe(204)
      expect((yield* post(archive, { archived: false })).status).toBe(204)
      const restored = yield* request(`/api/session/${created.id}`)
      expect((yield* HttpClientResponse.schemaBodyJson(Info)(restored)).data.time.archived).toBeUndefined()
      const history = yield* request(`/api/session/${created.id}/history`)
      expect(yield* history.json).toMatchObject({
        data: [
          { type: "session.next.archive.changed", data: { archived: expect.any(Number) } },
          { type: "session.next.archive.changed", data: { archived: null } },
        ],
        hasMore: false,
      })
      const missing = yield* post("/api/session/ses_archive_missing/archive", { archived: true })
      expect(missing.status).toBe(404)
      expect(yield* missing.json).toEqual({
        _tag: "SessionNotFoundError",
        sessionID: "ses_archive_missing",
        message: "Session not found: ses_archive_missing",
      })
      yield* Effect.forEach([{}, { archived: "true" }, { archived: null }], (body) =>
        Effect.gen(function* () {
          const invalid = yield* post(archive, body)
          expect(invalid.status).toBe(400)
          expect(yield* invalid.json).toMatchObject({ _tag: "InvalidRequestError", kind: "Payload" })
        }),
      )
      const badFlag = yield* request("/api/session?includeArchived=garbage")
      expect(badFlag.status).toBe(400)
    }),
  30_000,
)

it.live(
  "real HTTP cursors retain archive visibility and scope in both directions",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const process = yield* AppProcess.Service
      yield* process
        .run(ChildProcess.make("git", ["init"], { cwd: tmp.path }))
        .pipe(Effect.flatMap(AppProcess.requireSuccess))
      const created = yield* Effect.forEach([0, 1, 2], (index) =>
        Effect.gen(function* () {
          const response = yield* post("/api/session", {
            id: `ses_http_archive_${index}`,
            location: { directory: tmp.path },
          })
          expect(response.status).toBe(200)
          return (yield* HttpClientResponse.schemaBodyJson(Info)(response)).data
        }),
      )
      expect((yield* post(`/api/session/${created[1].id}/archive`, { archived: true })).status).toBe(204)
      yield* Effect.forEach(["asc", "desc"] as const, (order) =>
        Effect.gen(function* () {
          yield* Effect.forEach([true, false], (includeArchived) =>
            Effect.gen(function* () {
              const expected = (includeArchived ? created : [created[0], created[2]]).map((item) => item.id)
              const ids = order === "asc" ? expected : expected.toReversed()
              const response = yield* request(
                `/api/session?directory=${encodeURIComponent(tmp.path)}&limit=1&order=${order}&includeArchived=${includeArchived}`,
              )
              const first = yield* HttpClientResponse.schemaBodyJson(Page)(response)
              expect(first.data.map((item) => item.id)).toEqual(ids.slice(0, 1))
              if (!first.cursor.next) return yield* Effect.die("Next cursor missing")
              expect(yield* SessionsCursor.parse(first.cursor.next)).toMatchObject({
                includeArchived,
                directory: tmp.path,
                order,
                anchor: { direction: "next" },
              })
              const nextResponse = yield* request(
                `/api/session?cursor=${first.cursor.next}&limit=1&includeArchived=${!includeArchived}`,
              )
              const next = yield* HttpClientResponse.schemaBodyJson(Page)(nextResponse)
              expect(next.data.map((item) => item.id)).toEqual(ids.slice(1, 2))
              if (!next.cursor.previous) return yield* Effect.die("Previous cursor missing")
              const previousResponse = yield* request(`/api/session?cursor=${next.cursor.previous}&limit=1`)
              expect(
                (yield* HttpClientResponse.schemaBodyJson(Page)(previousResponse)).data.map((item) => item.id),
              ).toEqual(ids.slice(0, 1))
            }),
          )
        }),
      )
    }),
  30_000,
)
