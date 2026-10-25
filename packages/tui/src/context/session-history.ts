import type {
  AssistantMessage,
  FilePart,
  Message,
  Part,
  SessionMessage,
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantText,
  SessionMessageAssistantTool,
  ToolPart,
  V2Event,
} from "../compat/schema"

type Assistant = SessionMessageAssistant
type Path = { cwd: string; root: string }

// Applies one V2 Session event to a Session's messages, newest first as `/api/session/:id/message` returns
// them. The list is mutated in place so a Solid `produce` draft can be passed directly. Returns false for
// events that do not change the message list.
export function applyEvent(messages: SessionMessage[], event: V2Event) {
  switch (event.type) {
    case "session.next.agent.switched":
      prepend(messages, {
        id: event.data.messageID,
        type: "agent-switched",
        agent: event.data.agent,
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.model.switched":
      prepend(messages, {
        id: event.data.messageID,
        type: "model-switched",
        model: event.data.model,
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.prompted":
      prepend(messages, {
        id: event.data.messageID,
        type: "user",
        text: event.data.prompt.text,
        files: event.data.prompt.files,
        agents: event.data.prompt.agents,
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.context.updated":
      prepend(messages, {
        id: event.data.messageID,
        type: "system",
        text: event.data.text,
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.synthetic":
      prepend(messages, {
        id: event.data.messageID,
        type: "synthetic",
        sessionID: event.data.sessionID,
        text: event.data.text,
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.shell.started":
      prepend(messages, {
        id: event.data.messageID,
        type: "shell",
        callID: event.data.callID,
        command: event.data.command,
        output: "",
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.shell.ended": {
      const match = messages.find((item) => item.type === "shell" && item.callID === event.data.callID)
      if (match?.type !== "shell") return true
      match.output = event.data.output
      match.time.completed = event.data.timestamp
      return true
    }
    case "session.next.step.started": {
      if (messages.some((item) => item.id === event.data.assistantMessageID)) return true
      const active = messages.find((item) => item.type === "assistant" && !item.time.completed)
      if (active?.type === "assistant") active.time.completed = event.data.timestamp
      prepend(messages, {
        id: event.data.assistantMessageID,
        type: "assistant",
        agent: event.data.agent,
        model: event.data.model,
        content: [],
        snapshot: event.data.snapshot ? { start: event.data.snapshot } : undefined,
        time: { created: event.data.timestamp },
      })
      return true
    }
    case "session.next.step.ended": {
      const match = assistant(messages, event.data.assistantMessageID)
      if (!match) return true
      match.time.completed = event.data.timestamp
      match.finish = event.data.finish
      match.cost = event.data.cost
      match.tokens = event.data.tokens
      if (event.data.snapshot || event.data.files)
        match.snapshot = {
          ...match.snapshot,
          ...(event.data.snapshot ? { end: event.data.snapshot } : {}),
          ...(event.data.files ? { files: [...event.data.files] } : {}),
        }
      return true
    }
    case "session.next.step.failed": {
      const match = assistant(messages, event.data.assistantMessageID)
      if (!match) return true
      match.time.completed = event.data.timestamp
      match.finish = "error"
      match.error = event.data.error
      return true
    }
    case "session.next.text.started":
      assistant(messages, event.data.assistantMessageID)?.content.push({
        type: "text",
        id: event.data.textID,
        text: "",
      })
      return true
    case "session.next.text.delta": {
      const match = text(assistant(messages, event.data.assistantMessageID), event.data.textID)
      if (match) match.text += event.data.delta
      return true
    }
    case "session.next.text.ended": {
      const match = text(assistant(messages, event.data.assistantMessageID), event.data.textID)
      if (match) match.text = event.data.text
      return true
    }
    case "session.next.tool.input.started":
      assistant(messages, event.data.assistantMessageID)?.content.push({
        type: "tool",
        id: event.data.callID,
        name: event.data.name,
        time: { created: event.data.timestamp },
        state: { status: "pending", input: "" },
      })
      return true
    case "session.next.tool.input.delta": {
      const match = tool(assistant(messages, event.data.assistantMessageID), event.data.callID)
      if (match?.state.status === "pending") match.state.input += event.data.delta
      return true
    }
    case "session.next.tool.input.ended": {
      const match = tool(assistant(messages, event.data.assistantMessageID), event.data.callID)
      if (match?.state.status === "pending") match.state.input = event.data.text
      return true
    }
    case "session.next.tool.called": {
      const match = tool(assistant(messages, event.data.assistantMessageID), event.data.callID)
      if (!match) return true
      match.time.ran = event.data.timestamp
      match.provider = event.data.provider
      match.state = { status: "running", input: event.data.input, structured: {}, content: [] }
      return true
    }
    case "session.next.tool.progress": {
      const match = tool(assistant(messages, event.data.assistantMessageID), event.data.callID)
      if (match?.state.status !== "running") return true
      match.state.structured = event.data.structured
      match.state.content = [...event.data.content]
      return true
    }
    case "session.next.tool.success": {
      const match = tool(assistant(messages, event.data.assistantMessageID), event.data.callID)
      if (match?.state.status !== "running") return true
      match.state = {
        status: "completed",
        input: match.state.input,
        structured: event.data.structured,
        content: [...event.data.content],
        result: event.data.result,
      }
      match.provider = {
        executed: event.data.provider.executed || match.provider?.executed === true,
        metadata: match.provider?.metadata,
        resultMetadata: event.data.provider.metadata,
      }
      match.time.completed = event.data.timestamp
      return true
    }
    case "session.next.tool.failed": {
      const match = tool(assistant(messages, event.data.assistantMessageID), event.data.callID)
      if (!match || (match.state.status !== "pending" && match.state.status !== "running")) return true
      match.state = {
        status: "error",
        error: event.data.error,
        input: typeof match.state.input === "string" ? {} : match.state.input,
        structured: match.state.status === "running" ? match.state.structured : {},
        content: match.state.status === "running" ? match.state.content : [],
        result: event.data.result,
      }
      match.provider = {
        executed: event.data.provider.executed || match.provider?.executed === true,
        metadata: match.provider?.metadata,
        resultMetadata: event.data.provider.metadata,
      }
      match.time.completed = event.data.timestamp
      return true
    }
    case "session.next.reasoning.started":
      assistant(messages, event.data.assistantMessageID)?.content.push({
        type: "reasoning",
        id: event.data.reasoningID,
        text: "",
        providerMetadata: event.data.providerMetadata,
        time: { created: event.data.timestamp },
      })
      return true
    case "session.next.reasoning.delta": {
      const match = reasoning(assistant(messages, event.data.assistantMessageID), event.data.reasoningID)
      if (match) match.text += event.data.delta
      return true
    }
    case "session.next.reasoning.ended": {
      const match = reasoning(assistant(messages, event.data.assistantMessageID), event.data.reasoningID)
      if (!match) return true
      match.text = event.data.text
      match.time = { created: match.time?.created ?? event.data.timestamp, completed: event.data.timestamp }
      if (event.data.providerMetadata !== undefined) match.providerMetadata = event.data.providerMetadata
      return true
    }
    case "session.next.compaction.ended":
      prepend(messages, {
        id: event.data.messageID,
        type: "compaction",
        reason: event.data.reason,
        summary: event.data.text,
        recent: event.data.recent,
        time: { created: event.data.timestamp },
      })
      return true
  }
  return false
}

// The TUI renderer reads the V1 message/part shapes, so V2 messages are projected into them here. Agent and
// model switches, system context and queued inputs have no V1 message; they only feed the projected
// messages' agent and model.
export function toLegacy(sessionID: string, messages: readonly SessionMessage[], path: Path) {
  const ascending = messages.toSorted((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
  const firstAssistant = ascending.find((item) => item.type === "assistant")
  const state = {
    agent: firstAssistant?.type === "assistant" ? firstAssistant.agent : "",
    model: firstAssistant?.type === "assistant" ? firstAssistant.model : { id: "", providerID: "" },
    parent: "",
  }
  return ascending.flatMap((message): { info: Message; parts: Part[] }[] => {
    const base = { sessionID, messageID: message.id }
    if (message.type === "agent-switched") state.agent = message.agent
    if (message.type === "model-switched") state.model = message.model
    if (message.type === "assistant") {
      state.agent = message.agent
      state.model = message.model
      return [{ info: assistantInfo(sessionID, message, state.parent, path), parts: assistantParts(message, base) }]
    }
    if (message.type === "user" || message.type === "synthetic") {
      state.parent = message.id
      return [
        {
          info: userInfo(message.id, sessionID, message.time.created, state),
          parts: [
            {
              ...base,
              id: `${message.id}-text`,
              type: "text",
              text: message.text,
              ...(message.type === "synthetic" ? { synthetic: true } : {}),
            },
            ...(message.files ?? []).map(
              (file, index): FilePart => ({
                ...base,
                id: `${message.id}-file-${index}`,
                type: "file",
                mime: file.mime,
                filename: file.name,
                url: file.uri,
                source: file.source
                  ? {
                      type: "file",
                      path: file.uri.replace(/^file:\/\//, ""),
                      text: { value: file.source.text, start: file.source.start, end: file.source.end },
                    }
                  : undefined,
              }),
            ),
            ...(message.type === "user" ? (message.agents ?? []) : []).map(
              (agent, index): Part => ({
                ...base,
                id: `${message.id}-agent-${index}`,
                type: "agent",
                name: agent.name,
                source: agent.source
                  ? { value: agent.source.text, start: agent.source.start, end: agent.source.end }
                  : undefined,
              }),
            ),
          ],
        },
      ]
    }
    if (message.type === "shell") {
      const info = assistantInfo(
        sessionID,
        { id: message.id, agent: state.agent, model: state.model, time: message.time, type: "assistant", content: [] },
        state.parent,
        path,
      )
      return [
        {
          info,
          parts: [
            {
              ...base,
              id: `${message.id}-shell`,
              type: "tool",
              callID: message.callID,
              tool: "bash",
              state: message.time.completed
                ? {
                    status: "completed",
                    input: { command: message.command },
                    output: message.output,
                    title: message.command,
                    metadata: { output: message.output },
                    time: { start: message.time.created, end: message.time.completed },
                  }
                : {
                    status: "running",
                    input: { command: message.command },
                    metadata: { output: message.output },
                    time: { start: message.time.created },
                  },
            },
          ],
        },
      ]
    }
    if (message.type === "compaction") {
      state.parent = message.id
      return [
        {
          info: userInfo(message.id, sessionID, message.time.created, state),
          parts: [{ ...base, id: `${message.id}-compaction`, type: "compaction", auto: message.reason === "auto" }],
        },
        {
          info: { ...assistantInfo(sessionID, summary(message, state), message.id, path), summary: true },
          parts: [
            {
              sessionID,
              messageID: `${message.id}-summary`,
              id: `${message.id}-summary-text`,
              type: "text",
              text: message.summary,
            },
          ],
        },
      ]
    }
    return []
  })
}

function summary(
  message: Extract<SessionMessage, { type: "compaction" }>,
  state: { agent: string; model: Assistant["model"] },
): Assistant {
  return {
    id: `${message.id}-summary`,
    type: "assistant",
    agent: state.agent,
    model: state.model,
    content: [],
    time: { created: message.time.created, completed: message.time.created },
  }
}

function userInfo(
  id: string,
  sessionID: string,
  created: number,
  state: { agent: string; model: Assistant["model"] },
): Message {
  return {
    id,
    sessionID,
    role: "user",
    time: { created },
    agent: state.agent,
    model: { providerID: state.model.providerID, modelID: state.model.id, variant: state.model.variant },
  }
}

function assistantInfo(sessionID: string, message: Assistant, parentID: string, path: Path): AssistantMessage {
  return {
    id: message.id,
    sessionID,
    role: "assistant",
    time: { created: message.time.created, completed: message.time.completed },
    parentID,
    modelID: message.model.id,
    providerID: message.model.providerID,
    variant: message.model.variant,
    mode: message.agent,
    agent: message.agent,
    path,
    cost: message.cost ?? 0,
    tokens: message.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    finish: message.finish,
    error: message.error ? { name: "UnknownError", data: { message: message.error.message } } : undefined,
  }
}

function assistantParts(message: Assistant, base: { sessionID: string; messageID: string }): Part[] {
  const finished: Part[] = message.time.completed
    ? [
        {
          ...base,
          id: `${message.id}-finish`,
          type: "step-finish",
          reason: message.finish ?? "stop",
          snapshot: message.snapshot?.end,
          cost: message.cost ?? 0,
          tokens: message.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      ]
    : []
  return [
    { ...base, id: `${message.id}-start`, type: "step-start", snapshot: message.snapshot?.start },
    ...message.content.map((content): Part => {
      const id = `${message.id}-${content.type}-${content.id}`
      if (content.type === "text") return { ...base, id, type: "text", text: content.text }
      if (content.type === "reasoning")
        return {
          ...base,
          id,
          type: "reasoning",
          text: content.text,
          metadata: content.providerMetadata,
          time: {
            start: content.time?.created ?? message.time.created,
            end: content.time?.completed ?? message.time.completed,
          },
        }
      return { ...base, id, type: "tool", callID: content.id, tool: content.name, state: toolState(content, base) }
    }),
    ...finished,
  ]
}

function toolState(
  tool: SessionMessageAssistantTool,
  base: { sessionID: string; messageID: string },
): ToolPart["state"] {
  const start = tool.time.ran ?? tool.time.created
  const end = tool.time.completed ?? start
  if (tool.state.status === "pending") return { status: "pending", input: {}, raw: tool.state.input }
  if (tool.state.status === "running")
    return { status: "running", input: tool.state.input, metadata: tool.state.structured, time: { start } }
  if (tool.state.status === "error")
    return {
      status: "error",
      input: tool.state.input,
      error: tool.state.error.message,
      metadata: { ...tool.state.structured, ...tool.state.metadata },
      time: { start, end },
    }
  const title = tool.state.structured.title
  return {
    status: "completed",
    input: tool.state.input,
    output: tool.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n"),
    title: typeof title === "string" ? title : "",
    metadata: { ...tool.state.structured, ...tool.state.metadata },
    time: { start, end },
    attachments: tool.state.content.flatMap((item, index) =>
      item.type === "file"
        ? [
            {
              sessionID: base.sessionID,
              messageID: base.messageID,
              id: `${tool.id}-attachment-${index}`,
              type: "file" as const,
              mime: item.mime,
              filename: item.name,
              url: item.uri,
            },
          ]
        : [],
    ),
  }
}

function prepend(messages: SessionMessage[], item: SessionMessage) {
  if (messages.some((existing) => existing.id === item.id)) return
  messages.unshift(item)
}

function assistant(messages: SessionMessage[], messageID: string) {
  const item = messages.find((item) => item.type === "assistant" && item.id === messageID)
  return item?.type === "assistant" ? item : undefined
}

function tool(message: Assistant | undefined, callID: string) {
  return message?.content.findLast(
    (item): item is SessionMessageAssistantTool => item.type === "tool" && item.id === callID,
  )
}

function text(message: Assistant | undefined, textID: string) {
  return message?.content.findLast(
    (item): item is SessionMessageAssistantText => item.type === "text" && item.id === textID,
  )
}

function reasoning(message: Assistant | undefined, reasoningID: string) {
  return message?.content.findLast(
    (item): item is SessionMessageAssistantReasoning => item.type === "reasoning" && item.id === reasoningID,
  )
}
