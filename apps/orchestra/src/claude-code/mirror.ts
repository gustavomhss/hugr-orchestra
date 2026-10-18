export * as ClaudeCodeMirror from "./mirror"

// Mirrors one Claude Code turn into Orchestra's session: the same message and part writes the processor makes, so the
// UI, the database, revert and the archive need no change. host/mirror.ts builds on it for a Claude-hosted session.
// - One Orchestra assistant message per Claude API message (`message.id`); Claude Code streams it block by block.
// - Claude Code's own tool parts carry `metadata.providerExecuted`: Claude Code runs them, so Orchestra's loop never
//   waits on them. Orchestra's MCP tools (tools.ts) do not: Orchestra ran them.
// - Each assistant message is a step: `step-start`/`step-finish` with snapshots and a `patch` part, as the processor
//   writes them, so revert restores files whichever tool changed them.
import { Effect } from "effect"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { AbortedError } from "@orchestra/core/v1/session"
import { NamedError } from "@orchestra/core/util/error"
import { ModelV2 } from "@orchestra/core/model"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import type { Snapshot } from "@/snapshot"
import type { Agent } from "@/agent/agent"
import { ClaudeCodeTranscript } from "./transcript"
import { ClaudeCodeTools } from "./tools"

/** Claude Code tool names shown under Orchestra's own names, so the UI renders them with its tool views. */
export const NAMES: Record<string, string> = Object.fromEntries(Object.entries(ClaudeCodeTools.NATIVE).map(([id, name]) => [name, id]))

const FINISH: Record<string, string> = {
  end_turn: "stop",
  stop_sequence: "stop",
  tool_use: "tool-calls",
  max_tokens: "length",
  refusal: "content-filter",
  pause_turn: "other",
}

type Usage = { input_tokens?: number | null; output_tokens?: number | null;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number | null } | null }

