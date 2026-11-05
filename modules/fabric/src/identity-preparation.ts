export * as FabricIdentityPreparation from "./identity-preparation"

import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { Effect } from "effect"
import type { FabricIdentityPreparationContract } from "./identity-preparation-contract"

// Acceptance scaffold. No PKCE, ciphertext, URL or pending transition is produced before implementation.
export const make: FabricIdentityPreparationContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      prepare: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({
            code: "unavailable",
            message: "Fabric identity preparation is unavailable",
          }),
        ),
    }),
  )
