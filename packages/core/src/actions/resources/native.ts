export * as ActionsResourceNative from "./native"

import { createHash } from "node:crypto"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCursor } from "../cursor"
import { GitHubNative } from "../github/native"
import { GitHubCommandCommon } from "../github/commands/common"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitLabCommandNative } from "../gitlab/commands/native"
import { ActionsResponse } from "../transport/response"

export type Services = { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }
export const ProviderOnly = Schema.Struct({ provider: Actions.ProviderKind })
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })
const Selection = Schema.Struct({ binding: Actions.Binding, input: Actions.ResourceListInput })

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition })
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "invalid_input", "Actions resource metadata could not be validated safely") })
}

export function input<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const result = Schema.decodeUnknownOption(schema)(value, { onExcessProperty: "error" })
  if (Option.isNone(result)) throw error(binding, "invalid_input", "Resource input does not match its strict provider-native schema")
  return result.value
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown, sent = false): A {
  const result = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(result)) throw error(binding, sent ? "outcome_unknown" : "transport_failed",
    "Provider did not return qualified native resource metadata", sent ? "unknown" : "definitely_unsent")
  return result.value
}

export function scope(binding: Actions.Binding) {
  return `${binding.provider.kind === "github" ? "repository" : "project"}:${id(binding, binding.projectID)}`
}

export function sameScope(binding: Actions.Binding, value?: string) {
  if (value !== undefined && value !== scope(binding)) throw error(binding, "invalid_input", "Resource scope differs from the immutable bound project")
}

export function id(binding: Actions.Binding, value: string) {
  if (!/^[1-9]\d{0,127}$/.test(value)) throw error(binding, "invalid_input", "Resource target requires a canonical positive native ID")
  return value
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
  kind: Actions.ResourceKind, operations: readonly Actions.OperationKind[], fields: readonly string[] = []) {
  input(binding, Capture, { binding, intent, payload })
  const frozen = input(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
  if (frozen.intent.binding.id !== frozen.binding.id || frozen.intent.binding.revision !== frozen.binding.revision)
    throw error(binding, "binding_stale", "Resource command admission differs from the current binding revision")
  if (frozen.intent.target.resourceKind !== kind || !operations.includes(frozen.intent.kind) ||
      Object.keys(frozen.intent.target).some((key) => !["resourceKind", "resourceID", "scope", "ref", "path", ...fields].includes(key)))
    throw error(binding, "invalid_input", "Resource command target belongs to another native operation")
  sameScope(frozen.binding, frozen.intent.target.scope)
  if (frozen.intent.expected?.attempt !== undefined) throw error(binding, "invalid_input", "Resource commands have no run-attempt precondition")
  if (frozen.intent.expected?.commit !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.commit)
  if (frozen.intent.expected?.sourceVersion !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.sourceVersion)
  return frozen
}

export function selection(binding: Actions.Binding, value: Actions.ResourceListInput, kind: Actions.ResourceKind, fields: readonly string[]) {
  input(binding, Selection, { binding, input: value })
  const frozen = input(binding, Schema.fromJsonString(Selection), JSON.stringify({ binding, input: value }))
  if (frozen.input.kind !== kind || Object.keys(frozen.input).some((key) => !["kind", "scope", ...fields].includes(key)))
    throw error(binding, "invalid_input", "Resource selection contains unsupported filters")
  sameScope(frozen.binding, frozen.input.scope)
  return frozen
}

export const before = <A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) => effect.pipe(
  Effect.mapError((cause) => error(binding, cause.kind, `Resource preflight failed (${cause.kind})`)),
)

export const get = Effect.fn("ActionsResources.get")(function* (services: Services, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, ...(query === undefined ? {} : { query }) }))
  if (response.status !== 200) {
    const cause = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, cause.kind, "Native resource read was rejected")
  }
  return response
})

export const authority = Effect.fn("ActionsResources.authority")(function* (services: Services, binding: Actions.Binding, minimum = 40) {
  if (binding.provider.kind === "github") {
    const repo = yield* GitHubCommandCommon.authority(services, binding)
    return { root: repo.root, headers: repo.headers, runnerAdmin: repo.native.permissions?.admin, level: undefined, project: undefined }
  }
  const response = yield* get(services, binding, ActionsGitLabNative.projectPath(binding))
  const authority = yield* checked(binding, () => {
    const project = decode(binding, GitLabCommandNative.Project, response.data)
    if (String(project.id) !== binding.projectID) throw error(binding, "binding_stale", "Native project differs from the bound project")
    return { project, level: GitLabCommandNative.role(binding, project, minimum) }
  })
  yield* actor(services, binding)
  return { root: ActionsGitLabNative.projectPath(binding), headers: response.headers, runnerAdmin: undefined, ...authority }
})

