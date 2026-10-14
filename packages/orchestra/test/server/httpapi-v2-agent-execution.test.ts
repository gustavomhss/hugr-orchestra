import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { AgentV2 } from "@orchestra/core/agent"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { AgentGroup } from "@orchestra/protocol/groups/agent"
import { LocationQuery } from "@orchestra/protocol/groups/location"
import { AgentExecution } from "@orchestra/server/agent-execution"
import { ServerAuth } from "@orchestra/server/auth"
import { AgentHandler } from "@orchestra/server/handlers/agent"
import { layer, LocationMiddleware } from "@orchestra/server/location"
import { authorizationLayer } from "@orchestra/server/middleware/authorization"
import { schemaErrorLayer } from "@orchestra/server/middleware/schema-error"
import { Agent } from "../../src/agent/agent"
import { NativeSessionFixture } from "../fixture/native-session"
import { InstanceStore } from "../../src/project/instance-store"
import { HostAgentExecution } from "../../src/server/routes/instance/httpapi/handlers/agent-execution"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Exercise the production handler and middleware with real registries and persisted Instance placement.
// The lead owns application assembly; this narrow API composes the new adapter without editing server.ts.
const api = HttpApi.make("server").add(AgentGroup.middleware(LocationMiddleware))
const services = NativeSessionFixture.legacy(
  LayerNode.group([Agent.node, InstanceStore.node, FSUtil.node, LocationServiceMap.node]),
)
const it = testEffect(Layer.mergeAll(services, NodeHttpServer.layerTest, NodeServices.layer))

function serve(host: boolean) {
  return HttpApiBuilder.layer(api).pipe(
    Layer.provide(AgentHandler),
    Layer.provide(host ? HostAgentExecution.layer : Layer.empty),
    Layer.provide([layer, authorizationLayer, schemaErrorLayer]),
    Layer.provide(ServerAuth.Config.layer),
    HttpRouter.serve,
    Layer.build,
  )
}

function list(directory: string) {
  return Effect.gen(function* () {
    const query = Schema.encodeSync(LocationQuery)({ location: { directory } })
    if (!query.location?.directory) return yield* Effect.die(new Error("Agent list query requires an explicit directory"))
    const result = yield* HttpClientRequest.get("/api/agent").pipe(
      HttpClientRequest.setUrlParam("location[directory]", query.location.directory),
      HttpClient.execute,
    )
    expect(result.status).toBe(200)
    // The decoder consumes the JSON envelope, not the Effect that reads it.
    return yield* result.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Location.response(Schema.Array(AgentV2.Info)))))
  })
}

