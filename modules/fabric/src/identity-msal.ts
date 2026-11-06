export * as FabricIdentityMsal from "./identity-msal"

import { Effect } from "effect"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityMsalContract } from "./identity-msal-contract"

// Acceptance scaffold. No provider request, token/cache candidate or account publication is admitted.
export const make: FabricIdentityMsalContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      exchange: () =>
        Effect.fail(
          new FabricIdentityTokens.Failure({ code: "unavailable", message: "Fabric identity exchange is unavailable" }),
        ),
    }),
  )
