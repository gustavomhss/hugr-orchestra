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
import { MessageV2 } from "@/session/message-v2"
import { decode, index, scaffold, scope, type Decoded, type Failure } from "./memory"
import { apply as applyMasks, type Masks } from "./masking"
import { ownedHistory, tailIndex, validSnapshot } from "./model"
import { Transcript } from "./transcript"
import { PREPARE_MARGIN } from "./trigger"
import type { Host, MemoryArtifact, MemorySnapshot } from "./memory-types"
import PROMPT from "./prompt.txt"

const TAIL_SIZE = 8

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
): MemorySnapshot | undefined {
  // An infinite budget is the replay transport, which sends the index, not the head transcript.
  if (!ownedHistory(sessionID, messages) || !(maxHeadTokens > 0)) return
  const boundary = messages.at(-1)?.info.id
  const limit = messages.findLastIndex((message, index) =>
    index <= messages.length - TAIL_SIZE && message.info.role === "user",
  )
  if (!boundary || limit <= 0) return
  const anchor = previous ? tailIndex({ sessionID, boundary: previous.boundary,
    tailStart: previous.tailStart, text: previous.text, artifact: previous }, messages) : undefined
  const start = anchor ?? 0
  if (start >= limit) return
  // Take a contiguous prefix of complete turns. Unprocessed turns stay native.
  // Measuring the real archive transcript also accounts for tool-result framing.
  // The first whole turn is always taken, so one oversized turn cannot stall coverage.
  let end = start
  for (let next = start + 1; next <= limit; next++) {
    if (messages[next].info.role !== "user") continue
    if (end > start && Number.isFinite(maxHeadTokens) &&
      Token.estimate(Transcript.transcript(messages.slice(start, next))) > maxHeadTokens) break
    end = next
  }
  if (end === start) return
  return {
    sessionID, boundary, tailStart: messages[end].info.id,
    head: messages.slice(start, end), tail: messages.slice(end),
    previous: anchor === undefined ? undefined : previous, canRecall,
  }
}

/** The region no pass can cover: from the last user turn that leaves TAIL_SIZE messages native. */
function protectedTail(captured: MemorySnapshot) {
  const messages = [...captured.head, ...captured.tail]
  const limit = messages.findLastIndex((message, index) => index <= messages.length - TAIL_SIZE && message.info.role === "user")
  return messages.slice(Math.max(captured.head.length, limit))
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
  return Transcript.transcript(captured.head).replace(/^(## \w+ message (\S+)|### .* — (\S+))$/gm,
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
  skip?: "precondition" | "workflow" | "no-ceiling" | "no-room" | "input-limit"
  check?: string
  retried: boolean
  ops: { op: string; section?: string; id?: string }[]
  size: number
  ceiling: number
}

export const run = Effect.fn("ContinuityFork.run")(function* (
  captured: MemorySnapshot,
  services: { provider: Provider.Interface; llm: LLM.Interface },
  host: Host,
  options: { trigger: number; masks?: Masks; parent?: ParentRequest; overhead?: number },
) {
  const previous = captured.previous?.text ?? ""
  const pass = (rest: Partial<Pass>): Pass => ({ retried: false, ops: [], size: Token.estimate(previous), ceiling: 0, ...rest })
  if (captured.canRecall !== true || !validSnapshot(captured)) return pass({ skip: "precondition" })
  const parent = captured.tail.findLast((message) => message.info.role === "user")?.info
  if (!parent || parent.role !== "user") return pass({ skip: "precondition" })
  const model = yield* services.provider.getModel(parent.model.providerID, parent.model.modelID)
  // Workflow providers create remote sessions and approvals, even without local tools.
  if (model.api.npm === "gitlab-ai-provider" && model.api.id.startsWith("duo-workflow")) return pass({ skip: "workflow" })
  const inputLimit = Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)
  // Measured as the model sees it: model messages with masks applied, not stored records.
  const sent = (messages: SessionV1.WithParts[]) => {
    const view = applyMasks(messages, options.masks ?? new Map())
    return MessageV2.toModelMessagesEffect(view, model).pipe(
      Effect.map((converted) => Token.estimate(JSON.stringify(converted))),
      Effect.orElseSucceed(() => Token.estimate(JSON.stringify(view))))
  }
  const overhead = options.overhead ?? (options.parent ? yield* measure(options.parent, previous) : 0)
  // After the swap the context sits where masking aims; every swap also shrinks the context.
  const ceiling = Math.floor(Math.min(
    (options.trigger - PREPARE_MARGIN) * model.limit.context - Math.max(2048, overhead) - (yield* sent(protectedTail(captured))),
    (yield* sent(captured.head)) + Token.estimate(previous)))
  if (!Number.isFinite(ceiling) || ceiling <= 0) return pass({ skip: "no-ceiling", ceiling })
  // The fixed scaffold alone overflows: no reply could fit, so the pass waits for a larger head.
  if (scaffold(captured, host, ceiling) > ceiling) return pass({ skip: "no-room", ceiling })
  const last = captured.tail.findLast((message) => message.info.role === "assistant")?.info
  const observed = last?.role === "assistant" ? last.tokens.input + last.tokens.cache.read + last.tokens.cache.write : 0
  const sessionID = SessionID.descending()
  const appended = index(captured, host, Token.estimate(previous), ceiling)
  const instruction = `${PROMPT}\n${REPLAY_NOTE}\n\n${appended}`
  // The replayed parent request already fit; only the appended instruction is new.
  const replayed = options.parent && observed + Token.estimate(instruction) <= inputLimit
    ? replay(options.parent, captured, model, instruction) : undefined
  const prepared = request(captured, host, appended)
  const size = replayed ? observed + Token.estimate(instruction) : Token.estimate(PROMPT + "\n" + prepared.messages[0].content)
  if (!replayed && size > inputLimit) return pass({ skip: "input-limit", ceiling })
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
    ? decode({ text: reply.text, snapshot: captured, producerID: sessionID, host, ceiling })
    : { check: "C1", detail: "the reply must finish with stop and call no tools" }
  const reply = yield* ask(first)
  let outcome = check(reply)
  if ("check" in outcome) {
    // One cache-hot retry: the same request, the rejected reply and the failed check.
    const note = `HOST CHECK FAILED. ${outcome.check}: ${outcome.detail}\n` +
      "Reply with one complete, corrected ops object for the same new span, and nothing else."
    // A paid reply that failed and cannot be retried is a failure, so the breaker can stop it.
    if (size + Token.estimate(reply.text + note) > inputLimit) return pass({ check: outcome.check, ceiling })
    outcome = check(yield* ask({ ...first, messages: [...first.messages,
      { role: "assistant", content: reply.text || "(empty reply)" }, { role: "user", content: note }] }))
    if ("check" in outcome) return pass({ check: outcome.check, retried: true, ceiling })
    return accepted(outcome, true, ceiling)
  }
  return accepted(outcome, false, ceiling)
}, Effect.timeout("180 seconds"))

const accepted = (decoded: Decoded, retried: boolean, ceiling: number): Pass => ({
  artifact: decoded.artifact, retried, ceiling, size: Token.estimate(decoded.artifact.text),
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
