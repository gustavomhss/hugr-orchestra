export * as ActionsConfigCommon from "./config-common"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"

export type Services = { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }
export const ID = Schema.Union([Schema.String.check(Schema.isPattern(/^[1-9]\d{0,127}$/)), Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))])
export const Text = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(1024), Schema.isPattern(/^[^\x00-\x1f\x7f]+$/))
export const Value = Schema.String.check(Schema.isPattern(/\S/))
export const Provider = Actions.ProviderKind
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent })
const Access = Schema.NullOr(Schema.Struct({ access_level: Schema.Int }))
export const Project = Schema.Struct({
  id: ID, archived: Schema.optionalKey(Schema.Boolean), private: Schema.optionalKey(Schema.Boolean),
  permissions: Schema.optionalKey(Schema.Struct({
    push: Schema.optionalKey(Schema.Boolean), admin: Schema.optionalKey(Schema.Boolean),
    project_access: Schema.optionalKey(Access), group_access: Schema.optionalKey(Access),
  })),
  allow_pipeline_trigger_approve_deployment: Schema.optionalKey(Schema.Boolean),
})

export function fail(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent", retryAfter?: number) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition,
    ...(retryAfter === undefined ? {} : { retryAfter }) })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, value: unknown, native = false): S["Type"] {
  const parsed = Schema.decodeUnknownOption(schema)(value, native ? {} : { onExcessProperty: "error" })
  if (Option.isNone(parsed)) throw fail(binding, native ? "transport_failed" : "invalid_input", native
    ? "Provider returned invalid configuration metadata" : "Configuration payload does not match its strict native form")
  return parsed.value
}

export function guard<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError ? cause : fail(binding, "invalid_input", "Configuration input could not be validated") })
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, kind: Actions.ResourceKind, review = false) {
  const frozen = decode(binding, Capture, structuredClone({ binding, intent }))
  if (intent.binding.id !== binding.id || intent.binding.revision !== binding.revision)
    throw fail(binding, "binding_stale", "Configuration admission does not match the current binding revision")
  if ((!review && !["resource.create", "resource.update", "resource.delete"].includes(intent.kind)) ||
      (review && intent.kind !== "deployment.review") || intent.target.resourceKind !== kind)
    throw fail(binding, "invalid_input", "Configuration intent belongs to another operation or resource domain")
  const allowed = review ? ["resourceKind", "resourceID", "scope", "runID"] : ["resourceKind", "resourceID", "scope"]
  if (Object.keys(intent.target).some((key) => !allowed.includes(key)) || !intent.target.resourceID || intent.target.scope === undefined)
    throw fail(binding, "invalid_input", "Configuration target requires an exact native name and scope")
  decode(binding, Text, intent.target.resourceID)
  decode(binding, Text, intent.target.scope)
  if (Object.keys(intent.expected ?? {}).some((key) => key !== "resourceVersion" && !(review && ["commit", "attempt"].includes(key))))
    throw fail(binding, "invalid_input", "Configuration intent contains an unrelated precondition")
  root(binding)
  return frozen
}

export function selection(binding: Actions.Binding, input: Actions.ResourceListInput, kind: Actions.ResourceKind, allowed: readonly string[]) {
  const frozen = decode(binding, Actions.ResourceListInput, structuredClone(input))
  if (frozen.kind !== kind || Object.keys(frozen).some((key) => !["kind", "cursor", "limit", ...allowed].includes(key)))
    throw fail(binding, "invalid_input", "Configuration list contains an unsupported selection")
  root(binding)
  return frozen
}

export function root(binding: Actions.Binding) {
  if (!/^[1-9]\d{0,127}$/.test(binding.projectID)) throw fail(binding, "invalid_input", "Configuration requires an immutable native project ID")
  return `${binding.provider.kind === "github" ? "repositories" : "projects"}/${binding.projectID}`
}

function httpKind(status: number): Actions.ErrorKind {
  return status === 401 ? "not_authenticated" : status === 403 ? "permission_denied" : status === 404 ? "not_found"
    : status === 409 || status === 412 ? "source_conflict" : status === 422 || status === 400 ? "invalid_input"
    : status === 429 ? "rate_limited" : "transport_failed"
}

export const get = Effect.fn("ActionsConfig.get")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, missing = false): Effect.fn.Return<ActionsContract.Response, ActionsError> {
  const response = yield* services.transport.request(binding, request).pipe(Effect.catch((error) =>
    missing && error.kind === "not_found" && error.disposition === "definitely_rejected"
      ? Effect.succeed({ status: 404, headers: {}, data: null })
      : Effect.fail(fail(binding, error.kind, `Configuration preflight failed (${error.kind})`, "definitely_unsent", error.retryAfter))))
  if (response.status !== 200 && !(missing && response.status === 404))
    return yield* fail(binding, httpKind(response.status), `Configuration read returned HTTP ${response.status}`)
  return response
})

