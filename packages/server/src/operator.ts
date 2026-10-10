export * as ServerOperator from "./operator"

import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { Context, Effect, Layer } from "effect"
import { Principal } from "./principal"

/** Host-injected facade; its scoped Core factory owns authority and the request frame. */
export class Service extends Context.Service<Service, CapabilityOperatorContract.Interface>()(
  "@orchestra/ServerOperator",
) {}

export const layer = Layer.effect(Service, Effect.suspend(() => CapabilityOperator.make({
  principal: Principal.account(), scope: { placements: "instance", actions: ["*"] },
})).pipe(Effect.orDie))
