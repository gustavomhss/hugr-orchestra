import { SessionProcess } from "@orchestra/core/session-process"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { TaskBackground } from "@orchestra/core/tool/task-background"
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
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Session } from "@orchestra/schema/session"
import { Effect, Fiber, Layer, Option, Schedule, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { ServerAuth } from "@orchestra/server/auth"
import { SessionHandler } from "@orchestra/server/handlers/session"
import { authorizationLayer } from "@orchestra/server/middleware/authorization"
import { SessionLocationMiddleware, sessionLocationLayer } from "@orchestra/server/middleware/session-location"
import { schemaErrorLayer } from "@orchestra/server/middleware/schema-error"

const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    LocationServiceMap.node,
    AppProcess.node,
    FSUtil.node,
    SessionV2.node,
    SessionExecution.node,
    SessionSubagentModels.node,
    SessionProcess.node,
    MoveSession.node,
    TaskBackground.node,
  ]),
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
const request = (path: string, init?: RequestInit) => {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}
const post = (path: string, body?: unknown) =>
  request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })
const Count = Schema.Struct({ data: Schema.Number })

it.live("real HTTP background releases the foreground subagent the Session waits on", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const created = yield* post("/api/session", { location: { directory: tmp.path } }).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Info)),
    )
    const background = yield* TaskBackground.Service
    const waiting = yield* background.requested(created.data.id).pipe(Effect.forkChild)

    // The waiter registers on its own fiber, so retry until the route reports it released one.
    const released = yield* post(`/api/session/${created.data.id}/background`).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Count)),
      Effect.flatMap((body) => (body.data === 1 ? Effect.succeed(body) : Effect.fail(new Error("not waiting yet")))),
      Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 100 }),
    )
    expect(released.data).toBe(1)
    yield* Fiber.join(waiting)
    const again = yield* post(`/api/session/${created.data.id}/background`).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Count)),
    )
    expect(again.data).toBe(0)
    const missing = yield* post("/api/session/ses_missing/background")
    expect(missing.status).toBe(404)
  }),
)
