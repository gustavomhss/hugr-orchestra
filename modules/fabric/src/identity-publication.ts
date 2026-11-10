export * as FabricIdentityPublication from "./identity-publication"

import { Effect } from "effect"
import { FabricConnection } from "@orchestra/schema/fabric-connection"
import type { FabricIdentityPublicationContract } from "./identity-publication-contract"

// Acceptance scaffold: no Completion consumed, credential or connection inserted, or attempt completed yet.
export const make: FabricIdentityPublicationContract.Factory = (_options) =>
  Effect.succeed(
    Object.freeze({
      publish: () =>
        Effect.fail(
          new FabricConnection.Failure({ code: "unavailable", message: "Fabric identity publication is unavailable" }),
        ),
      get: () =>
        Effect.fail(
          new FabricConnection.Failure({ code: "unavailable", message: "Fabric identity publication is unavailable" }),
        ),
    }),
  )
