export * as ServerOperator from "./operator"

import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Context } from "effect"

/** Host-injected facade; its scoped Core factory owns authority and the request frame. */
export class Service extends Context.Service<Service, CapabilityOperatorContract.Interface>()(
  "@orchestra/ServerOperator",
) {}
