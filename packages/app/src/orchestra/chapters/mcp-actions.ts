import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"

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

export function mcpErrorDetail(error: unknown): string | undefined {
  // The legacy SDK wraps HttpApi failures in Error and preserves their body in cause.
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
