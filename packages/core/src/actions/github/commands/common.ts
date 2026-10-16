export * as GitHubCommandCommon from "./common"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsError } from "../../error"
import { ActionsResponse } from "../../transport/response"
import { GitHubNative } from "../native"

export type Services = { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })
const Repository = Schema.Struct({ ...GitHubNative.Repository.fields,
  private: Schema.optionalKey(Schema.Boolean), archived: Schema.optionalKey(Schema.Boolean) })
const Account = Schema.Struct({ id: GitHubNative.ID,
  login: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]+(?:\[bot\])?$/)) })
const supported = new Set(["workflow.dispatch", "workflow.enable", "workflow.disable", "run.retry", "run.retryFailed",
  "run.cancel", "run.forceCancel", "run.delete", "run.approveFork", "job.retry"])

export function fail(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "github", disposition })
}

export function input<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(value, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) throw fail(binding, "invalid_input", "GitHub command payload does not match its frozen native schema")
  return decoded.value
}

export function guard<A>(binding: Actions.Binding, fn: () => A, kind: Actions.ErrorKind = "invalid_input") {
  return Effect.try({ try: fn, catch: (error) => error instanceof ActionsError ? error : fail(binding, kind, "GitHub command metadata could not be validated") })
}

export const capture = Effect.fn("ActionsGitHubCommands.capture")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  return yield* guard(binding, () => {
    input(binding, Capture, { binding, intent, payload })
    // Clone all admission and execute data before the first remote await. No payload hash or log.
    const frozen = input(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
    if (frozen.binding.provider.kind !== "github" || !supported.has(frozen.intent.kind))
      throw fail(binding, "invalid_input", "Command does not belong to the GitHub execution dispatcher")
    if (frozen.intent.binding.id !== frozen.binding.id || frozen.intent.binding.revision !== frozen.binding.revision)
      throw fail(binding, "binding_stale", "Command admission does not match the current binding revision")
    const target = frozen.intent.target
    const workflow = frozen.intent.kind.startsWith("workflow.")
    const job = frozen.intent.kind === "job.retry"
    const allowed = new Set(workflow ? ["workflowID", "path", "ref"] : job ? ["jobID", "runID", "workflowID", "path", "ref"] : ["runID", "workflowID", "path", "ref"])
    if (Object.keys(target).some((key) => !allowed.has(key)))
      throw fail(binding, "invalid_input", "Command target contains fields belonging to another native operation")
    const id = workflow ? target.workflowID : job ? target.jobID : target.runID
    if (id === undefined) throw fail(binding, "invalid_input", "Command requires its admitted native target ID")
    GitHubNative.id(binding, id)
    if (target.runID !== undefined) GitHubNative.id(binding, target.runID)
    if (target.workflowID !== undefined) GitHubNative.id(binding, target.workflowID)
    if (target.ref !== undefined) GitHubNative.ref(binding, target.ref)
    if (target.path !== undefined) GitHubNative.path(binding, target.path)
    if (workflow && frozen.intent.expected?.attempt !== undefined)
      throw fail(binding, "invalid_input", "Workflow commands do not have a native run-attempt precondition")
    if (frozen.intent.expected?.commit !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.commit)
    if (frozen.intent.expected?.sourceVersion !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.sourceVersion)
    return frozen
  })
})

export function before<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError((error) => fail(binding, error.kind, `GitHub command preflight failed (${error.kind})`)))
}

export const get = Effect.fn("ActionsGitHubCommands.get")(function* (services: Services, binding: Actions.Binding, path: string) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path }))
  if (response.status !== 200) {
    const error = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* fail(binding, error.kind, "GitHub command preflight request was rejected")
  }
  return response
})

export const authority = Effect.fn("ActionsGitHubCommands.authority")(function* (services: Services, binding: Actions.Binding) {
  const root = yield* guard(binding, () => `repositories/${GitHubNative.id(binding, binding.projectID)}`)
  const response = yield* get(services, binding, root)
  const native = yield* guard(binding, () => GitHubNative.decode(binding, Repository, response.data, "repository"), "transport_failed")
  if (String(native.id) !== binding.projectID) return yield* fail(binding, "binding_stale", "Native repository does not match command admission")
  yield* actor(services, binding)
  if (native.permissions?.push === false || native.archived === true)
    return yield* fail(binding, "permission_denied", "Native repository metadata denies command writes")
  const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
    return yield* fail(binding, "permission_denied", "Observed classic OAuth scopes deny repository writes")
  // Missing scope/role evidence stays unknown. Native authorization decides this
  // explicit command; no available write capability or fine-grained role is invented.
  return { root, native, headers: response.headers }
})

const actor = Effect.fn("ActionsGitHubCommands.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "GitHub binding has no verified actor account")
  const user = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => GitHubNative.decode(binding, Account, user.data, "signed-in account"), "not_authenticated")
  if (account.login.toLowerCase() !== binding.account.toLowerCase())
    return yield* fail(binding, "binding_stale", "GitHub signed-in account changed after command admission")
})

