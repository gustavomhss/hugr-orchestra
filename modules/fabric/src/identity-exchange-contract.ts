export * as FabricIdentityExchangeContract from "./identity-exchange-contract"

import type { CredentialCipher } from "@orchestra/core/credential"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Effect, Scope } from "effect"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"
import type { FabricIdentityCallbacksContract } from "./identity-callback-contract"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"
import type { FabricIdentityMsalContract } from "./identity-msal-contract"
import type { FabricIdentityPreparationContract } from "./identity-preparation-contract"
import type { FabricIdentityTokens } from "./identity-token"

declare const completion: unique symbol
// Runtime identity only: never a wire schema, grant, account or cache DTO.
export interface Completion {
  readonly [completion]: true
}
export type Error = FabricIdentityAttemptsContract.Error | FabricIdentityTokens.Failure
export type Interface = Readonly<{
  exchange: (
    input: FabricIdentityAttempt.Selection & Readonly<{ ticket: FabricIdentityCallbacksContract.Ticket }>,
  ) => Effect.Effect<Completion, Error>
  consume: (
    input: FabricIdentityAttempt.Selection & Readonly<{ completion: Completion }>,
  ) => Effect.Effect<FabricIdentityMsalContract.Candidate, Error>
}>
export type Factory = (
  options: FabricIdentityPreparationContract.Options &
    Readonly<{
      callbacks: FabricIdentityCallbacksContract.Interface
      network?: FabricIdentityDiscoveryContract.Options["network"]
      certificate?: Parameters<FabricIdentityMsalContract.Factory>[0]["certificate"]
      timeoutMs?: number
      maxEntries?: number
    }>,
) => Effect.Effect<Interface, Error, Database.Service | Project.Service | CredentialCipher.Service | Scope.Scope>
