export * as CapabilityArtifactManagementContract from "./management-contract"

import type { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import type { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { Capability } from "@orchestra/schema/capability"
import type { SessionID } from "@orchestra/schema/session-id"
import type { Effect } from "effect"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityArtifacts } from "./index"

// The Session is a selector only: placement comes from its stored row, authority from the operator binding.
export type Interface = Readonly<{
  list: (sessionID: SessionID, input: typeof CapabilityArtifactManagement.ArtifactQuery.Type) =>
    Effect.Effect<CapabilityArtifactManagement.ArtifactPage, CapabilityArtifacts.Error>
  get: (sessionID: SessionID, ref: Capability.ArtifactRef) =>
    Effect.Effect<CapabilityArtifactManagement.Artifact, CapabilityArtifacts.Error>
  /** Host transport only. Whole verified bounded blob; HTTP Range slicing belongs to the Server. */
  content: (sessionID: SessionID, ref: Capability.ArtifactRef) =>
    Effect.Effect<Readonly<{ artifact: CapabilityArtifactManagement.Artifact; data: Uint8Array }>, CapabilityArtifacts.Error>
} & Mutations>

export type Mutations = Readonly<{
  share: (sessionID: SessionID, ref: Capability.ArtifactRef, input: typeof CapabilityArtifactManagement.ShareInput.Type) =>
    Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityArtifacts.Error>
  pin: (sessionID: SessionID, ref: Capability.ArtifactRef, input: typeof CapabilityArtifactManagement.PinInput.Type) =>
    Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityArtifacts.Error>
  removeReference: (sessionID: SessionID, ref: Capability.ArtifactRef) =>
    Effect.Effect<typeof CapabilityManagement.Receipt.Type, CapabilityArtifacts.Error>
}>

export type Options = Readonly<{ operators: CapabilityOperatorContract.Interface; artifacts?: CapabilityArtifacts.Options }>
