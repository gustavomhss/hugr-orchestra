export * as FabricIdentityPreparationContract from "./identity-preparation-contract"

import type { CredentialCipher } from "@orchestra/core/credential"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Effect } from "effect"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"

export type Options = Parameters<FabricIdentityAttemptsContract.Factory>[0]
// This value is for a trusted manual browser boundary, never a model/tool/progress DTO.
export type Prepared = Readonly<{ attempt: FabricIdentityAttempt.Ref; authorizationURL: string }>
export type Interface = Readonly<{
  prepare: (input: FabricIdentityAttempt.Selection) => Effect.Effect<Prepared, FabricIdentityAttemptsContract.Error>
}>
export type Factory = (
  options: Options,
) => Effect.Effect<
  Interface,
  FabricIdentityAttemptsContract.Error,
  Database.Service | Project.Service | CredentialCipher.Service
>
