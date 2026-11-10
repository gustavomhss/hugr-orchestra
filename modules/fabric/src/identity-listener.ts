export * as FabricIdentityListener from "./identity-listener"

import { Effect } from "effect"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import type { FabricIdentityListenerContract } from "./identity-listener-contract"

// Acceptance scaffold: no socket is opened and no callback URL is delivered.
export const make: FabricIdentityListenerContract.Factory = () =>
  Effect.fail(FabricIdentityAttemptAccess.failure("unavailable"))