type Step = {
  info: SessionV1.Assistant
  apiID: string
  /** A model from an actual SDK assistant frame, not the requested model fallback. */
  model?: string
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
}) {
  const { sessionID, sessions, snapshot } = input
  const tools = new Map<string, SessionV1.ToolPart>()
  const claimed = new Set<string>()
  const uuids = new Map<string, MessageID>()
  let step: Step | undefined
  let last: SessionV1.Assistant | undefined
  let lastFinish: SessionV1.StepFinishPart | undefined
  let lastModel: string | undefined
  let costModel: string | undefined
  let costOwner: MessageID | undefined
  let costReceipt: PartID | undefined
  let pendingCostOwner = false
  let cost: number | undefined
  let rejectedBaseline: number | undefined
  let ended = false
  let parentID = input.user.id

  const open = (apiID: string) => Effect.gen(function* () {
    if (step?.apiID === apiID) return step
    if (step && [...tools.values()].some((part) => part.messageID === step?.info.id &&
      (part.state.status === "running" || part.state.status === "pending")))
      return yield* Effect.die(new Error("Claude Code began a step before prior tools finished"))
    yield* close()
    const info: SessionV1.Assistant = {
      id: MessageID.ascending(), sessionID, parentID, role: "assistant",
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
    const reasoning = exactReasoning(usage)
    const tokens = { input: usage.input_tokens ?? 0, output: Math.max(0, (usage.output_tokens ?? 0) - reasoning), reasoning,
      cache: { read: usage.cache_read_input_tokens ?? 0, write: usage.cache_creation_input_tokens ?? 0 } }
    // A failed step still finishes ("error"), so the loop sees the turn answered and ends.
    const finish = error ? "error" : FINISH[current.stop ?? ""] ?? "other"
    const end = yield* snapshot.track()
    const part: SessionV1.StepFinishPart = { id: PartID.ascending(), sessionID, messageID: current.info.id, type: "step-finish",
      reason: finish, snapshot: end, cost: 0, tokens }
    yield* sessions.updatePart(part)
    lastFinish = part
    lastModel = current.model
    if (costOwner === current.info.id) costReceipt = part.id
    if (current.start) {
      const patch = yield* snapshot.patch(current.start)
      if (patch.files.length)
        yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: current.info.id, type: "patch",
          hash: patch.hash, files: patch.files })
    }
    current.info = { ...current.info, tokens, finish, error, time: { ...current.info.time, completed: now } }
    yield* sessions.updateMessage(current.info)
    last = current.info
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
      ? { ...part, state: { status: "error", input: part.state.input, error: output || "Tool failed",
          metadata: { ...(part.state.status === "running" ? part.state.metadata : {}), output }, time: { start, end: Date.now() } } }
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
        cost = undefined
        costModel = undefined
        costOwner = step?.info.id ?? last?.id
        costReceipt = costOwner === last?.id ? lastFinish?.id : undefined
        pendingCostOwner = costOwner === undefined
        // The result observer may overwrite this scalar before finish; retain it for rejected ownership too.
        const stored = yield* sessions.get(sessionID).pipe(Effect.orDie)
        const previous = stored.metadata?.claudeCode?.cost
        rejectedBaseline = typeof previous === "number" && Number.isFinite(previous) && previous >= 0 ? previous : undefined
        if (Number.isFinite(message.total_cost_usd) && message.total_cost_usd >= 0) {
          const model = step?.model ?? lastModel
          const expected = model ?? input.user.model.modelID
          const reported = Object.entries(message.modelUsage ?? {}).find(([id, usage]) =>
            id === expected || usage.canonicalModel === expected)?.[1]
          const priced = Object.values(message.modelUsage ?? {}).every((usage) =>
            usage.costBasis !== "unknown" && Number.isFinite(usage.costUSD) && usage.costUSD >= 0)
          // No-frame errors may use a matching reported model total, never the requested model alone.
          // Host owns query replay/reset admission; this mirror only projects the admitted allocation.
          costModel = message.modelUsage === undefined ? model
            : reported && priced ? expected : undefined
          // A reported zero resets the cumulative baseline without claiming priced model work.
          if (costModel || message.total_cost_usd === 0) cost = message.total_cost_usd
        }
        if (!step && !last && message.subtype === "success") {
          const current = yield* open(`result:${message.uuid}`)
          if (pendingCostOwner) {
            costOwner = current.info.id
            pendingCostOwner = false
          }
          if (message.result) {
            const part = yield* text(current, "text", false)
            yield* sessions.updatePart({ ...part, text: message.result, time: { start: Date.now(), end: Date.now() } })
          }
        }
        if (step && message.stop_reason) step.stop = message.stop_reason
        if (!step && last && lastFinish && costOwner === last.id && costReceipt === lastFinish.id &&
          message.stop_reason && last.finish !== "error") {
          const finish = FINISH[message.stop_reason] ?? last.finish ?? "other"
          const receipt = { ...lastFinish, reason: finish }
          const info = { ...last, finish }
          yield* sessions.updatePart(receipt)
          yield* sessions.updateMessage(info)
          lastFinish = receipt
          last = info
        }
        return
      }
      // A subagent's frames belong to its seat's child session: host/mirror.ts hands them to that session's mirror.
      if ("parent_tool_use_id" in message && message.parent_tool_use_id) return
      if (message.type === "stream_event") {
        const event = message.event
        if (event.type === "message_start") {
          pendingCostOwner = false
          const current = yield* open(event.message.id)
          current.model = event.message.model || current.model
          current.info = { ...current.info, modelID: ModelV2.ID.make(event.message.model || current.info.modelID) }
          yield* sessions.updateMessage(current.info)
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
        pendingCostOwner = false
        const current = yield* open(message.message.id)
        current.model = message.message.model || current.model
        current.info = { ...current.info, modelID: ModelV2.ID.make(message.message.model || current.info.modelID) }
        yield* sessions.updateMessage(current.info)
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
            const own = ClaudeCodeTools.orchestra(block.name)
            const part: SessionV1.ToolPart = { id: PartID.ascending(), sessionID, messageID: current.info.id, type: "tool",
              callID: block.id, tool: NAMES[block.name] ?? own ?? block.name,
              state: { status: "running", input: block.input as Record<string, unknown>, time: { start: Date.now() } },
              metadata: own ? { claudeCodeTool: block.name } : { providerExecuted: true, claudeCodeTool: block.name } }
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
    /** A receipt may first arrive with the complete assistant for an already-open stream. */
    parent: (next: MessageID) => Effect.gen(function* () {
      parentID = next
      if (!step) return
      step.info = { ...step.info, parentID: next }
      yield* sessions.updateMessage(step.info)
    }),
    tool: (callID: string) => tools.get(callID),
    retract: (ids: readonly string[]) => Effect.gen(function* () {
      const messages = new Set(ids.flatMap((id) => uuids.get(id) ? [uuids.get(id) as MessageID] : []))
      for (const messageID of messages) {
        if (costOwner === messageID) {
          costOwner = undefined
          costReceipt = undefined
          pendingCostOwner = false
        }
        if (step?.info.id === messageID) step = undefined
        if (last?.id === messageID) {
          last = undefined
          lastFinish = undefined
          lastModel = undefined
        }
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

    /** Host serializes on/finish/retract; receipt replacement does not synchronize concurrent callers. */
    finish: (previousCost: number) => Effect.gen(function* () {
      yield* close()
      const owned = last !== undefined && lastFinish !== undefined && costOwner === last.id &&
        costReceipt === lastFinish.id && lastFinish.messageID === last.id && costModel === last.modelID
      if (cost !== undefined && last && lastFinish && owned &&
        Number.isFinite(previousCost) && previousCost >= 0 && cost > previousCost && last.cost !== cost - previousCost) {
        // Core aggregates parts, not assistant.cost. Reuse this receipt so retries replace, never append usage.
        const receipt = { ...lastFinish, cost: cost - previousCost }
        yield* sessions.updatePart(receipt)
        const info = { ...last, cost: cost - previousCost }
        yield* sessions.updateMessage(info)
        lastFinish = receipt
        last = info
      }
      // Undefined means no accepted total, whereas an accepted zero is a genuine producer reset.
      return { cost: cost !== undefined && (owned || cost === 0) ? cost : rejectedBaseline ?? previousCost, last }
    }),

    /** The turn failed or was cancelled: running tools are aborted and the open step carries the error. */
    fail: (cause: { aborted: boolean; message: string }) => Effect.gen(function* () {
      if (ended) return last
      ended = true
      const now = Date.now()
      const current = step
      const retained = !current && last?.id === costOwner && lastFinish?.messageID === last?.id ? last : undefined
      const retainedFinish = retained ? lastFinish : undefined
      for (const part of tools.values()) {
        if (part.state.status !== "running" && part.state.status !== "pending") continue
        const aborted: SessionV1.ToolPart = { ...part, metadata: { ...part.metadata, interrupted: true },
          state: { status: "error", input: part.state.input, error: "Tool execution aborted",
            metadata: { ...(part.state.status === "running" ? part.state.metadata : {}), aborted: true },
            time: { start: part.state.status === "running" ? part.state.time.start : now, end: now } } }
        tools.set(part.callID, aborted)
        yield* sessions.updatePart(aborted)
      }
      const error = cause.aborted
        ? new AbortedError({ message: cause.message }).toObject()
        : new NamedError.Unknown({ message: cause.message }).toObject()
      // Persist the failure before best-effort snapshots.
      const info: SessionV1.Assistant = current?.info ?? retained ?? { id: MessageID.ascending(), sessionID, parentID, role: "assistant",
        mode: input.agent.id ?? input.agent.name, agent: input.agent.id ?? input.agent.name, path: input.path,
        modelID: input.user.model.modelID, providerID: input.user.model.providerID, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: now } }
      const usage = current?.usage
      const reasoning = exactReasoning(usage)
      const tokens = retained?.tokens ?? { input: usage?.input_tokens ?? 0, output: Math.max(0, (usage?.output_tokens ?? 0) - reasoning), reasoning,
        cache: { read: usage?.cache_read_input_tokens ?? 0, write: usage?.cache_creation_input_tokens ?? 0 } }
      for (const part of current?.open ?? []) yield* sessions.updatePart({ ...part, time: { start: part.time?.start ?? now, end: now } })
      last = { ...info, tokens, finish: "error", error: error as SessionV1.Assistant["error"], time: { ...info.time, completed: now } }
      lastModel = current?.model ?? (retained ? lastModel : undefined)
      step = undefined
      yield* sessions.updateMessage(last)
      // Healthy snapshots still retain actual undo evidence on Stop.
      const patch = current?.start ? yield* snapshot.patch(current.start).pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined
      const end = current?.start ? yield* snapshot.track().pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined
      if (patch?.files.length) yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: last.id, type: "patch", hash: patch.hash, files: patch.files })
      lastFinish = retainedFinish ? { ...retainedFinish, reason: "error", tokens: last.tokens }
        : { id: PartID.ascending(), sessionID, messageID: last.id, type: "step-finish", reason: "error", cost: 0, tokens: last.tokens, snapshot: end }
      yield* sessions.updatePart(lastFinish)
      if (pendingCostOwner) {
        costOwner = last.id
        pendingCostOwner = false
      }
      if (costOwner === last.id) costReceipt = lastFinish.id
      return last
    }),
  }
}

// Thinking is a subset of output. Missing or invalid per-message details remain unallocated.
function exactReasoning(usage: Usage | undefined) {
  const tokens = usage?.output_tokens_details?.thinking_tokens
  return typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0 && tokens <= (usage?.output_tokens ?? 0) ? tokens : 0
}
