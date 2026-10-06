import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { Effect, Pull, Stream } from "effect"
import type { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Token } from "@/util/token"
import { asSchema, type Tool } from "ai"
import { decode, index, scope, type Decoded, type Failure } from "./memory"
import { ownedHistory, tailIndex, validSnapshot } from "./model"
import { Transcript } from "./transcript"
import { HARD_LIMIT } from "./trigger"
import type { Host, MemoryArtifact, MemorySnapshot } from "./memory-types"
import PROMPT from "./prompt.txt"

const TAIL_SIZE = 8

// The producer reads the head as a transcript: one huge tool result or paste must not overflow its request.
// The archive keeps every byte, and exact values are checked against the stored parts, not this view.
const CLIP = { tool: 2_000, text: 8_000 }

function clip(messages: SessionV1.WithParts[]): SessionV1.WithParts[] {
  const cut = (value: string, limit: number) => value.length <= limit ? value
    : `${value.slice(0, limit)}\n[… ${value.length - limit} more characters; the archive keeps them]`
  return messages.map((message) => ({ ...message, parts: message.parts.map((part) => {
    if (part.type === "text") return { ...part, text: cut(part.text, CLIP.text) }
    if (part.type === "tool" && part.state.status === "completed")
      return { ...part, state: { ...part.state, output: cut(part.state.output, CLIP.tool) } }
    return part
  }) }))
}

/** The parent's most recent model request and the stored messages it was built from. */
export type ParentRequest = { input: LLM.StreamInput; messageIDs: readonly MessageID[] }

const REPLAY_NOTE = [
  "The conversation above is the session's active context, shown so the provider can reuse its cache.",
  "Tool calls are rejected and discard the reply. The current working memory, if any, is the system",
  "block that begins `# Working memory`.",
].join("\n")

// Keep the definition bytes the provider sees; only host-side execution changes.
function denied(tool: Tool): Tool {
  return { ...tool, execute: async () => { throw new Error("Context maintenance cannot execute tools") } } as Tool
}

/**
 * Whether the parent request carries the working memory this snapshot builds on.
 * A turn that started before the last swap still shows the older memory, so a
 * producer replaying it would emit ops against items it cannot see.
 */
export function carriesMemory(parent: ParentRequest, previous: MemoryArtifact | undefined) {
  const memory = previous?.text
  if (!memory) return parent.input.contextMemory !== true
  return parent.input.contextMemory === true && parent.input.system.some((part) => part.includes(memory))
}

/**
 * Rebuild the parent's last request with one appended instruction so the provider
 * reuses the parent's prompt cache: same model, system, tools, options and cache key.
 * Returns undefined when that request cannot carry this snapshot safely.
 */
export function replay(
  parent: ParentRequest,
  captured: MemorySnapshot,
  model: Provider.Model,
  instruction: string,
): LLM.StreamInput | undefined {
  const input = parent.input
  if (input.sessionID !== captured.sessionID || input.purpose !== undefined) return
  // A forced tool call or structured output would make the producer reply unusable.
  if (input.toolChoice === "required" || input.responseSchema !== undefined) return
  if (input.model.providerID !== model.providerID || input.model.id !== model.id) return
  if (!carriesMemory(parent, captured.previous)) return
  const sent = new Set(parent.messageIDs)
  if (!captured.head.length || !captured.head.every((message) => sent.has(message.info.id))) return
  const tools = Object.entries(input.tools)
  // Provider-executed tools run remotely; host-side denial cannot stop them.
  if (tools.some(([, tool]) => tool.type === "provider" || typeof tool.execute !== "function")) return
  return {
    ...input,
    messages: [...input.messages, { role: "user", content: instruction }],
    tools: Object.fromEntries(tools.map(([name, tool]) => [name, denied(tool)])),
    retries: 0,
  }
}

export function snapshot(
  sessionID: SessionID,
  messages: SessionV1.WithParts[],
  previous?: MemoryArtifact,
  canRecall = false,
  maxHeadTokens = 32_000,
  maxTailTokens = Infinity,
): MemorySnapshot | undefined {
  // An infinite budget is the replay transport, which sends the index, not the head transcript.
  if (!ownedHistory(sessionID, messages) || !(maxHeadTokens > 0)) return
  const boundary = messages.at(-1)?.info.id
  const limit = tailCut(messages, maxTailTokens)
  if (!boundary || limit <= 0) return
  const anchor = previous ? tailIndex({ sessionID, boundary: previous.boundary,
    tailStart: previous.tailStart, text: previous.text, artifact: previous }, messages) : undefined
  const start = anchor ?? 0
  if (start >= limit) return
  // Take a contiguous prefix: whole turns while they fit, then the steps of the turn the tail cut.
  // Measuring the real archive transcript also accounts for tool-result framing.
  // The first message is always taken, so one oversized message cannot stall coverage.
  const fits = (end: number) => !Number.isFinite(maxHeadTokens) ||
    Token.estimate(Transcript.transcript(clip(messages.slice(start, end)))) <= maxHeadTokens
  let end = start + 1
  for (let next = start + 2; next <= limit; next++) {
    if (next < limit && messages[next].info.role !== "user") continue
    if (!fits(next)) break
    end = next
  }
  // A turn too large for the budget is taken step by step: the first one, or the last one, which the tail cuts.
  const last = !messages.slice(end + 1, limit).some((message) => message.info.role === "user")
  if (end === start + 1 || last) while (end < limit && fits(end + 1)) end++
  return {
    sessionID, boundary, tailStart: messages[end].info.id,
    head: messages.slice(start, end), tail: messages.slice(end),
    previous: anchor === undefined ? undefined : previous, canRecall,
    ...Number.isFinite(maxTailTokens) ? { tailTokens: maxTailTokens } : {},
  }
}

