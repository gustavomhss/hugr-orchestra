import { Schema } from "effect"
import { BindingID } from "./identity"
import { optional, PositiveInt } from "../schema"

export const ResourceKind = Schema.Literals([
  "artifacts", "environments", "deployments", "variables", "runners", "caches", "schedules",
  "triggers", "secureFiles", "resourceGroups", "pipelineVariables", "testReports", "policy",
]).annotate({ identifier: "Actions.ResourceKind" })
export type ResourceKind = typeof ResourceKind.Type

export const Resource = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  kind: ResourceKind,
  name: Schema.String,
  scope: optional(Schema.String),
  owner: optional(Schema.String),
  status: optional(Schema.String),
  sensitive: optional(Schema.Boolean),
  // Provider details are JSON, not unrestricted runtime values. Adapters redact sensitive fields.
  data: Schema.Json,
}).annotate({ identifier: "Actions.Resource" })
export interface Resource extends Schema.Schema.Type<typeof Resource> {}

export const ResourceListInput = Schema.Struct({
  kind: ResourceKind,
  runID: optional(Schema.String),
  resourceID: optional(Schema.String),
  scope: optional(Schema.String),
  ref: optional(Schema.String),
  query: optional(Schema.String),
  cursor: optional(Schema.String),
  limit: optional(PositiveInt),
}).annotate({ identifier: "Actions.ResourceListInput" })
export interface ResourceListInput extends Schema.Schema.Type<typeof ResourceListInput> {}

export const ResourcePage = Schema.Struct({
  items: Schema.Array(Resource), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.ResourcePage" })
export interface ResourcePage extends Schema.Schema.Type<typeof ResourcePage> {}

export const TransferInput = Schema.Struct({
  kind: Schema.Literals(["jobLog", "runLog", "artifact", "secureFile"]),
  id: Schema.NonEmptyString,
  runID: optional(Schema.String),
  attempt: optional(PositiveInt),
  path: optional(Schema.String),
}).annotate({ identifier: "Actions.TransferInput" })
export interface TransferInput extends Schema.Schema.Type<typeof TransferInput> {}

export const TransferInfo = Schema.Struct({
  filename: Schema.String,
  contentType: Schema.String,
  size: optional(Schema.Number),
  digest: optional(Schema.String),
}).annotate({ identifier: "Actions.TransferInfo" })
export interface TransferInfo extends Schema.Schema.Type<typeof TransferInfo> {}
