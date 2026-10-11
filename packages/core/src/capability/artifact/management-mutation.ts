export * as CapabilityArtifactMutations from "./management-mutation"

import { Effect } from "effect"
import type { CapabilityArtifactManagementContract } from "./management-contract"

// Frozen signature. Mutations author replaces the body; the read facade composes this factory.
export const make = (_options: CapabilityArtifactManagementContract.Options) =>
  Effect.succeed<CapabilityArtifactManagementContract.Mutations>({
    share: () => Effect.die("CapabilityArtifactMutations.share is not implemented"),
    pin: () => Effect.die("CapabilityArtifactMutations.pin is not implemented"),
    removeReference: () => Effect.die("CapabilityArtifactMutations.removeReference is not implemented"),
  })
