import type { Provider, SessionMessage, SessionMessageAssistant } from "../types"
import { Locale } from "./locale"
import * as Model from "./model"
import { toolInput, toolOutput } from "./session-message"

export type TranscriptOptions = {
  thinking: boolean
  toolDetails: boolean
  assistantMetadata: boolean
  providers?: Provider[]
}

export type SessionInfo = {
  id: string
  title: string
  time: {
    created: number
    updated: number
  }
}

export function formatTranscript(session: SessionInfo, messages: SessionMessage[], options: TranscriptOptions): string {
  const providers = Model.index(options.providers)
  const header =
    `# ${session.title}\n\n` +
    `**Session ID:** ${session.id}\n` +
    `**Created:** ${new Date(session.time.created).toLocaleString()}\n` +
    `**Updated:** ${new Date(session.time.updated).toLocaleString()}\n\n` +
    `---\n\n`
  return messages
    .toSorted((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
    .map((message) => formatMessage(message, options, providers))
    .filter((text) => text !== "")
    .reduce((transcript, text) => transcript + text + `---\n\n`, header)
}

/** One message as Markdown. Host-injected, system and switch messages are not part of the conversation and render empty. */
export function formatMessage(
  message: SessionMessage,
  options: TranscriptOptions,
  providers?: Provider[] | ReadonlyMap<string, Provider>,
): string {
  if (message.type === "user") return `## User\n\n${message.text}\n\n`
  if (message.type === "shell") return `## Shell\n\n\`\`\`\n$ ${message.command}\n${message.output}\n\`\`\`\n\n`
  if (message.type === "compaction") return `## Compaction\n\n${message.summary}\n\n`
  if (message.type !== "assistant") return ""
  return (
    formatAssistantHeader(message, options.assistantMetadata, providers ?? options.providers) +
    message.content.map((part) => formatPart(part, options)).join("")
  )
}

export function formatAssistantHeader(
  message: SessionMessageAssistant,
  includeMetadata: boolean,
  providers?: Provider[] | ReadonlyMap<string, Provider>,
): string {
  if (!includeMetadata) return `## Assistant\n\n`
  const duration = message.time.completed
    ? ((message.time.completed - message.time.created) / 1000).toFixed(1) + "s"
    : ""
  const modelName = Model.name(providers, message.model.providerID, message.model.id)
  return `## Assistant (${Locale.titlecase(message.agent)} · ${modelName}${duration ? ` · ${duration}` : ""})\n\n`
}

export function formatPart(part: SessionMessageAssistant["content"][number], options: TranscriptOptions): string {
  if (part.type === "text") return `${part.text}\n\n`
  if (part.type === "reasoning") return options.thinking ? `_Thinking:_\n\n${part.text}\n\n` : ""
  const input = toolInput(part)
  const output = toolOutput(part)
  const details = [
    options.toolDetails && Object.keys(input).length > 0
      ? `\n**Input:**\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`\n`
      : "",
    options.toolDetails && part.state.status === "completed" && output
      ? `\n**Output:**\n\`\`\`\n${output}\n\`\`\`\n`
      : "",
    options.toolDetails && part.state.status === "error"
      ? `\n**Error:**\n\`\`\`\n${part.state.error.message}\n\`\`\`\n`
      : "",
  ]
  return `**Tool: ${part.name}**\n${details.join("")}\n`
}
