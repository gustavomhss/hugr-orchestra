export * as CapabilityArtifactManagement from "./capability-artifact-management"

import { Schema } from "effect"
import { Capability } from "./capability"
import { SessionID } from "./session-id"

// Operator projection only: owner, producer and user metadata stay host-private.
export interface Artifact extends Schema.Schema.Type<typeof Artifact> {}
export const Artifact = Schema.Struct({
  artifact: Capability.ArtifactRef,
  mime: Schema.String,
  kind: Schema.String,
  hash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/)),
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  verification: Capability.Verification,
  timeCreated: Schema.Int,
  pinned: Schema.Boolean,
}).annotate({ identifier: "CapabilityArtifactManagement.Artifact" })

// `<artifactID>:<revision>` of the last returned item; it never names an item the page omitted.
export const ArtifactCursor = Schema.String.check(Schema.isPattern(/^cart_[0-9A-Za-z]{26}:(0|[1-9][0-9]{0,15})(?![\s\S])/))
  .annotate({ identifier: "CapabilityArtifactManagement.ArtifactCursor" })
export const ArtifactQuery = Schema.Struct({ after: Schema.optionalKey(ArtifactCursor),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
export interface ArtifactPage extends Schema.Schema.Type<typeof ArtifactPage> {}
export const ArtifactPage = Schema.Struct({ items: Schema.Array(Artifact), after: Schema.optionalKey(ArtifactCursor),
  coverage: Schema.Literal("live") }).annotate({ identifier: "CapabilityArtifactManagement.ArtifactPage" })

export const ShareInput = Schema.Struct({ targetSessionID: SessionID })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const PinInput = Schema.Struct({ pinned: Schema.Boolean })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
