export * as FabricContextDirectory from "./context-directory"

import { FabricContext } from "@orchestra/schema/fabric-context"
import { Effect } from "effect"
import type { FabricContextDirectoryContract } from "./context-directory-contract"

// Provisional split seam only; no filesystem preparation is implemented by this scaffold.
export const make: FabricContextDirectoryContract.Factory = () => Effect.fail(new FabricContext.Failure({
  code: "unavailable", message: "Fabric context directory is not available",
}))
