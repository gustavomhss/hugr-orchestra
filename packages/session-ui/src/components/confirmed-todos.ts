import type { Todo } from "@opencode-ai/sdk/v2"

export function confirmedTodos(state: { status?: string; metadata?: Record<string, unknown>; output?: string }) {
  if (state.status !== "completed") return
  const metadata = checklist(state.metadata?.todos)
  if (metadata) return metadata
  if (!state.output) return
  try {
    const output: unknown = JSON.parse(state.output)
    if (typeof output === "object" && output !== null && "todos" in output) return checklist(output.todos)
    return checklist(output)
  } catch {
    return
  }
}

function checklist(value: unknown) {
  if (!Array.isArray(value)) return
  if (value.every(todo)) return value
}

function todo(value: unknown): value is Pick<Todo, "content" | "status"> {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    typeof value.content === "string" &&
    "status" in value &&
    typeof value.status === "string" &&
    ["pending", "in_progress", "completed", "cancelled"].includes(value.status)
  )
}
