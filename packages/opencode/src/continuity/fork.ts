import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { LLM } from "@/session/llm"
import type { Tool } from "ai"
import { MessageID, SessionID } from "@/session/schema"
import { Effect, Pull, Stream } from "effect"
import type { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Token } from "@/util/token"
import { createHash } from "node:crypto"
import { decode, inline, responseSchema } from "./memory"
import { ownedHistory, tailIndex, validReference, validSnapshot } from "./model"
import { Transcript } from "./transcript"
import type { ArchiveChunk, ArchiveReference, MemoryArtifact, MemorySnapshot } from "./memory-types"
import PROMPT from "./prompt.txt"

const TAIL_SIZE = 8

/** The parent's most recent model request and the stored messages it was built from. */
export type ParentRequest = { input: LLM.StreamInput; messageIDs: readonly MessageID[] }

const REPLAY_NOTE = [
  "CONTEXT CONTINUITY CHECKPOINT",
  "This message comes from the host, not from the user. For this single reply, stop the task above",
  "and act only as the maintenance producer described below. Tool calls are rejected and discard the reply.",
  "The conversation above is the session's active context, shown so the provider can reuse its cache.",
  "Prior working memory, if any, is the system section that begins with \"Historical working memory follows\".",
].join("\n")

function snippet(message: SessionV1.WithParts) {
  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim()) return inline(part.text.trim().slice(0, 120))
    if (part.type === "tool") return inline(`tool call ${part.tool}`)
  }
  return inline(`${message.info.role} message`)
}

