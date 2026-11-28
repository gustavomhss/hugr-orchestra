export * as ClaudeCodeEvents from "./events"

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { LLMEvent } from "@orchestra/llm"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeCodeRecord } from "./record"

export type Tracker = {
  readonly names: Map<string, string>
  /** Each TodoWrite call's list, recorded as its result and the Session's todos so the widget and panel show it. */
  readonly todos: Map<string, unknown>
  /** Claude Code's task list (TaskCreate, TaskUpdate), recorded as the todo list Orchestra's todo tool keeps. */
  readonly checklist: ClaudeCodeRecord.Checklist
  /** The entry each TaskCreate call added, which takes its id from the call's result. */
  readonly created: Map<string, ClaudeCodeRecord.ChecklistItem>
  readonly failure: { uuid?: string; message?: string }
  /** Block and call ids emitted for each main-thread assistant message, so a superseded message can be retracted. */
  readonly emitted: Map<string, string[]>
  /** The model the turn runs on, to pick its entry out of the per-model usage Claude Code reports. */
  readonly model: string | undefined
}

/** Maps one main-thread SDK frame to runner events. */
export function events(message: SDKMessage, tracker: Tracker, MCP_PREFIX: string): LLMEvent[] {
  const { names, failure, emitted } = tracker
  if (message.type === "assistant" && message.supersedes?.some((uuid) => uuid === failure.uuid)) failure.message = undefined
  if (message.type === "system" && message.subtype === "model_refusal_fallback" &&
    message.retracted_message_uuids?.some((uuid) => uuid === failure.uuid)) failure.message = undefined
  // What the engine replaced is retracted: a refusal fallback names the messages it retracts, a reply the ones it supersedes.
  const replaced = message.type === "assistant" ? message.supersedes : message.type === "system" && message.subtype === "model_refusal_fallback" ? message.retracted_message_uuids : undefined
  const retracted = (replaced ?? []).flatMap((uuid) => {
    const ids = emitted.get(uuid)
    emitted.delete(uuid)
    return ids ?? []
  })
  const retract = retracted.length ? [LLMEvent.retract({ ids: retracted })] : []
  if (message.type === "assistant" && message.parent_tool_use_id === null && message.error) {
    const text = message.message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n") || message.error
    failure.uuid = message.uuid
    failure.message = ClaudeCodeSDK.signedOut(message) ? ClaudeCodeSDK.SIGNED_OUT : (ClaudeCodeSDK.billingRejection(text) ?? text)
    return retract
  }
  if (message.type === "assistant" && message.parent_tool_use_id === null) {
    const ids: string[] = []
    const blocks = message.message.content.flatMap((block, index): LLMEvent[] => {
      const id = `${message.uuid}:${index}`
      if (block.type === "text") {
        ids.push(id)
        return [LLMEvent.textStart({ id }), LLMEvent.textDelta({ id, text: block.text }), LLMEvent.textEnd({ id })]
      }
      if (block.type === "thinking") {
        ids.push(id)
        return [LLMEvent.reasoningStart({ id }), LLMEvent.reasoningDelta({ id, text: block.thinking }), LLMEvent.reasoningEnd({ id })]
      }
      // Orchestra tools are recorded by the runner through `turn.execute`, never by the host. A call left off the record
      // has no name in `names`, so its result is left off too.
      if (block.type !== "tool_use" || block.name.startsWith(MCP_PREFIX) || ClaudeCodeRecord.UNRECORDED.has(block.name)) return []
      const listed = ClaudeCodeRecord.TASK_LIST_TOOLS.has(block.name) ? ClaudeCodeRecord.checklist(block.id, block.name, block.input, tracker.checklist, tracker.created) : undefined
      const call = listed ? { name: "todowrite", input: { todos: listed }, todos: listed } : ClaudeCodeRecord.shown(block.name, block.input)
      names.set(block.id, call.name)
      if (call.name === "todowrite") tracker.todos.set(block.id, call.todos)
      ids.push(block.id)
      return [LLMEvent.toolCall({ id: block.id, name: call.name, input: call.input, providerExecuted: true })]
    })
    emitted.set(message.uuid, ids)
    return [...retract, ...blocks]
  }
  if (message.type === "system" && message.subtype === "model_refusal_fallback") return retract
  if (message.type === "user" && message.parent_tool_use_id === null && Array.isArray(message.message.content))
    return message.message.content.flatMap((block): LLMEvent[] => {
      if (block.type !== "tool_result") return []
      const name = names.get(block.tool_use_id)
      if (!name) return []
      const added = tracker.created.get(block.tool_use_id)
      if (added) ClaudeCodeRecord.assign(added, block.is_error === true, message.tool_use_result, tracker.checklist)
      const listed = tracker.todos.get(block.tool_use_id)
      const text = listed !== undefined && !block.is_error
        ? JSON.stringify({ todos: listed })
        : typeof block.content === "string"
          ? block.content
          : (block.content ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
      return [LLMEvent.toolResult({
        id: block.tool_use_id,
        name,
        result: block.is_error ? { type: "error", value: text } : { type: "text", value: text },
        providerExecuted: true,
      })]
    })
  if (message.type !== "result") return []
  const pending = failure.message
  failure.message = undefined
  if (pending !== undefined) return [LLMEvent.providerError({ message: pending })]
  if (message.subtype !== "success" || message.is_error) {
    const detail = message.subtype === "success" ? message.result : [message.subtype, ...message.errors].join(": ")
    return [LLMEvent.providerError({ message: ClaudeCodeSDK.billingRejection(detail) ?? detail })]
  }
  return [LLMEvent.stepFinish({
    index: 0,
    reason: "stop",
    usage: {
      nonCachedInputTokens: message.usage.input_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens,
      cacheWriteInputTokens: message.usage.cache_creation_input_tokens,
      inputTokens: message.usage.input_tokens + message.usage.cache_read_input_tokens + message.usage.cache_creation_input_tokens,
      outputTokens: message.usage.output_tokens,
      // What Claude Code billed for the turn (this process is the turn's), and the window of the model that answered.
      ...(Number.isFinite(message.total_cost_usd) && message.total_cost_usd >= 0 ? { cost: message.total_cost_usd } : {}),
      ...contextWindow(message.modelUsage, tracker.model),
    },
  })]
}

/** The context window of the main model in Claude Code's per-model usage: the named model, else the busiest one. */
function contextWindow(usage: Record<string, { readonly contextWindow: number; readonly inputTokens: number; readonly outputTokens: number }> | undefined, model: string | undefined) {
  const entries = Object.entries(usage ?? {})
  const main = entries.find(([id]) => model !== undefined && id.startsWith(model)) ??
    entries.toSorted((a, b) => b[1].inputTokens + b[1].outputTokens - (a[1].inputTokens + a[1].outputTokens))[0]
  return main && Number.isFinite(main[1].contextWindow) && main[1].contextWindow > 0 ? { contextWindow: main[1].contextWindow } : {}
}
