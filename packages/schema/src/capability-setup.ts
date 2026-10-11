export * as CapabilitySetup from "./capability-setup"

import { Schema } from "effect"
import { Capability } from "./capability"
import { optional } from "./schema"

// Key/bearer setup only. OAuth-only hosted MCPs (sentry, vercel, grafana, railway, netlify, prisma-postgres) need F05 OAuth.
export const Provider = Schema.Literals(["slack", "discord", "cloudflare", "supabase", "neon", "linear", "stripe",
  "openai", "runway", "globalping"]).annotate({ identifier: "CapabilitySetup.Provider" })
// verified: a fixed identity endpoint returned the account/user the key belongs to.
// credential-only: the provider has no identity endpoint for this key type; only key validity was observed.
export const Verification = Schema.Literals(["verified", "credential-only"]).annotate({ identifier: "CapabilitySetup.Verification" })
export type Provider = typeof Provider.Type
export const Label = Schema.String.check(Schema.isMaxLength(128)).annotate({ identifier: "CapabilitySetup.Label" })
export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({ provider: Provider,
  key: Schema.NonEmptyString.check(Schema.isMaxLength(4096)), label: optional(Label) })
  .annotate({ identifier: "CapabilitySetup.Input", parseOptions: { onExcessProperty: "error" } }).pipe(Schema.redact)
export interface Result extends Schema.Schema.Type<typeof Result> {}
export type Verification = typeof Verification.Type
export const Result = Schema.Struct({ connection: Capability.ConnectionRef, verification: Verification })
  .annotate({ identifier: "CapabilitySetup.Result" })
