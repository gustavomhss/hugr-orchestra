import type { Actions } from "@orchestra/schema/actions"
import { ActionsRequestError, type createActionsAPI } from "./api"
import type { State } from "./contract"

/** Dialogs own cancellation and results; inspection never installs a main-view source. */
export function createActionsInspection(input: {
  api: ReturnType<typeof createActionsAPI>
  state: () => State
  disposed: () => boolean
}) {
  const capture = (signal: AbortSignal) => {
    const binding = input.state().binding
    if (!binding || signal.aborted || input.disposed()) throw new ActionsRequestError("binding_stale")
    const scope = { bindingID: binding.id, revision: binding.revision }
    return { scope, current: () => {
      if (signal.aborted || input.disposed() || input.state().binding?.id !== scope.bindingID
        || input.state().binding?.revision !== scope.revision) throw new ActionsRequestError("binding_stale")
    } }
  }
  return {
    async inspectWorkflow(workflowID: string, ref: string, signal: AbortSignal) {
      const captured = capture(signal)
      const workflow = input.state().workflows.value?.items.find((item) => item.bindingID === captured.scope.bindingID && item.id === workflowID)
      if (!workflow?.path || !ref) throw new ActionsRequestError("source_unresolved")
      const path = workflow.path
      const graph = await input.api.graph(captured.scope, { path, ref }, signal)
      captured.current()
      if (graph.source.bindingID !== captured.scope.bindingID || graph.source.path !== path || graph.source.ref !== ref)
        throw new ActionsRequestError("source_conflict")
      return graph
    },
    async resourceScopes(signal: AbortSignal): Promise<Actions.ResourcePage> {
      const captured = capture(signal)
      const page = await input.api.resources(captured.scope, { kind: "environments", limit: 30 }, signal)
      captured.current()
      if (page.items.length > 30) throw new ActionsRequestError("metadata_truncated")
      if (page.items.some((item) => item.bindingID !== captured.scope.bindingID || item.kind !== "environments"))
        throw new ActionsRequestError("binding_stale")
      return page
    },
  }
}
