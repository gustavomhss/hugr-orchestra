import type { Actions } from "@orchestra/schema/actions"
import type { State } from "./contract"
import { canRequestAction } from "./action-eligibility"

export function settingsPolicy(state: State) {
  return state.resources.status === "ready" ? state.resources.value?.items.find((item) =>
    item.bindingID === state.binding?.id && item.kind === "policy" && item.id === "project-settings") : undefined
}

export function localPolicyEvidence(resource?: Actions.Resource) {
  const policy = record(record(resource?.data).policy)
  return {
    retentionDays: typeof policy.retentionDays === "number" && Number.isInteger(policy.retentionDays) && policy.retentionDays > 0 ? policy.retentionDays : undefined,
    execution: typeof policy.execution === "string" && policy.execution.length > 0 ? policy.execution : undefined,
    readOnly: policy.readOnly === true || policy.readonly === true || policy.inherited === true || policy.editable === false,
  }
}

export function nativePolicyEvidence(resource?: Actions.Resource) {
  const data = record(resource?.data)
  return {
    // Only these exact native values round-trip through the existing provider command.
    value: data.nativePolicy === "Project default" || data.nativePolicy === "Restricted to approved actions" ? data.nativePolicy : undefined,
    unavailable: record(data.nativePolicy).state === "unavailable",
    settings: typeof data.nativeSettings === "object" && data.nativeSettings !== null && !Array.isArray(data.nativeSettings) ? data.nativeSettings : undefined,
    version: typeof data.resourceVersion === "string" && data.resourceVersion.length > 0 ? data.resourceVersion : undefined,
  }
}

export function canConfigureLocalPolicy(state: State, resource = settingsPolicy(state)) {
  const policy = localPolicyEvidence(resource)
  // Provider read-only flags and native write authorization do not govern this local store.
  return !state.submitting && !state.unsupported && !!state.binding && resource === settingsPolicy(state)
    && !!resource && record(resource.data).historical !== true && !policy.readOnly
}

export function canConfigureNativePolicy(state: State, resource = settingsPolicy(state)) {
  const policy = nativePolicyEvidence(resource)
  return state.binding?.provider.kind === "github" && !!resource && resource === settingsPolicy(state)
    && resource.scope === "Repository" && record(resource.data).historical !== true && policy.value !== undefined && policy.version !== undefined
    && canRequestAction(state, { kind: "resource.update", target: { resourceKind: "policy", resourceID: resource.id, scope: resource.scope },
      expected: { resourceVersion: policy.version } })
}

/** Connection is an observation of reads, not a cached binding or a write-permission claim. */
export function settingsConnection(state: State) {
  const errors = [state.bindings, state.capabilities, state.resources, state.workflows, state.runs, state.run, state.jobs, state.source, state.graph, state.artifacts, state.log]
    .flatMap((data) => data.status === "error" && data.error ? [data.error] : [])
  const auth = [state.commandError, ...errors].find((error) => error?.kind === "not_authenticated" || error?.kind === "server_auth")
  if (auth) return { state: "unavailable" as const, label: auth.message }
  if (state.unsupported) return { state: "unavailable" as const, label: "orchestra.actions.unsupported" as const }
  if (errors.length) return { state: "unavailable" as const, label: errors[0].message }
  if (!state.binding) return { state: "unknown" as const, label: "orchestra.actions.unknown" as const }
  const scopes = [`repository:${state.binding.projectID}`, `project:${state.binding.projectID}`, `projects/${state.binding.projectID}`]
  const observed = state.capabilities.status === "ready" && state.capabilities.value?.some((item) =>
    ["workflows.list", "workflows.read", "runs.list", "runs.read", "jobs.list", "jobs.read", "source.read", "logs.read"].includes(item.operation)
    && item.state === "available" && (!item.scope || scopes.includes(item.scope)))
  if (observed || nativePolicyEvidence(settingsPolicy(state)).settings) return { state: "connected" as const, label: "orchestra.actions.connected" as const }
  return { state: "unknown" as const, label: "orchestra.actions.unknown" as const }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}
}
