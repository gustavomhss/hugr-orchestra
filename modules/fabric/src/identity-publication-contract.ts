export * as FabricIdentityPublicationContract from "./identity-publication-contract"

import type { CredentialCipher } from "@orchestra/core/credential"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { FabricConnection } from "@orchestra/schema/fabric-connection"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Effect } from "effect"
import type { FabricIdentityExchangeContract } from "./identity-exchange-contract"
import type { FabricIdentityPreparationContract } from "./identity-preparation-contract"

export type Error = FabricIdentityExchangeContract.Error | FabricConnection.Failure
export type Interface = Readonly<{
  publish: (
    input: FabricIdentityAttempt.Selection & Readonly<{ completion: FabricIdentityExchangeContract.Completion }>,
  ) => Effect.Effect<FabricConnection.Published, Error>
  get: (input: FabricConnection.Selection) => Effect.Effect<FabricConnection.Info, Error>
}>
export type Factory = (
  options: FabricIdentityPreparationContract.Options &
    Readonly<{
      exchange: FabricIdentityExchangeContract.Interface
    }>,
) => Effect.Effect<Interface, Error, Database.Service | Project.Service | CredentialCipher.Service>
