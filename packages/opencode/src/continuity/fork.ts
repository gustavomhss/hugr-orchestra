import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { Effect, Stream } from "effect"
import type { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Token } from "@/util/token"
import { catalogue, input } from "./source"
import { decode, estimateHostBase, jsonSchema } from "./artifact"
import { responseSchema } from "./output-schema"
import type { ArtifactEnvelope, MaterializedArtifact, SourceCatalogue } from "./types"
import PROMPT from "./prompt.txt"

const TAIL_SIZE = 8
export const MAX_ARTIFACT_TOKENS = 6000

export function snapshot(
  sessionID: SessionID,
  messages: SessionV1.WithParts[],
  previous?: MaterializedArtifact,
  canRecall = false,
) {
  const boundary = messages.at(-1)?.info.id
  const index = messages.findLastIndex((message, index) =>
    index <= messages.length - TAIL_SIZE && message.info.role === "user",
  )
  if (!boundary || index <= 0) return
  const anchor = previous ? messages.findIndex((message) => message.info.id === previous.envelope.tailStart) : -1
  const covered = previous ? messages.findIndex((message) => message.info.id === previous.envelope.coveredThrough) : -1
  const submitted = previous ? messages.findIndex((message) => message.info.id === previous.envelope.boundary) : -1
  const usable = previous && previous.envelope.version === 1 && previous.envelope.kind === "continuity_handoff" &&
    previous.envelope.parentID === sessionID && previous.body.status === "ready" && anchor >= 0 &&
    messages[anchor].info.role === "user" && submitted >= anchor && (covered < 0 || covered === anchor - 1)
  // A prior artifact replaces only its covered prefix; never summarize that raw prefix again.
  const start = usable ? anchor : 0
  if (start >= index) return
  return {
    sessionID,
    boundary,
    tailStart: messages[index].info.id,
    head: messages.slice(start, index),
    tail: messages.slice(index),
    previous: usable ? previous : undefined,
    canRecall,
  }
}

type Snapshot = NonNullable<ReturnType<typeof snapshot>>

function envelope(input: Snapshot, producerID: SessionID): ArtifactEnvelope {
  return {
    version: 1,
    kind: "continuity_handoff",
    parentID: input.sessionID,
    producerID,
    boundary: input.boundary,
    coveredThrough: input.head[input.head.length - 1].info.id,
    tailStart: input.tailStart,
  }
}

export function request(captured: Snapshot, sources: SourceCatalogue, producerID: SessionID) {
  const hostEnvelope = envelope(captured, producerID)
  return {
    tools: {},
    toolChoice: "none" as const,
    system: [],
    messages: [{
      role: "user" as const,
      content: JSON.stringify({
        envelope: hostEnvelope,
        receiver: { canRecall: captured.canRecall },
        maxTokens: MAX_ARTIFACT_TOKENS,
        budget: { maxTokens: MAX_ARTIFACT_TOKENS, fixedTokens: estimateHostBase(hostEnvelope) },
        source: input(sources),
        bodySchema: jsonSchema,
      }),
    }],
  }
}

export const run = Effect.fn("ContinuityFork.run")(function* (
  captured: Snapshot,
  services: { provider: Provider.Interface; llm: LLM.Interface },
) {
  const parent = captured.tail.findLast((message) => message.info.role === "user")?.info
  if (!parent || parent.role !== "user" || captured.head.length === 0) return
  const model = yield* services.provider.getModel(parent.model.providerID, parent.model.modelID)
  // Workflow providers create remote sessions and approvals, even with no local tools.
  if (model.api.npm === "gitlab-ai-provider" && model.api.id.startsWith("duo-workflow")) return
  const sessionID = SessionID.descending()
  const sources = catalogue({
    parentID: captured.sessionID, head: captured.head, previous: captured.previous, canRecall: captured.canRecall,
  })
  const prepared = request(captured, sources, sessionID)
  const schemaRole = `\nV1 BODY SCHEMA (host-owned):\n${JSON.stringify(jsonSchema)}`
  const hostRules = `\nHOST SNAPSHOT RULES (host-owned; current runtime):\nreceiver.canRecall:${captured.canRecall}\n` +
    (captured.canRecall
      ? "reference_only requires receiver.canRecall:true AND each referenced unit.recoverable:true. Preserve necessary supplied facts in exact or grounded notes; a path alone is not a retrieval route.\n"
      : "reference_only MUST be []; this parent has no operational retrieval route. Preserve necessary supplied facts in exact or grounded notes; do not claim unsupported recovery.\n") +
    "ready MUST have issues:[]; nonempty issues require status:needs_context. Unknown task facts are notes, not ready issues. exact reason only constraint/identifier/evidence.\n" +
    "Budget: fixed + exact(sum selected) + citation(sum unique active NOT exact) + notesJSON. Reserve reference_only JSON too. Exact frames already include semantic provenance; do not pay citationTokens again for exact IDs. Costs are conservative per-source bounds; shared dictionary values render once. Actual rendered budget maximum: 6000 tokens."
  const role = PROMPT + schemaRole + hostRules
  const inputLimit = Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)
  if (inputLimit <= 0 || Token.estimate(role + prepared.messages[0].content) > inputLimit) return
  const defaults = ProviderTransform.options({ model, sessionID })
  const verbosity = parent.model.variant ? model.variants?.[parent.model.variant]?.textVerbosity : undefined
  const agent: Agent.Info = {
    name: "continuity",
    mode: "subagent",
    hidden: true,
    permission: [{ permission: "*", pattern: "*", action: "deny" }],
    prompt: role,
    // Only change the coding default when this integration advertises support.
    options: defaults.textVerbosity === "low" && verbosity === undefined && model.options.textVerbosity === undefined
      ? { textVerbosity: "medium" } : {},
  }
  const user: SessionV1.User = {
    id: MessageID.ascending(),
    sessionID,
    role: "user",
    agent: agent.name,
    model: { ...parent.model },
    time: { created: Date.now() },
  }
  const result = yield* services.llm.stream({
    user,
    agent,
    permission: agent.permission,
    sessionID,
    parentSessionID: captured.sessionID,
    purpose: "context-maintenance",
    model,
    ...prepared,
    ...(model.api.npm === "@ai-sdk/openai" ? { responseSchema: responseSchema(sources) } : {}),
  }).pipe(Stream.runFold(() => ({ text: "", finished: false, invalid: false }), reduce))
  if (!result.finished || result.invalid) return
  const decoded = decode({
    text: result.text, catalogue: sources, envelope: envelope(captured, sessionID), maxTokens: MAX_ARTIFACT_TOKENS,
  })
  return decoded.ok ? decoded.artifact : undefined
}, Effect.timeout("60 seconds"))

function reduce(state: { text: string; finished: boolean; invalid: boolean }, event: LLMEvent) {
  if (state.finished) return { ...state, invalid: true }
  switch (event.type) {
    case "text-delta":
      return { ...state, text: state.text + event.text }
    case "finish":
      return { ...state, finished: true, invalid: state.invalid || event.reason !== "stop" }
    case "step-finish":
      return { ...state, invalid: state.invalid || event.reason !== "stop" }
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
