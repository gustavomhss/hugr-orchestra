import { Schema } from "effect"
import { descending } from "../identifier"
import { optional, PositiveInt, statics } from "../schema"

export const ProviderKind = Schema.Literals(["github", "gitlab"]).annotate({ identifier: "Actions.ProviderKind" })
export type ProviderKind = typeof ProviderKind.Type

export const BindingID = Schema.String.check(Schema.isStartsWith("ab_")).annotate({ identifier: "Actions.BindingID" }).pipe(
  Schema.brand("Actions.BindingID"),
  statics((schema) => ({ create: () => schema.make(`ab_${descending()}`) })),
)
export type BindingID = typeof BindingID.Type

export const OperationID = Schema.String.check(Schema.isStartsWith("aop_")).annotate({ identifier: "Actions.OperationID" }).pipe(
  Schema.brand("Actions.OperationID"),
  statics((schema) => ({ create: () => schema.make(`aop_${descending()}`) })),
)
export type OperationID = typeof OperationID.Type

export const Provider = Schema.Struct({
  kind: ProviderKind,
  hostname: Schema.NonEmptyString,
  apiOrigin: Schema.NonEmptyString,
  version: optional(Schema.String),
}).annotate({ identifier: "Actions.Provider" })
export interface Provider extends Schema.Schema.Type<typeof Provider> {}

export const BindingInput = Schema.Struct({
  remote: Schema.NonEmptyString,
  provider: Provider,
  projectPath: Schema.NonEmptyString,
  expectedRevision: optional(PositiveInt),
}).annotate({ identifier: "Actions.BindingInput" })
export interface BindingInput extends Schema.Schema.Type<typeof BindingInput> {}

export const Binding = Schema.Struct({
  id: BindingID,
  revision: PositiveInt,
  remote: Schema.NonEmptyString,
  provider: Provider,
  projectID: Schema.NonEmptyString,
  projectPath: Schema.NonEmptyString,
  account: optional(Schema.String),
  directory: Schema.NonEmptyString,
  workspaceID: optional(Schema.String),
}).annotate({ identifier: "Actions.Binding" })
export interface Binding extends Schema.Schema.Type<typeof Binding> {}

export const BindingRef = Schema.Struct({ id: BindingID, revision: PositiveInt })
  .annotate({ identifier: "Actions.BindingRef" })
export interface BindingRef extends Schema.Schema.Type<typeof BindingRef> {}

export const Capability = Schema.Struct({
  operation: Schema.NonEmptyString,
  state: Schema.Literals(["available", "unavailable", "unknown"]),
  reason: optional(Schema.String),
  scope: optional(Schema.String),
  observedAt: Schema.Number,
}).annotate({ identifier: "Actions.Capability" })
export interface Capability extends Schema.Schema.Type<typeof Capability> {}

export const ErrorKind = Schema.Literals([
  "binding_missing", "binding_stale", "host_mismatch", "cli_missing", "not_authenticated",
  "permission_denied", "capability_unavailable", "not_found", "invalid_input", "source_conflict",
  "source_unresolved", "rate_limited", "metadata_truncated", "transport_failed", "transfer_failed",
  "outcome_unknown", "operation_missing", "operation_expired", "operation_reused", "intent_conflict",
  "maintenance_required",
]).annotate({ identifier: "Actions.ErrorKind" })
export type ErrorKind = typeof ErrorKind.Type

export const SendDisposition = Schema.Literals(["definitely_unsent", "definitely_rejected", "unknown"])
  .annotate({ identifier: "Actions.SendDisposition" })
export type SendDisposition = typeof SendDisposition.Type

export const ErrorData = Schema.Struct({
  kind: ErrorKind,
  message: Schema.String,
  bindingID: optional(BindingID),
  provider: optional(ProviderKind),
  resourceID: optional(Schema.String),
  retryAfter: optional(Schema.Number),
  operationID: optional(OperationID),
  disposition: optional(SendDisposition),
}).annotate({ identifier: "Actions.ErrorData" })
export interface ErrorData extends Schema.Schema.Type<typeof ErrorData> {}

export const Policy = Schema.Struct({ retentionDays: optional(PositiveInt), execution: optional(Schema.String) })
  .annotate({ identifier: "Actions.Policy" })
export interface Policy extends Schema.Schema.Type<typeof Policy> {}

export const PolicyState = Schema.Struct({ binding: BindingRef, policy: Policy })
  .annotate({ identifier: "Actions.PolicyState" })
export interface PolicyState extends Schema.Schema.Type<typeof PolicyState> {}
