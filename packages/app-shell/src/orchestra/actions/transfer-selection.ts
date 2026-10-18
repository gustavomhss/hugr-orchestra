import type { Actions } from "@orchestra/schema/actions"
import type { State } from "./contract"

export function validTransfer(state: State, target: Actions.TransferInput) {
  if (target.kind === "artifact" && !state.route.runID) return state.resources.value?.items.some((item) => item.kind === "artifacts" && item.id === target.id && item.bindingID === state.binding?.id)
  if (target.kind === "secureFile" || !state.binding || !state.route.runID || target.runID !== state.route.runID) return false
  if (target.kind !== "artifact" && state.route.attempt !== undefined && target.attempt !== state.route.attempt) return false
  if (target.kind === "runLog") return target.id === state.route.runID
  if (target.kind === "artifact") return state.artifacts.value?.items.some((item) => item.id === target.id && item.bindingID === state.binding?.id)
  return state.jobs.value?.items.some((item) => item.id === target.id && item.bindingID === state.binding?.id && item.runID === target.runID
    && (target.attempt === undefined || item.attempt === undefined || item.attempt === target.attempt))
}
