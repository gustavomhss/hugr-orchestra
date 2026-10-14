import type { Actions } from "@orchestra/schema/actions"
import { actionsError, ActionsRequestError } from "./api"
import type { Dialog, ErrorState, State } from "./contract"
import { githubDefinitions, headerDefinitions } from "./source-dialogs"

type DispatchDialog = Extract<Dialog, { kind: "dispatch" }>
type SelectionState = Pick<State, "binding" | "dialog" | "route" | "workflows">
type Selection = {
  dialog: DispatchDialog
  bindingID: Actions.BindingID
  revision: number
  provider: Actions.ProviderKind
  workflowID: string
  path: string
  ref: string
}
export type DispatchData = {
  status: "idle" | "loading" | "ready" | "error" | "unresolved"
  definitions?: readonly Actions.InputDefinition[]
  error?: ErrorState
}
type Reader = {
  inspectWorkflow(workflowID: string, ref: string, signal: AbortSignal): Promise<Actions.Graph>
  resourceScopes(signal: AbortSignal): Promise<Actions.ResourcePage>
}

export function dispatchDefaultRef(state: SelectionState, dialog: DispatchDialog) {
  const workflow = state.workflows.value?.items.find((item) => item.bindingID === state.binding?.id && item.id === dialog.workflowID)
  if (!workflow) return ""
  if ((state.route.view === "workflow" || state.route.view === "source") && !state.route.runID
    && state.route.workflowID === workflow.id && (!state.route.path || state.route.path === workflow.path)
    && state.route.ref !== undefined) return state.route.ref
  return workflow.defaultRef ?? ""
}

export function dispatchSelection(state: SelectionState, ref: string): Selection | undefined {
  const dialog = state.dialog
  if (dialog?.kind !== "dispatch" || !state.binding) return
  const workflow = state.workflows.value?.items.find((item) => item.bindingID === state.binding?.id && item.id === dialog.workflowID)
  if (!workflow?.path || !ref.trim()) return
  return { dialog, bindingID: state.binding.id, revision: state.binding.revision,
    provider: state.binding.provider.kind, workflowID: dialog.workflowID, path: workflow.path, ref: ref.trim() }
}

/** One dialog owns these reads. Transport cancellation alone cannot fence late completions. */
export function createDispatchData(input: {
  model: Reader
  current: () => Selection | undefined
  update: (data: DispatchData) => void
}) {
  let controller: AbortController | undefined
  let generation = 0
  let disposed = false
  let loaded: Selection | undefined
  const matches = (selection: Selection) => {
    const current = input.current()
    return !!current && current.dialog === selection.dialog && current.bindingID === selection.bindingID
      && current.revision === selection.revision && current.provider === selection.provider
      && current.path === selection.path && current.ref === selection.ref
      && current.workflowID === selection.workflowID
  }
  const cancel = () => {
    generation++
    loaded = undefined
    controller?.abort()
    controller = undefined
  }
  return {
    ready: () => !disposed && !!loaded && matches(loaded),
    cancel,
    dispose() { disposed = true; cancel() },
    async load() {
      cancel()
      if (disposed) return
      const selection = input.current()
      if (!selection) { input.update({ status: "idle", definitions: undefined, error: undefined }); return }
      const abort = new AbortController()
      controller = abort
      const captured = generation
      const current = () => !disposed && !abort.signal.aborted && captured === generation && matches(selection)
      input.update({ status: "loading", definitions: undefined, error: undefined })
      await Promise.resolve().then(async () => {
        if (!current()) return
        const graph = await input.model.inspectWorkflow(selection.workflowID, selection.ref, abort.signal)
        if (!current()) return
        if (graph.source.bindingID !== selection.bindingID || graph.source.path !== selection.path || graph.source.ref !== selection.ref)
          throw new ActionsRequestError("source_unresolved")
        const definitions = dispatchDefinitions(graph, selection.provider)
        if (!definitions) {
          input.update({ status: "unresolved", definitions: undefined, error: {
            kind: graph.diagnostics.some((item) => item.startsWith("inputs_include_unresolved:")) ? "inputs_include_unresolved" : "source_unresolved",
            message: "orchestra.actions.partialGraph",
          } })
          return
        }
        const options = definitions.some((item) => item.type === "environment")
          ? environmentOptions(await input.model.resourceScopes(abort.signal), selection.bindingID) : undefined
        if (!current()) return
        loaded = selection
        input.update({ status: "ready", error: undefined, definitions: definitions.map((item) => item.type === "environment"
          ? { ...item, options } : item) })
      }).catch((error: unknown) => {
        if (current()) input.update({ status: "error", definitions: undefined, error: actionsError(error) })
      })
    },
  }
}

export function dispatchDefinitions(graph: Actions.Graph, provider: Actions.ProviderKind) {
  if (graph.diagnostics.some((item) => /^(inputs_include_unresolved|input_unresolved|input_invalid):/.test(item))) return
  if (provider === "gitlab" && graph.header && typeof graph.header === "object" && !Array.isArray(graph.header)
    && graph.header.spec && typeof graph.header.spec === "object" && !Array.isArray(graph.header.spec) && "include" in graph.header.spec) return
  const definitions = provider === "github" ? githubDefinitions(graph.triggers)
    : graph.inputs ?? headerDefinitions(graph.header) ?? (graph.header === undefined && graph.includes === undefined && !graph.source.includes?.length && graph.state !== "unresolved" ? [] : undefined)
  // Native GitLab options can be numbers or booleans. Index-valued selects preserve those types.
  return definitions?.map((item): Actions.InputDefinition => item.options && item.type !== "environment" && item.type !== "array"
    ? { ...item, type: "choice" } : item)
}

export function environmentOptions(page: Actions.ResourcePage, bindingID: Actions.BindingID) {
  if (page.next !== undefined || (page.total !== undefined && page.total > page.items.length)) throw new ActionsRequestError("metadata_truncated")
  return [...new Set(page.items.filter((item) => item.bindingID === bindingID && item.kind === "environments" && item.name !== "")
    .map((item) => item.name))]
}
