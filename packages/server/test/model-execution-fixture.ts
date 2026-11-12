export * as ModelExecutionFixture from "./model-execution-fixture"

import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ModelV2 } from "@orchestra/core/model"
import { AppProcess } from "@orchestra/core/process"
import { Prompt } from "@orchestra/core/session/prompt"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ModelGroup } from "@orchestra/protocol/groups/model"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Deferred, Effect, Layer, Option, Schema, Stream } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { realpath } from "node:fs/promises"
import { ServerAuth } from "../src/auth"
import { ModelHandler } from "../src/handlers/model"
import { LocationMiddleware, layer } from "../src/location"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

export const state = {
  ready: true,
  streams: 0,
  materializations: 0,
  tools: 0,
  provider: 0,
  wait: undefined as { entered: Deferred.Deferred<void>; interrupted: Deferred.Deferred<void> } | undefined,
}
const hosts = Layer.succeed(
  ExecutionHost.Service,
  ExecutionHost.of([
    {
      id: "claude-code",
      stateKey: "wireFixture",
      // This fixture declares a registered host's answer. Actual Claude eligibility was verified in its own package.
      describeModel: () =>
        Effect.suspend(() => {
          const wait = state.wait
          if (wait)
            return Deferred.succeed(wait.entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(wait.interrupted, undefined)),
            )
          return Effect.succeed(
            state.ready
              ? { status: "ready" as const }
              : { status: "unavailable" as const, reason: "host-unavailable" as const },
          )
        }),
      stream: () =>
        Stream.unwrap(
          Effect.sync(() => {
            state.streams++
            return Stream.die("No execution during eligibility")
          }),
        ),
    },
  ]),
)
const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    LocationServiceMap.node,
    AppProcess.node,
    FSUtil.node,
    SessionV2.node,
    SessionExecution.node,
  ]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [ExecutionHost.node, hosts],
    [SessionExecution.node, SessionExecution.noopLayer],
  ],
)
const routes = HttpApiBuilder.layer(
  HttpApi.make("server")
    .add(ModelGroup.middleware(LocationMiddleware))
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware),
).pipe(
  Layer.provide(ModelHandler),
  Layer.provide(layer),
  Layer.provide(schemaErrorLayer),
  Layer.provide(authorizationLayer),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
)
export const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  ),
)
export const ref = (providerID = "openai", id = "wire-model", variant?: string) =>
  ModelV2.Ref.make({
    providerID: ProviderV2.ID.make(providerID),
    id: ModelV2.ID.make(id),
    ...(variant === undefined ? {} : { variant: ModelV2.VariantID.make(variant) }),
  })
export const json = (response: Response): Effect.Effect<unknown> => Effect.promise(() => response.json())
export const setup = Effect.gen(function* () {
  state.ready = true
  state.streams = 0
  state.materializations = 0
  state.tools = 0
  state.provider = 0
  state.wait = undefined
  const tmp = yield* Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
  const directory = AbsolutePath.make(yield* Effect.promise(() => realpath(tmp.path)))
  const provider = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch() {
          state.provider++
          return new Response("No provider work during eligibility", { status: 500 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const location = Location.Ref.make({ directory })
  const locations = yield* LocationServiceMap.Service
  const context = yield* locations.contextEffect(location)
  const agents = Context.get(context, AgentV2.Service)
  yield* agents.transform((draft) => {
    draft.update(AgentV2.defaultID, (agent) => {
      agent.engine = "orchestra"
      agent.mode = "primary"
    })
    draft.update(AgentV2.ID.make("host-seat"), (agent) => {
      agent.engine = "claude-code"
      agent.mode = "all"
    })
  })
  const integrations = Context.get(context, Integration.Service)
  yield* integrations.transform((draft) => {
    draft.update(Integration.ID.make("openai"), () => {})
    draft.update(Integration.ID.make("anthropic"), () => {})
    draft.update(Integration.ID.make("google"), () => {})
  })
  const catalog = Context.get(context, Catalog.Service)
  yield* catalog.transform((draft) => {
    for (const id of ["openai", "anthropic", "google"]) {
      const providerID = ProviderV2.ID.make(id)
      draft.provider.update(providerID, (item) => {
        item.api = {
          type: "aisdk",
          package: `@ai-sdk/${id}`,
          url: provider.url.origin,
          settings: id === "anthropic" ? {} : { apiKey: "FICTITIOUS_WIRE_KEY" },
        }
      })
      draft.model.update(providerID, ModelV2.ID.make("wire-model"), (model) => {
        model.enabled = true
        model.name = id
        model.variants = [{ id: ModelV2.VariantID.make("high"), headers: {}, body: {} }]
      })
    }
    draft.model.default.set(ProviderV2.ID.openai, ModelV2.ID.make("wire-model"))
  })
  const tools = Context.get(context, ToolRegistry.Service)
  yield* tools.register({
    wire_probe: Tool.make({
      get description() {
        state.materializations++
        return "Wire materialization probe"
      },
      input: Schema.Struct({}),
      output: Schema.Struct({}),
      toModelOutput: () => [],
      execute: () =>
        Effect.sync(() => {
          state.tools++
          return {}
        }),
    }),
  })
  const sessions = yield* SessionV2.Service
  const session = yield* sessions.create({ location, agent: AgentV2.defaultID, model: ref() })
  yield* sessions.prompt({
    sessionID: session.id,
    prompt: Prompt.make({ text: "Wire admitted fixture" }),
    resume: false,
  })
  const database = yield* Database.Service
  const snapshot = () =>
    Effect.gen(function* () {
      return {
        sessions: yield* database.db.select().from(SessionTable).all().pipe(Effect.orDie),
        inputs: yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie),
      }
    })
  const server = yield* HttpServer.HttpServer
  if (server.address._tag !== "TcpAddress") return yield* Effect.die("Expected a real TCP server")
  const baseUrl = `http://127.0.0.1:${server.address.port}`
  const request = (pathname: string, payload?: unknown, at = directory) =>
    Effect.promise(() => {
      const url = new URL(pathname, baseUrl)
      url.searchParams.set("location[directory]", at)
      return fetch(
        url,
        payload === undefined
          ? undefined
          : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
      )
    })
  return { context, directory, location, session, sessions, database, agents, catalog, baseUrl, request, snapshot }
})
