import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { buildLocationServiceMap, type LocationServices, type LocationError } from "@orchestra/core/location-services"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionSchema } from "@orchestra/core/session/schema"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Context, Effect, Fiber, Layer, RcMap, Schema, Scope } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Agent } from "../../src/agent/agent"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceStore } from "../../src/project/instance-store"
import { AppNodeBuilderV1 } from "../../src/effect/app-node-builder-v1"
import { ArsenalBindings } from "../../src/maestro/arsenal-bindings"
import { Process } from "../../src/util/process"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

// CI runs many files in one process. Each production-root story gets its own
// process so earlier AppRuntime calls cannot hide a cold composition failure.
function cold<A, E>(name: string, body: () => Effect.Effect<A, E, Scope.Scope>) {
  it.live(
    name,
    () => {
      if (process.env.ORCHESTRA_RUNTIME_GLOBALS_CHILD === name) return body()
      return Effect.gen(function* () {
        const addon = process.env.HUGR_OMNI_ADDON
        const supervisor = process.env.HUGR_OMNI_SUPERVISOR
        if (!addon || !supervisor)
          return yield* Effect.die("Cold runtime proof requires the owner/CI native addon and supervisor pair")
        const tmp = yield* Effect.acquireRelease(
          Effect.promise(() => tmpdir()),
          (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
        )
        // Omni strips its own variables from child environments; Bun loads this
        // explicit producer pair before the child's test preloads import services.
        const env = `${tmp.path}/probe.env`
        yield* Effect.promise(() =>
          Bun.write(
            env,
            [
              `HUGR_OMNI_ADDON=${JSON.stringify(addon)}`,
              `HUGR_OMNI_SUPERVISOR=${JSON.stringify(supervisor)}`,
              `ORCHESTRA_RUNTIME_GLOBALS_CHILD=${JSON.stringify(name)}`,
            ].join("\n"),
          ),
        )
        const result = yield* Effect.promise(() =>
          Process.run([process.execPath, `--env-file=${env}`, "test", import.meta.path, "--test-name-pattern", name], {
            nothrow: true,
            deadline: 45_000,
          }),
        )
        const output = result.stdout.toString() + result.stderr.toString()
        expect(result.code, output).toBe(0)
        expect(output).toContain(`(pass) ${name}`)
        expect(output).toContain("1 pass")
        expect(output).toContain("0 fail")
      })
    },
    50_000,
  )
}

cold("cold AppRuntime bootstrap opens native agents and Task registry", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir({ git: true, config: { snapshot: false } })),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const { AppRuntime } = yield* Effect.promise(() => import("../../src/effect/app-runtime"))
    yield* Effect.promise(() =>
      AppRuntime.runPromise(
        Effect.gen(function* () {
          const locations = yield* LocationServiceMap.Service
          const store = yield* InstanceStore.Service
          const agents = yield* Agent.Service
          const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
          expect(Array.from(yield* RcMap.keys(locations.rcMap))).toEqual([])
          yield* Effect.addFinalizer(() =>
            store.disposeDirectory(tmp.path).pipe(Effect.andThen(locations.invalidate(ref))),
          )
          const instance = yield* store.load({ directory: tmp.path })
          const sessions = yield* SessionV2.Service
          const execution = yield* SessionExecution.Service
          expect(sessions.active).toBe(execution.active)
          expect((yield* agents.list().pipe(Effect.provideService(InstanceRef, instance))).length).toBeGreaterThan(0)
          const opened = yield* locations.contextEffect(ref)
          const nativeAgents = Context.get(opened, AgentV2.Service)
          const tools = Context.get(opened, ToolRegistry.Service)
          expect((yield* nativeAgents.all()).map((agent) => agent.id)).toContain(AgentV2.defaultID)
          expect((yield* tools.materialize()).definitions.map((tool) => tool.name)).toContain("task")
          yield* Effect.gen(function* () {
            const { ToolRegistry } = yield* Effect.promise(() => import("../../src/tool/registry"))
            const { Session } = yield* Effect.promise(() => import("../../src/session/session"))
            const { MessageID } = yield* Effect.promise(() => import("../../src/session/schema"))
            const registry = yield* ToolRegistry.Service
            const legacySessions = yield* Session.Service
            const chat = yield* legacySessions.create({ title: "Cold continuity diagnostic" })
            const compact = (yield* registry.all()).find((tool) => tool.id === "context_compact")
            if (!compact) return yield* Effect.die("Cold root did not export context_compact")
            const result = yield* compact.execute(
              {},
              {
                sessionID: chat.id,
                messageID: MessageID.ascending(),
                callID: "cold-compact",
                agent: "maestro",
                abort: AbortSignal.any([]),
                messages: [],
                metadata: () => Effect.void,
                ask: () => Effect.void,
              },
            )
            expect(result.title).toBe("Context compaction")
            expect(result.metadata.outcome).toBe("fits")
          }).pipe(Effect.provideService(InstanceRef, instance))
        }).pipe(Effect.scoped),
      ),
    )
  }),
)

