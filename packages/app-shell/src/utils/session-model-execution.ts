import type { makeModelExecutionQuery } from "@orchestra/client"

type Execute = Parameters<typeof makeModelExecutionQuery>[0]["execute"]
const executions = new WeakMap<object, Execute>()

export function registerSessionModelExecution(api: object, execute: Execute) {
  executions.set(api, execute)
}

export function modelExecutionForSession(api: object) {
  return executions.get(api)
}

export function inheritSessionModelExecution(from: object, to: object) {
  const execute = executions.get(from)
  if (execute) executions.set(to, execute)
}

export type SessionModelRef = { providerID: string; id: string; variant?: string }

const pendingSelections = new WeakMap<object, Set<{ sessionID: string; model: SessionModelRef }>>()

export function trackSessionModelSelection(api: object, sessionID: string, model: SessionModelRef) {
  const pending = pendingSelections.get(api) ?? new Set()
  const selection = { sessionID, model }
  pending.add(selection)
  pendingSelections.set(api, pending)
  return () => { pending.delete(selection) }
}

export function sessionModelSelectionPending(api: object, sessionID: string, model: SessionModelRef) {
  const pending = pendingSelections.get(api)
  if (!pending) return false
  return [...pending].some((selection) => selection.sessionID === sessionID && selection.model.providerID === model.providerID &&
    selection.model.id === model.id && selection.model.variant === model.variant)
}
