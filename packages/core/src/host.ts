export * as Host from "./host"

import { Layer } from "effect"
import type { Database } from "./database/database"
import type { EventV2 } from "./event"
import type { LayerNode } from "./effect/layer-node"
import type { Node } from "./effect/app-node"
import { LocationServiceMap } from "./location-service-map"
import { locationServices, type LocationError } from "./location-services"
import { ScheduledTask } from "./scheduled-task"
import { SessionV2 } from "./session"
import { SessionExecution } from "./session/execution"

/** Global services every composition root provides to a contribution's reference overrides. */
export type ReferenceServices = Database.Service | EventV2.Service | LocationServiceMap.Service

/**
 * What a product module hands a composition root. A root applies all contributions once, to its single
 * application graph (AGENTS "V2 Session Core": one process-local SessionExecution, one Location map).
 */
export interface Contribution {
  /** Stable module id ("maestro", "app-dock", ...). Duplicates are a composition error. */
  readonly id: string
  /** Node replacements for the root graph; AppNodeBuilder also applies them to every Location map it builds. */
  readonly replacements?: LayerNode.Replacements
  /** Extra global nodes owned by the module. They must not fail: the root's error type does not grow. */
  readonly nodes?: ReadonlyArray<Node.GlobalNode<unknown>>
  /** Extra Location-scoped nodes appended to `locationServices` in every Location map the root builds. */
  readonly locationNodes?: ReadonlyArray<Node.LocationNode<unknown, LocationError>>
  /** Context.Reference overrides (core/host/* references), provided to the API layer. */
  readonly references?: Layer.Layer<never, never, ReferenceServices>
}

// One coordinator per process: these stay owned by the composition root.
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  const node = repeated(nodes.map((item) => item.name))
  if (node) throw new Error(`Host contribution node is not unique: ${node}`)
  // A contributed Location node may not shadow a built-in one either; changing a built-in is a replacement.
  const builtIn = new Set(locationServices.dependencies.map((item) => item.name))
  const location = repeated(locationNodes.map((item) => item.name)) ?? locationNodes.find((item) => builtIn.has(item.name))?.name
  if (location) throw new Error(`Host contribution Location node is not unique: ${location}`)
  const [first, ...rest] = contributions.flatMap((item) => (item.references ? [item.references] : []))
  const references: Layer.Layer<never, never, ReferenceServices> = !first ? Layer.empty : rest.length === 0 ? first : Layer.mergeAll(first, ...rest)
  return { replacements, nodes, locationNodes, references }
}

function repeated(names: ReadonlyArray<string>) {
  return names.find((name, index) => names.indexOf(name) !== index)
}
