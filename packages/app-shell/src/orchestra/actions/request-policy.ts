import { Actions } from "@orchestra/schema/actions"
import type { State } from "./contract"

/** Unknown authorization permits an explicit request, never an availability claim. */
export function canRequest(state: State, operation: string, scope?: string, command?: { current: () => boolean }) {
  // Only the current command owner can check admission while its own submit is active.
  if (!Actions.OperationKind.literals.some((kind) => kind === operation) || (command && !command.current())
    || (state.submitting && !command?.current()) || state.unsupported || !state.binding
    || state.capabilities.status !== "ready" || !state.capabilities.value || state.operation?.state === "outcome_unknown" || state.operation?.state === "sending"
    || state.commandError?.kind === "outcome_unknown") return false
  if (state.route.runID && state.route.attempt !== undefined) {
    const run = state.run.status === "ready" && state.run.value?.id === state.route.runID && state.run.value.bindingID === state.binding.id
      ? state.run.value : state.runs.status === "ready" ? state.runs.value?.items.find((item) => item.id === state.route.runID && item.bindingID === state.binding?.id) : undefined
    if (run?.attempt !== state.route.attempt) return false
  }
  const projectScopes = [`repository:${state.binding.projectID}`, `project:${state.binding.projectID}`, `projects/${state.binding.projectID}`]
  return !state.capabilities.value?.some((item) => item.operation === operation && item.state === "unavailable"
    && (!item.scope || !scope || item.scope === scope || projectScopes.includes(item.scope)))
}
