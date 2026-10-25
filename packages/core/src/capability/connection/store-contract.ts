export * as CapabilityConnectionStoreContract from "./store-contract"

import type { Capability } from "@orchestra/schema/capability"
import type { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { Agent } from "@orchestra/schema/agent"
import type { SessionID } from "@orchestra/schema/session-id"
import type { Effect } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityRequestContract } from "../operator/request-contract"
import type { CapabilityConnectionTable, CapabilityTargetTable } from "../sql"

export type Error = Capability.Failure | SqlError | EffectDrizzleQueryError
export type Transaction = CapabilityRequestContract.Transaction
export type Placement = CapabilityOperatorContract.Placement
export type Interface = Readonly<{
  connection: (tx: Transaction, placement: Placement, ref: Capability.ConnectionRef) =>
    Effect.Effect<typeof CapabilityConnectionTable.$inferSelect, Error>
  target: (tx: Transaction, placement: Placement, ref: Capability.TargetRef) =>
    Effect.Effect<Readonly<{ row: typeof CapabilityTargetTable.$inferSelect; parent: typeof CapabilityConnectionTable.$inferSelect }>, Error>
  createTarget: (tx: Transaction, placement: Placement, ref: Capability.ConnectionRef, input: typeof CapabilityManagement.TargetInput.Type) =>
    Effect.Effect<Capability.TargetRef, Error>
  retargetTarget: (tx: Transaction, placement: Placement, ref: Capability.TargetRef, input: typeof CapabilityManagement.TargetInput.Type) =>
    Effect.Effect<Capability.TargetRef, Error>
  removeTarget: (tx: Transaction, placement: Placement, ref: Capability.TargetRef) => Effect.Effect<void, Error>
  disconnect: (tx: Transaction, placement: Placement, ref: Capability.ConnectionRef) => Effect.Effect<void, Error>
  bind: (tx: Transaction, placement: Placement, input: Readonly<{ target: Capability.TargetRef; sessionID: SessionID;
    agentID: Agent.ID; actions: readonly string[] }>) => Effect.Effect<void, Error>
  unbind: (tx: Transaction, placement: Placement, ref: Capability.TargetRef, sessionID: SessionID, agentID: Agent.ID) => Effect.Effect<void, Error>
}>
