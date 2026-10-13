import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionSchema } from "@orchestra/core/session/schema"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Context, Effect, Layer, RcMap, Schema } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Agent } from "../../src/agent/agent"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceStore } from "../../src/project/instance-store"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

it.live("cold AppRuntime bootstrap opens native agents and Task registry", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir({ git: true, config: { snapshot: false } })),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const { AppRuntime } = yield* Effect.promise(() => import("../../src/effect/app-runtime"))
    yield* Effect.promise(() => AppRuntime.runPromise(Effect.gen(function* () {
      const locations = yield* LocationServiceMap.Service
      const store = yield* InstanceStore.Service
      const agents = yield* Agent.Service
      const sessions = yield* SessionV2.Service
      const execution = yield* SessionExecution.Service
      expect(sessions.active).toBe(execution.active)
      const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
      expect(Array.from(yield* RcMap.keys(locations.rcMap))).toEqual([])
      yield* Effect.addFinalizer(() => store.disposeDirectory(tmp.path).pipe(Effect.andThen(locations.invalidate(ref))))
      const instance = yield* store.load({ directory: tmp.path })
      expect((yield* agents.list().pipe(Effect.provideService(InstanceRef, instance))).length).toBeGreaterThan(0)
      const opened = yield* locations.contextEffect(ref)
      const nativeAgents = Context.get(opened, AgentV2.Service)
      const tools = Context.get(opened, ToolRegistry.Service)
      expect((yield* nativeAgents.all()).map((agent) => agent.id)).toContain(AgentV2.defaultID)
      expect((yield* tools.materialize()).definitions.map((tool) => tool.name)).toContain("task")
    }).pipe(Effect.scoped)))
  }), 30_000,
)

it.live("cold public HTTP root serves native metadata and Session settings", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir({ git: true, config: { snapshot: false } })),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const { HttpApiApp } = yield* Effect.promise(() => import("../../src/server/routes/instance/httpapi/server"))
    // A separate memo map prevents AppRuntime or earlier HTTP tests from warming this root.
    const web = HttpRouter.toWebHandler(HttpApiApp.createRoutes(), { disableLogger: true, memoMap: Layer.makeMemoMapUnsafe() })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const request = (route: string, body?: unknown) => Effect.promise(() => web.handler(new Request(`http://localhost${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-orchestra-directory": tmp.path, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), HttpApiApp.context))
    const legacy = yield* request("/agent")
    expect(legacy.status, yield* Effect.promise(() => legacy.clone().text())).toBe(200)
    const metadata = yield* request("/api/agent")
    expect(metadata.status, yield* Effect.promise(() => metadata.clone().text())).toBe(200)
    expect(yield* Effect.promise(() => metadata.json())).toMatchObject({ data: expect.arrayContaining([expect.objectContaining({ id: AgentV2.defaultID })]) })
    const created = yield* request("/api/session", { location: { directory: tmp.path } })
    expect(created.status, yield* Effect.promise(() => created.clone().text())).toBe(200)
    const session = Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Struct({ id: SessionSchema.ID }) }))(yield* Effect.promise(() => created.json()))
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
    expect(yield* Effect.promise(() => get.json())).toMatchObject({ data: { id: session.data.id, time: { archived: expect.any(Number) } } })
  }), 30_000,
)
