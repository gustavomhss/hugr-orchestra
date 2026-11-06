export * as FabricIdentityExchange from "./identity-exchange"

import { Effect } from "effect"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { FabricIdentityExchangeContract } from "./identity-exchange-contract"

// Acceptance scaffold: no ticket consumed, provider dispatched or secret candidate delivered.
export const make: FabricIdentityExchangeContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      exchange: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({
            code: "unavailable",
            message: "Fabric contextual exchange is unavailable",
          }),
        ),
      consume: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({
            code: "unavailable",
            message: "Fabric contextual exchange is unavailable",
          }),
        ),
    }),
  )
