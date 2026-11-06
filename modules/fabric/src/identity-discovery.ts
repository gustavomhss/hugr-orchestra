export * as FabricIdentityDiscovery from "./identity-discovery"

import { Effect } from "effect"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"

// Acceptance scaffold: no discovery, verifier publication or provider work.
export const make: FabricIdentityDiscoveryContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      load: () =>
        Effect.fail(
          new FabricIdentityTokens.Failure({
            code: "unavailable",
            message: "Fabric identity discovery is unavailable",
          }),
        ),
    }),
  )
