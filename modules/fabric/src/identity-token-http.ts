export * as FabricIdentityTokenHttp from "./identity-token-http"

import { Effect } from "effect"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityTokenHttpContract } from "./identity-token-http-contract"

// Acceptance scaffold: neither GET nor token POST leaves the process yet.
export const make: FabricIdentityTokenHttpContract.Factory = (_options) =>
  Effect.succeed({
    sendGetRequestAsync: async () => {
      throw new FabricIdentityTokens.Failure({
        code: "unavailable",
        message: "Fabric identity exchange is unavailable",
      })
    },
    sendPostRequestAsync: async () => {
      throw new FabricIdentityTokens.Failure({
        code: "unavailable",
        message: "Fabric identity exchange is unavailable",
      })
    },
  })
