export * as FabricIdentityListenerContract from "./identity-listener-contract"

import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Effect, Scope } from "effect"
import type { FabricIdentityCallbacksContract } from "./identity-callback-contract"
import type { FabricIdentityProfile } from "./identity-profile"

export type Interface = Readonly<{ url: string }>
export type Factory = (
  options: Readonly<{
    callbacks: FabricIdentityCallbacksContract.Interface
    profile: FabricIdentityProfile.Profile
  }>,
) => Effect.Effect<Interface, FabricIdentityAttempt.Failure, Scope.Scope>
