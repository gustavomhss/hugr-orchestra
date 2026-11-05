export * as FabricContexts from "./context"

import { FabricContext } from "@orchestra/schema/fabric-context"
import { Effect } from "effect"
import type { FabricContextsContract } from "./context-contract"

// Acceptance scaffold only: deliberately unavailable until the context wave is implemented and qualified.
const unavailable = () => Effect.fail(new FabricContext.Failure({
  code: "unavailable", message: "Fabric context service is not available",
}))
export const make: FabricContextsContract.Factory = () => Effect.succeed({
  list: unavailable, preparing: unavailable, create: unavailable, resolve: unavailable, remove: unavailable,
})
