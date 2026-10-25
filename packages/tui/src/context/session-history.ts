import type {
  Event,
  SessionMessage,
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantText,
  SessionMessageAssistantTool,
} from "../types"

type Assistant = SessionMessageAssistant

// Applies one V2 Session event to a Session's messages, newest first as `/api/session/:id/message` returns
// them. The list is mutated in place so a Solid `produce` draft can be passed directly. Returns false for
// events that do not change the message list.
export function applyEvent(messages: SessionMessage[], event: Event) {
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
