import type { Actions } from "@orchestra/schema/actions"
import type { Filters, Route, State } from "./contract"

/** Complete selections from this binding's native observations, never from a recent run's branch. */
export function selectedRoute(state: State, route: Route): Route {
  if (!["workflow", "source", "run", "job"].includes(route.view) && !(route.view === "runs" && route.workflowID)) return { ...route }
  const run = [state.run.value, ...(state.runs.value?.items ?? [])].find((item) =>
    item?.bindingID === state.binding?.id && item?.id === route.runID)
  const workflowID = route.workflowID ?? run?.workflowID
  const workflow = state.workflows.value?.items.find((item) => item.bindingID === state.binding?.id && item.id === workflowID)
  const path = route.path ?? (!route.runID || state.binding?.provider.kind === "github" ? workflow?.path : undefined)
  const ref = route.runID ? run?.commit || route.ref
    : route.ref ?? (workflowID && workflowID === state.route.workflowID && !state.route.runID ? state.route.ref : undefined)
      ?? workflow?.defaultRef
  return { ...route, workflowID, path, ref,
    tab: route.tab ?? (route.view === "runs" ? undefined : route.view === "source" ? "source" : route.view === "job" ? "logs" : "graph") }
}

export function visibleWorkflows(items: readonly Actions.Workflow[], filters: Pick<Filters, "query" | "status">) {
  const query = filters.query.trim().toLowerCase()
  return items.filter((item) => (!query || `${item.name ?? ""} ${item.path}`.toLowerCase().includes(query))
    && (!filters.status || (filters.status === "disabled" ? item.state.startsWith("disabled") : item.state === filters.status)))
}