cold("cold public HTTP root serves native metadata and Session settings", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir({ git: true, config: { snapshot: false } })),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const { HttpApiApp } = yield* Effect.promise(() => import("../../src/server/routes/instance/httpapi/server"))
    // A separate memo map prevents AppRuntime or earlier HTTP tests from warming this root.
    const web = HttpRouter.toWebHandler(HttpApiApp.createRoutes(), {
      disableLogger: true,
      memoMap: Layer.makeMemoMapUnsafe(),
    })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const request = (route: string, body?: unknown) =>
      Effect.promise(() =>
        web.handler(
          new Request(`http://localhost${route}`, {
            method: body === undefined ? "GET" : "POST",
            headers: { "x-orchestra-directory": tmp.path, "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
          HttpApiApp.context,
        ),
      )
    const legacy = yield* request("/agent")
    expect(legacy.status, yield* Effect.promise(() => legacy.clone().text())).toBe(200)
    const metadata = yield* request("/api/agent")
    expect(metadata.status, yield* Effect.promise(() => metadata.clone().text())).toBe(200)
    expect(yield* Effect.promise(() => metadata.json())).toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ id: AgentV2.defaultID })]),
    })
    const created = yield* request("/api/session", { location: { directory: tmp.path } })
    expect(created.status, yield* Effect.promise(() => created.clone().text())).toBe(200)
    const session = Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Struct({ id: SessionSchema.ID }) }))(
      yield* Effect.promise(() => created.json()),
    )
    expect(session.data.id).toMatch(/^ses_/)
    const policy = { mode: "allowlist", models: [] }
    const updated = yield* request(`/api/session/${session.data.id}/subagent-models`, { policy })
    expect(updated.status, yield* Effect.promise(() => updated.clone().text())).toBe(200)
    expect(yield* Effect.promise(() => updated.json())).toEqual({ data: policy })
    const read = yield* request(`/api/session/${session.data.id}/subagent-models`)
    expect(read.status).toBe(200)
    expect(yield* Effect.promise(() => read.json())).toEqual({ data: policy })
    const archived = yield* request(`/api/session/${session.data.id}/archive`, { archived: true })
    expect(archived.status, yield* Effect.promise(() => archived.clone().text())).toBe(204)
    const get = yield* request(`/api/session/${session.data.id}`)
    expect(get.status).toBe(200)
    expect(yield* Effect.promise(() => get.json())).toMatchObject({
      data: { id: session.data.id, time: { archived: expect.any(Number) } },
    })
  }),
)

class EarlyLocation extends Context.Service<
  EarlyLocation,
  {
    readonly opened: Effect.Effect<Context.Context<LocationServices>, LocationError>
  }
>()("test/runtime-globals/EarlyLocation") {}

;(["concrete", "replacement"] as const).forEach((source) =>
  cold(`${source} Location map waits before caching constructor fork`, () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true, config: { snapshot: false } })),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
      const map = buildLocationServiceMap(ArsenalBindings.nativeRegistryReplacements)
      const concrete = makeGlobalNode({ service: LocationServiceMap.Service, layer: map, deps: [] })
      const early = makeGlobalNode({
        service: EarlyLocation,
        layer: Layer.effect(
          EarlyLocation,
          Effect.gen(function* () {
            const locations = yield* LocationServiceMap.Service
            const fiber = yield* locations.contextEffect(ref).pipe(Effect.forkScoped({ startImmediately: true }))
            // No partial entry may reach RcMap before this root completes.
            expect(Array.from(yield* RcMap.keys(locations.rcMap))).toEqual([])
            return EarlyLocation.of({ opened: Fiber.join(fiber) })
          }),
        ),
        deps: [source === "concrete" ? concrete : LocationServiceMap.node],
      })
      const { AppLayer } = yield* Effect.promise(() => import("../../src/effect/app-runtime"))
      // Concrete composition adopts the actual outer application's native globals;
      // replacement composition exports them in its own single application root.
      const layer =
        source === "concrete"
          ? AppNodeBuilder.build(early).pipe(Layer.provideMerge(AppLayer))
          : AppNodeBuilderV1.build(LayerNode.group([early, SessionV2.node, SessionExecution.node]), [
              [LocationServiceMap.node, map],
            ])
      yield* Effect.gen(function* () {
        const probe = yield* EarlyLocation
        const sessions = yield* SessionV2.Service
        const execution = yield* SessionExecution.Service
        expect(sessions.active).toBe(execution.active)
        const opened = yield* probe.opened
        const tools = Context.get(opened, ToolRegistry.Service)
        expect((yield* tools.materialize()).definitions.map((tool) => tool.name)).toContain("task")
      }).pipe(Effect.provide(layer))
    }),
  ),
)
