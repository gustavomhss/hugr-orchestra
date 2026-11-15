import { Schema } from "effect"
import { BindingID, BindingRef, OperationID } from "./identity"
import { ResourceKind } from "./resource"
import { optional, PositiveInt } from "../schema"

export const OperationKind = Schema.Literals([
  "workflow.dispatch", "workflow.enable", "workflow.disable", "run.retry", "run.retryFailed",
  "run.cancel", "run.forceCancel", "run.delete", "run.approveFork", "run.rename", "job.retry",
  "job.play", "job.cancel", "job.erase", "logs.delete", "source.branch", "source.write", "source.delete", "source.review",
  "resource.create", "resource.update", "resource.delete", "artifact.keep", "deployment.review",
  "environment.stop", "runner.register", "runner.assign", "runner.remove", "cache.clear",
  "schedule.play", "schedule.takeOwnership", "pipeline.mergeRequest", "pipeline.trigger",
  "secureFile.upload", "resourceGroup.processMode",
]).annotate({ identifier: "Actions.OperationKind" })
export type OperationKind = typeof OperationKind.Type

// Admission stores identity and optimistic preconditions, never a mutation's values.
export const OperationTarget = Schema.Struct({
  workflowID: optional(Schema.NonEmptyString),
  runID: optional(Schema.NonEmptyString),
  jobID: optional(Schema.NonEmptyString),
  resourceID: optional(Schema.NonEmptyString),
  resourceKind: optional(ResourceKind),
  scope: optional(Schema.String),
  path: optional(Schema.NonEmptyString),
  ref: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Actions.OperationTarget" })
export interface OperationTarget extends Schema.Schema.Type<typeof OperationTarget> {}

export const OperationExpected = Schema.Struct({
  sourceVersion: optional(Schema.NonEmptyString),
  commit: optional(Schema.NonEmptyString),
  attempt: optional(PositiveInt),
  resourceVersion: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Actions.OperationExpected" })
export interface OperationExpected extends Schema.Schema.Type<typeof OperationExpected> {}

export const OperationIntent = Schema.Struct({
  clientID: Schema.NonEmptyString,
  binding: BindingRef,
  kind: OperationKind,
  target: OperationTarget,
  expected: optional(OperationExpected),
}).annotate({ identifier: "Actions.OperationIntent" })
export interface OperationIntent extends Schema.Schema.Type<typeof OperationIntent> {}

export const OperationAcknowledgement = Schema.Struct({
  runID: optional(Schema.NonEmptyString),
  jobID: optional(Schema.NonEmptyString),
  resourceID: optional(Schema.NonEmptyString),
  attempt: optional(PositiveInt),
  unattributed: optional(Schema.Boolean),
}).annotate({ identifier: "Actions.OperationAcknowledgement" })
export interface OperationAcknowledgement extends Schema.Schema.Type<typeof OperationAcknowledgement> {}

export const OperationObservation = Schema.Struct({
  state: Schema.Literals(["pending", "confirmed", "rejected"]),
  acknowledgement: optional(OperationAcknowledgement),
}).annotate({ identifier: "Actions.OperationObservation" })
export interface OperationObservation extends Schema.Schema.Type<typeof OperationObservation> {}

export const Operation = Schema.Struct({
  id: OperationID,
  bindingID: BindingID,
  clientID: Schema.String,
  kind: OperationKind,
  state: Schema.Literals(["prepared", "sending", "accepted", "confirmed", "rejected", "outcome_unknown", "expired"]),
  target: OperationTarget,
  createdAt: Schema.Number,
  expiresAt: Schema.Number,
  updatedAt: Schema.Number,
  result: optional(OperationAcknowledgement),
  reason: optional(Schema.String),
}).annotate({ identifier: "Actions.Operation" })
export interface Operation extends Schema.Schema.Type<typeof Operation> {}

export const ExecuteInput = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ExecuteInput" })
export interface ExecuteInput extends Schema.Schema.Type<typeof ExecuteInput> {}
