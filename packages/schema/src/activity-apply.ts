export * as ActivityApply from "./activity-apply"

import { Schema } from "effect"
import { ActivityArm } from "./activity-arm"
import { NonNegativeInt } from "./schema"

export const maxResults = 128
const token = ActivityArm.Binding.fields.targetID
const outcome = Schema.Literals(["Out", "Refused", "Unknown"])
const destination = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096))

export const Request = Schema.Struct({ approvalID: token, ...ActivityArm.Binding.fields })
export type Request = typeof Request.Type

export const Confirm = Schema.Struct({ previewID: token })
export type Confirm = typeof Confirm.Type

export const Preview = Schema.Struct({
  previewID: token,
  action: Schema.Literal("apply-quarantine"),
  expiresAt: NonNegativeInt,
  approvalID: token,
  target: ActivityArm.Target,
  destination,
})
export type Preview = typeof Preview.Type

export const Result = Schema.Struct({ ...Request.fields, outcome })
export type Result = typeof Result.Type

export const Receipt = Schema.Struct({ previewID: token, ...Result.fields })
export type Receipt = typeof Receipt.Type

export const State = Schema.Struct({
  available: Schema.Boolean,
  eligible: Schema.Array(Request).check(Schema.isMaxLength(ActivityArm.maxTargets)),
  results: Schema.Array(Result).check(Schema.isMaxLength(maxResults)),
  partial: Schema.Boolean,
})
export type State = typeof State.Type

const strict = { onExcessProperty: "error" } as const
export const decodeRequest = Schema.decodeUnknownOption(Request, strict)
export const decodeConfirm = Schema.decodeUnknownOption(Confirm, strict)
export const decodePreview = Schema.decodeUnknownOption(Preview, strict)
export const decodeReceipt = Schema.decodeUnknownOption(Receipt, strict)
export const decodeState = Schema.decodeUnknownOption(State, strict)
