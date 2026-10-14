import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { limits } from "../source/document"

export type Services = { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }
const strict = { onExcessProperty: "error" } as const
const provider = Schema.Literals(["github", "gitlab"])
export const Branch = Schema.Struct({ provider, branch: Schema.NonEmptyString }).annotate({ parseOptions: strict })
export const Write = Schema.Struct({
  provider, mode: Schema.Literals(["create", "update"]), message: Schema.NonEmptyString, text: Schema.String,
  name: Schema.optionalKey(Schema.NonEmptyString),
  template: Schema.optionalKey(Schema.Literals(["Build and test", "Release", "Blank configuration"])),
}).annotate({ parseOptions: strict })
export const Review = Schema.Struct({ provider, title: Schema.NonEmptyString, text: Schema.String }).annotate({ parseOptions: strict })
export const Version = Schema.Struct({ blob_id: GitHubNative.SHA, last_commit_id: GitHubNative.SHA })
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown, sent = false): A {
  const decoded = Schema.decodeUnknownOption(schema, sent ? undefined : strict)(value)
  if (Option.isNone(decoded)) throw error(binding, sent ? "outcome_unknown" : "invalid_input",
    sent ? "Source mutation response did not prove native identity" : "Source command does not match its strict schema",
    sent ? "unknown" : "definitely_unsent")
  return decoded.value
}

export function native<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(decoded)) throw error(binding, "transport_failed", "Provider did not prove source preflight identity")
  return decoded.value
}

export function branch(binding: Actions.Binding, value: string) {
  if (!value || value.length > 1024 || !value.isWellFormed() || /[\s\\%?#{}:\x00-\x1f\x7f~^*\[]/.test(value) || value.includes("..") ||
    value.includes("@{") || value === "@" || value.startsWith("-") || value.endsWith(".") ||
    value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw error(binding, "invalid_input", "Source branch must be an exact safe native branch name")
  if (value.startsWith("refs/") || Option.isSome(Schema.decodeUnknownOption(GitHubNative.SHA)(value)))
    throw error(binding, "invalid_input", "Source mutations require a short branch name, not an immutable object or qualified ref")
  return value
}

export function sourcePath(binding: Actions.Binding, value: string | undefined) {
  if (!value || value.length > 4096 || !value.isWellFormed())
    throw error(binding, "invalid_input", "Source commands require an exact admitted repository path")
  if (binding.provider.kind === "gitlab") {
    if (!ActionsGitLabNative.localPath(value))
      throw error(binding, "source_unresolved", "GitLab source proposals require an exact local repository path")
    return value
  }
  GitHubNative.path(binding, value)
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(value))
    throw error(binding, "source_unresolved", "GitHub source proposals require a native workflow YAML path")
  return value
}

export function bytes(text: string) {
  if (text.length > limits.sourceBytes || !text.isWellFormed())
    throw new ActionsError({ kind: "invalid_input", message: "Source must be well-formed Unicode within 1048576 UTF-8 bytes", disposition: "definitely_unsent" })
  const value = new TextEncoder().encode(text)
  if (value.length > limits.sourceBytes)
    throw new ActionsError({ kind: "invalid_input", message: "Source exceeds 1048576 UTF-8 bytes", disposition: "definitely_unsent" })
  return value
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  decode(binding, Schema.toType(Capture), { binding, intent, payload })
  // Snapshot before the first await. Mutation values never become durable intent fields.
  const value = decode(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
  if (value.intent.binding.id !== value.binding.id || value.intent.binding.revision !== value.binding.revision)
    throw error(binding, "binding_stale", "Source command binding differs from admission")
  if (!["source.branch", "source.write", "source.review"].includes(value.intent.kind))
    throw error(binding, "invalid_input", "Source command kind belongs to another dispatcher")
  if (Object.keys(value.intent.target).some((key) => !["ref", "path", "resourceID"].includes(key)))
    throw error(binding, "invalid_input", "Historical runs and execution targets cannot authorize source mutations")
  if (value.intent.expected?.attempt !== undefined || value.intent.expected?.resourceVersion !== undefined)
    throw error(binding, "invalid_input", "Source commands require source versions and commits, not execution or resource versions")
  if (!value.intent.target.ref || !value.intent.expected?.commit)
    throw error(binding, "invalid_input", "Source commands require an admitted branch and immutable expected commit")
  branch(binding, value.intent.target.ref)
  decode(binding, GitHubNative.SHA, value.intent.expected.commit)
  sourcePath(binding, value.intent.target.path)
  if (value.intent.expected.sourceVersion !== undefined) {
    if (!value.intent.target.path) throw error(binding, "invalid_input", "Source version requires an admitted path")
    version(binding, value.intent.expected.sourceVersion)
  }
  if (value.intent.kind === "source.branch") {
    if (!value.intent.target.resourceID) throw error(binding, "invalid_input", "Branch creation requires its admitted new branch")
    branch(binding, value.intent.target.resourceID)
    if (value.intent.target.resourceID === value.intent.target.ref)
      throw error(binding, "invalid_input", "Source branch must differ from its captured base")
  }
  if (value.intent.kind === "source.write" && (!value.intent.target.path || value.intent.target.resourceID !== undefined))
    throw error(binding, "invalid_input", "Source writes require only their admitted path and branch")
  if (value.intent.kind === "source.review" && value.intent.target.resourceID !== undefined)
    branch(binding, value.intent.target.resourceID)
  return value
}

export function version(binding: Actions.Binding, value: string) {
  return binding.provider.kind === "github" ? { blob_id: decode(binding, GitHubNative.SHA, value), last_commit_id: undefined }
    : decode(binding, Schema.fromJsonString(Version).annotate({ parseOptions: strict }), value)
}

export function source(binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Source) {
  if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== intent.target.ref || !value.commit)
    throw error(binding, "source_unresolved", "Reader did not prove the admitted source identity")
  decode(binding, GitHubNative.SHA, value.commit)
  const selected = version(binding, value.version)
  bytes(value.text)
  const expected = intent.expected?.sourceVersion === undefined ? undefined : version(binding, intent.expected.sourceVersion)
  if (value.commit.toLowerCase() !== intent.expected?.commit?.toLowerCase() || expected !== undefined &&
    (selected.blob_id.toLowerCase() !== expected.blob_id.toLowerCase() ||
      selected.last_commit_id?.toLowerCase() !== expected.last_commit_id?.toLowerCase()))
    throw error(binding, "source_conflict", "Native source changed after admission")
  return value
}