export const actor = Effect.fn("ActionsResources.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* error(binding, "binding_stale", "Resource mutation requires a verified bound actor")
  const response = yield* get(services, binding, "user")
  const name = yield* checked(binding, () => binding.provider.kind === "github"
    ? decode(binding, Schema.Struct({ login: Schema.NonEmptyString }), response.data).login
    : decode(binding, Schema.Struct({ username: Schema.NonEmptyString }), response.data).username)
  if (binding.provider.kind === "github" ? name.toLowerCase() !== binding.account.toLowerCase() : name !== binding.account)
    return yield* error(binding, "binding_stale", "Native resource actor changed after admission")
})

export const send = Effect.fn("ActionsResources.send")(function* (services: Services, binding: Actions.Binding,
  request: ActionsContract.Request, statuses: readonly number[]) {
  if (binding.provider.kind === "github") return yield* GitHubCommandCommon.send(services, binding, request, statuses)
  // W1 checks the actor and write with one credential snapshot. No mutation retry.
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Native resource mutation failed", disposition)
  }))
  if (statuses.includes(response.status)) return response
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
    const cause = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, cause.kind, "Native resource mutation was rejected", "definitely_rejected")
  }
  return yield* error(binding, "outcome_unknown", "Native resource mutation returned an unqualified status", "unknown")
})

export function after<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError(() => error(binding, "outcome_unknown", "Write occurred; native acknowledgement could not be proved", "unknown")))
}

// Snapshot versions cover decoded, explicitly selected metadata, never enrollment secrets.
export function version(value: ActionsContract.Json) {
  const canonical = (item: ActionsContract.Json): string => item !== null && typeof item === "object"
    ? Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
      : `{${Object.entries<ActionsContract.Json>(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`
    : JSON.stringify(item)
  return `native:${createHash("sha256").update(canonical(value)).digest("hex")}`
}

export function requireVersion(binding: Actions.Binding, intent: Actions.OperationIntent, current: string) {
  if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== current)
    throw error(binding, "source_conflict", "Native resource metadata changed after admission")
}

export function pagination(binding: Actions.Binding, response: ActionsContract.Response,
  selected: ReturnType<typeof GitHubNative.selection>, count: number) {
  const next = ActionsCursor.next(response.headers)
  const total = ActionsCursor.total(response.headers)
  if (count > selected.per_page || next !== undefined && (next !== selected.page + 1 || count === 0) ||
    total !== undefined && (total < (selected.page - 1) * selected.per_page + count || next === undefined && total > selected.page * selected.per_page) ||
    count === selected.per_page && next === undefined && total === undefined && response.headers["x-next-page"] === undefined && response.headers.link === undefined)
    throw error(binding, "metadata_truncated", "Native resource page lacks complete advancing pagination evidence")
  return ActionsGitLabNative.pagination(binding, selected.scope, selected.filters, response.headers, selected.page)
}

export const source = Effect.fn("ActionsResources.sourcePrecondition")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent) {
  if (intent.target.ref === undefined && intent.target.path === undefined && intent.expected?.commit === undefined && intent.expected?.sourceVersion === undefined) return
  if (!intent.target.ref) return yield* error(binding, "invalid_input", "Resource source preconditions require an admitted exact ref")
  const ref = yield* checked(binding, () => GitHubNative.ref(binding, intent.target.ref ?? ""))
  const response = yield* get(services, binding, binding.provider.kind === "github"
    ? `repositories/${binding.projectID}/commits/${encodeURIComponent(ref)}`
    : `projects/${binding.projectID}/repository/commits/${encodeURIComponent(ref)}`)
  const sha = yield* checked(binding, () => {
    const sha = binding.provider.kind === "github" ? decode(binding, Schema.Struct({ sha: GitHubNative.SHA }), response.data).sha
      : decode(binding, Schema.Struct({ id: ActionsGitLabNative.SHA }), response.data).id
    if (intent.expected?.commit !== undefined && sha.toLowerCase() !== intent.expected.commit.toLowerCase())
      throw error(binding, "source_conflict", "Native resource ref moved after admission")
    return sha
  })
  if (!intent.target.path) {
    if (intent.expected?.sourceVersion !== undefined) return yield* error(binding, "invalid_input", "Resource sourceVersion requires an admitted exact path")
    return { commit: sha }
  }
  yield* checked(binding, () => GitHubNative.path(binding, intent.target.path ?? ""))
  const value = yield* before(binding, services.reader.source(binding, { path: intent.target.path, ref: sha }))
  if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== sha || value.commit?.toLowerCase() !== sha.toLowerCase() ||
    intent.expected?.sourceVersion !== undefined && value.version.toLowerCase() !== intent.expected.sourceVersion.toLowerCase())
    return yield* error(binding, "source_conflict", "Native resource source identity changed after admission")
  return { commit: sha, source: value }
})