export const actor = Effect.fn("ActionsConfig.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "Configuration requires a verified bound account")
  const response = yield* get(services, binding, { method: "GET", path: "user" })
  const native = yield* guard(binding, () => binding.provider.kind === "github"
    ? decode(binding, Schema.Struct({ id: ID, login: Text }), response.data, true)
    : decode(binding, Schema.Struct({ id: ID, username: Text }), response.data, true))
  const account = "login" in native ? native.login : native.username
  if (typeof account !== "string" || (binding.provider.kind === "github" ? account.toLowerCase() !== binding.account.toLowerCase() : account !== binding.account))
    return yield* fail(binding, "binding_stale", "Signed-in configuration account changed after admission")
  return String(native.id)
})

export const project = Effect.fn("ActionsConfig.project")(function* (services: Services, binding: Actions.Binding, write = false, admin = false) {
  const path = yield* guard(binding, () => root(binding))
  const response = yield* get(services, binding, { method: "GET", path })
  const native = yield* guard(binding, () => decode(binding, Project, response.data, true))
  if (String(native.id) !== binding.projectID) return yield* fail(binding, "binding_stale", "Native configuration project differs from binding")
  if (write) {
    yield* actor(services, binding)
    const levels = [native.permissions?.project_access, native.permissions?.group_access]
      .filter((access) => access !== undefined).map((access) => access?.access_level ?? 0)
    if (native.archived || (binding.provider.kind === "github"
      ? native.permissions?.[admin ? "admin" : "push"] === false
      : levels.length === 2 && Math.max(...levels) < 40))
      return yield* fail(binding, "permission_denied", "Observed project role denies this configuration write")
    const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
    if (binding.provider.kind === "github" && scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
      return yield* fail(binding, "permission_denied", "Observed OAuth scopes deny repository configuration writes")
  }
  return { path, native, response }
})

export function version(binding: Actions.Binding, expected: Actions.OperationExpected | undefined, response: ActionsContract.Response, metadata: ActionsContract.Json) {
  const current = JSON.stringify(metadata)
  if (expected?.resourceVersion !== undefined && expected.resourceVersion !== current && expected.resourceVersion !== response.headers.etag)
    throw fail(binding, "source_conflict", "Native configuration identity, scope or version changed after admission")
  return response.headers.etag ?? current
}

export function identity(binding: Actions.Binding, name: string, scope: string, nativeID?: string) {
  return { provider: binding.provider.kind, projectID: binding.projectID, bindingID: binding.id,
    bindingRevision: binding.revision, name, scope, ...(nativeID === undefined ? {} : { id: nativeID }) }
}

export function page(binding: Actions.Binding, input: Actions.ResourceListInput, phase = "") {
  const limit = ActionsCursor.limit(input.limit)
  const scope = `config:${input.kind}:${phase}`
  const filters = { scope: input.scope, resourceID: input.resourceID, query: input.query, per_page: limit }
  return { limit, scope, filters, number: ActionsCursor.page(binding, scope, filters, input.cursor) }
}

export function pagination(binding: Actions.Binding, selected: ReturnType<typeof page>, response: ActionsContract.Response, count: number, total?: number) {
  const next = ActionsCursor.next(response.headers)
  const headerTotal = ActionsCursor.total(response.headers)
  if (count > selected.limit || (next !== undefined && (next !== selected.number + 1 || count === 0)) ||
      (total !== undefined && (!Number.isSafeInteger(total) || total < 0 || (headerTotal !== undefined && total !== headerTotal) ||
        (count > 0 && total < (selected.number - 1) * selected.limit + count) ||
        (count === 0 && total > (selected.number - 1) * selected.limit) ||
        (next === undefined && total > selected.number * selected.limit) || (next !== undefined && total <= selected.number * selected.limit))) ||
      (next === undefined && total === undefined && count === selected.limit && response.headers.link === undefined && response.headers["x-next-page"] === undefined))
    throw fail(binding, "metadata_truncated", "Provider configuration pagination is incomplete")
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, selected.scope, selected.filters, next) }), capturedAt: Date.now() }
}

export const send = Effect.fn("ActionsConfig.send")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, statuses: readonly number[]) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) =>
    fail(binding, error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.kind : "outcome_unknown",
      "Provider configuration write failed", error.disposition ?? "unknown", error.retryAfter)))
  if (statuses.includes(response.status)) return response
  const rejected = [400, 401, 403, 404, 409, 412, 422, 429].includes(response.status)
  return yield* fail(binding, rejected ? httpKind(response.status) : "outcome_unknown", `Provider configuration write returned HTTP ${response.status}`,
    rejected ? "definitely_rejected" : "unknown")
})

export const stages = Effect.fn("ActionsConfig.stages")(function* (services: Services, binding: Actions.Binding,
  requests: readonly { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[]) {
  yield* Effect.forEach(requests, (stage, index) => send(services, binding, stage.request, stage.statuses).pipe(
    Effect.mapError((error) => index === 0 ? fail(binding, error.kind, `Environment phase '${stage.phase}' failed (${error.kind})`, error.disposition ?? "unknown", error.retryAfter)
      : fail(binding, "outcome_unknown", `Environment configuration partially applied; phase '${stage.phase}' failed (${error.kind}); read back before another operation`, "unknown", error.retryAfter)),
  ), { concurrency: 1, discard: true })
})
