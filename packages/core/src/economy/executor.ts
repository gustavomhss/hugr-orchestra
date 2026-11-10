// @orchestra/core — src/economy/executor.ts (G1 / F2)
//
// Scoped physical-attempt guard composed with `RequestExecutor.layer` (contract:
// modules/atlas/docs/design/genesis-g1-contract.md §1, §2.2, Astra decision 2026-11-09).
//
// - Every controllable send passes through this guard: the wrapped HttpClient is what
//   `RequestExecutor.layer` receives, so `retryStatusFailures` re-encounters the guard on
//   each retry and every attempt reserves inside the retry frontier (§1.5, EA-08).
// - The bound is sealed from the *final* request bytes: `max_output_tokens` must be a
//   positive finite integer and is the bound sent to reserve; the same bytes are
//   fingerprinted, reserved and forwarded — no re-serialization in between (§4.1, EA-05/06).
// - The admission context is a per-dispatch object created by the host; there is no global
//   "current attempt" (§2.2). The attempt chain (initial attempt and its retries) lives
//   inside that context: each retry reserves with the previous attempt as its named
//   predecessor, whose ≥400 response is recorded terminal evidence via `observeTerminal`
//   before the retry is reserved (§1.5).
// - Economic refusals keep a typed channel: the per-context outcome register (written
//   before the response path ever runs) plus a typed fail value — never converted into a
//   valid empty model response (EA-28).
// - Duplicate keys (EA-13) and reconciled repeats return non-consumable grants; only the
//   creator of a durable reservation may forward, and only once per attempt.

import { createHash } from "crypto"
import { Effect, Layer, Ref } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { LLMError, TransportReason } from "@orchestra/llm"
import { WebSocketExecutor } from "@orchestra/llm/route"
import { Database } from "../database/database"
import {
  type AttemptId,
  type AttemptOutcome,
  type AttemptBound,
  type AttemptUsage,
  attemptKey,
  lookupAttempt,
  noteTransportError,
  observeTerminal,
  recordForward,
  reserveAttempt,
  settleAttempt,
  type SealedRequest,
} from "./admission"

export interface EconomyDispatchInput {
  readonly envelope: SealedRequest["envelope"]
  readonly logical: SealedRequest["logical"]
  readonly key: string
  /** Only the instrumented, guarantee-capable transport is admitted (§1.1/§2.2). */
  readonly route: string
  readonly protocol: string
}

/** Typed economic-refusal value raised before any send is possible. */
export class EconomyDispatchRefused {
  readonly outcome: AttemptOutcome
  constructor(outcome: AttemptOutcome) {
    this.outcome = outcome
  }
}

interface ChainEntry {
  readonly attempt: AttemptId
  /** The HTTP attempt returned a complete response. This is not remote terminus. */
  readonly answered: boolean
}

/** Typed economic-refusal marker — never converted into a valid empty response. */
export const ECONOMY_REFUSAL_MARK = "economy-dispatch-refused"
export const ECONOMY_TRANSPORT_MARK = "economy-transport-failed"

const refusalDescription = (outcome: AttemptOutcome): string =>
  `${ECONOMY_REFUSAL_MARK}:${"reason" in outcome ? String(outcome.reason) : outcome.kind}`

export interface AttemptContext {
  /** Typed outcomes of every attempt reserved inside this context (EA-28 channel). */
  readonly outcomes: Effect.Effect<ReadonlyArray<AttemptOutcome>>
  /** Durable attempt identifiers reserved inside this context, in chain order. */
  readonly attempts: Effect.Effect<ReadonlyArray<AttemptId>>
  /** Costed HttpClient: decorator layer over the ambient one; give it to `RequestExecutor.layer`. */
  readonly layer: Layer.Layer<HttpClient.HttpClient, never, HttpClient.HttpClient | Database.Service>
  /** Refuses an uncovered socket before open/send (§2.2 / CE-10). */
  readonly uncovered: typeof uncoveredSockets
}

const uncoveredSockets = Layer.succeed(WebSocketExecutor.Service, {
  open: (socket) =>
    Effect.fail(new LLMError({
      module: "EconomyGuard",
      method: "open",
      reason: new TransportReason({
        message: `${ECONOMY_REFUSAL_MARK}:route`,
        url: socket.url,
        kind: "websocket",
      }),
    })),
})

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

const terminalEvidence = (status: number, body: string) => ({
  evidenceDigest: sha256(JSON.stringify({ status, body })),
  evidence: JSON.stringify({ status, body }),
})

/** One native bound field per admitted protocol. Aliases of another protocol never substitute. */
const NATIVE_BOUND_FIELD = {
  responses: "max_output_tokens",
  "openai-chat": "max_tokens",
} as const

