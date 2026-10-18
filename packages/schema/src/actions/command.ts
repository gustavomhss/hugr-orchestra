import { Schema } from "effect"
import { Operation } from "./operation"
import { OperationID } from "./identity"
import { optional } from "../schema"

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
const strict = { onExcessProperty: "error" } as const
const Variables = Schema.Array(Schema.Struct({
  key: Schema.NonEmptyString, value: Schema.String,
  variable_type: optional(Schema.Literals(["env_var", "file"])),
}).annotate({ parseOptions: strict }))

export const GitHubDispatch = Schema.Struct({
  provider: Schema.Literal("github"), ref: Schema.NonEmptyString,
  inputs: optional(Schema.Record(Schema.String, Value)),
}).annotate({ identifier: "Actions.GitHubDispatch", parseOptions: strict })
export const GitLabDispatch = Schema.Struct({
  provider: Schema.Literal("gitlab"), ref: Schema.NonEmptyString,
  variables: optional(Variables), inputs: optional(Schema.Record(Schema.String, Schema.Json)),
}).annotate({ identifier: "Actions.GitLabDispatch", parseOptions: strict })
export const DispatchCommand = Schema.Struct({ id: OperationID, input: Schema.Union([GitHubDispatch, GitLabDispatch]) })
  .annotate({ identifier: "Actions.DispatchCommand", parseOptions: strict })

export const WorkflowStateCommand = Schema.Struct({
  id: OperationID, input: Schema.Struct({ provider: Schema.Literal("github"), enabled: Schema.Boolean }),
}).annotate({ identifier: "Actions.WorkflowStateCommand", parseOptions: strict })
export const RetryCommand = Schema.Struct({ id: OperationID, input: Schema.Union([
  Schema.Struct({ provider: Schema.Literal("github"), mode: Schema.Literals(["all", "failed"]), enableDebugLogging: optional(Schema.Boolean) }),
  Schema.Struct({ provider: Schema.Literal("gitlab"), mode: Schema.Literal("failed") }),
]) }).annotate({ identifier: "Actions.RetryCommand", parseOptions: strict })
export const ProviderCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literals(["github", "gitlab"]) }) })
  .annotate({ identifier: "Actions.ProviderCommand", parseOptions: strict })
export const GitHubCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literal("github") }) })
  .annotate({ identifier: "Actions.GitHubCommand", parseOptions: strict })
export const GitLabCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literal("gitlab") }) })
  .annotate({ identifier: "Actions.GitLabCommand", parseOptions: strict })
export const RenameCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({
  provider: Schema.Literal("gitlab"), name: Schema.NonEmptyString,
}) }).annotate({ identifier: "Actions.RenameCommand", parseOptions: strict })
export const JobRetryCommand = Schema.Struct({ id: OperationID, input: Schema.Union([
  Schema.Struct({ provider: Schema.Literal("github"), enableDebugLogging: optional(Schema.Boolean) }),
  Schema.Struct({ provider: Schema.Literal("gitlab") }),
]) }).annotate({ identifier: "Actions.JobRetryCommand", parseOptions: strict })
export const JobPlayCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({
  provider: Schema.Literal("gitlab"), variables: optional(Variables),
}) }).annotate({ identifier: "Actions.JobPlayCommand", parseOptions: strict })

export const MergeRequestCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({ provider: Schema.Literal("gitlab") }) })
  .annotate({ identifier: "Actions.MergeRequestCommand", parseOptions: strict })
export const TriggerPipelineCommand = Schema.Struct({ id: OperationID, input: Schema.Struct({
  provider: Schema.Literal("gitlab"), ref: Schema.NonEmptyString, token: Schema.NonEmptyString,
  variables: optional(Schema.Record(Schema.String, Schema.String)), inputs: optional(Schema.Record(Schema.String, Schema.Json)),
}) }).annotate({ identifier: "Actions.TriggerPipelineCommand", parseOptions: strict })

// These values are returned only to the owning request, never put in an operation row.
export const CommandOutput = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("runnerToken"), token: Schema.NonEmptyString, expiresAt: optional(Schema.String), runnerID: optional(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("runnerJit"), encodedConfiguration: Schema.NonEmptyString, runnerID: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("triggerToken"), token: Schema.NonEmptyString, triggerID: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("sourceReview"), id: Schema.NonEmptyString, url: Schema.NonEmptyString }),
]).annotate({ identifier: "Actions.CommandOutput" })
export type CommandOutput = typeof CommandOutput.Type
export const CommandExecution = Schema.Struct({ operation: Operation, output: optional(CommandOutput) })
  .annotate({ identifier: "Actions.CommandExecution" })
export interface CommandExecution extends Schema.Schema.Type<typeof CommandExecution> {}

export const ResourceCommand = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ResourceCommand", parseOptions: strict })
