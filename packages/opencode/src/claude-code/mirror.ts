// Mirrors one Claude Code turn into Orchestra's session: the same message and part writes the processor makes, so the
// UI, the database, revert and the archive need no change.
// - One Orchestra assistant message per Claude API message (`message.id`); Claude Code streams it block by block.
// - Tool parts carry `metadata.providerExecuted`: Claude Code runs them, so Orchestra's loop never waits on them.
// - Each assistant message is a step: `step-start`/`step-finish` with snapshots and a `patch` part, as the processor
//   writes them, so revert restores files whichever tool changed them.
import { Effect } from "effect"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { AbortedError } from "@opencode-ai/core/v1/session"
import { NamedError } from "@opencode-ai/core/util/error"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import type { Snapshot } from "@/snapshot"
import type { Agent } from "@/agent/agent"
import { ClaudeCodeTranscript } from "./transcript"

/** Claude Code tool names shown under Orchestra's own names, so the UI renders them with its tool views. */
export const NAMES: Record<string, string> = {
  Bash: "bash",
  Grep: "grep",
  Glob: "glob",
  WebFetch: "webfetch",
  WebSearch: "websearch",
  mcp__orchestra__read: "read",
  mcp__orchestra__edit: "edit",
  mcp__orchestra__write: "write",
  mcp__orchestra__context_recall: "context_recall",
  mcp__orchestra__context_compact: "context_compact",
}

const FINISH: Record<string, string> = {
  end_turn: "stop",
  stop_sequence: "stop",
  tool_use: "tool-calls",
  max_tokens: "length",
  refusal: "content-filter",
  pause_turn: "other",
}

