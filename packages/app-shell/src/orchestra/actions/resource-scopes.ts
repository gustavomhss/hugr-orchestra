import type { Actions } from "@orchestra/schema/actions"
import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { actionsError, ActionsRequestError } from "./api"
import type { ErrorState, Model } from "./contract"

export function defaultResourceScope(provider: Actions.ProviderKind) {
  return provider === "github" ? "Repository" : "*"
}

export function resourceScopeOptions(provider: Actions.ProviderKind, environments: readonly string[], existing: readonly string[] = []) {
  // GitHub's adapter accepts exact environment names, not an Environment: display prefix.
  // GitLab's catalog is suggestions only: native scopes may be arbitrary strings or patterns.
  return [...new Set([defaultResourceScope(provider), ...environments, ...existing])]
}

export function resourceScopePage(page: Actions.ResourcePage, bindingID: Actions.BindingID) {
  if (page.items.length > 30) throw new ActionsRequestError("metadata_truncated")
  if (page.items.some((item) => item.bindingID !== bindingID)) throw new ActionsRequestError("binding_stale")
  if (page.items.some((item) => item.kind !== "environments" || !item.name.trim() || item.name.length > 1024 || /[\x00-\x1f\x7f]/.test(item.name))) throw new ActionsRequestError("invalid_response")
  return {
    names: [...new Set(page.items.map((item) => item.name))],
    truncated: Boolean(page.next) || page.total !== undefined && page.total > page.items.length,
  }
}

/** One bounded environment page per mounted scope field; never shares the variables slot. */
export function createResourceScopes(model: Pick<Model, "state" | "resourceScopes">) {
  const [state, setState] = createStore<{
    status: "idle" | "loading" | "ready" | "error"
    names: string[]
    truncated: boolean
    error?: ErrorState
  }>({ status: "idle", names: [], truncated: false })
  createEffect(() => {
    const id = model.state.binding?.id
    const revision = model.state.binding?.revision
    const unsupported = model.state.unsupported
    setState({ status: id && !unsupported ? "loading" : "idle", names: [], truncated: false, error: undefined })
    if (!id || unsupported) return
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && model.state.binding?.id === id && model.state.binding.revision === revision && !model.state.unsupported
    onCleanup(() => controller.abort())
    void Promise.resolve().then(() => current() ? model.resourceScopes(controller.signal) : undefined)
      .then((page) => {
        if (page && current()) setState({ status: "ready", ...resourceScopePage(page, id) })
      })
      .catch((error: unknown) => {
        if (current()) setState({ status: "error", names: [], truncated: false, error: actionsError(error) })
      })
  })
  return state
}
