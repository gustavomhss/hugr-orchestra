export * as ActivityArm from "./activity-arm"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"

export const maxTargets = 16
const token = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,160}$/))
const generation = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,99}$/))
const label = Schema.String.check(Schema.isMaxLength(384))
const selected = <A extends Schema.Constraint>(row: A) =>
  Schema.Array(row).check(Schema.isMinLength(1), Schema.isMaxLength(maxTargets))

export const Binding = Schema.Struct({ targetID: token, generation })
export type Binding = typeof Binding.Type
export const Request = Schema.Struct({ targets: selected(Binding) })
export type Request = typeof Request.Type

export const Target = Schema.Struct({ targetID: token, generation, label, owner: label })
export type Target = typeof Target.Type
export const Preview = Schema.Struct({
  previewID: token,
  action: Schema.Literal("arm-quarantine"),
  expiresAt: NonNegativeInt,
  targets: selected(Target),
})
export type Preview = typeof Preview.Type

export const Confirm = Schema.Struct({ previewID: token })
export type Confirm = typeof Confirm.Type
export const Receipt = Schema.Struct({
  approvalID: token,
  action: Schema.Literal("arm-quarantine"),
  approvedAt: NonNegativeInt,
  targets: selected(Target),
})
export type Receipt = typeof Receipt.Type

export const decodeRequest = Schema.decodeUnknownOption(Request, { onExcessProperty: "error" })
export const decodeConfirm = Schema.decodeUnknownOption(Confirm, { onExcessProperty: "error" })
export const decodePreview = Schema.decodeUnknownOption(Preview, { onExcessProperty: "error" })
export const decodeReceipt = Schema.decodeUnknownOption(Receipt, { onExcessProperty: "error" })