const PROTOCOL_PROVIDER = {
  responses: "openai",
  "openai-chat": "openai",
} as const

type AdmittedProtocol = keyof typeof NATIVE_BOUND_FIELD

const isAdmittedProtocol = (protocol: string): protocol is AdmittedProtocol => protocol in NATIVE_BOUND_FIELD

const boundOf = (protocol: AdmittedProtocol, body: string): AttemptBound | "invalid" | "absent" => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return "absent"
  }
  const max = (parsed as Record<string, unknown>)[NATIVE_BOUND_FIELD[protocol]]
  if (max === undefined) return { attempts: 1 }
  if (typeof max !== "number" || !Number.isSafeInteger(max) || max <= 0) return "invalid"
  return { attempts: 1, outputTokens: max }
}

const modelOf = (body: string): string | undefined => {
  try {
    const model = (JSON.parse(body) as { readonly model?: unknown }).model
    return typeof model === "string" && model.length > 0 ? model : undefined
  } catch {
    return undefined
  }
}

interface ProtocolClose {
  readonly terminal: boolean
  readonly usage?: AttemptUsage
  readonly invalid: boolean
}

const counted = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined

const usageOf = (
  input: unknown,
  output: unknown,
  cached: unknown,
  reasoning: unknown,
): AttemptUsage | "invalid" | undefined => {
  if (input === undefined && output === undefined && cached === undefined && reasoning === undefined) return undefined
  const inputTokens = input === undefined ? undefined : counted(input)
  const outputTokens = output === undefined ? undefined : counted(output)
  const cachedInputTokens = cached === undefined ? undefined : counted(cached)
  const reasoningTokens = reasoning === undefined ? undefined : counted(reasoning)
  if (
    (input !== undefined && inputTokens === undefined) ||
    (output !== undefined && outputTokens === undefined) ||
    (cached !== undefined && cachedInputTokens === undefined) ||
    (reasoning !== undefined && reasoningTokens === undefined)
  ) return "invalid"
  if (cachedInputTokens !== undefined && (inputTokens === undefined || cachedInputTokens > inputTokens)) return "invalid"
  if (reasoningTokens !== undefined && (outputTokens === undefined || reasoningTokens > outputTokens)) return "invalid"
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  }
}

const responseTerminal = (type: unknown) =>
  type === "response.completed" || type === "response.incomplete" || type === "response.failed"

const chatCloses = (choices: ReadonlyArray<{ readonly finish_reason?: unknown }> | undefined) =>
  choices?.some((choice) => typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) === true

/**
 * Protocol close, matched to the consumer's terminal boundary.
 * Chat may split finish_reason and the final usage chunk; usage before that finish is not a measurement.
 * Responses stops at the first canonical terminal, including response.failed. A later event cannot replace it.
 */
const readClose = (protocol: AdmittedProtocol, text: string): ProtocolClose => {
  let terminal = false
  let invalid = false
  let usage: AttemptUsage | undefined
  for (const line of text.split("\n")) {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : ""
    if (payload.length === 0 || payload === "[DONE]") continue
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      continue
    }
    const record = parsed as {
      readonly choices?: ReadonlyArray<{ readonly finish_reason?: unknown }>
      readonly usage?: { readonly prompt_tokens?: unknown; readonly completion_tokens?: unknown; readonly prompt_tokens_details?: { readonly cached_tokens?: unknown }; readonly completion_tokens_details?: { readonly reasoning_tokens?: unknown } } | null
      readonly type?: unknown
      readonly response?: { readonly usage?: { readonly input_tokens?: unknown; readonly output_tokens?: unknown } | null }
    }
    if (protocol === "responses") {
      if (!responseTerminal(record.type)) continue
      terminal = true
      const responseUsage = record.response?.usage as {
        readonly input_tokens?: unknown
        readonly output_tokens?: unknown
        readonly input_tokens_details?: { readonly cached_tokens?: unknown }
        readonly output_tokens_details?: { readonly reasoning_tokens?: unknown }
      } | null | undefined
      const parsedUsage = responseUsage == null
        ? undefined
        : usageOf(responseUsage.input_tokens, responseUsage.output_tokens, responseUsage.input_tokens_details?.cached_tokens, responseUsage.output_tokens_details?.reasoning_tokens)
      if (parsedUsage === "invalid") {
        invalid = true
        usage = undefined
      } else {
        usage = parsedUsage
      }
      break
    }
    const parsedUsage = record.usage == null
      ? undefined
      : usageOf(record.usage.prompt_tokens, record.usage.completion_tokens, record.usage.prompt_tokens_details?.cached_tokens, record.usage.completion_tokens_details?.reasoning_tokens)
    if (!terminal) {
      if (!chatCloses(record.choices)) continue
      terminal = true
      if (parsedUsage === "invalid") {
        invalid = true
        usage = undefined
        continue
      }
      usage = parsedUsage
      continue
    }
    // A second close is past the finish the consumer already recorded. The trailing usage chunk is not a close.
    if (chatCloses(record.choices) || invalid) break
    if (parsedUsage === undefined) continue
    if (parsedUsage === "invalid") {
      invalid = true
      usage = undefined
      continue
    }
    usage = parsedUsage
  }
  return { terminal, invalid, ...(usage === undefined ? {} : { usage }) }
}