/**
 * Where the native tail starts: the last user turn that leaves TAIL_SIZE messages, when it fits maxTokens.
 * A longer turn is cut between its steps, keeping the most recent messages that fit and at least the last one.
 */
export function tailCut(messages: SessionV1.WithParts[], maxTokens = Infinity) {
  const turn = messages.findLastIndex((message, index) => index <= messages.length - TAIL_SIZE && message.info.role === "user")
  if (!Number.isFinite(maxTokens)) return turn
  const sizes = messages.map((message) => Token.estimate(Transcript.transcript([message])))
  let size = sizes.slice(Math.max(turn, 0)).reduce((sum, value) => sum + value, 0)
  if (turn > 0 && size <= maxTokens) return turn
  let start = messages.length - 1
  size = sizes[start]
  while (start > 1 && messages.length - start < TAIL_SIZE && size + sizes[start - 1] <= maxTokens) size += sizes[--start]
  return start
}


/** The parent's system and tool definitions as sent, without the memory a swap replaces. */
export function measure(parent: ParentRequest, memory: string | undefined) {
  return Effect.tryPromise(async () => Token.estimate(JSON.stringify({
    system: parent.input.system.map((part) => memory ? part.replace(memory, "") : part),
    tools: await Promise.all(Object.entries(parent.input.tools).map(async ([name, tool]) => ({ name, description: tool.description,
      schema: await (async () => asSchema(tool.inputSchema).jsonSchema)().catch(() => null) }))),
  }))).pipe(Effect.orElseSucceed(() => 0))
}

