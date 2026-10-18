import { Schema } from "effect"
import { BindingID } from "./identity"
import { optional, PositiveInt } from "../schema"

export const Run = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  workflowID: Schema.NonEmptyString,
  name: Schema.NullOr(Schema.String),
  ref: Schema.NullOr(Schema.String),
  commit: Schema.String,
  event: Schema.String,
  actor: optional(Schema.String),
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  attempt: optional(PositiveInt),
  createdAt: optional(Schema.String),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
  updatedAt: optional(Schema.String),
  triggeringActor: optional(Schema.String),
  repositoryID: optional(Schema.String),
  duration: optional(Schema.Number),
  parentID: optional(Schema.String),
  url: optional(Schema.String),
}).annotate({ identifier: "Actions.Run" })
export interface Run extends Schema.Schema.Type<typeof Run> {}

export const Step = Schema.Struct({
  number: Schema.Number,
  name: Schema.String,
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
}).annotate({ identifier: "Actions.Step" })
export interface Step extends Schema.Schema.Type<typeof Step> {}

export const Job = Schema.Struct({
  id: Schema.NonEmptyString,
  bindingID: BindingID,
  runID: Schema.NonEmptyString,
  name: Schema.String,
  status: Schema.NullOr(Schema.String),
  conclusion: optional(Schema.NullOr(Schema.String)),
  definitionID: optional(Schema.String),
  runner: optional(Schema.String),
  runnerID: optional(Schema.String),
  runnerLabels: optional(Schema.Array(Schema.String)),
  runnerGroupID: optional(Schema.String),
  attempt: optional(PositiveInt),
  startedAt: optional(Schema.String),
  finishedAt: optional(Schema.String),
  downstreamID: optional(Schema.String),
  downstreamProjectID: optional(Schema.String),
  kind: optional(Schema.Literals(["job", "bridge"])),
  stage: optional(Schema.String),
  retried: optional(Schema.Boolean),
  retryOf: optional(Schema.String),
  allowFailure: optional(Schema.Boolean),
  steps: Schema.Array(Step),
}).annotate({ identifier: "Actions.Job" })
export interface Job extends Schema.Schema.Type<typeof Job> {}

export const RunListInput = Schema.Struct({
  workflowID: optional(Schema.String), cursor: optional(Schema.String), limit: optional(PositiveInt),
  ref: optional(Schema.String), event: optional(Schema.String), status: optional(Schema.String),
  commit: optional(Schema.String), actor: optional(Schema.String), created: optional(Schema.String),
  createdAfter: optional(Schema.String), createdBefore: optional(Schema.String),
  updatedAfter: optional(Schema.String), updatedBefore: optional(Schema.String),
}).annotate({ identifier: "Actions.RunListInput" })
export interface RunListInput extends Schema.Schema.Type<typeof RunListInput> {}

export const RunPage = Schema.Struct({
  items: Schema.Array(Run), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.RunPage" })
export interface RunPage extends Schema.Schema.Type<typeof RunPage> {}

export const JobPage = Schema.Struct({
  items: Schema.Array(Job), next: optional(Schema.String), total: optional(Schema.Number), capturedAt: Schema.Number,
}).annotate({ identifier: "Actions.JobPage" })
export interface JobPage extends Schema.Schema.Type<typeof JobPage> {}
