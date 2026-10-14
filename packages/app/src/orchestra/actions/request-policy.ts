import { Actions } from "@orchestra/schema/actions"
import type { State } from "./contract"

/** Unknown authorization permits an explicit request, never an availability claim. */
export function canRequest(state: State, operation: string, scope?: string) {
  if (!Actions.OperationKind.literals.some((kind) => kind === operation) || state.submitting || state.unsupported || !state.binding
    || state.capabilities.status !== "ready" || state.operation?.state === "outcome_unknown") return false
  if (state.route.runID && state.route.attempt !== undefined && state.run.value?.attempt !== state.route.attempt) return false
  const projectScopes = [`repository:${state.binding.projectID}`, `project:${state.binding.projectID}`, `projects/${state.binding.projectID}`]
  return !state.capabilities.value?.some((item) => item.operation === operation && item.state === "unavailable"
    && (!item.scope || !scope || item.scope === scope || projectScopes.includes(item.scope)))
}
