export * as ActivityEmpty from "./activity-empty"

import { Schema } from "effect"
import { ActivityArm } from "./activity-arm"
import { NonNegativeInt } from "./schema"

const previewID = Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/))
const Target = Schema.Struct({
  ...ActivityArm.Target.fields,
  originalPath: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
})
export const Request = Schema.Struct({})
export const Confirm = Schema.Struct({ previewID })
export type Confirm = typeof Confirm.Type
export const Preview = Schema.Struct({
  previewID,
  action: Schema.Literal("empty-quarantine"),
  expiresAt: NonNegativeInt,
  targets: Schema.Array(Target).check(Schema.isMinLength(1), Schema.isMaxLength(ActivityArm.maxTargets)),
})
export type Preview = typeof Preview.Type
export const Outcome = Schema.Literals(["Verified", "Refused", "Unknown"])
export type Outcome = typeof Outcome.Type
export const Receipt = Schema.Struct({
  previewID,
  outcome: Outcome,
  targets: Schema.Array(ActivityArm.Binding).check(Schema.isMinLength(1), Schema.isMaxLength(ActivityArm.maxTargets)),
})
export type Receipt = typeof Receipt.Type

export const decodeRequest = Schema.decodeUnknownOption(Request, { onExcessProperty: "error" })
export const decodeConfirm = Schema.decodeUnknownOption(Confirm, { onExcessProperty: "error" })
export const decodePreview = Schema.decodeUnknownOption(Preview, { onExcessProperty: "error" })
export const decodeReceipt = Schema.decodeUnknownOption(Receipt, { onExcessProperty: "error" })
