export * as ActivityFreeze from "./activity-freeze"

import { Schema } from "effect"
import { ActivityArm } from "./activity-arm"
import { NonNegativeInt } from "./schema"

const id = Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/))
const treeID = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160))
const member = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,9}:[1-9][0-9]{0,19}$/))
const Action = Schema.Literals(["suspend", "resume"])
export type Action = typeof Action.Type
export const Read = Schema.Struct({ recordID: id })
export type Read = typeof Read.Type
export const State = Schema.Struct({
  recordID: id,
  treeID,
  member,
  next: Schema.Literals(["suspend", "resume", "blocked"]),
})
export type State = typeof State.Type

export const Request = Schema.Struct({ recordID: id, action: Action })
export type Request = typeof Request.Type
export const Confirm = Schema.Struct({ previewID: id })
export type Confirm = typeof Confirm.Type
export const Preview = Schema.Struct({ previewID: id, action: Action, expiresAt: NonNegativeInt, target: ActivityArm.Target, treeID, member })
export type Preview = typeof Preview.Type
export const Receipt = Schema.Struct({
  previewID: id,
  target: ActivityArm.Binding,
  treeID,
  member,
  action: Action,
  markID: id,
  phase: Schema.Literals(["suspended", "partial", "resumed", "refused", "unknown"]),
})
export type Receipt = typeof Receipt.Type

export const decodeRead = Schema.decodeUnknownOption(Read, { onExcessProperty: "error" })
export const decodeState = Schema.decodeUnknownOption(State, { onExcessProperty: "error" })
export const decodeRequest = Schema.decodeUnknownOption(Request, { onExcessProperty: "error" })
export const decodeConfirm = Schema.decodeUnknownOption(Confirm, { onExcessProperty: "error" })
export const decodePreview = Schema.decodeUnknownOption(Preview, { onExcessProperty: "error" })
export const decodeReceipt = Schema.decodeUnknownOption(Receipt, { onExcessProperty: "error" })
