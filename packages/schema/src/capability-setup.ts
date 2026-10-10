export * as CapabilitySetup from "./capability-setup"

import { Schema } from "effect"
import { Capability } from "./capability"
import { optional } from "./schema"

export const Provider = Schema.Literals(["slack", "discord"]).annotate({ identifier: "CapabilitySetup.Provider" })
export type Provider = typeof Provider.Type
export const Label = Schema.String.check(Schema.isMaxLength(128)).annotate({ identifier: "CapabilitySetup.Label" })
export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({ provider: Provider,
  key: Schema.NonEmptyString.check(Schema.isMaxLength(4096)), label: optional(Label) })
  .annotate({ identifier: "CapabilitySetup.Input", parseOptions: { onExcessProperty: "error" } }).pipe(Schema.redact)
export interface Result extends Schema.Schema.Type<typeof Result> {}
export const Result = Schema.Struct({ connection: Capability.ConnectionRef, verification: Schema.Literal("verified") })
  .annotate({ identifier: "CapabilitySetup.Result" })
