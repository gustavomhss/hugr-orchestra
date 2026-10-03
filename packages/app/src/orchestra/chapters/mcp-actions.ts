import type { McpServer } from "@opencode-ai/client/promise"
import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"

export const mcpStatusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  needs_client_registration: "orchestra.mcp.needsClientRegistration",
  disabled: "mcp.status.disabled",
  pending: "orchestra.mcp.pending",
} as const

export function mcpAction(status: McpServer["status"]["status"]) {
  if (status === "pending") return
  if (status === "connected") return "disconnect"
  if (status === "needs_auth") return "authenticate"
  return "connect"
}

export function createMcpActions(toggle: (name: string) => Promise<void>) {
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
    async run(name: string, status: McpServer["status"]["status"]) {
      if (lifetime.disposed || state.pending[name] || !mcpAction(status)) return
      setState("pending", name, true)
      setState("failures", name, undefined)
      await toggle(name)
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
