export * as FabricIdentityDiscoveryContract from "./identity-discovery-contract"

import type { Agent } from "node:https"
import type { Effect } from "effect"
import type { FabricIdentityProfile } from "./identity-profile"
import type { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityTokensContract } from "./identity-token-contract"

// A custom Agent is a trusted host networking capability, never request/workspace configuration or proof of Microsoft origin.
export type Options = Readonly<{ profile: FabricIdentityProfile.Profile; agent?: Agent; timeoutMs?: number }>
export type Interface = Readonly<{
  load: () => Effect.Effect<FabricIdentityTokensContract.Interface, FabricIdentityTokens.Failure>
}>
export type Factory = (options: Options) => Effect.Effect<Interface, FabricIdentityTokens.Failure>
