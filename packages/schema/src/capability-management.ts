export * as CapabilityManagement from "./capability-management"

import { Schema } from "effect"
import { Capability } from "./capability"
import { SessionID } from "./session-id"

export const Connection = Schema.Struct({ connection: Capability.ConnectionRef,
  state: Schema.Literals(["active", "disconnected", "revoked"]), credential: Schema.Literals(["present", "missing"]) })
export const Target = Schema.Struct({ target: Capability.TargetRef })
export const TargetCursor = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{32,2048}(?![\s\S])/))
  .annotate({ identifier: "CapabilityManagement.TargetCursor" })
export const ConnectionPage = Schema.Struct({ items: Schema.Array(Connection),
  after: Schema.optionalKey(Capability.ConnectionID), coverage: Schema.Literal("live") })
export const TargetPage = Schema.Struct({ items: Schema.Array(Target),
  after: Schema.optionalKey(TargetCursor), coverage: Schema.Literal("live") })
export const ConnectionQuery = Schema.Struct({ after: Schema.optionalKey(Capability.ConnectionID),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
export const TargetQuery = Schema.Struct({ after: Schema.optionalKey(TargetCursor),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))) })
export const TargetInput = Schema.Struct({ environment: Schema.NonEmptyString, resource: Schema.Json })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const BindingInput = Schema.Struct({ sessionID: SessionID, actions: Schema.Array(Schema.NonEmptyString)
  .check(Schema.isMinLength(1), Schema.isMaxLength(32)) }).annotate({ parseOptions: { onExcessProperty: "error" } })
export const DisconnectInput = Schema.Struct({ connection: Capability.ConnectionRef })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const CreateTargetInput = Schema.Struct({ connection: Capability.ConnectionRef, input: TargetInput })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const RetargetInput = Schema.Struct({ target: Capability.TargetRef, input: TargetInput })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const RemoveTargetInput = Schema.Struct({ target: Capability.TargetRef })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const PutBindingInput = Schema.Struct({ target: Capability.TargetRef, input: BindingInput })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const RemoveBindingInput = Schema.Struct({ target: Capability.TargetRef, sessionID: SessionID })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export const Receipt = Schema.Struct({ requestID: Schema.String, reused: Schema.Boolean, data: Schema.Json })
