import type { Orchestra } from "@orchestra/client"
import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import type { ServerConnection } from "@/context/server"
import type { ErrorState } from "./contract"
import { previewResponse } from "./requests"

export type ActionsScope = { bindingID: Actions.BindingID; revision: number }
export type ResourceAction = "create" | "update" | "delete" | "play" | "pause" | "keep" | "clear"
export type ActionsCommand = { kind: Actions.OperationKind; target: Actions.OperationTarget; input: Schema.Json; expected?: Actions.OperationExpected; action?: ResourceAction }
export const ResourceForms = {
  variableDelete: Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString, type: Schema.Literals(["Secret", "Variable"]), scope: Schema.NonEmptyString }),
  environmentDelete: Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString }),
  variables: Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString, type: Schema.Literals(["Secret", "Variable"]),
    scope: Schema.NonEmptyString, value: Schema.String, protected: Schema.optional(Schema.Boolean), masked: Schema.optional(Schema.Boolean), hidden: Schema.optional(Schema.Boolean) }),
  environments: Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString,
    reviewers: Schema.String, refs: Schema.NonEmptyString, timer: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 43200 }))), preventSelfReview: Schema.Boolean,
    description: Schema.optional(Schema.String), tier: Schema.optional(Schema.Literals(["production", "staging", "testing", "development", "other"])) }),
  runners: Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString,
    labels: Schema.Union([Schema.NonEmptyString, Schema.Array(Schema.NonEmptyString)]), platform: Schema.Literals(["Linux x64", "Linux ARM64", "macOS ARM64", "macOS x64", "Windows x64"]),
    runnerGroupID: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))) }),
  schedules: Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString, cron: Schema.NonEmptyString,
    zone: Schema.NonEmptyString, ref: Schema.NonEmptyString, input: Schema.optional(Schema.String), enabled: Schema.optional(Schema.Boolean),
    inputMode: Schema.optional(Schema.Literals(["input", "variable"])), inputs: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
    variables: Actions.GitLabDispatch.fields.variables }),
  policy: Schema.Struct({ provider: Actions.ProviderKind, retention: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 }))),
    policy: Schema.optional(Schema.Literals(["Project default", "Restricted to approved actions"])) }),
  approval: Schema.Struct({ provider: Actions.ProviderKind, decision: Schema.Literals(["Approve", "Reject"]), comment: Schema.NonEmptyString }),
}
export const CreateWorkflowForm = Schema.Struct({ provider: Schema.optional(Actions.ProviderKind), name: Schema.NonEmptyString, path: Schema.NonEmptyString,
  template: Schema.Literals(["Build and test", "Release", "Blank configuration", "build-test", "release", "blank"]), ref: Schema.optional(Schema.NonEmptyString),
  text: Schema.optional(Schema.String), content: Schema.optional(Schema.String) })
export const ReviewSourceForm = Schema.Struct({ provider: Schema.optional(Actions.ProviderKind), branch: Schema.NonEmptyString,
  message: Schema.NonEmptyString, title: Schema.NonEmptyString, text: Schema.optional(Schema.String), content: Schema.optional(Schema.String) })

/** Reject excess fields and non-JSON values, then detach the payload before the first await. */
export function decodeAction<S extends Schema.Decoder<unknown>>(schema: S, value: unknown): S["Type"] {
  // Native optional fields omit undefined on the wire but allow it in typed client forms.
  const decoded = Schema.decodeUnknownOption(Schema.toType(schema), { onExcessProperty: "error" })(value)
  if (Option.isNone(decoded)) throw new ActionsRequestError("invalid_input")
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(JSON.stringify(decoded.value))
  if (Option.isNone(json)) throw new ActionsRequestError("invalid_input")
  const result = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(json.value)
  if (Option.isNone(result)) throw new ActionsRequestError("invalid_input")
  return result.value
}

