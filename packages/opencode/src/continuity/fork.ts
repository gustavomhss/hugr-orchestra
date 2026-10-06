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
import { decode, index, type Decoded, type Failure } from "./memory"
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
export function carriesMemory(parent: ParentRequest, captured: MemorySnapshot) {
  const memory = captured.previous?.text
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
  if (!carriesMemory(parent, captured)) return
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
  if (!ownedHistory(sessionID, messages) || !Number.isFinite(maxHeadTokens) || maxHeadTokens <= 0) return
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
  let end = start
  for (let next = start + 1; next <= limit; next++) {
    if (messages[next].info.role !== "user") continue
    if (Token.estimate(Transcript.transcript(messages.slice(start, next))) > maxHeadTokens) break
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

// The parent's system and tool definitions as sent, without the memory a swap replaces.
function overhead(parent: ParentRequest | undefined, memory: string) {
  if (!parent) return Effect.succeed(0)
  return Effect.tryPromise(async () => Token.estimate(JSON.stringify({
    system: parent.input.system.map((part) => memory ? part.replace(memory, "") : part),
    tools: await Promise.all(Object.entries(parent.input.tools).map(async ([name, tool]) => ({ name, description: tool.description,
      schema: await (async () => asSchema(tool.inputSchema).jsonSchema)().catch(() => null) }))),
  }))).pipe(Effect.orElseSucceed(() => 0))
}

/** The isolated transport: the same index, with the memory and new span as data. */
export function request(captured: MemorySnapshot, appended: string) {
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
        Transcript.transcript(captured.head),
        appended,
      ].join("\n\n"),
    }],
  }
}

export const run = Effect.fn("ContinuityFork.run")(function* (
  captured: MemorySnapshot,
  services: { provider: Provider.Interface; llm: LLM.Interface },
  host: Host,
  options: { trigger: number; masks?: Masks; parent?: ParentRequest },
) {
  if (captured.canRecall !== true || !validSnapshot(captured)) return
  const parent = captured.tail.findLast((message) => message.info.role === "user")?.info
  if (!parent || parent.role !== "user") return
  const model = yield* services.provider.getModel(parent.model.providerID, parent.model.modelID)
  // Workflow providers create remote sessions and approvals, even without local tools.
  if (model.api.npm === "gitlab-ai-provider" && model.api.id.startsWith("duo-workflow")) return
  const inputLimit = Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)
  const previous = captured.previous?.text ?? ""
  const sent = (messages: SessionV1.WithParts[]) => Token.estimate(JSON.stringify(applyMasks(messages, options.masks ?? new Map())))
  // After the swap the context sits where masking aims; every swap also shrinks the context.
  const ceiling = Math.floor(Math.min(
    (options.trigger - PREPARE_MARGIN) * model.limit.context - Math.max(2048, yield* overhead(options.parent, previous)) -
      sent(protectedTail(captured)),
    sent(captured.head) + Token.estimate(previous)))
  if (!Number.isFinite(ceiling) || ceiling <= 0) return
  const last = captured.tail.findLast((message) => message.info.role === "assistant")?.info
  const observed = last?.role === "assistant" ? last.tokens.input + last.tokens.cache.read + last.tokens.cache.write : 0
  const sessionID = SessionID.descending()
  const appended = index(captured, host, Token.estimate(previous), ceiling)
  const instruction = `${PROMPT}\n${REPLAY_NOTE}\n\n${appended}`
  // The replayed parent request already fit; only the appended instruction is new.
  const replayed = options.parent && observed + Token.estimate(instruction) <= inputLimit
    ? replay(options.parent, captured, model, instruction) : undefined
  const prepared = request(captured, appended)
  const size = replayed ? observed + Token.estimate(instruction) : Token.estimate(PROMPT + "\n" + prepared.messages[0].content)
  if (!replayed && size > inputLimit) return
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
  let retried = false
  if ("check" in outcome) {
    // One cache-hot retry: the same request, the rejected reply and the failed check.
    const note = `HOST CHECK FAILED. ${outcome.check}: ${outcome.detail}\n` +
      "Reply with one complete, corrected ops object for the same new span, and nothing else."
    if (size + Token.estimate(reply.text + note) <= inputLimit) {
      retried = true
      outcome = check(yield* ask({ ...first, messages: [...first.messages,
        { role: "assistant", content: reply.text || "(empty reply)" }, { role: "user", content: note }] }))
    }
  }
  const accepted = "artifact" in outcome ? outcome : undefined
  yield* Effect.logInfo("continuity maintenance", {
    sessionID: captured.sessionID, boundary: captured.boundary, reason: "pass",
    outcome: accepted ? "accepted" : `${(outcome as Failure).check}: ${(outcome as Failure).detail}`, retried,
    ops: accepted?.ops, retired: accepted?.retired, size: Token.estimate(accepted?.artifact.text ?? previous), ceiling,
  })
  return accepted?.artifact
}, Effect.timeout("180 seconds"))

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
