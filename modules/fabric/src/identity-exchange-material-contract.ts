export * as FabricIdentityExchangeMaterialContract from "./identity-exchange-material-contract"

import type { CredentialCipher } from "@orchestra/core/credential"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Effect } from "effect"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"
import type { FabricIdentityPreparationContract } from "./identity-preparation-contract"

// Private host material only: never a wire schema, progress DTO, tool result or model-visible value.
export type Material = Readonly<{
  verifier: string
  nonce: string
  correlationID: string
  scopes: FabricIdentityAttempt.Scopes
  redirectUri: string
  createdAt: number
  expiresAt: number
}>
export type Interface = Readonly<{
  read: (input: FabricIdentityAttempt.Selection) => Effect.Effect<Material, FabricIdentityAttemptsContract.Error>
}>
export type Factory = (
  options: FabricIdentityPreparationContract.Options,
) => Effect.Effect<
  Interface,
  FabricIdentityAttemptsContract.Error,
  Database.Service | Project.Service | CredentialCipher.Service
>
