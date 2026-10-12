// Claude-host sessions delegate through Claude Code's own `Agent` tool (`Task` on older binaries). Those parts
// carry the same task metadata (sessionId, parentSessionId, workResult), so every display treats them as `task`.
const TASK_TOOLS = new Set(["task", "Agent", "Task"])

export function isTaskTool(name: string) {
  return TASK_TOOLS.has(name)
}

// The agent a task part ran as: a Claude Code dispatch records its Orchestra seat, a native task its subagent_type.
export function taskAgentType(
  input: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined,
) {
  const dispatch = metadata?.claudeCodeDispatch
  const seat = dispatch && typeof dispatch === "object" && "seat" in dispatch ? dispatch.seat : undefined
  if (typeof seat === "string" && seat) return seat
  const type = input?.subagent_type
  if (typeof type === "string" && type) return type
}
