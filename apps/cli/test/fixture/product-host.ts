import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Core reads its database path, XDG roots and network switches from the environment when its modules first load, and
// replacing a global node (Database, Global) in the graph makes hoisting reject the replacements that depend on it. So
// the environment is set here and core loads after it, through `import()`, never statically.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-product-host-"))
process.once("exit", () => fs.rmSync(home, { recursive: true, force: true }))
Object.assign(process.env, {
  ORCHESTRA_DB: ":memory:",
  ORCHESTRA_INHERIT_CREDENTIALS: "0",
  ORCHESTRA_DISABLE_MODELS_FETCH: "true",
  XDG_DATA_HOME: path.join(home, "data"),
  XDG_CACHE_HOME: path.join(home, "cache"),
  XDG_CONFIG_HOME: path.join(home, "config"),
  XDG_STATE_HOME: path.join(home, "state"),
})

// Types only: a static value import would load core before the environment above is set.
type Services =
  | import("@orchestra/core/tool/registry").ToolRegistry.Service
  | import("@orchestra/maestro/v2/seats-service").MaestroSeats.Service

/** A Dock channel that never answers: the tools register, none runs. */
const dock = { postMessage: () => {}, on: () => {} }

/**
 * The tools the composed product host registers in a Location and the seats it exposes: the same root graph
 * `createRoutes` builds (global nodes, replacements and Location nodes from `ProductHost.contributions`), minus HTTP.
 * Also the names the other modules say they own, for the tests to compare against.
 */
export async function productHost() {
  // Sequential, in `serve`'s own order: core's modules import each other in cycles that only resolve from there.
  await import("@orchestra/core/credential")
  const { Database } = await import("@orchestra/core/database/database")
  const { AppNodeBuilder } = await import("@orchestra/core/effect/app-node-builder")
  const { LayerNode } = await import("@orchestra/core/effect/layer-node")
  await import("@orchestra/core/permission/saved")
  const { SessionV2 } = await import("@orchestra/core/session")
  const { Effect } = await import("effect")
  const { EventV2 } = await import("@orchestra/core/event")
  const { Host } = await import("@orchestra/core/host")
  const { Location } = await import("@orchestra/core/location")
  const { LocationServiceMap } = await import("@orchestra/core/location-service-map")
  const { AbsolutePath } = await import("@orchestra/core/schema")
  const { SessionExecution } = await import("@orchestra/core/session/execution")
  const { SessionExecutionLocal } = await import("@orchestra/core/session/execution/local")
  const { ApplicationTools } = await import("@orchestra/core/tool/application-tools")
  const { ToolRegistry } = await import("@orchestra/core/tool/registry")
  const { MaestroArsenal } = await import("@orchestra/core/tool/maestro-arsenal")
  const { ProductHost } = await import("../../src/host")
  const { MaestroSeats } = await import("@orchestra/maestro/v2/seats-service")
  const { Seats } = await import("@orchestra/maestro/seats")
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
    [[SessionExecution.node, SessionExecutionLocal.node], ...merged.replacements],
    merged.locationNodes,
  )
  const project = path.join(home, "project")
  fs.mkdirSync(project, { recursive: true })
  const ref = Location.Ref.make({ directory: AbsolutePath.make(project) })
  const inspect = Effect.gen(function* () {
    // The Location map types only the built-in services; contributed nodes are in the same compiled context.
    const location = LocationServiceMap.Service.get(ref) as import("effect").Layer.Layer<Services>
    return yield* Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const seats = yield* MaestroSeats.Service
      return { tools: (yield* registry.materialize()).definitions.map((tool) => tool.name), seats: seats.ids }
    }).pipe(Effect.provide(location))
  })
  const state = await Effect.runPromise(inspect.pipe(Effect.provide(services), Effect.scoped))
  return {
    ...state,
    rosterSeats: Object.keys(Seats.all),
    arsenal: Object.values(MaestroArsenal.names),
    ids: (channel?: typeof dock) => ProductHost.contributions(channel).map((item) => item.id),
    dock,
  }
}
