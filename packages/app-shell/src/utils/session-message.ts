import type { SessionMessageAssistant, SessionMessageInfo, SessionMessageUser } from "@/session-types"
import type { SessionMessageAssistantTool, SessionMessageShell } from "@/v2-wire"

import type { FilePart } from "@/v2-types"
import type { AssistantMessage, Message, Part, ToolPart, UserMessage } from "@/v2-wire"

import { Option, Schema } from "effect"

const emptyTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
const emptyModel: { id: string; providerID: string; variant?: string } = { id: "", providerID: "" }
const decodeToolInput = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export function compareMessages(a: Pick<Message, "id" | "time">, b: Pick<Message, "id" | "time">) {
  const left = messageKey(a)
  const right = messageKey(b)
  return left < right ? -1 : left > right ? 1 : 0
}

export const messageKey = (message: Pick<Message, "id" | "time">) => message.time.created + message.id

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeToolInput(name: string, input: Record<string, unknown>) {
  if (!["edit", "write"].includes(name) || typeof input.path !== "string" || typeof input.filePath === "string")
    return input
  return { ...input, filePath: input.path }
}

function normalizeToolMetadata(name: string, metadata: Record<string, unknown>, structured?: unknown) {
  // Native confirmed output is separate from display text, including retained Task result handles.
  const confirmed =
    (name === "todowrite" || name === "task") && record(structured) ? { ...metadata, ...structured } : metadata
  if (name !== "edit" || !Array.isArray(confirmed.files)) return confirmed
  const file = confirmed.files.find(record)
  if (!file || typeof file.file !== "string") return confirmed
  return {
    ...confirmed,
    filediff: {
      file: file.file,
      patch: typeof file.patch === "string" ? file.patch : undefined,
      additions: typeof file.additions === "number" ? file.additions : 0,
      deletions: typeof file.deletions === "number" ? file.deletions : 0,
    },
  }
}

/**
 * Projects V2 session messages into the wire rows the transcript renders.
 *
 * `only` limits the output to those row ids. The walk still reads every message, because a row's agent, model and
 * parent come from the messages before and after it, but it builds rows and parts only for the ids asked for. That
 * keeps a streaming flush proportional to the message that changed rather than to the whole session.
 */
export function normalizeSessionMessages(
  sessionID: string,
  source: readonly SessionMessageInfo[],
  only?: ReadonlySet<string>,
) {
  const messages: Message[] = []
  const parts = new Map<string, Part[]>()
  const wants = (id: string) => !only || only.has(id)
  let agent = ""
  let model = emptyModel
  let parentID: string | undefined
  // The row of `parentID`, when it is part of the output. Its agent and model follow the last reply it gets.
  let parent: UserMessage | undefined

  source.forEach((message) => {
    if (message.type === "agent-switched") {
      agent = message.agent
      return
    }
    if (message.type === "model-switched") {
      model = message.model
      return
    }
    if (message.type === "user") {
      parentID = message.id
      parent = undefined
      if (!wants(message.id)) return
      parent = userMessage(sessionID, message, agent, model)
      messages.push(parent)
      parts.set(message.id, userParts(sessionID, message))
      return
    }
    if (message.type === "synthetic" && message.description?.trim()) {
      parentID = message.id
      parent = undefined
      if (!wants(message.id)) return
      parent = {
        id: message.id,
        sessionID,
        role: "user",
        time: message.time,
        agent,
        model: { providerID: model.providerID, modelID: model.id, variant: model.variant },
      }
      messages.push(parent)
      parts.set(message.id, [textPart(sessionID, message.id, 0, message.description, true)])
      return
    }
    if (message.type === "shell") {
      parentID = undefined
      parent = undefined
      if (!wants(message.id) && !wants(`${message.id}:assistant`)) return
      messages.push(...shellMessages(sessionID, message, agent, model).filter((row) => wants(row.id)))
      if (wants(message.id)) parts.set(message.id, [textPart(sessionID, message.id, 0, message.command)])
      if (wants(`${message.id}:assistant`)) parts.set(`${message.id}:assistant`, [shellPart(sessionID, message)])
      return
    }
    if (message.type === "assistant") {
      agent = message.agent
      model = message.model
      if (!parentID) return
      if (parent) {
        parent.agent = message.agent
        parent.model = {
          providerID: message.model.providerID,
          modelID: message.model.id,
          variant: message.model.variant,
        }
      }
      if (!wants(message.id)) return
      messages.push(assistantMessage(sessionID, parentID, message))
      parts.set(message.id, assistantParts(sessionID, message))
      return
    }
    // A compaction is its own turn: a divider in place of the user prompt and the summary as the
    // reply. The runner's work after an automatic compaction continues that turn.
    if (message.type !== "compaction" || message.status === "failed") return
    parentID = message.id
    parent = undefined
    if (!wants(message.id) && !wants(`${message.id}:assistant`)) return
    const [user, assistant] = compactionMessages(sessionID, message, agent, model)
    if (wants(user.id)) {
      parent = user
      messages.push(user)
      parts.set(user.id, [
        { id: `${message.id}:compaction`, sessionID, messageID: user.id, type: "compaction", auto: message.reason === "auto" },
      ])
    }
    if (wants(assistant.id)) {
      messages.push(assistant)
      parts.set(assistant.id, message.summary.trim() ? [textPart(sessionID, assistant.id, 0, message.summary)] : [])
    }
  })

  return { messages, parts }
}

