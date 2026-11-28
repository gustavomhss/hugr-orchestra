export * as ActivityStop from "./activity-stop"

import { Schema } from "effect"
import { ActivityArm } from "./activity-arm"
import { NonNegativeInt } from "./schema"

const id = Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/))
const member = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,9}:[1-9][0-9]{0,19}$/))
const members = Schema.Array(member).check(Schema.isMinLength(1), Schema.isMaxLength(256))
const treeID = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160))

export const Request = Schema.Struct({ recordID: id })
export type Request = typeof Request.Type
export const Confirm = Schema.Struct({ previewID: id })
export type Confirm = typeof Confirm.Type
export const Preview = Schema.Struct({
  previewID: id,
  action: Schema.Literal("stop-tree"),
  expiresAt: NonNegativeInt,
  target: ActivityArm.Target,
  treeID,
  members,
})
export type Preview = typeof Preview.Type
export const Receipt = Schema.Struct({
  previewID: id,
  target: ActivityArm.Target,
  treeID,
  outcomes: Schema.Array(Schema.Struct({ member, state: Schema.Literals(["exited", "unknown"]) }))
    .check(Schema.isMinLength(1), Schema.isMaxLength(256)),
})
export type Receipt = typeof Receipt.Type

export const decodeRequest = Schema.decodeUnknownOption(Request, { onExcessProperty: "error" })
export const decodeConfirm = Schema.decodeUnknownOption(Confirm, { onExcessProperty: "error" })
export const decodePreview = Schema.decodeUnknownOption(Preview, { onExcessProperty: "error" })
export const decodeReceipt = Schema.decodeUnknownOption(Receipt, { onExcessProperty: "error" })
