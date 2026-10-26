import type { SessionMessage, SessionMessageAssistant, SessionMessageAssistantTool } from "../types"

type Tool = SessionMessageAssistantTool

/** The text a tool returned to the model, its text content joined line by line. */
export function toolOutput(tool: Pick<Tool, "state">) {
  if (tool.state.status === "pending") return ""
  return tool.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")
}

/** What the tool reported about its run: its structured output plus the host's settlement facts. */
export function toolMetadata(tool: Pick<Tool, "state">): Record<string, unknown> {
  if (tool.state.status === "pending") return {}
  if (tool.state.status === "running") return tool.state.structured
  return { ...tool.state.structured, ...tool.state.metadata }
}

/** The tool's parsed input. A pending call still streams its input as raw text, so it has none yet. */
export function toolInput(tool: Pick<Tool, "state">): Record<string, unknown> {
  if (tool.state.status === "pending") return {}
  return tool.state.input
}

export function toolTitle(tool: Pick<Tool, "state">) {
  const title = toolMetadata(tool).title
  return typeof title === "string" ? title : ""
}

/** The message a person typed or a host injected; both render as the prompt that started a turn. */
export function isPrompt(message: SessionMessage) {
  return message.type === "user" || message.type === "synthetic"
}

export function isAssistant(message: SessionMessage): message is SessionMessageAssistant {
  return message.type === "assistant"
}

export function tools(message: SessionMessage) {
  if (message.type !== "assistant") return []
  return message.content.filter((item): item is Tool => item.type === "tool")
}