/** Structural equality for JSON-like part values. A missing key equals an undefined one, as in the transcript store. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a))
    return Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  if (!record(a) || !record(b)) return false
  return (
    Object.keys(a).every((key) => sameValue(a[key], b[key])) &&
    Object.keys(b).every((key) => key in a || b[key] === undefined)
  )
}

function shellMessages(
  sessionID: string,
  message: SessionMessageShell,
  agent: string,
  model: { id: string; providerID: string; variant?: string },
): [UserMessage, AssistantMessage & { synthetic: true }] {
  return [
    {
      id: message.id,
      sessionID,
      role: "user",
      time: { created: message.time.created },
      agent,
      model: { providerID: model.providerID, modelID: model.id, variant: model.variant },
    },
    {
      id: `${message.id}:assistant`,
      sessionID,
      role: "assistant",
      time: message.time,
      parentID: message.id,
      modelID: model.id,
      providerID: model.providerID,
      variant: model.variant,
      mode: agent,
      agent,
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: emptyTokens,
      synthetic: true,
    },
  ]
}

function compactionMessages(
  sessionID: string,
  message: Exclude<Extract<SessionMessageInfo, { type: "compaction" }>, { status: "failed" }>,
  agent: string,
  model: { id: string; providerID: string; variant?: string },
): [UserMessage, AssistantMessage] {
  return [
    {
      id: message.id,
      sessionID,
      role: "user",
      time: { created: message.time.created },
      agent,
      model: { providerID: model.providerID, modelID: model.id, variant: model.variant },
    },
    {
      id: `${message.id}:assistant`,
      sessionID,
      role: "assistant",
      time: message.status === "running" ? { created: message.time.created } : { created: message.time.created, completed: message.time.created },
      parentID: message.id,
      modelID: model.id,
      providerID: model.providerID,
      variant: model.variant,
      mode: agent,
      agent,
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: emptyTokens,
      summary: true,
    },
  ]
}

function shellPart(sessionID: string, message: SessionMessageShell): ToolPart {
  const input = { command: message.command }
  const start = message.time.created
  const state: ToolPart["state"] =
    message.status === "running"
      ? { status: "running", input, time: { start } }
      : {
          status: "completed",
          input,
          output: message.output?.output ?? "",
          title: "Shell",
          metadata: {
            status: message.status,
            exit: message.exit,
            truncated: message.output?.truncated,
          },
          time: { start, end: message.time.completed ?? start },
        }
  return {
    id: `${message.id}:tool`,
    sessionID,
    messageID: `${message.id}:assistant`,
    type: "tool",
    callID: message.shellID,
    tool: "bash",
    state,
  }
}

export function sessionMessagePartID(messageID: string, type: "text" | "reasoning", ordinal: number) {
  return `${messageID}:${type}:${ordinal}`
}

function userMessage(
  sessionID: string,
  message: SessionMessageUser,
  agent: string,
  model: { id: string; providerID: string; variant?: string },
): UserMessage {
  return {
    id: message.id,
    sessionID,
    role: "user",
    time: message.time,
    agent,
    model: { providerID: model.providerID, modelID: model.id, variant: model.variant },
  }
}

function userParts(sessionID: string, message: SessionMessageUser): Part[] {
  return [
    textPart(sessionID, message.id, 0, message.text),
    ...(message.files ?? []).map(
      (file, index): FilePart => ({
        id: `${message.id}:file:${index}`,
        sessionID,
        messageID: message.id,
        type: "file",
        mime: file.mime,
        filename: file.name,
        url: file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`,
        source: file.mention
          ? {
              type: "file",
              text: { value: file.mention.text, start: file.mention.start, end: file.mention.end },
              path: file.mention.text.startsWith("@") ? file.mention.text.slice(1) : (file.name ?? file.mention.text),
            }
          : undefined,
      }),
    ),
    ...(message.agents ?? []).map(
      (item, index): Part => ({
        id: `${message.id}:agent:${index}`,
        sessionID,
        messageID: message.id,
        type: "agent",
        name: item.name,
        source: item.mention
          ? { value: item.mention.text, start: item.mention.start, end: item.mention.end }
          : undefined,
      }),
    ),
  ]
}

function assistantMessage(
  sessionID: string,
  parentID: string,
  message: SessionMessageAssistant,
): AssistantMessage & { costAvailable: boolean; tokensAvailable: boolean } {
  const error = message.error
    ? message.error.type.toLowerCase().includes("abort") || message.error.type.toLowerCase().includes("interrupt")
      ? { name: "MessageAbortedError" as const, data: { message: message.error.message } }
      : { name: "UnknownError" as const, data: { message: message.error.message } }
    : undefined
  return {
    id: message.id,
    sessionID,
    role: "assistant",
    time: message.time,
    error,
    parentID,
    modelID: message.model.id,
    providerID: message.model.providerID,
    variant: message.model.variant,
    mode: message.agent,
    agent: message.agent,
    path: { cwd: "", root: "" },
    cost: message.cost ?? 0,
    tokens: message.tokens ?? emptyTokens,
    costAvailable: message.cost !== undefined,
    tokensAvailable: message.tokens !== undefined,
    finish: message.finish,
  }
}

function assistantParts(sessionID: string, message: SessionMessageAssistant): Part[] {
  const ordinals = { text: 0, reasoning: 0 }
  return message.content.flatMap((content): Part[] => {
    if (content.type === "text") {
      const part = textPart(sessionID, message.id, ordinals.text++, content.text)
      return content.text.trim() ? [part] : []
    }
    if (content.type === "reasoning") {
      const part: Part = {
        id: sessionMessagePartID(message.id, "reasoning", ordinals.reasoning++),
        sessionID,
        messageID: message.id,
        type: "reasoning",
        text: content.text,
        metadata: content.state,
        time: {
          start: content.time?.created ?? message.time.created,
          end: content.time?.completed,
        },
      }
      return content.text.trim() ? [part] : []
    }
    return [toolPart(sessionID, message.id, content)]
  })
}

function textPart(sessionID: string, messageID: string, ordinal: number, text: string, synthetic?: boolean): Part {
  return {
    id: sessionMessagePartID(messageID, "text", ordinal),
    sessionID,
    messageID,
    type: "text",
    text,
    synthetic,
  }
}

function toolPart(sessionID: string, messageID: string, tool: SessionMessageAssistantTool): ToolPart {
  const start = tool.time.ran ?? tool.time.created
  const state = (() => {
    if (tool.state.status === "streaming") {
      const value = Option.getOrUndefined(decodeToolInput(tool.state.input))
      const input = normalizeToolInput(tool.name, record(value) ? value : {})
      return { status: "pending" as const, input, raw: tool.state.input }
    }
    if (tool.state.status === "running") {
      return {
        status: "running" as const,
        input: normalizeToolInput(tool.name, tool.state.input),
        metadata: normalizeToolMetadata(
          tool.name,
          tool.state.metadata ?? {},
          "structured" in tool.state ? tool.state.structured : undefined,
        ),
        time: { start },
      }
    }
    if (tool.state.status === "error") {
      return {
        status: "error" as const,
        input: normalizeToolInput(tool.name, tool.state.input),
        error: tool.state.error.message,
        metadata: normalizeToolMetadata(
          tool.name,
          tool.state.metadata ?? {},
          "structured" in tool.state ? tool.state.structured : undefined,
        ),
        time: { start, end: tool.time.completed ?? start },
      }
    }
    const attachments = tool.state.content.flatMap((item, index): FilePart[] =>
      item.type === "file"
        ? [
            {
              id: `${tool.id}:file:${index}`,
              sessionID,
              messageID,
              type: "file",
              mime: item.mime,
              filename: item.name,
              url: item.uri,
            },
          ]
        : [],
    )
    return {
      status: "completed" as const,
      input: normalizeToolInput(tool.name, tool.state.input),
      output: tool.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n"),
      title: tool.name,
      // Preserve confirmed native output even when its display text was truncated.
      metadata: normalizeToolMetadata(
        tool.name,
        tool.state.metadata ?? {},
        "structured" in tool.state ? tool.state.structured : undefined,
      ),
      time: { start, end: tool.time.completed ?? start },
      attachments: attachments.length ? attachments : undefined,
    }
  })()
  return {
    id: tool.id,
    sessionID,
    messageID,
    type: "tool",
    callID: tool.id,
    tool: tool.name,
    state,
    metadata: { providerState: tool.providerState, providerResultState: tool.providerResultState },
  }
}