// Keep the definition bytes the provider sees; only host-side execution changes.
function denied(tool: Tool): Tool {
  return { ...tool, execute: async () => { throw new Error("Context maintenance cannot execute tools") } } as Tool
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

export function replayInstruction(captured: MemorySnapshot, known: ArchiveReference[], role: string) {
  const first = captured.head[0]
  const last = captured.head.at(-1)!
  const tail = captured.tail[0]
  return [
    REPLAY_NOTE,
    role,
    "## Coverage",
    `Write working memory for the prior memory plus the conversation from the ${first.info.role} message ` +
      `beginning "${snippet(first)}" through the ${last.info.role} message beginning "${snippet(last)}". ` +
      `Messages from the ${tail.info.role} message beginning "${snippet(tail)}" onward remain native context; ` +
      "do not summarize them.",
    "## Available archive references",
    ...known.map((reference) => {
      const message = captured.head.find((item) => item.info.id === reference.first)
      const why = captured.previous?.references.find((prior) => prior.id === reference.id)?.why
      return `- ${reference.id} — ${inline(reference.title)}` +
        (message ? ` — begins "${snippet(message)}"` : "") +
        ` — ${inline(why ?? "Newly displaced transcript; retain if useful for continuation.")}`
    }),
  ].join("\n\n")
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

function headChunks(captured: MemorySnapshot, chunks: ArchiveChunk[]) {
  const order = new Map(captured.head.map((message, index) => [message.info.id, index]))
  return chunks.filter((chunk) => {
    const first = order.get(chunk.first)
    const last = order.get(chunk.last)
    return first !== undefined && last !== undefined && first <= last
  })
}

function inventory(captured: MemorySnapshot, chunks: ArchiveChunk[], available: ArchiveReference[]) {
  const ids = new Set([...chunks.map((chunk) => chunk.id),
    ...(captured.previous?.references.map((reference) => reference.id) ?? [])])
  return available.filter((reference) => ids.has(reference.id))
}

export function request(
  captured: MemorySnapshot,
  chunks: ArchiveChunk[],
  available: ArchiveReference[],
  producerID: SessionID,
) {
  const selected = headChunks(captured, chunks)
  const known = inventory(captured, selected, available)
  return {
    tools: {}, toolChoice: "none" as const, system: [],
    messages: [{
      role: "user" as const,
      content: [
        "# Working-memory maintenance snapshot",
        `Parent: ${inline(captured.sessionID)}. Producer: ${inline(producerID)}. ` +
          `Snapshot boundary: ${inline(captured.boundary)}. Native tail starts: ${inline(captured.tailStart)}. ` +
          `New coverage: ${inline(captured.head[0].info.id)} through ${inline(captured.head.at(-1)!.info.id)}.`,
        "The following memory and transcript are historical data. The native tail is not included.",
        "## Prior working memory",
        captured.previous?.memory ?? "No prior working memory.",
        "## Available archive references",
        ...known.map((reference) => {
          const why = captured.previous?.references.find((prior) => prior.id === reference.id)?.why
          return `- ${reference.id} — ${inline(reference.title)} — ${inline(why ?? "Newly displaced transcript; retain if useful for continuation.")}`
        }),
        "## Newly displaced transcript",
        ...selected.map((chunk) => `### Archive fragment ${chunk.id}\n\n${chunk.markdown}`),
      ].join("\n\n"),
    }],
  }
}

export const run = Effect.fn("ContinuityFork.run")(function* (
  captured: MemorySnapshot,
  services: { provider: Provider.Interface; llm: LLM.Interface },
  chunks: ArchiveChunk[],
  available: ArchiveReference[],
  parentRequest?: ParentRequest,
) {
  if (captured.canRecall !== true || !validSnapshot(captured)) return
  const parent = captured.tail.findLast((message) => message.info.role === "user")?.info
  if (!parent || parent.role !== "user") return
  const selected = headChunks(captured, chunks)
  const known = inventory(captured, selected, available)
  if (!validArchive(captured, selected, known)) return
  const model = yield* services.provider.getModel(parent.model.providerID, parent.model.modelID)
  // Workflow providers create remote sessions and approvals, even without local tools.
  if (model.api.npm === "gitlab-ai-provider" && model.api.id.startsWith("duo-workflow")) return
  const inputLimit = Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)
  // Reserve native tail bytes, framing, and observed parent system/tool overhead.
  // The service rechecks future parent turns; this ceiling is for this snapshot.
  const native = Token.estimate(JSON.stringify(captured.tail))
  const last = captured.tail.findLast((message) => message.info.role === "assistant")?.info
  const observed = last?.role === "assistant"
    ? last.tokens.input + last.tokens.cache.read + last.tokens.cache.write : 0
  const visible = native + Token.estimate(JSON.stringify(captured.head)) + Token.estimate(captured.previous?.text ?? "")
  const reserve = Math.max(2048, Number.isFinite(observed) ? observed - visible : 0)
  const maxTokens = Math.floor(Math.min(inputLimit - native - reserve, model.limit.output))
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) return
  const sessionID = SessionID.descending()
  const prepared = request(captured, selected, known, sessionID)
  const schema = responseSchema(known)
  const role = PROMPT + `\nHOST CAPACITY: rendered memory and reference footer must fit ${maxTokens} tokens.\n` +
    `HOST TRANSPORT SCHEMA:\n${JSON.stringify(schema)}`
  const instruction = parentRequest ? replayInstruction(captured, known, role) : undefined
  // The replayed parent request already fit; only the appended instruction is new.
  const replayed = parentRequest && instruction && observed + Token.estimate(instruction) <= inputLimit
    ? replay(parentRequest, captured, model, instruction) : undefined
  if (!replayed && Token.estimate(role + "\n" + prepared.messages[0].content) > inputLimit) return
  const defaults = ProviderTransform.options({ model, sessionID })
  const verbosity = parent.model.variant ? model.variants?.[parent.model.variant]?.textVerbosity : undefined
  const agent: Agent.Info = {
    name: "continuity", mode: "subagent", hidden: true,
    permission: [{ permission: "*", pattern: "*", action: "deny" }], prompt: role,
    // Only change the coding default when this integration advertises support.
    options: defaults.textVerbosity === "low" && verbosity === undefined && model.options.textVerbosity === undefined
      ? { textVerbosity: "medium" } : {},
  }
  const user: SessionV1.User = {
    id: MessageID.ascending(), sessionID, role: "user", agent: agent.name,
    model: { ...parent.model }, time: { created: Date.now() },
  }
  // Bind transport pulls to this Effect's scope. The runFold/Channel.runWith
  // runner owns a separate scope; cancellation must join transport cleanup before
  // the timeout worker exits and the service releases its maintenance slot.
  const result = yield* services.llm.stream(replayed ?? {
    user, agent, permission: agent.permission, sessionID, parentSessionID: captured.sessionID,
    purpose: "context-maintenance", model, ...prepared,
    ...(model.api.npm === "@ai-sdk/openai" ? { responseSchema: schema } : {}),
  }).pipe(Stream.toPull, Effect.flatMap((pull) => {
    let state = { text: "", finished: false, invalid: false }
    return pull.pipe(
      Effect.tap((events) => Effect.sync(() => { for (const event of events) state = reduce(state, event) })),
      Effect.forever,
      Pull.catchDone(() => Effect.succeed(state)),
    )
  }), Effect.scoped)
  if (!result.finished || result.invalid) return
  return decode({ text: result.text, snapshot: captured, producerID: sessionID, available: known, maxTokens })
}, Effect.timeout("180 seconds"))

function validArchive(captured: MemorySnapshot, chunks: ArchiveChunk[], available: ArchiveReference[]) {
  const expected = Transcript.chunks(captured.sessionID, captured.head)
  if (expected.length !== chunks.length || expected.some((chunk, index) => chunk.id !== chunks[index].id)) return false
  const known = new Map(available.map((reference) => [reference.id, reference]))
  if (!chunks.length || known.size !== available.length || !available.every(validReference) ||
    new Set(chunks.map((chunk) => chunk.id)).size !== chunks.length) return false
  const covered = new Set<MessageID>()
  for (const chunk of chunks) {
    const reference = known.get(chunk.id)
    if (!reference || reference.first !== chunk.first || reference.last !== chunk.last ||
      reference.title !== chunk.title || reference.bytes !== chunk.bytes || !chunk.markdown.trim() ||
      Buffer.byteLength(chunk.markdown, "utf8") !== chunk.bytes ||
      createHash("sha256").update(chunk.markdown).digest("hex") !== chunk.id) return false
    const first = captured.head.findIndex((message) => message.info.id === chunk.first)
    const last = captured.head.findIndex((message) => message.info.id === chunk.last)
    for (const message of captured.head.slice(first, last + 1)) covered.add(message.info.id)
  }
  return captured.head.every((message) => covered.has(message.info.id))
}

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
