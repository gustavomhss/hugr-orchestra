export * as CapabilityConnectionSetupContract from "./setup-contract"

import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import type { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { Integration } from "@orchestra/schema/integration"
import type { Effect, Schema } from "effect"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityRequestContract } from "../operator/request-contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"

export type Proof = Readonly<{ provider: CapabilitySetup.Provider; subjectID: string; endpoint: string;
  integrationID: Integration.ID; scopeHash: string }>
export type Verifier = Readonly<{ verify: (input: CapabilitySetup.Input) =>
  Effect.Effect<Proof, CapabilityConnectionStoreContract.Error> }>
export type Reconciliation = Readonly<{ reconcile: <E, R>(target: CapabilityOperatorContract.Target, payload: Schema.Json,
  verify?: (tx: CapabilityRequestContract.Transaction) => Effect.Effect<void, E, R>) =>
  Effect.Effect<typeof CapabilityManagement.Receipt.Type | undefined, E | CapabilityConnectionStoreContract.Error, R> }>
export type Options = Readonly<{ operators: CapabilityOperatorContract.Interface;
  ledger: CapabilityRequestContract.Interface & Reconciliation; verifier: Verifier }>
export type Interface = Readonly<{ connect: (placement: CapabilityOperatorContract.Placement, input: CapabilitySetup.Input) =>
  Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityConnectionStoreContract.Error> }>
