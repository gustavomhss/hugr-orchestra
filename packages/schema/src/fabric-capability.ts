export * as FabricCapability from "./fabric-capability"

import { Schema } from "effect"

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  id: Schema.NonEmptyString,
  revision: Schema.NonEmptyString,
}).annotate({ identifier: "FabricCapability.Ref", parseOptions: { onExcessProperty: "error" } })

// These are observation labels, not execution permission or proof that an adapter is qualified.
export const Availability = Schema.Literals([
  "disabled",
  "not-installed",
  "authentication-required",
  "denied",
  "unsupported",
  "unverified",
  "ready",
  "degraded",
]).annotate({ identifier: "FabricCapability.Availability" })
export type Availability = typeof Availability.Type
