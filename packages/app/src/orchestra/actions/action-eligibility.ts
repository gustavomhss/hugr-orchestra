import type { Actions } from "@orchestra/schema/actions"
import type { ActionsCommand } from "./api"
import type { State } from "./contract"
import { canRequest } from "./request-policy"

/** Native edit evidence is operation-specific; schedule ownership does not deny play/delete. */
export function resourceWritable(resource: Actions.Resource, operation: Actions.OperationKind) {
  const data = resource.data
  if (!isMetadata(data)) return false
  if (data.readOnly === true || data.readonly === true || data.inherited === true || resource.status?.toLowerCase() === "inherited") return false
  if (operation === "resource.update") return data.editable !== false && (resource.kind !== "schedules" || data.ownedByCurrentActor !== false)
  if (operation === "resource.delete" || operation === "runner.remove") return data.removable !== false
  if (operation === "deployment.review") return data.current_user_can_approve !== false
  return true
}

/** Shared by native controls and both command boundaries; Unknown stays requestable. */
export function canRequestAction(state: State, command: Pick<ActionsCommand, "kind" | "target" | "expected">, owner?: { current: () => boolean }) {
  if (!canRequest(state, command.kind, command.target.scope, owner)) return false
  const binding = state.binding
  if (!binding) return false
  const target = command.target
  if (command.kind.startsWith("workflow.")) {
    const workflow = state.workflows.status === "ready" ? state.workflows.value?.items.find((item) => item.id === target.workflowID && item.bindingID === binding.id) : undefined
    if (!workflow?.path || (target.path !== undefined && target.path !== workflow.path)) return false
    if (binding.provider.kind === "github" && (!nativeID(binding.provider.kind, workflow.id) || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))) return false
    if (binding.provider.kind === "gitlab" && (workflow.id !== `gitlab:project:${binding.projectID}:pipeline`
      || /[:@\x00-\x1f\x7f\\?*{}$]/.test(workflow.path) || workflow.path.startsWith("/")
      || workflow.path.split("/").some((part) => !part || part === "." || part === ".."))) return false
    if (command.kind === "workflow.dispatch") return workflow.dispatchState !== "unavailable"
      && workflow.state === (binding.provider.kind === "github" ? "active" : "configured")
    return binding.provider.kind === "github" && ["active", "disabled_manually", "disabled_inactivity", "disabled_fork"].includes(workflow.state)
  }
  if (command.kind.startsWith("run.") || command.kind.startsWith("job.")) {
    const run = state.run.status === "ready" && state.run.value && state.run.value.id === target.runID && state.run.value.bindingID === binding.id
      ? state.run.value : state.runs.status === "ready" ? state.runs.value?.items.find((item) => item.id === target.runID && item.bindingID === binding.id) : undefined
    if (!run || !nativeID(binding.provider.kind, run.id) || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(run.commit)
      || (command.expected?.commit !== undefined && command.expected.commit !== run.commit)
      || (command.expected?.attempt !== undefined && command.expected.attempt !== run.attempt)) return false
    if (binding.provider.kind === "github" && (!Number.isSafeInteger(run.attempt) || !run.attempt || run.attempt < 1)) return false
    if (state.route.runID === run.id && state.route.attempt !== undefined && state.route.attempt !== run.attempt) return false
    if (command.kind.startsWith("job.")) {
      const job = state.jobs.status === "ready" ? state.jobs.value?.items.find((item) => item.id === target.jobID && item.runID === run.id && item.bindingID === binding.id) : undefined
      if (!job || !nativeID(binding.provider.kind, job.id) || (binding.provider.kind === "github" && job.attempt !== run.attempt)
        || (command.expected?.attempt !== undefined && job.attempt !== command.expected.attempt)) return false
      if (command.kind === "job.play") return binding.provider.kind === "gitlab" && job.status === "manual"
      if (command.kind === "job.retry") return binding.provider.kind === "github"
        ? job.status === "completed" && run.status === "completed" : ["success", "failed", "canceled"].includes(job.status ?? "")
      return false
    }
    if (command.kind === "run.retry" || command.kind === "run.retryFailed") return binding.provider.kind === "github"
      ? run.status === "completed" && (command.kind !== "run.retryFailed" || ["failure", "cancelled", "timed_out"].includes(run.conclusion ?? ""))
      : command.kind === "run.retry"
    if (command.kind === "run.cancel") return binding.provider.kind === "github"
      ? ["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status ?? "")
      : ["created", "waiting_for_resource", "preparing", "pending", "running", "scheduled"].includes(run.status ?? "")
    if (command.kind === "run.delete") return binding.provider.kind !== "github" || run.status === "completed"
    return false
  }
  if (target.resourceKind) {
    if (command.kind === "resource.create" || command.kind === "runner.register" || command.kind === "cache.clear") return state.resources.status === "ready"
    const resources = [...(state.resources.status === "ready" ? state.resources.value?.items ?? [] : []),
      ...(state.artifacts.status === "ready" ? state.artifacts.value?.items ?? [] : [])]
      .filter((item) => item.bindingID === binding.id && item.kind === target.resourceKind
        && (item.id === target.resourceID || (item.kind === "variables" || item.kind === "environments") && item.name === target.resourceID)
        && (target.scope === undefined || item.scope === target.scope))
    if (!resources.length || !resources.every((item) => item.id === resources[0].id && item.scope === resources[0].scope && resourceWritable(item, command.kind))) return false
    if (command.kind === "schedule.play" && (binding.provider.kind !== "gitlab" || target.resourceKind !== "schedules")) return false
    if (command.kind === "artifact.keep" && (binding.provider.kind !== "gitlab" || target.resourceKind !== "artifacts")) return false
    return command.expected?.resourceVersion === undefined || resources.every((item) => isMetadata(item.data)
      && item.data.resourceVersion === command.expected?.resourceVersion)
  }
  return command.kind.startsWith("source.")
}

function isMetadata(value: Actions.Resource["data"]): value is Readonly<Record<string, Actions.Resource["data"]>> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function nativeID(provider: Actions.ProviderKind, value: string) {
  return (provider === "github" ? /^[1-9]\d{0,127}$/ : /^[1-9]\d*$/).test(value)
}
