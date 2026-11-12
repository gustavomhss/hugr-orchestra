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
import { SessionEvent } from "@orchestra/core/session/event"
import { EventV2 } from "@orchestra/core/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { DateTime } from "effect"
import { SessionExecution } from "@orchestra/core/session/execution"
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Session } from "@orchestra/schema/session"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ServerAuth } from "../src/auth"
import { SessionHandler } from "../src/handlers/session"
import { authorizationLayer } from "../src/middleware/authorization"
import { SessionLocationMiddleware, sessionLocationLayer } from "../src/middleware/session-location"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    EventV2.node,
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
  [[SessionExecution.node, Layer.succeed(SessionExecution.Service, SessionExecution.Service.of({
    active: Effect.succeed(new Set()), resume: () => Effect.void, wake: () => Effect.void,
    interrupt: () => Effect.void, exclusive: () => Effect.succeedNone, withRunner: () => Effect.die("unused"),
  }))]],
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
// A route that declares no payload never reads one, and an unread request body keeps its connection open, which holds
// the server's graceful shutdown for its full 20 s. The client sends no body to those routes, so neither does this.
const post = (path: string, body?: unknown) =>
  request(
    path,
    body === undefined
      ? { method: "POST" }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  )
it.live("busy revert and staged replacement return HTTP 409 without changing history", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    const createdResponse = yield* post("/api/session", { location: { directory: tmp.path } })
    expect(createdResponse.status).toBe(200)
    const created = (yield* HttpClientResponse.schemaBodyJson(Info)(createdResponse)).data
    const events = yield* EventV2.Service
    const boundary = SessionMessage.ID.make("msg_http_undo")
    yield* events.publish(SessionEvent.Prompted, {
      sessionID: created.id, messageID: boundary, timestamp: DateTime.makeUnsafe(1),
      prompt: { text: "preserve this" }, delivery: "steer",
    })
    yield* events.publish(SessionEvent.RevertEvent.Staged, {
      sessionID: created.id, timestamp: DateTime.makeUnsafe(2), revert: { messageID: boundary, files: [] },
    })
    for (const operation of ["stage", "clear", "commit"]) {
      const response = yield* post(`/api/session/${created.id}/revert/${operation}`,
        operation === "stage" ? { messageID: boundary, files: false } : undefined)
      expect(response.status).toBe(409)
      yield* response.text
    }
    const prompt = yield* post(`/api/session/${created.id}/prompt`, { prompt: { text: "replacement" }, resume: false })
    expect(prompt.status).toBe(409)
    yield* prompt.text
    const session = yield* SessionV2.Service
    expect((yield* session.get(created.id)).revert?.messageID).toBe(boundary)
    expect((yield* session.messages({ sessionID: created.id })).length).toBe(1)
  }),
)
