type Target = Window & { __ORCHESTRA__?: { deepLinks?: string[] } }
type Bridge = {
  consumeInitialDeepLinks(): Promise<string[]>
  onDeepLink(callback: (urls: string[]) => void): () => void
}

export function listenForDeepLinks(target: Target, api: Bridge) {
  const state = { pending: undefined as string[] | undefined, disposed: false }
  const emit = (urls: string[]) => {
    if (!urls.length || state.disposed) return
    const event = new CustomEvent("orchestra:deep-link", { detail: { urls }, cancelable: true })
    target.dispatchEvent(event)
    if (event.defaultPrevented) return
    target.__ORCHESTRA__ ??= {}
    target.__ORCHESTRA__.deepLinks = [...(target.__ORCHESTRA__.deepLinks ?? []), ...urls]
  }
  const ready = () => {
    if (state.pending) return
    state.pending = []
    void api
      .consumeInitialDeepLinks()
      .then((urls) => {
        const pending = state.pending ?? []
        state.pending = undefined
        emit([...urls, ...pending])
      })
      .catch(() => {
        const pending = state.pending ?? []
        state.pending = undefined
        emit(pending)
      })
  }
  target.addEventListener("orchestra:deep-link-ready", ready)
  const unsubscribe = api.onDeepLink((urls) => (state.pending ? state.pending.push(...urls) : emit(urls)))
  return () => {
    state.disposed = true
    target.removeEventListener("orchestra:deep-link-ready", ready)
    unsubscribe()
  }
}
