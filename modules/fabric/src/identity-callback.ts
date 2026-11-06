export * as FabricIdentityCallbacks from "./identity-callback"

import { Effect } from "effect"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { FabricIdentityCallbacksContract } from "./identity-callback-contract"

// Acceptance scaffold: receive delivers nothing, and neither claims nor code consumption are admitted.
export const make: FabricIdentityCallbacksContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      register: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({ code: "unavailable", message: "Fabric callback is unavailable" }),
        ),
      receive: (_input: unknown) => {},
      claim: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({ code: "unavailable", message: "Fabric callback is unavailable" }),
        ),
      consume: () =>
        Effect.fail(
          new FabricIdentityAttempt.Failure({ code: "unavailable", message: "Fabric callback is unavailable" }),
        ),
    }),
  )
