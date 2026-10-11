export * as CapabilityProcessRegistry from "./registry"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "../../effect/app-node"
import type { CapabilityProcessContract } from "./contract"

export class Service extends Context.Service<Service, CapabilityProcessContract.Registry>()("@orchestra/CapabilityProcessRegistry") {}

// Frozen signature. Registry author replaces the layer body and its deps.
export const layer = Layer.effect(Service, Effect.die("CapabilityProcessRegistry is not implemented"))
export const node = makeGlobalNode({ service: Service, layer, deps: [] })
