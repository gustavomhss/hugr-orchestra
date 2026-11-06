export * as FabricIdentityExchangeMaterial from "./identity-exchange-material"

import { Effect } from "effect"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { FabricIdentityExchangeMaterialContract } from "./identity-exchange-material-contract"

// Acceptance scaffold. No sensitive material or provider work is admitted yet.
export const make: FabricIdentityExchangeMaterialContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      read: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({
            code: "unavailable",
            message: "Fabric exchange material is unavailable",
          }),
        ),
    }),
  )
