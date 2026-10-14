import { expect } from "bun:test"
import { Actions } from "@orchestra/core/actions"
import { ActionsContract } from "@orchestra/core/actions/contract"
import { ActionsOperations } from "@orchestra/core/actions/operations"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { buildLocationServiceMap, locationServices } from "@orchestra/core/location-services"
import { Policy } from "@orchestra/core/policy"
import { AppProcess } from "@orchestra/core/process"
import { Relay } from "@orchestra/core/relay"
import { RelayHookRecovery } from "@orchestra/core/relay-hook-recovery"
import { ActionsApiError } from "@orchestra/protocol/groups/actions-common"
import { ActionsBindingGroup } from "@orchestra/protocol/groups/actions-binding"
import { ActionsOperationGroup } from "@orchestra/protocol/groups/actions-operation"
import { ActionsWorkflowGroup } from "@orchestra/protocol/groups/actions-workflow"
import { ActionsRunGroup } from "@orchestra/protocol/groups/actions-run"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import type { Binding, ErrorKind, OperationAcknowledgement, OperationID } from "@orchestra/schema/actions"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import path from "node:path"
import { Orchestra } from "../../client/src/generated/index"
import { fixture } from "../../core/test/actions/assembly-fixture"
import { ServerAuth } from "../src/auth"
import { ActionsBindingHandler } from "../src/handlers/actions-binding"
import { ActionsOperationHandler } from "../src/handlers/actions-operation"
import { ActionsWorkflowHandler } from "../src/handlers/actions-workflow"
import { ActionsRunHandler } from "../src/handlers/actions-run"
import { layer, LocationMiddleware } from "../src/location"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

export { it, github, gitlab, githubPath, runID, jobID } from "../../core/test/actions/assembly-fixture"
export const workspaceID = "wrk_http_fixture"

const focusedApi = HttpApi.make("server")
  .add(
    ActionsBindingGroup.middleware(LocationMiddleware),
    ActionsOperationGroup.middleware(LocationMiddleware),
    ActionsWorkflowGroup.middleware(LocationMiddleware),
    ActionsRunGroup.middleware(LocationMiddleware),
  )
  .middleware(Authorization)
  .middleware(SchemaErrorMiddleware)
const kept = new Set([
  Location.node.name,
  Actions.node.name,
  Config.node.name,
  Policy.node.name,
  Relay.node.name,
  RelayHookRecovery.node.name,
])
// Same production map/hoist/tap as the focused recovery tests; unrelated model/tool nodes are omitted.
const omitted = locationServices.dependencies
  .filter((node) => !kept.has(node.name))
  .map((node): LayerNode.Replacement => [node, Layer.empty])

