import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { MaestroSeats } from "@orchestra/maestro/v2/seats-service"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Host } from "@orchestra/core/host"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Effect, Layer } from "effect"
import { ProductHost } from "../../src/host"

/** A Dock channel that never answers: the tools register, none runs. */
const dock = { postMessage: () => {}, on: () => {} }

/**
 * The names the composed product host registers in a Location and the seats it exposes: the same root graph
 * `createRoutes` builds (global nodes, replacements and Location nodes from `ProductHost.contributions`), minus HTTP.
 */
export function productHost() {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-product-host-"))),
          (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
        )
        const merged = Host.merge(ProductHost.contributions(dock))
        const services = AppNodeBuilder.build(
          LayerNode.group([
            ApplicationTools.node,
            Database.node,
            EventV2.node,
            LocationServiceMap.node,
            SessionV2.node,
            SessionExecution.node,
            ...merged.nodes,
          ]),
          [
            [Database.node, Database.layerFromPath(":memory:")],
            [
              Global.node,
              Global.layerWith({
                home: root,
                data: path.join(root, "data"),
                cache: path.join(root, "cache"),
                config: path.join(root, "config"),
                state: path.join(root, "state"),
                tmp: path.join(root, "tmp"),
                bin: path.join(root, "bin"),
                log: path.join(root, "log"),
                repos: path.join(root, "repos"),
              }),
            ],
            [SessionExecution.node, SessionExecutionLocal.node],
            ...merged.replacements,
          ],
          merged.locationNodes,
        )
        const project = path.join(root, "project")
        yield* Effect.promise(() => fs.mkdir(project, { recursive: true }))
        return yield* Effect.gen(function* () {
          const ref = Location.Ref.make({ directory: AbsolutePath.make(project) })
          // The Location map exposes its typed services; contributed nodes are in the same compiled context.
          const location = LocationServiceMap.Service.get(ref) as Layer.Layer<ToolRegistry.Service | MaestroSeats.Service>
          return yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const seats = yield* MaestroSeats.Service
            return {
              tools: (yield* registry.materialize()).definitions.map((tool) => tool.name),
              seats: seats.ids,
            }
          }).pipe(Effect.provide(location))
        }).pipe(Effect.provide(services))
      }),
    ),
  )
}
