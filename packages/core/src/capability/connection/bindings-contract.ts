export * as CapabilityConnectionBindingsContract from "./bindings-contract"

import type { Capability } from "@orchestra/schema/capability"
import type { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { Effect } from "effect"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"

export type Options = Readonly<{ operators: CapabilityOperatorContract.Interface }>
export type Interface = Readonly<{ get: (id: Capability.TargetID) =>
  Effect.Effect<typeof CapabilityManagement.Target.Type, CapabilityConnectionStoreContract.Error>;
  list: (id: Capability.TargetID, input: typeof CapabilityManagement.BindingQuery.Type) =>
  Effect.Effect<typeof CapabilityManagement.BindingPage.Type, CapabilityConnectionStoreContract.Error> }>
