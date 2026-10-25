import { SessionProcess } from "@orchestra/core/session-process"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionV2 } from "@orchestra/core/session"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { makeSessionGroup } from "../../protocol/src/groups/session"
import { SchemaErrorMiddleware } from "../../protocol/src/middleware/schema-error"
import { Session } from "@orchestra/schema/session"
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect"
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
  LayerNode.group([
    Database.node,
    LocationServiceMap.node,
    AppProcess.node,
    FSUtil.node,
    SessionExecution.node,
    SessionV2.node,
    SessionSubagentModels.node,
    SessionProcess.node,
    MoveSession.node,
  ]),
  [[SessionExecution.node, SessionExecutionLocal.node]],
)
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
const post = (path: string, body: unknown) =>
  HttpClientRequest.fromWeb(
    new Request(new URL(path, "http://localhost"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  ).pipe(HttpClientRequest.setUrl(path), HttpClient.execute)

it.live("real Session HTTP middleware opens a Location containing native Task", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const tmp = yield* Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
  const process = yield* AppProcess.Service
  yield* process.run(ChildProcess.make("git", ["init"], { cwd: tmp.path })).pipe(Effect.flatMap(AppProcess.requireSuccess))
  const createdResponse = yield* post("/api/session", { location: { directory: tmp.path } })
  expect({ status: createdResponse.status, _body: yield* createdResponse.text }).toMatchObject({ status: 200 })
  const created = (yield* HttpClientResponse.schemaBodyJson(Info)(createdResponse)).data
  const response = yield* post(`/api/session/${created.id}/agent`, { agent: "general" })
  const locations = yield* LocationServiceMap.Service
  const opened = yield* Location.Service.pipe(
    Effect.provide(locations.get(created.location)),
    Effect.exit,
  )
  if (Exit.isFailure(opened)) console.error("Location acquisition cause:", Cause.pretty(opened.cause))
  expect({ status: response.status, _body: yield* response.text }).toEqual({ status: 204, _body: "" })
  const definitions = yield* ToolRegistry.Service.use((registry) => registry.materialize()).pipe(
    Effect.provide(locations.get(created.location)),
  )
  expect(definitions.definitions.map((tool) => tool.name)).toContain("task")
}), 30_000)
