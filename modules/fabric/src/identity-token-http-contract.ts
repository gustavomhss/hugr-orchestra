export * as FabricIdentityTokenHttpContract from "./identity-token-http-contract"

import type { INetworkModule } from "@azure/msal-node"
import type { Effect } from "effect"
import type { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"

export type Factory = (
  options?: Readonly<{ network?: FabricIdentityDiscoveryContract.Options["network"]; timeoutMs?: number }>,
) => Effect.Effect<INetworkModule, FabricIdentityTokens.Failure>
