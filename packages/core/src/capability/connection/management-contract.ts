export * as CapabilityConnectionManagementContract from "./management-contract"

import type { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { Capability } from "@orchestra/schema/capability"
import type { Effect } from "effect"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"

export type Interface = Readonly<{
  list: (placement: CapabilityOperatorContract.Placement, input: typeof CapabilityManagement.ConnectionQuery.Type) =>
    Effect.Effect<typeof CapabilityManagement.ConnectionPage.Type, CapabilityConnectionStoreContract.Error>
  get: (id: Capability.ConnectionID) => Effect.Effect<typeof CapabilityManagement.Connection.Type, CapabilityConnectionStoreContract.Error>
  targets: (id: Capability.ConnectionID, input: typeof CapabilityManagement.TargetQuery.Type) =>
    Effect.Effect<typeof CapabilityManagement.TargetPage.Type, CapabilityConnectionStoreContract.Error>
  disconnect: (input: typeof CapabilityManagement.DisconnectInput.Type) => Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error>
  createTarget: (input: typeof CapabilityManagement.CreateTargetInput.Type) => Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error>
  retargetTarget: (input: typeof CapabilityManagement.RetargetInput.Type) => Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error>
  removeTarget: (input: typeof CapabilityManagement.RemoveTargetInput.Type) => Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error>
  bind: (input: typeof CapabilityManagement.PutBindingInput.Type) => Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error>
  unbind: (input: typeof CapabilityManagement.RemoveBindingInput.Type) => Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error>
}>
export type Options = Readonly<{ operators: CapabilityOperatorContract.Interface; store: CapabilityConnectionStoreContract.Interface }>