type Usage = { input_tokens?: number | null; output_tokens?: number | null;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

type Step = {
  info: SessionV1.Assistant
  apiID: string
  start?: string
  /** Text and reasoning parts by stream block index, with the text received so far. */
  blocks: Map<number, { part: SessionV1.TextPart | SessionV1.ReasoningPart }>
  /** Text and reasoning parts the complete blocks have not closed yet, in order. */
  open: (SessionV1.TextPart | SessionV1.ReasoningPart)[]
  usage: Usage
  stop?: string
}

export function create(input: {
  sessionID: SessionID
  user: SessionV1.User
  agent: Agent.Info
  path: { cwd: string; root: string }
  sessions: Session.Interface
  snapshot: Snapshot.Interface
  record?: (input: { apiID?: string; uuid?: string; messageID: MessageID }) => Effect.Effect<void>
  onStep?: (message: SessionV1.Assistant) => Effect.Effect<void>
}) {
  const { sessionID, sessions, snapshot } = input
  const tools = new Map<string, SessionV1.ToolPart>()
  const claimed = new Set<string>()
  const uuids = new Map<string, MessageID>()
  let step: Step | undefined
  let last: SessionV1.Assistant | undefined
  let cost = 0
  let ended = false

  const open = (apiID: string) => Effect.gen(function* () {
    if (step?.apiID === apiID) return step
    if (step && [...tools.values()].some((part) => part.messageID === step?.info.id &&
      (part.state.status === "running" || part.state.status === "pending")))
      return yield* Effect.die(new Error("Claude Code began a step before prior tools finished"))
    yield* close()
    const info: SessionV1.Assistant = {
      id: MessageID.ascending(), sessionID, parentID: input.user.id, role: "assistant",
      mode: input.agent.id ?? input.agent.name, agent: input.agent.id ?? input.agent.name, variant: input.user.model.variant,
      path: input.path, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: input.user.model.modelID, providerID: input.user.model.providerID, time: { created: Date.now() },
    }
    yield* sessions.updateMessage(info)
    step = { info, apiID, blocks: new Map(), open: [], usage: {} }
    if (input.record) yield* input.record({ apiID, messageID: info.id })
    if (ended) return yield* Effect.interrupt
    const start = yield* snapshot.track()
    if (ended) return yield* Effect.interrupt
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: info.id, type: "step-start", snapshot: start })
    step.start = start
    return step
  })

  /** A new text or reasoning part; `open` when the stream will fill it and a complete block will close it. */
  const text = (current: Step, kind: "text" | "reasoning", open = true) => Effect.gen(function* () {
    const base = { id: PartID.ascending(), sessionID, messageID: current.info.id, text: "", time: { start: Date.now() } }
    const part = kind === "text" ? { ...base, type: "text" as const } : { ...base, type: "reasoning" as const }
    yield* sessions.updatePart(part)
    if (open) current.open.push(part)
    return part
  })

  /** Ends the current step: usage, finish reason, end snapshot and the files it changed. */
  const close = (error?: SessionV1.Assistant["error"]) => Effect.gen(function* () {
    const current = step
    if (!current) return
    step = undefined
    const now = Date.now()
    for (const part of current.open) yield* sessions.updatePart({ ...part, time: { start: part.time?.start ?? now, end: now } })
    const usage = current.usage
    const tokens = { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, reasoning: 0,
      cache: { read: usage.cache_read_input_tokens ?? 0, write: usage.cache_creation_input_tokens ?? 0 } }
    // A failed step still finishes ("error"), so the loop sees the turn answered and ends.
    const finish = error ? "error" : FINISH[current.stop ?? ""] ?? "other"
    const end = yield* snapshot.track()
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: current.info.id, type: "step-finish",
      reason: finish, snapshot: end, cost: 0, tokens })
    if (current.start) {
      const patch = yield* snapshot.patch(current.start)
      if (patch.files.length)
        yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: current.info.id, type: "patch",
          hash: patch.hash, files: patch.files })
    }
    current.info = { ...current.info, tokens, finish, error, time: { ...current.info.time, completed: now } }
    yield* sessions.updateMessage(current.info)
    last = current.info
    if (!error && ["stop", "tool-calls"].includes(finish) && !current.open.length && input.onStep &&
      ![...tools.values()].some((part) => part.messageID === current.info.id &&
        (part.state.status === "pending" || part.state.status === "running"))) yield* input.onStep(current.info)
  })

  const toolResult = (block: { tool_use_id: string; content?: unknown; is_error?: boolean | null }) => Effect.gen(function* () {
    const part = tools.get(block.tool_use_id)
    if (!part || part.state.status === "completed" || part.state.status === "error") return
    const content: unknown[] = Array.isArray(block.content) ? block.content : []
    const output = typeof block.content === "string" ? block.content
      : content.filter(ClaudeCodeTranscript.record).flatMap((item) => item.type === "text" && typeof item.text === "string" ? [item.text] : []).join("\n")
    const attachments = content.filter(ClaudeCodeTranscript.record).flatMap((item) => {
      if (item.type !== "image" || !ClaudeCodeTranscript.record(item.source) || item.source.type !== "base64" ||
        typeof item.source.media_type !== "string" || typeof item.source.data !== "string") return []
      return [{ id: PartID.ascending(), sessionID, messageID: part.messageID, type: "file" as const,
        mime: item.source.media_type, url: `data:${item.source.media_type};base64,${item.source.data}` }]
    })
    const start = part.state.status === "running" ? part.state.time.start : Date.now()
    const next: SessionV1.ToolPart = block.is_error
      ? { ...part, state: { status: "error", input: part.state.input, error: output || "Tool failed", time: { start, end: Date.now() } } }
      : { ...part, state: { status: "completed", input: part.state.input, output,
          title: String((part.state.input as Record<string, unknown>).description ?? (part.state.input as Record<string, unknown>).command ?? part.tool),
          metadata: { output }, attachments, time: { start, end: Date.now() } } }
    tools.set(block.tool_use_id, next)
    yield* sessions.updatePart(next)
  })

  return {
    /** Apply one SDK message to the session. */
    on: (message: SDKMessage) => Effect.gen(function* () {
      if (ended) return
      if (message.type === "result") {
        if ("total_cost_usd" in message && typeof message.total_cost_usd === "number") cost = message.total_cost_usd
        if (!step && message.subtype === "success") {
          const current = yield* open(`result:${message.uuid}`)
          if (message.result) {
            const part = yield* text(current, "text", false)
            yield* sessions.updatePart({ ...part, text: message.result, time: { start: Date.now(), end: Date.now() } })
          }
        }
        if (step && message.stop_reason) step.stop = message.stop_reason
        return
      }
      // Subagent frames (Task) are not mirrored in step 1: Task is disallowed.
      if ("parent_tool_use_id" in message && message.parent_tool_use_id) return
      if (message.type === "stream_event") {
        const event = message.event
        if (event.type === "message_start") {
          const current = yield* open(event.message.id)
          current.usage = { ...current.usage, ...event.message.usage }
          return
        }
        const current = step
        if (!current) return
        if (event.type === "content_block_start" && (event.content_block.type === "text" || event.content_block.type === "thinking"))
          current.blocks.set(event.index, { part: yield* text(current, event.content_block.type === "text" ? "text" : "reasoning") })
        if (event.type === "content_block_delta") {
          const block = current.blocks.get(event.index)
          const delta = event.delta.type === "text_delta" ? event.delta.text : event.delta.type === "thinking_delta" ? event.delta.thinking : undefined
          if (block && delta) {
            block.part.text += delta
            yield* sessions.updatePartDelta({ sessionID, messageID: current.info.id, partID: block.part.id, field: "text", delta })
          }
        }
        if (event.type === "message_delta") {
          current.stop = event.delta.stop_reason ?? current.stop
          current.usage = { ...current.usage, ...Object.fromEntries(Object.entries(event.usage).filter(([, value]) => value !== null)) }
        }
        return
      }
      if (message.type === "assistant") {
        const current = yield* open(message.message.id)
        uuids.set(message.uuid, current.info.id)
        if (input.record) yield* input.record({ apiID: message.message.id, uuid: message.uuid, messageID: current.info.id })
        current.usage = { ...current.usage, ...message.message.usage }
        current.stop = message.message.stop_reason ?? current.stop
        for (const block of message.message.content) {
          if (block.type === "text" || block.type === "thinking") {
            const kind = block.type === "text" ? "text" : "reasoning"
            const index = current.open.findIndex((part) => part.type === kind)
            const part = index >= 0 ? current.open.splice(index, 1)[0] : yield* text(current, kind, false)
            const value = block.type === "text" ? block.text : block.thinking
            yield* sessions.updatePart({ ...part, text: value, time: { start: part.time?.start ?? Date.now(), end: Date.now() } })
          }
          if (block.type === "tool_use") {
            if (tools.has(block.id)) continue
            const part: SessionV1.ToolPart = { id: PartID.ascending(), sessionID, messageID: current.info.id, type: "tool",
              callID: block.id, tool: NAMES[block.name] ?? block.name,
              state: { status: "running", input: block.input as Record<string, unknown>, time: { start: Date.now() } },
              metadata: { providerExecuted: true, claudeCodeTool: block.name } }
            tools.set(block.id, part)
            yield* sessions.updatePart(part)
          }
        }
        return
      }
      if (message.type === "user" && Array.isArray(message.message.content))
        for (const block of message.message.content)
          if (typeof block === "object" && block.type === "tool_result") yield* toolResult(block)
    }),

    /** The open step's message, and a mirrored tool call by its `tool_use_id`. */
    current: () => step?.info,
    tool: (callID: string) => tools.get(callID),
    retract: (ids: readonly string[]) => Effect.gen(function* () {
      const messages = new Set(ids.flatMap((id) => uuids.get(id) ? [uuids.get(id) as MessageID] : []))
      for (const messageID of messages) {
        if (step?.info.id === messageID) step = undefined
        if (last?.id === messageID) last = undefined
        for (const [callID, part] of tools) if (part.messageID === messageID) tools.delete(callID)
        yield* sessions.removeMessage({ sessionID, messageID })
      }
    }),

    /** The oldest running call of an Orchestra tool that no handler has taken yet. */
    claim: (tool: string) => {
      if (ended) return
      for (const [callID, part] of tools)
        if (part.tool === tool && part.state.status === "running" && !claimed.has(callID)) {
          claimed.add(callID)
          return part
        }
    },

    /** An Orchestra tool finished: write its full result (title, metadata, attachments) on the mirrored part. */
    complete: (part: SessionV1.ToolPart) => Effect.gen(function* () {
      if (ended) return
      tools.set(part.callID, part)
      yield* sessions.updatePart(part)
    }),

    /** The turn ended: close the last step and put the turn's cost on it. */
    finish: (previousCost: number) => Effect.gen(function* () {
      yield* close()
      if (last && cost > previousCost) {
        last = { ...last, cost: cost - previousCost }
        yield* sessions.updateMessage(last)
      }
      return { cost, last }
    }),

    /** The turn failed or was cancelled: running tools are aborted and the open step carries the error. */
    fail: (cause: { aborted: boolean; message: string }) => Effect.gen(function* () {
      if (ended) return last
      ended = true
      const now = Date.now()
      const current = step
      for (const part of tools.values()) {
        if (part.state.status !== "running" && part.state.status !== "pending") continue
        const aborted: SessionV1.ToolPart = { ...part, metadata: { ...part.metadata, interrupted: true },
          state: { status: "error", input: part.state.input, error: "Tool execution aborted",
            time: { start: part.state.status === "running" ? part.state.time.start : now, end: now } } }
        tools.set(part.callID, aborted)
        yield* sessions.updatePart(aborted)
      }
      const error = cause.aborted
        ? new AbortedError({ message: cause.message }).toObject()
        : new NamedError.Unknown({ message: cause.message }).toObject()
      // Failure admission must never touch the failed native store or filesystem snapshots.
      const info: SessionV1.Assistant = step?.info ?? { id: MessageID.ascending(), sessionID, parentID: input.user.id, role: "assistant",
        mode: input.agent.id ?? input.agent.name, agent: input.agent.id ?? input.agent.name, path: input.path,
        modelID: input.user.model.modelID, providerID: input.user.model.providerID, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: now } }
      for (const part of step?.open ?? []) yield* sessions.updatePart({ ...part, time: { start: part.time?.start ?? now, end: now } })
      last = { ...info, finish: "error", error: error as SessionV1.Assistant["error"], time: { ...info.time, completed: now } }
      step = undefined
      yield* sessions.updateMessage(last)
      // Native persistence is not part of this path. Healthy snapshots still retain actual undo evidence on Stop.
      const patch = current?.start ? yield* snapshot.patch(current.start).pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined
      const end = current?.start ? yield* snapshot.track().pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined
      if (patch?.files.length) yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: last.id, type: "patch", hash: patch.hash, files: patch.files })
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: last.id, type: "step-finish", reason: "error", cost: 0, tokens: last.tokens, snapshot: end })
      return last
    }),
  }
}