export function version(binding: Actions.Binding, expected: Actions.OperationExpected | undefined, response: ActionsContract.Response) {
  if (expected?.resourceVersion === undefined) return
  if (!response.headers.etag) throw fail(binding, "capability_unavailable", "Native resource version was not observed")
  if (response.headers.etag !== expected.resourceVersion) throw fail(binding, "source_conflict", "Native resource version changed after admission")
}

export function source(binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Source, path: string, ref: string, commit?: string) {
  if (value.bindingID !== binding.id || value.path !== path || value.ref !== ref || value.commit === undefined)
    throw fail(binding, "source_unresolved", "Reader did not prove the admitted native source identity")
  input(binding, GitHubNative.SHA, value.commit)
  input(binding, GitHubNative.SHA, value.version)
  if ((commit !== undefined && value.commit.toLowerCase() !== commit.toLowerCase()) ||
      (intent.expected?.commit !== undefined && value.commit.toLowerCase() !== intent.expected.commit.toLowerCase()) ||
      (intent.expected?.sourceVersion !== undefined && value.version.toLowerCase() !== intent.expected.sourceVersion.toLowerCase()))
    throw fail(binding, "source_conflict", "Native source changed after command admission")
}

export const run = Effect.fn("ActionsGitHubCommands.runPreflight")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, id: string) {
  const value = yield* before(binding, services.reader.run(binding, id))
  if (value.id !== id || value.bindingID !== binding.id || value.repositoryID !== binding.projectID)
    return yield* fail(binding, "binding_stale", "Reader did not prove the admitted native run ownership")
  yield* guard(binding, () => input(binding, GitHubNative.SHA, value.commit))
  if (value.attempt === undefined || !Number.isSafeInteger(value.attempt) || value.attempt < 1)
    return yield* fail(binding, "capability_unavailable", "Native run attempt was not proved")
  if ((intent.expected?.commit !== undefined && value.commit.toLowerCase() !== intent.expected.commit.toLowerCase()) ||
      (intent.expected?.attempt !== undefined && value.attempt !== intent.expected.attempt) ||
      (intent.target.ref !== undefined && value.ref !== intent.target.ref) ||
      (intent.target.workflowID !== undefined && value.workflowID !== intent.target.workflowID))
    return yield* fail(binding, "source_conflict", "Native run source or attempt changed after admission")
  return value
})

export const historical = Effect.fn("ActionsGitHubCommands.historicalSource")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Run, response?: ActionsContract.Response) {
  if (intent.expected?.sourceVersion === undefined && intent.target.path === undefined && (intent.kind === "job.retry" || intent.expected?.resourceVersion === undefined)) return
  const metadata = response ?? (yield* get(services, binding, `repositories/${binding.projectID}/actions/runs/${value.id}`))
  yield* guard(binding, () => {
    const native = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, head_sha: GitHubNative.SHA,
      run_attempt: GitHubNative.Positive, path: Schema.NonEmptyString, repository: Schema.Struct({ id: GitHubNative.ID }),
      status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)), event: Schema.String }), metadata.data, "run source")
    if (String(native.id) !== value.id || String(native.repository.id) !== binding.projectID || native.head_sha.toLowerCase() !== value.commit.toLowerCase() || native.run_attempt !== value.attempt)
      throw fail(binding, "source_conflict", "Native run metadata changed during preflight")
    if (native.status !== value.status || native.conclusion !== value.conclusion || native.event !== value.event)
      throw fail(binding, "source_conflict", "Native run conditions changed during preflight")
    if (intent.target.path !== undefined && native.path !== intent.target.path) throw fail(binding, "source_conflict", "Admitted source path does not match native run provenance")
    if (intent.kind !== "job.retry") version(binding, intent.expected, metadata)
  })
  if (intent.expected?.sourceVersion === undefined) return
  const native = yield* guard(binding, () => GitHubNative.decode(binding, Schema.Struct({ path: Schema.NonEmptyString }), metadata.data, "run path"))
  const selected = yield* before(binding, services.reader.source(binding, { path: native.path, ref: value.commit }))
  yield* guard(binding, () => source(binding, intent, selected, native.path, value.commit, value.commit))
})

export const send = Effect.fn("ActionsGitHubCommands.send")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, statuses: readonly number[]) {
  // gh reloads CLI credentials per invocation; recheck actor immediately before send.
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) => {
    const disposition = error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.disposition : "unknown"
    return new ActionsError({ kind: disposition === "unknown" ? "outcome_unknown" : error.kind, provider: "github", bindingID: binding.id,
      message: "GitHub command request failed", disposition, retryAfter: error.retryAfter })
  }))
  if (statuses.includes(response.status)) return response
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
    const error = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* fail(binding, error.kind, "GitHub command was rejected by the provider", "definitely_rejected")
  }
  return yield* fail(binding, "outcome_unknown", "GitHub command returned an unrecognized acknowledgement", "unknown")
})
