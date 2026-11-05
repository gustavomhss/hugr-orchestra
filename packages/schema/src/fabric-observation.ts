export * as FabricObservation from "./fabric-observation"

import { Schema } from "effect"
import { FabricCapability } from "./fabric-capability"
import { FabricContext } from "./fabric-context"
import { FabricResource } from "./fabric-resource"
import { NonNegativeInt, optional } from "./schema"

export const EvidenceKind = Schema.Literals(["provider", "extracted", "inferred", "user", "unknown"]).annotate({
  identifier: "FabricObservation.EvidenceKind",
})
export type EvidenceKind = typeof EvidenceKind.Type

export const EvidenceMode = Schema.Literals(["real", "fixture", "demo", "documentation"]).annotate({
  identifier: "FabricObservation.EvidenceMode",
})
export type EvidenceMode = typeof EvidenceMode.Type

export interface Meta extends Schema.Schema.Type<typeof Meta> {}
export const Meta = Schema.Struct({
  context: FabricContext.Ref,
  scope: FabricResource.Scope,
  capability: FabricCapability.Ref,
  identityFingerprint: Schema.NonEmptyString,
  permissionEpoch: NonNegativeInt,
  observedAt: NonNegativeInt,
  complete: Schema.Boolean,
  mode: EvidenceMode,
  providerRevision: optional(Schema.NonEmptyString),
}).annotate({ identifier: "FabricObservation.Meta", parseOptions: { onExcessProperty: "error" } })

export interface Problem extends Schema.Schema.Type<typeof Problem> {}
export const Problem = Schema.Struct({
  code: Schema.Literals([
    "invalid-input",
    "conflict",
    "denied",
    "authentication-required",
    "unsupported",
    "unverified",
    "limit",
    "throttled",
    "offline",
    "expired",
    "unknown",
    "incompatible-version",
    "unavailable",
  ]),
  retry: Schema.Literals(["never", "read-after", "deliberate-action", "reconcile"]),
  messageKey: Schema.NonEmptyString,
  retryAfterMillis: optional(NonNegativeInt),
}).annotate({ identifier: "FabricObservation.Problem", parseOptions: { onExcessProperty: "error" } })
