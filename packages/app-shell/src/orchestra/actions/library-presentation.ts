import type { Actions } from "@orchestra/schema/actions"
import type { Filters, State, Translate } from "./contract"
import { visibleWorkflows } from "./selection"

/** Collection previews use native list metadata only; source and graph stay navigation-owned. */
export function libraryPresentation(state: State, filters: Pick<Filters, "query" | "status">) {
  const binding = state.binding
  const page = binding && state.workflows.status === "ready"
    ? state.workflows.value?.items.filter((item) => item.bindingID === binding.id).slice(0, 100) ?? [] : []
  const runs = binding && state.runs.status === "ready"
    ? (state.runs.value?.items.filter((item) => item.bindingID === binding.id).slice(0, 100) ?? [])
      .toSorted((a, b) => timestamp(b) - timestamp(a)) : []
  return {
    page,
    workflows: visibleWorkflows(page, { query: filters.query, status: "" })
      .filter((item) => !filters.status || workflowState(item.state).filter === filters.status),
    recent: runs.slice(0, 3),
    latest: runs.reduce((result, run) => {
      if (!result.has(run.workflowID)) result.set(run.workflowID, run)
      return result
    }, new Map<string, Actions.Run>()),
    // Identify the approved source, but always navigate with the observed native workflow ID.
    actualOrchestraCI: binding?.provider.kind === "github" && binding.provider.hostname.toLowerCase() === "github.com"
      && binding.projectPath.toLowerCase() === "gustavomhss/hugr-orchestra"
      ? page.find((item) => item.path === ".github/workflows/test.yml") : undefined,
  }
}

// Fixed like the approved mock: every option stays visible even when no loaded workflow has that state.
export const workflowFilters = [
  { value: "", label: "orchestra.actions.all" },
  { value: "active", label: "orchestra.actions.active" },
  { value: "disabled", label: "orchestra.actions.disabled" },
] as const

/** Run filter values are native statuses: the model sends the selected value unchanged to the provider run list. */
export function runFilters(kind?: Actions.ProviderKind) {
  const gitlab = kind === "gitlab"
  return [
    { value: "", label: "orchestra.actions.all" },
    { value: gitlab ? "failed" : "failure", label: "orchestra.actions.failed" },
    { value: gitlab ? "running" : "in_progress", label: "orchestra.actions.running" },
    { value: gitlab ? "manual" : "waiting", label: gitlab ? "orchestra.actions.manual" : "orchestra.actions.needsApproval" },
    { value: gitlab ? "pending" : "queued", label: "orchestra.actions.queued" },
    { value: "success", label: "orchestra.actions.passed" },
  ] as const
}

/** A stored status that is not an option of the current list (e.g. after a provider switch) counts as All. */
export function selectedFilter(filters: readonly { value: string }[], status: string) {
  return filters.some((item) => item.value === status) ? status : ""
}

export function runIdentity(run: Actions.Run) {
  return { title: run.title ?? run.name ?? run.id, number: run.number === undefined ? run.id : `#${run.number}` }
}

export function workflowState(state: string): { filter: string; label?: Parameters<Translate>[0]; tone: string } {
  if (state === "active" || state === "configured") return { filter: "active", label: "orchestra.actions.active", tone: "good" }
  if (["disabled", "disabled_manually", "disabled_inactivity", "disabled_fork"].includes(state)) {
    return { filter: "disabled", label: "orchestra.actions.disabled", tone: "" }
  }
  return { filter: state, tone: "" }
}

function timestamp(run: Actions.Run) {
  const value = Date.parse(run.createdAt ?? run.startedAt ?? "")
  return Number.isNaN(value) ? 0 : value
}