const protocolOfUrl = (url: string): AdmittedProtocol | undefined => {
  const path = new URL(url).pathname
  if (path.endsWith("/chat/completions")) return "openai-chat"
  if (path.endsWith("/responses")) return "responses"
  return undefined
}

const requestBodyOf = (request: HttpClientRequest.HttpClientRequest): Effect.Effect<string> =>
  Effect.gen(function* () {
    const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
    return yield* Effect.promise(() => web.text())
  })

const endpointOf = (request: HttpClientRequest.HttpClientRequest): string => {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`
}

const guardedDispatch = Effect.fnUntraced(function* (
  chain: Ref.Ref<ReadonlyArray<ChainEntry>>,
  outcomes: Ref.Ref<ReadonlyArray<AttemptOutcome>>,
  input: EconomyDispatchInput,
  request: HttpClientRequest.HttpClientRequest,
  submit: (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientResponse.HttpClientResponse, unknown>,
) {
  if (input.route !== "http" || input.route !== input.envelope.route) {
    const refusal: AttemptOutcome = { kind: "economy-refusal", reason: "route", evidence: [input.route, input.envelope.route] }
    yield* Ref.update(outcomes, (list) => [...list, refusal])
    return yield* Effect.fail(new EconomyDispatchRefused(refusal))
  }
  const effective = protocolOfUrl(request.url)
  if (effective === undefined || effective !== input.protocol) {
    const refusal: AttemptOutcome = { kind: "economy-refusal", reason: "route", evidence: [input.protocol, request.url] }
    yield* Ref.update(outcomes, (list) => [...list, refusal])
    return yield* Effect.fail(new EconomyDispatchRefused(refusal))
  }
  // §4.1: capture one copy of the final bytes; seal, reserve and send exactly from it.
  if (!isAdmittedProtocol(input.protocol) || input.envelope.provider !== PROTOCOL_PROVIDER[input.protocol]) {
    const refusal: AttemptOutcome = { kind: "economy-refusal", reason: "route", evidence: [input.protocol] }
    yield* Ref.update(outcomes, (list) => [...list, refusal])
    return yield* Effect.fail(new EconomyDispatchRefused(refusal))
  }
  const bytes = yield* requestBodyOf(request)
  const operationModel = modelOf(bytes)
  if (operationModel !== input.envelope.model) {
    const refusal: AttemptOutcome = { kind: "economy-refusal", reason: "identity", evidence: [operationModel ?? "model-missing"] }
    yield* Ref.update(outcomes, (list) => [...list, refusal])
    return yield* Effect.fail(new EconomyDispatchRefused(refusal))
  }
  const bound = boundOf(input.protocol, bytes)
  if (bound === "invalid" || bound === "absent") {
    const refusal: AttemptOutcome = { kind: "economy-refusal", reason: "bound", evidence: [NATIVE_BOUND_FIELD[input.protocol]] }
    yield* Ref.update(outcomes, (list) => [...list, refusal])
    return yield* Effect.fail(new EconomyDispatchRefused(refusal))
  }
  const entries = yield* Ref.get(chain)
  const prior = entries.at(-1)
  if (prior !== undefined && !prior.answered) {
    return yield* Effect.fail(new EconomyDispatchRefused({
      kind: "economy-refusal", reason: "predecessor", evidence: ["not-terminal"],
    }))
  }
  const outcome = yield* reserveAttempt({
    ...input,
    endpoint: endpointOf(request),
    body: bytes,
    bound,
    ...(prior === undefined ? {} : { prior: prior.attempt }),
  })
  yield* Ref.update(outcomes, (list) => [...list, outcome])
  if (outcome.kind !== "economy-grant") return yield* Effect.fail(new EconomyDispatchRefused(outcome))
  if (!outcome.consumable) return yield* replayOrHold(request, outcome)
  const attemptId = outcome.attempt
  yield* Ref.update(chain, (list) => [...list, { attempt: attemptId, answered: false }])
  const response = yield* submit(request)
  // Observation follows a response, never a mere intention to send (CE-12).
  const forward = yield* recordForward(attemptId)
  if (forward.kind === "economy-hold" || forward.kind === "economy-refusal") {
    return yield* Effect.fail(new EconomyDispatchRefused(forward))
  }
  const text = yield* response.text
  if (text === undefined) return response
  const rebuilt = HttpClientResponse.fromWeb(request, new Response(text, {
    status: response.status,
    headers: { "content-type": "text/event-stream" },
  }))
  yield* Ref.update(chain, (list) => list.map((entry) => entry.attempt === attemptId ? { ...entry, answered: true } : entry))
  const evidence = terminalEvidence(response.status, text)
  if (response.status >= 400) {
    // A gateway error is an observed response, not upstream terminus, and does not free the slot.
    const noted = yield* noteTransportError(attemptId, evidence)
    if (noted.kind === "economy-hold" || noted.kind === "economy-refusal") {
      return yield* Effect.fail(new EconomyDispatchRefused(noted))
    }
    return rebuilt
  }
  const close = readClose(input.protocol, text)
  if (close.invalid) {
    return yield* Effect.fail(new EconomyDispatchRefused({
      kind: "economy-refusal", reason: "usage", evidence: [attemptKey(attemptId), "inconsistent"],
    }))
  }
  if (!close.terminal) return rebuilt
  const terminal = yield* observeTerminal(attemptId, evidence)
  if (terminal.kind === "economy-hold" || terminal.kind === "economy-refusal") {
    return yield* Effect.fail(new EconomyDispatchRefused(terminal))
  }
  if (close.usage !== undefined) {
    const settled = yield* settleAttempt(attemptId, close.usage, evidence)
    if (settled.kind === "economy-hold" || settled.kind === "economy-refusal") {
      return yield* Effect.fail(new EconomyDispatchRefused(settled))
    }
  }
  return rebuilt
})

const replayOrHold = (
  request: HttpClientRequest.HttpClientRequest,
  outcome: Extract<AttemptOutcome, { kind: "economy-grant" }>,
) =>
  Effect.gen(function* () {
    if (outcome.completionRef === undefined) {
      return yield* Effect.fail(new EconomyDispatchRefused({
        kind: "economy-hold", reason: "response-unavailable", evidence: [outcome.key],
      }))
    }
    const found = yield* lookupAttempt(outcome.attempt)
    if (typeof found === "object" && found !== null && "completionBody" in found && found.completionBody !== undefined) {
      return HttpClientResponse.fromWeb(request, new Response(found.completionBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }))
    }
    return yield* Effect.fail(new EconomyDispatchRefused({
      kind: "economy-hold", reason: "response-unavailable", evidence: [outcome.completionRef],
    }))
  })

/**
 * Per-dispatch admission context: the chain and register live inside the returned object,
 * never in global state (§2.2). `layer` decorates the ambient HttpClient so every send —
 * including each retry executed by `RequestExecutor`'s `retryStatusFailures` — passes
 * through the guard.
 */
export const makeAdmissionGuard = (attempt: EconomyDispatchInput): AttemptContext => {
  const chain = Effect.runSync(Ref.make<ReadonlyArray<ChainEntry>>([]))
  const outcomes = Effect.runSync(Ref.make<ReadonlyArray<AttemptOutcome>>([]))
  return {
    outcomes: Ref.get(outcomes),
    attempts: Effect.map(Ref.get(chain), (entries) => entries.map((entry) => entry.attempt)),
    uncovered: uncoveredSockets,
    layer: Layer.effect(HttpClient.HttpClient, Effect.gen(function* () {
      const ambient = yield* HttpClient.HttpClient
      const database = yield* Database.Service
      return HttpClient.make((request) =>
        guardedDispatch(chain, outcomes, attempt, request, (sent) => ambient.execute(sent)).pipe(
          Effect.provideService(Database.Service, database),
          // The platform refuses any non-HttpClientError here; the economic refusal rides it
          // as an identified marked transport refusal (typed register + marker), never as a
          // valid empty response (§2.2 / EA-28). Ambient transport failures keep their
          // distinct marker; the original failure rides as `cause` in both cases.
          Effect.catchIf((error): error is unknown => true, (error) =>
            Effect.fail(new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                description: error instanceof EconomyDispatchRefused ? refusalDescription(error.outcome) : ECONOMY_TRANSPORT_MARK,
                cause: error,
              }),
            })),
          ),
        ),
      )
    })),
  }
}
