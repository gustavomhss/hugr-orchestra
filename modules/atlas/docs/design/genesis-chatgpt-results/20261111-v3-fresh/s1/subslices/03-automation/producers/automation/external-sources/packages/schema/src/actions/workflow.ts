import { Schema } from "effect"
import { BindingID } from "./identity"
import { optional, PositiveInt } from "../schema"

export const InputDefinition = Schema.Struct({
  name: Schema.NonEmptyString,
  description: optional(Schema.String),
  type: Schema.Literals(["string", "boolean", "number", "choice", "environment", "file", "array"]),
  required: Schema.Boolean,
  default: optional(Schema.Json),
  options: optional(Schema.Array(Schema.Union([Schema.String, Schema.Boolean, Schema.Number]))),
}).annotate({ identifier: "Actions.InputDefinition" })
export interface InputDefinition extends Schema.Schema.Type<typeof InputDefinition> {}

export const Workflow = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  name: Schema.NullOr(Schema.String),
  path: Schema.String,
  defaultRef: optional(Schema.NonEmptyString),
  state: Schema.String,
  dispatchable: Schema.Boolean,
  dispatchState: optional(Schema.Literals(["available", "unavailable", "unknown"])),
  inputs: optional(Schema.Array(InputDefinition)),
  triggers: optional(Schema.Array(Schema.String)),
  updatedAt: optional(Schema.String),
}).annotate({ identifier: "Actions.Workflow" })
export interface Workflow extends Schema.Schema.Type<typeof Workflow> {}

export const SourceBase = Schema.Struct({
  bindingID: BindingID,
  ref: Schema.NonEmptyString,
  commit: Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)),
}).annotate({ identifier: "Actions.SourceBase" })
export interface SourceBase extends Schema.Schema.Type<typeof SourceBase> {}

export const Source = Schema.Struct({
  bindingID: BindingID,
  path: Schema.NonEmptyString,
  ref: Schema.NonEmptyString,
  commit: optional(Schema.String),
  version: Schema.NonEmptyString,
  text: Schema.String,
  editable: Schema.Boolean,
  includes: optional(Schema.Array(Schema.String)),
  diagnostics: optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "Actions.Source" })
export interface Source extends Schema.Schema.Type<typeof Source> {}

export const GraphStep = Schema.Struct({
  name: Schema.String,
  uses: optional(Schema.String),
  run: optional(Schema.String),
  condition: optional(Schema.String),
}).annotate({ identifier: "Actions.GraphStep" })
export interface GraphStep extends Schema.Schema.Type<typeof GraphStep> {}

export const GraphJob = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
  needs: Schema.Array(Schema.String),
  stage: optional(Schema.String),
  condition: optional(Schema.String),
  runner: optional(Schema.Json),
  matrix: optional(Schema.Json),
  reusable: optional(Schema.String),
  configuration: optional(Schema.Json),
  steps: Schema.Array(GraphStep),
}).annotate({ identifier: "Actions.GraphJob" })
export interface GraphJob extends Schema.Schema.Type<typeof GraphJob> {}

export const Graph = Schema.Struct({
  source: Source,
  state: Schema.Literals(["complete", "partial", "unresolved"]),
  jobs: Schema.Array(GraphJob),
  diagnostics: Schema.Array(Schema.String),
  triggers: optional(Schema.Json),
  stages: optional(Schema.Array(Schema.String)),
  includes: optional(Schema.Json),
  inputs: optional(Schema.Array(InputDefinition)),
  header: optional(Schema.Json),
}).annotate({ identifier: "Actions.Graph" })
export interface Graph extends Schema.Schema.Type<typeof Graph> {}

export const ListInput = Schema.Struct({
  cursor: optional(Schema.String),
  limit: optional(PositiveInt),
  query: optional(Schema.String),
  state: optional(Schema.String),
}).annotate({ identifier: "Actions.ListInput" })
export interface ListInput extends Schema.Schema.Type<typeof ListInput> {}

export const WorkflowPage = Schema.Struct({
  items: Schema.Array(Workflow), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.WorkflowPage" })
export interface WorkflowPage extends Schema.Schema.Type<typeof WorkflowPage> {}