/** Native DTOs were validated before Store adoption; detach its private symbols before revalidation. */
export function snapshotAction<S extends Schema.Decoder<unknown>>(schema: S, value: unknown): S["Type"] {
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(JSON.stringify(value))
  if (Option.isNone(json)) throw new ActionsRequestError("invalid_input")
  return decodeAction(schema, json.value)
}
function jsonBody(value: unknown) { return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(JSON.stringify(value)) }
function nativeID(value?: string) { if (!value) throw new ActionsRequestError("invalid_input"); return value }

export class ActionsRequestError extends Error {
  constructor(readonly kind: string, readonly retryAfter?: number, readonly operationID?: Actions.OperationID, readonly disposition?: Actions.SendDisposition) {
    super(kind)
  }
}

// Provider messages, transport causes and receipts' reasons can contain credentials or inputs.
export function actionsError(error: unknown): ErrorState {
  const safe = requestError(error)
  return {
    kind: safe.kind,
    message: safe.kind === "source_dirty" ? "orchestra.actions.reviewSource" : safe.kind === "unsupported" ? "orchestra.actions.unsupported"
      : safe.kind === "not_authenticated" ? "orchestra.actions.providerSignInRequired"
      : safe.kind === "server_auth" ? "orchestra.actions.serverAuthFailed"
      : safe.kind === "outcome_unknown" ? "orchestra.actions.unknownOutcome"
      : safe.kind === "operation_rejected" ? "orchestra.actions.operationRejected"
      : safe.kind === "source_unresolved" ? "orchestra.actions.noSource" : "orchestra.actions.unavailable",
    ...(safe.retryAfter === undefined ? {} : { retryAfter: safe.retryAfter }),
  }
}

export function requestError(error: unknown): ActionsRequestError {
  if (error instanceof ActionsRequestError) return error
  const native = Schema.decodeUnknownOption(Actions.ErrorData)(error)
  if (Option.isSome(native)) return new ActionsRequestError(native.value.kind, native.value.retryAfter, native.value.operationID, native.value.disposition)
  if (typeof error === "object" && error !== null && "_tag" in error) {
    if (error._tag === "UnauthorizedError") return new ActionsRequestError("server_auth")
    if (error._tag === "InvalidRequestError") return new ActionsRequestError("invalid_input")
  }
  if (typeof error === "object" && error !== null && "reason" in error && error.reason === "UnexpectedStatus"
    && "cause" in error && typeof error.cause === "object" && error.cause !== null && "status" in error.cause) {
    if (error.cause.status === 404) return new ActionsRequestError("unsupported")
    if (error.cause.status === 401) return new ActionsRequestError("server_auth")
    if (error.cause.status === 403) return new ActionsRequestError("permission_denied")
    if (error.cause.status === 429) return new ActionsRequestError("rate_limited")
  }
  return new ActionsRequestError("transport_failed")
}

