export * as ActivityArm from "./activity-arm"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"

export const maxTargets = 16
const token = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,160}$/))
const generation = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,99}$/))
const label = Schema.String.check(Schema.isMaxLength(384))
export const Binding = Schema.Struct({ targetID: token, generation })
export type Binding = typeof Binding.Type
export const Request = Schema.Struct({
  targets: Schema.Array(Binding).check(Schema.isMinLength(1), Schema.isMaxLength(maxTargets)),
})
export type Request = typeof Request.Type

export const Target = Schema.Struct({ targetID: token, generation, label, owner: label })
  .annotate({ identifier: "ActivityArm.Target" })
export type Target = typeof Target.Type
const selectedTargets = Schema.Array(Target).check(Schema.isMinLength(1), Schema.isMaxLength(maxTargets))
export const Preview = Schema.Struct({
  previewID: token,
  action: Schema.Literal("arm-quarantine"),
  expiresAt: NonNegativeInt,
  targets: selectedTargets,
})
export type Preview = typeof Preview.Type

export const Confirm = Schema.Struct({ previewID: token })
export type Confirm = typeof Confirm.Type
export const Receipt = Schema.Struct({
  approvalID: token,
  action: Schema.Literal("arm-quarantine"),
  approvedAt: NonNegativeInt,
  targets: selectedTargets,
}).annotate({ identifier: "ActivityArm.Receipt" })
export type Receipt = typeof Receipt.Type

export const PlanSnapshot = Schema.Struct({
  ready: Schema.Array(Target),
  approvals: Schema.Array(Schema.Struct({ receipt: Receipt, changed: Schema.Boolean })),
  partial: Schema.Boolean,
}).annotate({ identifier: "ActivityArm.PlanSnapshot" })
export type PlanSnapshot = typeof PlanSnapshot.Type

export const decodeRequest = Schema.decodeUnknownOption(Request, { onExcessProperty: "error" })
export const decodeConfirm = Schema.decodeUnknownOption(Confirm, { onExcessProperty: "error" })
export const decodePreview = Schema.decodeUnknownOption(Preview, { onExcessProperty: "error" })
export const decodeReceipt = Schema.decodeUnknownOption(Receipt, { onExcessProperty: "error" })
