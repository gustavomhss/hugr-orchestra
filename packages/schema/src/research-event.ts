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
// One dispatch's inquiry (J5.1): opened over its question records, each check, and the close that carries the card.
export const InquiryOpened = Event.define({
  type: "research.inquiry.opened",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, ...Research.InquiryOpened.fields },
})
export const InquiryChecked = Event.define({
  type: "research.inquiry.checked",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, ...Research.InquiryChecked.fields },
})
export const InquiryClosed = Event.define({
  type: "research.inquiry.closed",
  durable: { version: 1, aggregate: "sessionID" },
  schema: { ...operation, ...Research.InquiryClosed.fields },
})
export const Definitions = Event.inventory(SourceAdmitted, SourceRequested, SourceAttempted, RecordCommitted, DocumentPublished,
  AllowanceBound, AllowanceCharged, InquiryOpened, InquiryChecked, InquiryClosed)
