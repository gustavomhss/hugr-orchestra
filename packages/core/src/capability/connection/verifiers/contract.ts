export * as CapabilityVerifierContract from "./contract"

import type { Capability } from "@orchestra/schema/capability"
import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import type { Integration } from "@orchestra/schema/integration"
import type { Effect, Schema } from "effect"

/** One fixed-route call to the provider's identity origin. Origin and auth scheme are bound by the verifier. */
export type Call = (input: Readonly<{ method: "GET" | "POST"; path: string; body?: Schema.Json }>) =>
  Effect.Effect<unknown, Capability.Failure>

export type Descriptor = Readonly<{
  provider: CapabilitySetup.Provider
  /** Stored on the connection: exactly what the consuming leaf (channel, media, platform_*) resolves against. */
  endpoint: string
  integrationID: Integration.ID
  verification: CapabilitySetup.Verification
  /** Fixed production origin for identity calls; trusted fixture options may replace it with loopback only. */
  origin: string
  /** Full Authorization header value for the identity origin (e.g. `Bearer k`, `Bot k`, or the raw key). */
  authorization: (key: string) => string
  /** Keys outside this shape are refused before any network call (e.g. Stripe accepts only restricted rk_ keys). */
  keyPattern?: RegExp
  /** Extra fixed headers for the identity origin (never derived from input). */
  headers?: Readonly<Record<string, string>>
  /**
   * Stable subject: provider account/user IDs for `verified`; for `credential-only`, never the key itself.
   * Fail `authentication_required` for rejected keys and `connection_unavailable` for malformed identity.
   */
  identify: (call: Call) => Effect.Effect<string, Capability.Failure>
}>
