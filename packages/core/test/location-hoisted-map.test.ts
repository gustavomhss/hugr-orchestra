import { expect } from "bun:test"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { makeGlobalNode, makeLocationNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { Snapshot } from "@orchestra/core/snapshot"
import { Context, Effect, Layer } from "effect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

class Observer extends Context.Service<Observer, { locations: Context.Service.Shape<typeof LocationServiceMap.Service> }>()(
  "test/HoistedMapObserver",
) {}
class Probe extends Context.Service<Probe, { observer: Context.Service.Shape<typeof Observer> }>()("test/HoistedMapProbe") {}

// Like ArsenalObservations: a global that needs the Location map, reached from a Location node, so the hoisted graph
// holds the map's unbound node.
it.live("a global that depends on the Location map is bound inside a Location's hoisted graph", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const observer = makeGlobalNode({
      service: Observer,
      layer: Layer.effect(
        Observer,
        Effect.gen(function* () {
          return { locations: yield* LocationServiceMap.Service }
        }),
      ),
      deps: [LocationServiceMap.node],
    })
    const probe = makeLocationNode({
      service: Probe,
      layer: Layer.effect(
        Probe,
        Effect.gen(function* () {
          return { observer: yield* Observer }
        }),
      ),
      deps: [observer],
    })
    const context = yield* Layer.build(
      AppNodeBuilder.build(
        LayerNode.group([Database.node, LocationServiceMap.node, observer, SessionV2.node, SessionExecution.node]),
        [
          [SessionExecution.node, SessionExecutionLocal.node],
          [
            Global.node,
            Global.layerWith({
              home: tmp.path,
              config: path.join(tmp.path, ".global"),
              data: path.join(tmp.path, ".data"),
            }),
          ],
          [Snapshot.node, Snapshot.noopLayer],
        ],
        [probe],
      ),
    )
    const locations = Context.get(context, LocationServiceMap.Service)
    const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
    const seen = yield* Probe.pipe(Effect.provide(locations.get(ref)))
    expect(typeof seen.observer.locations.get).toBe("function")
  }),
  30_000,
)
