import type { Agent } from "@opencode-ai/sdk/v2/client"

export function agentRoster(agents: readonly Agent[]) {
  return agents
    .filter((agent) => !agent.hidden)
    .map((agent) => ({
      agent,
      subagent: agent.mode === "subagent",
      chat: agent.mode === "primary" || agent.mode === "all",
    }))
}

export function agentUnavailable(error: unknown) {
  const status =
    error instanceof Error && error.cause && typeof error.cause === "object" && "status" in error.cause
      ? error.cause.status
      : undefined
  return status === 404 || status === 405
}