export function createActionsAPI(input: {
  server: ServerConnection.Any
  fetch?: typeof globalThis.fetch
  directory: string
}) {
  const baseUrl = input.server.http.url
  const directory = input.directory
  const fetch = input.fetch ?? globalThis.fetch
  const location = { directory }
  const connection = input.server.type === "ssh" ? `ssh:${input.server.host}`
    : input.server.type === "sidecar" ? input.server.variant === "wsl" ? `wsl:${input.server.distro}` : "sidecar"
    : new URL(baseUrl).origin
  const headers = new Headers(input.server.http.password ? {
    Authorization: `Basic ${btoa(`${input.server.http.username ?? "orchestra"}:${input.server.http.password}`)}`,
  } : undefined)
  let loading: Promise<ReturnType<typeof Orchestra.make>> | undefined
  const client = () => loading ??= (async () => {
    const { Orchestra } = await import("@orchestra/client")
    return Orchestra.make({ baseUrl, fetch, headers })
  })()
  const located = <S extends Schema.Decoder<unknown>>(schema: S, response: unknown): S["Type"] => {
    const decoded = Schema.decodeUnknownOption(Schema.Struct({
      location: Schema.Struct({ directory: Schema.String }), data: Schema.Unknown,
    }))(response)
    if (Option.isNone(decoded)) throw new ActionsRequestError("invalid_response")
    if (decoded.value.location.directory !== directory) throw new ActionsRequestError("binding_stale")
    const value = Schema.decodeUnknownOption(schema)(decoded.value.data)
    if (Option.isNone(value)) throw new ActionsRequestError("invalid_response")
    return value.value
  }
  const raw = async (path: string, query: Record<string, string | number | undefined>, signal: AbortSignal, body?: Schema.Json, readOnly = false) => {
    const url = new URL(path, baseUrl)
    url.searchParams.set("location[directory]", directory)
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined) url.searchParams.set(key, String(value)) })
    const requestHeaders = new Headers(headers)
    if (body !== undefined) requestHeaders.set("content-type", "application/json")
    const response = await fetch(url, { headers: requestHeaders, signal, redirect: "error",
      method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body) })
    if (response.ok) return response
    const preview = await previewResponse(response, signal).catch(() => undefined)
    const json = preview && !preview.truncated ? Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(preview.text) : Option.none()
    const decoded = Option.flatMap(json, Schema.decodeUnknownOption(Actions.ErrorData))
    if (Option.isSome(decoded)) throw requestError(decoded.value)
    if (body !== undefined && response.status >= 500) throw new ActionsRequestError(readOnly ? "transport_failed" : "outcome_unknown", undefined, undefined, readOnly ? "definitely_unsent" : "unknown")
    throw new ActionsRequestError(response.status === 404 ? "unsupported"
      : response.status === 401 ? "server_auth" : response.status === 403 ? "permission_denied"
      : response.status === 429 ? "rate_limited" : "transfer_failed")
  }
  return {
    directory,
    preferenceKey: JSON.stringify([connection, directory]),
    client,
    async bindings(signal: AbortSignal) {
      return located(Schema.Array(Actions.Binding), await (await client()).actionsBindings.list({ location }, { signal }))
    },
    async connect(payload: Actions.BindingInput, signal: AbortSignal) {
      return located(Actions.Binding, await (await client()).actionsBindings.create({ ...payload, location }, { signal }))
    },
    async removeBinding(scope: ActionsScope, signal: AbortSignal) {
      await (await client()).actionsBindings.remove({ ...scope, location }, { signal })
    },
    async capabilities(scope: ActionsScope, signal: AbortSignal) {
      return located(Schema.Array(Actions.Capability), await (await client()).actionsBindings.capabilities({ ...scope, location }, { signal }))
    },
    async policy(scope: ActionsScope, signal: AbortSignal) {
      return located(Actions.PolicyState, await (await client()).actionsBindings.policy({ ...scope, location }, { signal }))
    },
    async updatePolicy(scope: ActionsScope, policy: Actions.Policy, signal: AbortSignal) {
      return located(Actions.PolicyState, await (await client()).actionsBindings.updatePolicy({ ...scope, ...policy, location }, { signal }))
    },
    async workflows(scope: ActionsScope, query: Actions.ListInput, signal: AbortSignal) {
      return located(Actions.WorkflowPage, await (await client()).actionsWorkflows.list({ ...scope, ...query, location }, { signal }))
    },
    async runs(scope: ActionsScope, query: Actions.RunListInput, signal: AbortSignal) {
      return located(Actions.RunPage, await (await client()).actionsRuns.list({ ...scope, ...query, location }, { signal }))
    },
    async run(scope: ActionsScope, runID: string, signal: AbortSignal) {
      return located(Actions.Run, await (await client()).actionsRuns.get({ ...scope, runID, location }, { signal }))
    },
    async jobs(scope: ActionsScope, query: { runID: string; attempt?: number; cursor?: string }, signal: AbortSignal) {
      return located(Actions.JobPage, await (await client()).actionsRuns.jobs({ ...scope, ...query, location }, { signal }))
    },
    async source(scope: ActionsScope, query: { path: string; ref: string }, signal: AbortSignal) {
      return located(Actions.Source, await (await client()).actionsWorkflows.source({ ...scope, ...query, location }, { signal }))
    },
    async graph(scope: ActionsScope, query: { path: string; ref: string }, signal: AbortSignal) {
      return located(Actions.Graph, await (await client()).actionsWorkflows.graph({ ...scope, ...query, location }, { signal }))
    },
    async artifacts(scope: ActionsScope, query: Actions.ResourceListInput, signal: AbortSignal) {
      return located(Actions.ResourcePage, await (await raw(`/api/actions/resource/${encodeURIComponent(scope.bindingID)}`,
        { revision: scope.revision, ...query }, signal)).json())
    },
    async resources(scope: ActionsScope, query: Actions.ResourceListInput, signal: AbortSignal) {
      return located(Actions.ResourcePage, await (await raw(`/api/actions/resource/${encodeURIComponent(scope.bindingID)}`,
        { revision: scope.revision, ...query }, signal)).json())
    },
    async resource(scope: ActionsScope, kind: Actions.ResourceKind, action: ResourceAction, command: typeof Actions.ResourceCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await raw(`/api/actions/resource/${encodeURIComponent(scope.bindingID)}/${kind}/${action}`,
        { revision: scope.revision }, signal, jsonBody(command))).json()).operation
    },
    async validateSource(scope: ActionsScope, source: Actions.Source, draft: string, signal: AbortSignal) {
      return located(Actions.Graph, await (await raw(`/api/actions/source/${encodeURIComponent(scope.bindingID)}/validate`,
        { revision: scope.revision }, signal, jsonBody({ source, draft }), true)).json())
    },
    async sourceBase(scope: ActionsScope, ref: string | undefined, signal: AbortSignal) {
      return located(Actions.SourceBase, await (await raw(`/api/actions/source/${encodeURIComponent(scope.bindingID)}/base`,
        { revision: scope.revision, ref }, signal)).json())
    },
    async validateDraft(scope: ActionsScope, base: Actions.SourceBase, path: string, draft: string, signal: AbortSignal) {
      return located(Actions.Graph, await (await raw(`/api/actions/source/${encodeURIComponent(scope.bindingID)}/validate-draft`,
        { revision: scope.revision }, signal, jsonBody({ base, path, draft }), true)).json())
    },
    async sourceAction(scope: ActionsScope, action: "branch" | "write" | "review", command: typeof Actions.ResourceCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await raw(`/api/actions/source/${encodeURIComponent(scope.bindingID)}/${action}`,
        { revision: scope.revision }, signal, jsonBody(command))).json()).operation
    },
    async transferInfo(scope: ActionsScope, target: Actions.TransferInput, signal: AbortSignal) {
      return located(Actions.TransferInfo, await (await raw(`/api/actions/transfer/${encodeURIComponent(scope.bindingID)}/info`,
        { revision: scope.revision, ...target }, signal)).json())
    },
    transfer(scope: ActionsScope, target: Actions.TransferInput, signal: AbortSignal) {
      return raw(`/api/actions/transfer/${encodeURIComponent(scope.bindingID)}`, { revision: scope.revision, ...target }, signal)
    },
    async prepare(scope: ActionsScope, intent: Actions.OperationIntent, signal: AbortSignal) {
      if (intent.kind === "source.branch") return located(Actions.Operation, await (await raw(`/api/actions/operation/${encodeURIComponent(scope.bindingID)}`,
        { revision: scope.revision }, signal, jsonBody(intent))).json())
      return located(Actions.Operation, await (await client()).actionsOperations.prepare({ ...scope, ...intent, kind: intent.kind, location }, { signal }))
    },
    async receipt(scope: ActionsScope, operationID: Actions.OperationID, signal: AbortSignal) {
      return located(Actions.Operation, await (await client()).actionsOperations.get({ ...scope, operationID, location }, { signal }))
    },
    async dispatch(scope: ActionsScope, workflowID: string, command: typeof Actions.DispatchCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsWorkflows.dispatch({ ...scope, workflowID, ...command, location }, { signal })).operation
    },
    async retry(scope: ActionsScope, runID: string, command: typeof Actions.RetryCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsRuns.retry({ ...scope, runID, ...command, location }, { signal })).operation
    },
    async cancel(scope: ActionsScope, runID: string, command: typeof Actions.ProviderCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsRuns.cancel({ ...scope, runID, ...command, location }, { signal })).operation
    },
    async remove(scope: ActionsScope, runID: string, command: typeof Actions.ProviderCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsRuns.remove({ ...scope, runID, ...command, location }, { signal })).operation
    },
    async jobRetry(scope: ActionsScope, jobID: string, command: typeof Actions.JobRetryCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsJobs.retry({ ...scope, jobID, ...command, location }, { signal })).operation
    },
    async jobPlay(scope: ActionsScope, jobID: string, command: typeof Actions.JobPlayCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsJobs.play({ ...scope, jobID, ...command, location }, { signal })).operation
    },
    async workflowState(scope: ActionsScope, workflowID: string, command: typeof Actions.WorkflowStateCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsWorkflows.state({ ...scope, workflowID, ...command, location }, { signal })).operation
    },
    async approveFork(scope: ActionsScope, runID: string, command: typeof Actions.GitHubCommand.Type, signal: AbortSignal) {
      return located(Actions.CommandExecution, await (await client()).actionsRuns.approveFork({ ...scope, runID, ...command, location }, { signal })).operation
    },
    async execute(scope: ActionsScope, id: Actions.OperationID, command: ActionsCommand, signal: AbortSignal) {
      const body = { id, input: command.input }
      const action = command.kind === "source.branch" ? "branch" : command.kind === "source.write" ? "write" : command.kind === "source.review" ? "review" : undefined
      if (action) return located(Actions.CommandExecution, await (await raw(`/api/actions/source/${encodeURIComponent(scope.bindingID)}/${action}`,
        { revision: scope.revision }, signal, jsonBody(body))).json())
      if (command.target.resourceKind && command.action) return located(Actions.CommandExecution,
        await (await raw(`/api/actions/resource/${encodeURIComponent(scope.bindingID)}/${command.target.resourceKind}/${command.action}`,
          { revision: scope.revision }, signal, jsonBody(body))).json())
      const native = await client()
      const args = { ...scope, location }
      if (command.kind === "workflow.dispatch") return located(Actions.CommandExecution,
        await native.actionsWorkflows.dispatch({ ...args, workflowID: nativeID(command.target.workflowID), ...decodeAction(Actions.DispatchCommand, body) }, { signal }))
      if (command.kind === "workflow.enable" || command.kind === "workflow.disable") return located(Actions.CommandExecution,
        await native.actionsWorkflows.state({ ...args, workflowID: nativeID(command.target.workflowID), ...decodeAction(Actions.WorkflowStateCommand, body) }, { signal }))
      if (command.kind === "run.retry" || command.kind === "run.retryFailed") return located(Actions.CommandExecution,
        await native.actionsRuns.retry({ ...args, runID: nativeID(command.target.runID), ...decodeAction(Actions.RetryCommand, body) }, { signal }))
      if (command.kind === "run.cancel") return located(Actions.CommandExecution,
        await native.actionsRuns.cancel({ ...args, runID: nativeID(command.target.runID), ...decodeAction(Actions.ProviderCommand, body) }, { signal }))
      if (command.kind === "run.delete") return located(Actions.CommandExecution,
        await native.actionsRuns.remove({ ...args, runID: nativeID(command.target.runID), ...decodeAction(Actions.ProviderCommand, body) }, { signal }))
      if (command.kind === "run.approveFork") return located(Actions.CommandExecution,
        await native.actionsRuns.approveFork({ ...args, runID: nativeID(command.target.runID), ...decodeAction(Actions.GitHubCommand, body) }, { signal }))
      if (command.kind === "job.play") return located(Actions.CommandExecution,
        await native.actionsJobs.play({ ...args, jobID: nativeID(command.target.jobID), ...decodeAction(Actions.JobPlayCommand, body) }, { signal }))
      if (command.kind === "job.retry") return located(Actions.CommandExecution,
        await native.actionsJobs.retry({ ...args, jobID: nativeID(command.target.jobID), ...decodeAction(Actions.JobRetryCommand, body) }, { signal }))
      throw new ActionsRequestError("invalid_input")
    },
  }
}
