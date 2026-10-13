import { expect } from "bun:test"
import path from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { LocationError, LocationServices } from "@orchestra/core/location-services"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { Snapshot } from "@orchestra/core/snapshot"
import { Context, Deferred, Effect, Fiber, Layer, LayerMap, Option, RcMap } from "effect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
class LateGlobal extends Context.Service<LateGlobal, { token: object }>()("test/LateGlobal") {}

it.live("startup Location acquisition waits for delayed root exports without poisoning the cache", () => Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
  const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
  const release = yield* Deferred.make<void>()
  const started = yield* Deferred.make<LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>>()
  const acquired = yield* Deferred.make<AgentV2.Interface, LocationError>()
  const expected = { token: {} }
  const observed: { token: object }[] = []
  const state = { closed: false }

  yield* Effect.scoped(Effect.gen(function* () {
    const startup = makeGlobalNode({
      name: "test/startup-drain",
      layer: Layer.effectDiscard(Effect.gen(function* () {
        const locations = yield* LocationServiceMap.Service
        // Like ScheduledTask's daemon, construction launches a scoped drain without joining it.
        yield* Effect.gen(function* () {
          yield* Deferred.succeed(started, locations)
          return Context.get(yield* locations.contextEffect(ref), AgentV2.Service)
        }).pipe(
          Effect.onExit((exit) => Deferred.done(acquired, exit)),
          Effect.exit,
          Effect.forkScoped,
        )
      })),
      deps: [LocationServiceMap.node],
    })
    const late = makeGlobalNode({
      service: LateGlobal,
      layer: Layer.effect(LateGlobal, Deferred.await(release).pipe(Effect.as(expected))),
      deps: [],
    })
    const build = yield* Layer.build(AppNodeBuilder.build(LayerNode.group([
      Database.node, LocationServiceMap.node, startup, late, SessionV2.node, SessionExecution.node,
    ]), [
      [SessionExecution.node, SessionExecutionLocal.node],
      [Global.node, Global.layerWith({
        home: tmp.path, config: path.join(tmp.path, ".global"), data: path.join(tmp.path, ".data"),
      })],
      [Snapshot.node, Layer.effect(Snapshot.Service, Effect.gen(function* () {
        // Observe the real Location constructor's context, before it exports services to the caller.
        const global = yield* Effect.serviceOption(LateGlobal)
        if (Option.isNone(global)) return yield* Effect.die("Location acquired before the delayed root export")
        observed.push(global.value)
        yield* Effect.addFinalizer(() => Effect.sync(() => { state.closed = true }))
        return yield* Snapshot.Service
      })).pipe(Layer.provide(Snapshot.noopLayer))],
    ])).pipe(Effect.forkChild)

    const locations = yield* Deferred.await(started)
    yield* Effect.yieldNow
    expect(yield* Deferred.isDone(acquired)).toBe(false)
    expect(Array.from(yield* RcMap.keys(locations.rcMap))).toHaveLength(0)
    expect(observed).toHaveLength(0)

    yield* Deferred.succeed(release, undefined)
    const completed = yield* Fiber.join(build)
    const agents = yield* Deferred.await(acquired)
    expect(observed).toHaveLength(1)
    expect(observed[0]).toBe(expected)
    expect(observed[0]).toBe(Context.get(completed, LateGlobal))
    expect(yield* AgentV2.Service.pipe(Effect.provide(locations.get(ref)))).toBe(agents)
    expect(observed).toHaveLength(1)
    expect(Array.from(yield* RcMap.keys(locations.rcMap))).toHaveLength(1)
    expect(state.closed).toBe(false)
  }))
  expect(state.closed).toBe(true)
}), 30_000)