export const httpFixture = Effect.fnUntraced(function* () {
  const core = yield* fixture()
  const clone = yield* core.clone()
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const global = Global.make({
    home: core.root,
    data: core.stateDirectory,
    cache: path.join(core.root, "cache"),
    config: path.join(core.root, "config"),
    state: path.join(core.root, "state"),
    tmp: path.join(core.root, "tmp"),
    bin: path.join(core.root, "bin"),
    log: path.join(core.root, "log"),
    repos: path.join(core.root, "repos"),
  })
  yield* Effect.forEach(
    [global.cache, global.config, global.state, global.tmp, global.bin, global.log, global.repos],
    (directory) => fs.makeDirectory(directory, { recursive: true }),
  )
  const calls: { binding: Binding; input: ActionsContract.Request }[] = []
  const failure: { error?: Actions.ActionsError } = {}
  const transport: ActionsContract.Transport = {
    ...core.transport,
    request: (binding, input) =>
      Effect.suspend(() => {
        calls.push({ binding: structuredClone(binding), input: structuredClone(input) })
        return failure.error ? Effect.fail(failure.error) : core.transport.request(binding, input)
      }),
  }
  const injected = makeLocationNode({
    service: Actions.Service,
    deps: [Location.node, Global.node, Database.node, FSUtil.node, AppProcess.node],
    layer: Layer.effect(
      Actions.Service,
      Effect.gen(function* () {
        const location = yield* Location.Service
        const global = yield* Global.Service
        return yield* Actions.make({
          directory: location.directory,
          workspaceID: location.workspaceID,
          projectID: location.project.id,
          stateDirectory: global.data,
          transport,
        })
      }),
    ),
  })
  const locations = buildLocationServiceMap([
    ...omitted,
    [Actions.node, injected],
    [Database.node, Layer.succeed(Database.Service, core.database)],
    [Global.node, Layer.succeed(Global.Service, global)],
    [FSUtil.node, Layer.succeed(FSUtil.Service, fs)],
    [AppProcess.node, Layer.succeed(AppProcess.Service, proc)],
  ])
  const map = Context.get(yield* Layer.build(locations), LocationServiceMap.Service)
  yield* Layer.build(
    map.get(
      Schema.decodeUnknownSync(Location.Ref)({
        directory: core.directory,
        workspaceID,
      }),
    ),
  )
  const routes = HttpApiBuilder.layer(focusedApi, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(
      Layer.mergeAll(ActionsBindingHandler, ActionsOperationHandler, ActionsWorkflowHandler, ActionsRunHandler),
    ),
    Layer.provide(layer),
    Layer.provide(Layer.succeed(LocationServiceMap.Service, map)),
    Layer.provide(authorizationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(
      ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("http-fixture-secret") }),
    ),
    Layer.provide(HttpServer.layerServices),
  )
  const web = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  )
  const requests: { method: string; url: URL; headers: Headers }[] = []
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
          requests.push({ method: request.method, url: new URL(request.url), headers: request.headers })
          return web.handler(request)
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const responses: { status: number; headers: Headers }[] = []
  const trackedFetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      fetch(input, init).then((response) => {
        responses.push({ status: response.status, headers: response.headers })
        return response
      }),
    { preconnect: fetch.preconnect },
  )
  const headers = {
    ...ServerAuth.headers({ username: "orchestra", password: "http-fixture-secret" }),
    "x-orchestra-directory": encodeURIComponent(core.directory),
    "x-orchestra-workspace": workspaceID,
    "x-configured": "kept",
  }
  const connect = (override: HeadersInit = headers) =>
    Orchestra.make({ baseUrl: server.url.href, fetch: trackedFetch, headers: override })
  const raw = (pathname: string, input: RequestInit = {}) => {
    const merged = new Headers(headers)
    new Headers(input.headers).forEach((value, key) => merged.set(key, value))
    return trackedFetch(new URL(pathname, server.url), { ...input, headers: merged })
  }
  const execute = (
    location: Location.Info,
    binding: Binding,
    id: OperationID,
    acknowledgement: OperationAcknowledgement,
  ) =>
    ActionsOperations.make({
      directory: location.directory,
      workspaceID: location.workspaceID,
      projectID: location.project.id,
    }).pipe(
      Effect.provideService(Database.Service, core.database),
      Effect.flatMap((operations) =>
        operations.execute(binding, { id, input: {} }, () => Effect.succeed(acknowledgement)),
      ),
      Effect.scoped,
    )
  return {
    core,
    clone,
    global,
    calls,
    failure,
    server,
    requests,
    responses,
    headers,
    connect,
    client: connect(),
    raw,
    execute,
  }
})

export async function actionError(promise: Promise<unknown>, kind: ErrorKind) {
  const error: unknown = await promise.then(
    () => {
      throw new Error(`Expected HTTP Actions error: ${kind}`)
    },
    (error: unknown) => error,
  )
  expect(error).not.toBeInstanceOf(Error)
  const decoded = Schema.decodeUnknownSync(ActionsApiError, { onExcessProperty: "error" })(error)
  expect(decoded.kind).toBe(kind)
  expect(error).toEqual(Schema.encodeSync(ActionsApiError)(decoded))
  expect(error).not.toHaveProperty("data")
  return decoded
}