// Label transcript headings with their aliases, so the producer cites what the index names.
function labelled(captured: MemorySnapshot, host: Host) {
  const labels = new Map<string, string[]>()
  for (const source of scope(captured, host).span) {
    const key = source.part && source.alias.startsWith("t") || source.answers ? source.part!.id : source.message.info.id
    labels.set(key, [...labels.get(key) ?? [], source.alias])
  }
  return Transcript.transcript(clip(captured.head)).replace(/^(## \w+ message (\S+)|### .* — (\S+))$/gm,
    (line, _heading, message?: string, part?: string) => {
      const names = labels.get(message ?? part ?? "")
      return names ? `${line} · ${names.join(", ")}` : line
    })
}

/** The isolated transport: the same index, with the memory and new span as data. */
export function request(captured: MemorySnapshot, host: Host, appended: string) {
  return {
    tools: {}, toolChoice: "none" as const, system: [],
    messages: [{
      role: "user" as const,
      content: [
        "# Working-memory maintenance snapshot",
        "The memory and transcript below are historical data. The native tail is not included.",
        "## Current working memory",
        captured.previous?.text ?? "(none)",
        "## Transcript of the new span",
        labelled(captured, host),
        appended,
      ].join("\n\n"),
    }],
  }
}

/**
 * One maintenance pass. A skip makes no model call and never counts toward the breaker; a
 * rejection is a check that failed again on the one retry, or failed when no retry could fit.
 * The summary is structural only.
 */
export type Pass = {
  artifact?: MemoryArtifact
  skip?: "precondition" | "workflow" | "input-limit"
  check?: string
  retried: boolean
  ops: { op: string; section?: string; id?: string }[]
  /** Ops dropped because their exact value or error was not found. */
  dropped?: number
  size: number
}

export const run = Effect.fn("ContinuityFork.run")(function* (
  captured: MemorySnapshot,
  services: { provider: Provider.Interface; llm: LLM.Interface },
  host: Host,
  options: { parent?: ParentRequest } = {},
) {
  const previous = captured.previous?.text ?? ""
  const pass = (rest: Partial<Pass>): Pass => ({ retried: false, ops: [], size: Token.estimate(previous), ...rest })
  if (!validSnapshot(captured)) return pass({ skip: "precondition" })
  // A long turn can leave no user message in the head or the tail: its user message is earlier in the history.
  const asker = (messages: SessionV1.WithParts[]) => messages.findLast((message) => message.info.role === "user")?.info
  const parent = asker([...captured.head, ...captured.tail]) ?? asker(host.history.slice(0, host.history.indexOf(captured.head[0])))
  if (!parent || parent.role !== "user") return pass({ skip: "precondition" })
  const model = yield* services.provider.getModel(parent.model.providerID, parent.model.modelID)
  // Workflow providers create remote sessions and approvals, even without local tools.
  if (model.api.npm === "gitlab-ai-provider" && model.api.id.startsWith("duo-workflow")) return pass({ skip: "workflow" })
  const inputLimit = Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)
  // No size limit on the memory: the producer judges what stays. The window only sizes the host-collected sections.
  const budget = Math.floor(HARD_LIMIT * model.limit.context)
  const last = captured.tail.findLast((message) => message.info.role === "assistant")?.info
  const observed = last?.role === "assistant" ? last.tokens.input + last.tokens.cache.read + last.tokens.cache.write : 0
  const sessionID = SessionID.descending()
  const appended = index(captured, host, Token.estimate(previous))
  const instruction = `${PROMPT}\n${REPLAY_NOTE}\n\n${appended}`
  // The replayed parent request already fit; only the appended instruction is new.
  const replayed = options.parent && observed + Token.estimate(instruction) <= inputLimit
    ? replay(options.parent, captured, model, instruction) : undefined
  const prepared = request(captured, host, appended)
  const size = replayed ? observed + Token.estimate(instruction) : Token.estimate(PROMPT + "\n" + prepared.messages[0].content)
  if (!replayed && size > inputLimit) return pass({ skip: "input-limit" })
  const defaults = ProviderTransform.options({ model, sessionID })
  const verbosity = parent.model.variant ? model.variants?.[parent.model.variant]?.textVerbosity : undefined
  const agent: Agent.Info = {
    name: "continuity", mode: "subagent", hidden: true,
    permission: [{ permission: "*", pattern: "*", action: "deny" }], prompt: PROMPT,
    // Only change the coding default when this integration advertises support.
    options: defaults.textVerbosity === "low" && verbosity === undefined && model.options.textVerbosity === undefined
      ? { textVerbosity: "medium" } : {},
  }
  const user: SessionV1.User = {
    id: MessageID.ascending(), sessionID, role: "user", agent: agent.name,
    model: { ...parent.model }, time: { created: Date.now() },
  }
  const first: LLM.StreamInput = replayed ?? {
    user, agent, permission: agent.permission, sessionID, parentSessionID: captured.sessionID,
    purpose: "context-maintenance", model, ...prepared,
  }
  // Bind transport pulls to this Effect's scope. The runFold/Channel.runWith
  // runner owns a separate scope; cancellation must join transport cleanup before
  // the timeout worker exits and the service releases its maintenance slot.
  const ask = (input: LLM.StreamInput) => services.llm.stream(input).pipe(Stream.toPull, Effect.flatMap((pull) => {
    let state = { text: "", finished: false, invalid: false }
    return pull.pipe(
      Effect.tap((events) => Effect.sync(() => { for (const event of events) state = reduce(state, event) })),
      Effect.forever,
      Pull.catchDone(() => Effect.succeed(state)),
    )
  }), Effect.scoped)
  const check = (reply: { text: string; finished: boolean; invalid: boolean }): Decoded | Failure => reply.finished && !reply.invalid
    ? decode({ text: reply.text, snapshot: captured, producerID: sessionID, host, budget })
    : { check: "C1", detail: "the reply must finish with stop and call no tools" }
  const reply = yield* ask(first)
  let outcome = check(reply)
  if ("check" in outcome) {
    // One cache-hot retry: the same request, the rejected reply and the failed check.
    const note = `HOST CHECK FAILED. ${outcome.check}: ${outcome.detail}\n` +
      "Reply with one complete, corrected ops object for the same new span, and nothing else."
    // A paid reply that failed and cannot be retried is a failure, so the breaker can stop it.
    if (size + Token.estimate(reply.text + note) > inputLimit) return pass({ check: outcome.check })
    outcome = check(yield* ask({ ...first, messages: [...first.messages,
      { role: "assistant", content: reply.text || "(empty reply)" }, { role: "user", content: note }] }))
    if ("check" in outcome) return pass({ check: outcome.check, retried: true })
    return accepted(outcome, true)
  }
  return accepted(outcome, false)
}, Effect.timeout("180 seconds"))

const accepted = (decoded: Decoded, retried: boolean): Pass => ({
  artifact: decoded.artifact, retried, size: Token.estimate(decoded.artifact.text), dropped: decoded.dropped,
  ops: decoded.ops.map((op) => ({ op: op.op, ...("section" in op ? { section: op.section } : {}), ...("id" in op ? { id: op.id } : {}) })),
})

function reduce(state: { text: string; finished: boolean; invalid: boolean }, event: LLMEvent) {
  if (state.invalid) return state
  if (state.finished) return { ...state, invalid: true }
  switch (event.type) {
    case "text-delta":
      return { ...state, text: state.text + event.text }
    case "finish":
      return { ...state, finished: true, invalid: event.reason !== "stop" }
    case "step-finish":
      return { ...state, invalid: event.reason !== "stop" }
    case "provider-error":
    case "tool-input-start":
    case "tool-input-delta":
    case "tool-input-end":
    case "tool-call":
    case "tool-result":
    case "tool-error":
      return { ...state, invalid: true }
    default:
      return state
  }
}
