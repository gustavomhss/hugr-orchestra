export * as FabricIdentityDiscoveryContract from "./identity-discovery-contract"

import type { Effect } from "effect"
import type { FabricIdentityProfile } from "./identity-profile"
import type { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityTokensContract } from "./identity-token-contract"

// Network routing/trust is host-only, never request/workspace data or proof of Microsoft origin by itself.
export type Options = Readonly<{
  profile: FabricIdentityProfile.Profile
  network?: Readonly<{ address: string; port: number; ca?: string }>
  timeoutMs?: number
}>
export type Interface = Readonly<{
  load: () => Effect.Effect<FabricIdentityTokensContract.Interface, FabricIdentityTokens.Failure>
}>
export type Factory = (options: Options) => Effect.Effect<Interface, FabricIdentityTokens.Failure>
