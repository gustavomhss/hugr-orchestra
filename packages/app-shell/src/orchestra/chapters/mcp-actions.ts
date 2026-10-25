import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { mcpBrowserOpenFailed } from "./mcp-model"

// One request per server at a time; failures stay on their row until that row acts again.
export function createMcpActions() {
  // MCP names are configuration keys and may also be names on Object.prototype.
  const [state, setState] = createStore({
    pending: Object.create(null) as Record<string, boolean>,
    failures: Object.create(null) as Record<string, { detail?: string } | undefined>,
  })
  const lifetime = { disposed: false }
  onCleanup(() => {
    lifetime.disposed = true
  })

  return {
    state,
    async run(name: string, action: () => Promise<unknown>) {
      if (lifetime.disposed || state.pending[name]) return
      setState("pending", name, true)
      setState("failures", name, undefined)
      await action()
        .catch((error: unknown) => {
          if (lifetime.disposed) return
          setState("failures", name, { detail: mcpErrorDetail(error) })
        })
        .finally(() => {
          if (!lifetime.disposed) setState("pending", name, false)
        })
    },
  }
}

// OAuth sign-ins waiting on the server's browser callback. The server holds the request open for up to five minutes,
// so each wait keeps its AbortController (Cancel) and, when the server host could not open a browser, the link to open.
export function createMcpAuth() {
  const [state, setState] = createStore({
    waiting: Object.create(null) as Record<string, { url?: string } | undefined>,
  })
  const aborts = new Map<string, AbortController>()

  return {
    state,
    async run(name: string, request: (signal: AbortSignal) => Promise<unknown>) {
      const abort = new AbortController()
      aborts.set(name, abort)
      setState("waiting", name, {})
      await request(abort.signal)
        .catch((error: unknown) => {
          // Cancelling is the owner's choice, not a failure to report on the card.
          if (!abort.signal.aborted) throw error
        })
        .finally(() => {
          aborts.delete(name)
          setState("waiting", name, undefined)
        })
    },
    cancel(name: string) {
      aborts.get(name)?.abort()
    },
    /** Takes the `mcp.browser.open.failed` payload; a server this page is not waiting on is ignored. */
    openFailed(properties: unknown) {
      const failed = mcpBrowserOpenFailed(properties)
      if (failed && aborts.has(failed.name)) setState("waiting", failed.name, { url: failed.url })
    },
  }
}

export function mcpErrorDetail(error: unknown): string | undefined {
  // The client wraps HttpApi failures in Error and preserves their body in cause.
  if (error instanceof Error) {
    const cause = error.cause
    return (
      (cause && typeof cause === "object" && "body" in cause ? mcpErrorDetail(cause.body) : undefined) ?? error.message
    )
  }
  if (typeof error === "string") return error
  if (!error || typeof error !== "object") return
  if (
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "message" in error.data &&
    typeof error.data.message === "string"
  )
    return error.data.message
  if ("message" in error && typeof error.message === "string") return error.message
  if ("error" in error && typeof error.error === "string") return error.error
}
