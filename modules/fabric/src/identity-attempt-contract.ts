export * as FabricIdentityAttemptsContract from "./identity-attempt-contract"

import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { Capability } from "@orchestra/schema/capability"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { AbsolutePath } from "@orchestra/schema/schema"
import type { Effect } from "effect"
import type { FabricIdentityProfile } from "./identity-profile"

export type Error = FabricIdentityAttempt.Failure | FabricContext.Failure | Capability.Failure
export type Interface = Readonly<{
  begin: (input: FabricIdentityAttempt.Begin) => Effect.Effect<FabricIdentityAttempt.Ref, Error>
  inspect: (input: FabricIdentityAttempt.Selection) => Effect.Effect<FabricIdentityAttempt.Info, Error>
  cancel: (input: FabricIdentityAttempt.Selection) => Effect.Effect<FabricIdentityAttempt.Ref, Error>
}>
export type Factory = (
  options: Readonly<{
    operators: CapabilityOperatorContract.Interface
    root: AbsolutePath
    profile: FabricIdentityProfile.Profile
    maxAttempts?: number
    now?: () => number
  }>,
) => Effect.Effect<Interface, Error, Database.Service | Project.Service>
