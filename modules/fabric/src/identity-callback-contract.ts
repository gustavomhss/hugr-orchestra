export * as FabricIdentityCallbacksContract from "./identity-callback-contract"

import type { CredentialCipher } from "@orchestra/core/credential"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Effect, Scope } from "effect"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"
import type { FabricIdentityPreparationContract } from "./identity-preparation-contract"

declare const ticket: unique symbol
export interface Ticket {
  readonly [ticket]: true
}
export type Claim =
  | Readonly<{ attempt: FabricIdentityAttempt.Ref; outcome: "denied" }>
  | Readonly<{ attempt: FabricIdentityAttempt.Ref; outcome: "claimed"; ticket: Ticket }>
export type Interface = Readonly<{
  register: (
    input: FabricIdentityAttempt.Selection,
  ) => Effect.Effect<FabricIdentityPreparationContract.Prepared, FabricIdentityAttemptsContract.Error>
  receive: (input: unknown) => void
  claim: (input: FabricIdentityAttempt.Selection) => Effect.Effect<Claim, FabricIdentityAttemptsContract.Error>
  /** Private exchange-host only, never projected into a DTO/model/tool. Ticket identity is not authority. */
  consume: (
    input: FabricIdentityAttempt.Selection & Readonly<{ ticket: Ticket }>,
  ) => Effect.Effect<Readonly<{ code: string }>, FabricIdentityAttemptsContract.Error>
}>
export type Factory = (
  options: FabricIdentityPreparationContract.Options & Readonly<{ maxEntries?: number }>,
) => Effect.Effect<
  Interface,
  FabricIdentityAttemptsContract.Error,
  Database.Service | Project.Service | CredentialCipher.Service | Scope.Scope
>
