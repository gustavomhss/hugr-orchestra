import type { State } from "./contract"
import { immutableSource } from "./requests"
export { sourceDiscardBlocked } from "./requests"

export function sourceDraftDirty(state: State) {
  const base = state.draftBase ?? state.source.value
  return !!base && base.bindingID === state.binding?.id && !immutableSource(state, base)
    && (!!state.draftBase || state.draft !== state.source.value?.text)
}

type UnloadEvent = Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">

/** The view registers this only while dirty and owns the returned cleanup. */
export function sourceUnloadGuard(target: {
  addEventListener(type: "beforeunload", listener: (event: UnloadEvent) => void): void
  removeEventListener(type: "beforeunload", listener: (event: UnloadEvent) => void): void
}, dirty: () => boolean) {
  const listener = (event: UnloadEvent) => {
    if (!dirty()) return
    event.preventDefault()
    event.returnValue = ""
  }
  target.addEventListener("beforeunload", listener)
  return () => target.removeEventListener("beforeunload", listener)
}
