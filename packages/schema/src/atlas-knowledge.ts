export * as AtlasKnowledge from "./atlas-knowledge"

import { Schema } from "effect"
import { ProjectID } from "./project-id"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

const closed = { parseOptions: { onExcessProperty: "error" } } as const
export const MAX_UNITS = 8
export const MAX_BYTES = 128 * 1024

export const UnitID = Schema.String.check(
  Schema.isMinLength(1), Schema.isMaxLength(256), Schema.isPattern(/^[^\u0000]+$/),
).annotate({ identifier: "AtlasKnowledge.UnitID" })
export type UnitID = typeof UnitID.Type

export const Reference = Schema.String.check(
  Schema.isMinLength(64), Schema.isMaxLength(64), Schema.isPattern(/^[0-9a-f]{64}$/),
)
  .annotate({ identifier: "AtlasKnowledge.Reference" })
export type Reference = typeof Reference.Type

// A proposed work identity, not a durable Task or execution authorization.
export const Target = Schema.Struct({
  kind: Schema.Literals(["assignment", "work-package"]),
  id: UnitID,
}).annotate({ identifier: "AtlasKnowledge.Target", ...closed })
export interface Target extends Schema.Schema.Type<typeof Target> {}

export const Unit = Schema.Struct({
  unit: UnitID,
  name: Schema.NonEmptyString,
  sourceIdentity: Reference,
  sourceRevision: Schema.NonEmptyString,
  contentHash: Reference,
  receiptHash: Reference,
  bodyHash: Reference,
  content: Schema.String,
}).annotate({ identifier: "AtlasKnowledge.Unit", ...closed })
export interface Unit extends Schema.Schema.Type<typeof Unit> {}

// Host-produced tool metadata binds Archie's selection to its actual invocation.
export const Anchor = Schema.Struct({
  reference: Reference,
  projectID: ProjectID,
  authorSessionID: SessionID,
  assistantMessageID: SessionMessage.ID,
  callID: Schema.NonEmptyString,
  memberID: Schema.Literal("archie"),
  target: Target,
  units: Schema.Array(Unit).check(Schema.isMinLength(1), Schema.isMaxLength(MAX_UNITS)),
}).annotate({ identifier: "AtlasKnowledge.Anchor", ...closed })
export interface Anchor extends Schema.Schema.Type<typeof Anchor> {}