describe("V2 agent execution annotation", () => {
  it.live("standalone Server keeps the identity default and omits engine on the wire", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true, config: { agent: { maestro: { engine: "claude-code" } } } })
      const locations = yield* LocationServiceMap.Service
      const context = yield* locations.contextEffect(Location.Ref.make({
        directory: AbsolutePath.make(directory),
        workspaceID: undefined,
      }))
      yield* Effect.gen(function* () {
        const plugins = yield* PluginV2.Service
        yield* plugins.wait(PluginV2.ID.make("config-agent"))
        const agents = yield* AgentV2.Service
        const input = yield* agents.all()
        const annotate = yield* AgentExecution.Annotate
        expect(yield* annotate(input)).toBe(input)
        expect(Schema.encodeSync(AgentV2.Info)(AgentV2.Info.empty(AgentV2.defaultID))).not.toHaveProperty("engine")
        expect(() => Schema.decodeUnknownSync(AgentV2.Info)({ ...input[0], engine: "other" })).toThrow()
      }).pipe(Effect.provide(context))
      yield* serve(false)
      const result = yield* list(directory)
      expect(result.data.find((agent) => agent.id === "maestro")).toBeDefined()
      expect(result.data.every((agent) => agent.engine === undefined)).toBe(true)
    }),
  )

  it.live("annotates exact stable ids and preserves all fields without changing Core selection", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({
        git: true,
        config: {
          default_agent: "reviewer",
          agent: {
            maestro: { engine: "orchestra" },
            backend: { engine: "claude-code", name: "Review worker" },
            reviewer: { engine: "claude-code", mode: "primary", name: "Review owner" },
          },
        },
      })
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory })
      const registry = yield* Agent.Service
      const native = yield* instances.provide({ directory }, registry.list())
      expect(native.find((agent) => agent.id === "backend")?.name).toBe("Review worker")
      expect(native.find((agent) => agent.id === "reviewer")?.name).toBe("Review owner")
      const locations = yield* LocationServiceMap.Service
      // Match HTTP/bootstrap's explicit undefined workspace key and retain the lease in the outer test scope.
      // Providing the context keeps synthetic transforms alive through the HTTP request and selection recheck.
      const context = yield* locations.contextEffect(Location.Ref.make({
        directory: AbsolutePath.make(directory),
        workspaceID: undefined,
      }))
      const before = yield* Effect.gen(function* () {
        const plugins = yield* PluginV2.Service
        yield* plugins.wait(PluginV2.ID.make("config-agent"))
        const agents = yield* AgentV2.Service
        yield* agents.transform((draft) => {
          draft.update(AgentV2.defaultID, (agent) => {
            agent.request = { headers: { "x-setting": "retained" }, body: { engine: "claude-code", temperature: 0.4 } }
            agent.system = "Keep the selected instructions."
            agent.description = "Keep the description."
            agent.model = {
              id: ModelV2.ID.make("selected"),
              providerID: ProviderV2.ID.make("example"),
              variant: ModelV2.VariantID.make("careful"),
            }
            agent.color = "#123456"
            agent.steps = 7
            agent.permissions = [{ action: "edit", resource: "*", effect: "ask" }]
          })
          draft.update(AgentV2.ID.make("backend"), (agent) => {
            agent.hidden = true
          })
          draft.update(AgentV2.ID.make("Review worker"), () => {})
          draft.update(AgentV2.ID.make("unresolved"), (agent) => {
            agent.engine = "claude-code"
          })
        })
        return { agents: yield* agents.all(), selection: yield* agents.select() }
      }).pipe(Effect.provide(context))
      yield* serve(true)
      const result = yield* list(directory)
      expect(result.location.directory).toBe(AbsolutePath.make(directory))
      expect(result.location.project.id).toBe(instance.project.id)
      expect(result.data.map((agent) => agent.id)).toEqual(before.agents.map((agent) => agent.id))
      expect(result.data.find((agent) => agent.id === "maestro")?.engine).toBe("orchestra")
      expect(result.data.find((agent) => agent.id === "backend")?.engine).toBe("claude-code")
      expect(result.data.find((agent) => agent.id === "reviewer")?.engine).toBe("claude-code")
      expect(result.data.find((agent) => agent.id === "general")?.engine).toBe("orchestra")
      expect(result.data.find((agent) => agent.id === "Review worker")?.engine).toBeUndefined()
      expect(result.data.find((agent) => agent.id === "unresolved")?.engine).toBeUndefined()
      before.agents.forEach((agent, index) => {
        expect(result.data[index]).toEqual({ ...agent, engine: result.data[index].engine })
        expect(result.data[index].request).toEqual(agent.request)
      })
      const after = yield* AgentV2.Service.use((agents) => agents.select()).pipe(
        Effect.provide(context),
      )
      expect(after).toEqual(before.selection)
      expect(after.id).toBe(AgentV2.ID.make("reviewer"))
    }),
  )

  it.live("isolates concurrent persisted Locations and defaults only a resolved legacy omission", () =>
    Effect.gen(function* () {
      const ordinary = yield* tmpdirScoped({ git: true, config: { agent: { backend: { engine: "claude-code" } } } })
      const hosted = yield* tmpdirScoped({
        git: true,
        config: { agent: { maestro: { engine: "claude-code" }, backend: { engine: "orchestra" } } },
      })
      const instances = yield* InstanceStore.Service
      const placements = yield* Effect.forEach([ordinary, hosted], (directory) => instances.load({ directory }))
      expect(placements[0].project.id).not.toBe(placements[1].project.id)
      yield* serve(true)
      const results = yield* Effect.forEach([ordinary, hosted, ordinary, hosted], list, { concurrency: "unbounded" })
      results.forEach((result, index) => {
        expect(result.location.directory).toBe(AbsolutePath.make(index % 2 === 0 ? ordinary : hosted))
        expect(result.location.project.id).toBe(placements[index % 2].project.id)
        expect(result.data.find((agent) => agent.id === "maestro")?.engine).toBe(
          index % 2 === 0 ? "orchestra" : "claude-code",
        )
        expect(result.data.find((agent) => agent.id === "backend")?.engine).toBe(
          index % 2 === 0 ? "claude-code" : "orchestra",
        )
      })
    }),
  )
})
