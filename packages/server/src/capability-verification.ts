export * as ServerCapabilityVerification from "./capability-verification"

import type { CapabilityConnectionSetupContract } from "@orchestra/core/capability/connection/setup-contract"
import { CapabilityConnectionVerification } from "@orchestra/core/capability/connection/verify"
import { Context, Effect, Layer } from "effect"

/** Trusted host construction only; request payloads cannot replace production origins or identity checks. */
export class Service extends Context.Service<Service, CapabilityConnectionSetupContract.Verifier>()(
  "@orchestra/ServerCapabilityVerification",
) {}

export const layer = Layer.effect(Service, CapabilityConnectionVerification.make().pipe(Effect.orDie))
