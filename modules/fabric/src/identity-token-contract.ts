export * as FabricIdentityTokensContract from "./identity-token-contract"

import type { Effect } from "effect"
import type { FabricIdentityProfile } from "./identity-profile"
import type { FabricIdentityTokens } from "./identity-token"

export type Input = Readonly<{ token: string; nonce: string; createdAt: number; tenantID?: string; objectID?: string }>
export type Proof = Readonly<{
  clientID: string
  issuer: string
  tenantID: string
  objectID: string
  subject: string
  expiresAt: number
}>
export type Interface = Readonly<{
  verify: (input: Input) => Effect.Effect<Proof, FabricIdentityTokens.Failure>
  /** Provenance under this configured verifier only, never Microsoft trust or execution authority by itself. */
  owns: (input: unknown) => input is Proof
}>
export type Factory = (
  options: Readonly<{ profile: FabricIdentityProfile.Profile; keys: unknown; now?: () => number }>,
) => Effect.Effect<Interface, FabricIdentityTokens.Failure>
