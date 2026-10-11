export * as ResearchEvent from "./research-event"

import { Schema } from "effect"
import { Event } from "./event"
import { Research } from "./research"
import { SessionID } from "./session-id"
import { NonNegativeInt } from "./schema"

const operation = {
  sessionID: SessionID,
  operation: Schema.NonEmptyString,
  inputHash: Research.Digest,
  binding: Research.Binding,
}

export const SourceAdmitted = Event.define({
  type: "research.source.admitted",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, receipt: Research.SourceReceipt },
})
export const SourceAttempted = Event.define({
  type: "research.source.attempted",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, receipt: Research.AttemptReceipt },
})
export const SourceRequested = Event.define({
  type: "research.source.requested",
  durable: { version: 1, aggregate: "sessionID" },
  schema: operation,
})
export const RecordCommitted = Event.define({
  type: "research.record.committed",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, record: Research.Record },
})
export const DocumentPublished = Event.define({
  type: "research.document.published",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, receipt: Research.DocumentReceipt },
})
export const AllowanceBound = Event.define({
  type: "research.allowance.bound",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { sessionID: SessionID, allowance: Research.Allowance },
})
export const AllowanceCharged = Event.define({
  type: "research.allowance.charged",
  durable: { version: 1, aggregate: "sessionID" },
  schema: {
    sessionID: SessionID, dispatchCallID: Schema.NonEmptyString, operation: Schema.NonEmptyString,
    kind: Schema.Literals(["provider", "tool", "bytes"]), amount: NonNegativeInt,
  },
})
export const Definitions = Event.inventory(SourceAdmitted, SourceRequested, SourceAttempted, RecordCommitted, DocumentPublished, AllowanceBound, AllowanceCharged)
