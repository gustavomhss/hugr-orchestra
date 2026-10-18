export * as GitLabCommandShared from "./shared"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsError } from "../../error"
import { ActionsGitLabNative } from "../native"

export const kinds = ["workflow.dispatch", "run.retry", "run.cancel", "run.delete", "run.rename", "job.retry", "job.play", "job.cancel", "job.erase", "pipeline.mergeRequest", "pipeline.trigger"]
export const terminal = ["success", "failed", "canceled", "skipped"]
export type Plan = { readonly request: ActionsContract.Request; readonly statuses: readonly number[];
  readonly acknowledge: (response: ActionsContract.Response) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError> }

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, sent = false) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "gitlab", disposition: sent ? "unknown" : "definitely_unsent" })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown): S["Type"] {
  const result = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(data)
  if (Option.isNone(result)) throw error(binding, "invalid_input", "GitLab command payload or intent does not match its native schema")
  return result.value
}

export function json(binding: Actions.Binding, data: unknown) {
  const result = Schema.decodeUnknownOption(Schema.Json)(data)
  if (Option.isNone(result)) throw error(binding, "invalid_input", "GitLab command requires finite JSON values")
  return result.value
}

export function admit(binding: Actions.Binding, input: Actions.OperationIntent) {
  const intent = decode(binding, Actions.OperationIntent, input)
  ActionsGitLabNative.projectPath(binding)
  if (intent.binding.id !== binding.id || intent.binding.revision !== binding.revision)
    throw error(binding, "binding_stale", "GitLab command binding and admitted revision differ")
  if (!kinds.includes(intent.kind)) throw error(binding, "invalid_input", "GitLab command kind belongs to a different dispatcher")
  if (intent.expected?.attempt !== undefined) throw error(binding, "capability_unavailable", "GitLab has native retry job identities, not run_attempt preconditions")
  if (intent.expected?.resourceVersion !== undefined) throw error(binding, "capability_unavailable", "This GitLab execution command has no native resourceVersion precondition")
  if (intent.expected?.commit !== undefined && Option.isNone(Schema.decodeUnknownOption(ActionsGitLabNative.SHA)(intent.expected.commit)))
    throw error(binding, "invalid_input", "GitLab expected commit must be an immutable Git object ID")
  if (intent.target.workflowID !== undefined && intent.target.workflowID !== ActionsGitLabNative.workflowID(binding))
    throw error(binding, "invalid_input", "GitLab workflow target must identify this project's native pipeline/config slot")
  return intent
}

export function target(binding: Actions.Binding, intent: Actions.OperationIntent, allowed: readonly string[], required: readonly string[]) {
  if (Object.keys(intent.target).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(intent.target, key)))
    throw error(binding, "invalid_input", "GitLab admitted target does not match this native command")
}

export function commit(binding: Actions.Binding, intent: Actions.OperationIntent, sha: string, ref: string | null) {
  if (intent.expected?.commit !== undefined && intent.expected.commit !== sha || intent.target.ref !== undefined && intent.target.ref !== ref)
    throw error(binding, "source_conflict", "GitLab native commit or ref changed since admission")
}

export const source = Effect.fn("ActionsGitLabCommands.sourcePrecondition")(function* (
  binding: Actions.Binding, intent: Actions.OperationIntent, reader: ActionsContract.ReadAdapter, sha: string, path?: string,
) {
  const selected = intent.target.path ?? path
  if (!selected) {
    if (intent.expected?.sourceVersion !== undefined) return yield* error(binding, "source_unresolved", "A sourceVersion precondition requires the admitted native source path")
    return
  }
  const source = yield* reader.source(binding, { path: selected, ref: sha })
  if (source.bindingID !== binding.id || source.path !== selected || source.commit !== sha ||
    intent.expected?.sourceVersion !== undefined && source.version !== intent.expected.sourceVersion)
    return yield* error(binding, "source_conflict", "GitLab source identity or version changed since admission")
  return source
})

export function native<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown, sent = false): S["Type"] {
  const result = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(result)) throw error(binding, sent ? "outcome_unknown" : "transport_failed", "GitLab returned invalid command identity metadata", sent)
  return result.value
}

export function pipeline(binding: Actions.Binding, data: unknown, expected: { id?: string; commit?: string; ref?: string | null; sources?: readonly string[]; name?: string }) {
  const value = native(binding, ActionsGitLabNative.Pipeline, data, true)
  if (String(value.project_id) !== binding.projectID || expected.id !== undefined && String(value.id) !== expected.id ||
    expected.commit !== undefined && value.sha !== expected.commit || expected.ref !== undefined && value.ref !== expected.ref ||
    expected.sources !== undefined && !expected.sources.includes(value.source) || expected.name !== undefined && value.name !== expected.name)
    throw error(binding, "outcome_unknown", "GitLab mutation response did not prove the exact project, pipeline, source and ref", true)
  return { runID: String(value.id) }
}
