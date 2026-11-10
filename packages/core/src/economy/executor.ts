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
import { Database } from "../database/database"
import {
  type AttemptId,
  type AttemptOutcome,
  type AttemptBound,
  observeTerminal,
  recordForward,
  reserveAttempt,
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
  readonly terminal: boolean
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
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

const terminalEvidence = (status: number, body: string) => ({
  evidenceDigest: sha256(JSON.stringify({ status, body })),
  evidence: JSON.stringify({ status, body }),
})

/**
 * The bound is sealed from the final request bytes, not from pre-serialization intent (§4.1).
 * Body keys: `max_output_tokens` (Responses) / `max_tokens` / `max_completion_tokens` (chat).
 */
const NATIVE_BOUND_KEYS = ["max_output_tokens", "max_tokens", "max_completion_tokens"] as const

const boundOf = (body: string): AttemptBound => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { attempts: 1 }
  }
  for (const key of NATIVE_BOUND_KEYS) {
    const max = (parsed as Record<string, unknown>)[key]
    if (typeof max === "number" && Number.isFinite(max) && Number.isInteger(max) && max > 0) {
      return { attempts: 1, outputTokens: max }
    }
  }
  return { attempts: 1 }
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
  if (input.route !== "http") {
    const refusal: AttemptOutcome = { kind: "economy-refusal", reason: "route", evidence: [input.route] }
    yield* Ref.update(outcomes, (list) => [...list, refusal])
    return yield* Effect.fail(new EconomyDispatchRefused(refusal))
  }
  // §4.1: capture one copy of the final bytes; seal, reserve and send exactly from it.
  const bytes = yield* requestBodyOf(request)
  const entries = yield* Ref.get(chain)
  const prior = entries.at(-1)
  if (prior !== undefined && !prior.terminal) {
    // A possibly forwarded attempt keeps its position until terminus; a retry without
    // recorded predecessor terminus is refused (§4.4).
    return yield* Effect.fail(new EconomyDispatchRefused({
      kind: "economy-refusal", reason: "predecessor", evidence: ["not-terminal"],
    }))
  }
  const outcome = yield* reserveAttempt({
    ...input,
    endpoint: endpointOf(request),
    body: bytes,
    bound: boundOf(bytes),
    ...(prior === undefined ? {} : { prior: prior.attempt }),
  })
  yield* Ref.update(outcomes, (list) => [...list, outcome])
  if (outcome.kind !== "economy-grant") return yield* Effect.fail(new EconomyDispatchRefused(outcome))
  // Only the creator of a durable reservation may forward, and never a replayed grant (EA-13).
  if (!outcome.consumable) return yield* Effect.fail(new EconomyDispatchRefused(outcome))
  const attemptId = outcome.attempt
  yield* Ref.update(chain, (list) => [...list, { attempt: attemptId, terminal: false }])
  const forward = yield* recordForward(attemptId)
  if (forward.kind === "economy-hold" || forward.kind === "economy-refusal") {
    return yield* Effect.fail(new EconomyDispatchRefused(forward))
  }
  const response = yield* submit(request)
  const evidence = response.status >= 400
    ? terminalEvidence(response.status, yield* response.text)
    : {
        evidenceDigest: sha256(JSON.stringify({ status: response.status, url: endpointOf(request) })),
        evidence: JSON.stringify({ status: response.status }),
      }
  // Any consumed response is terminal evidence for this attempt (§1.5): the retry's named
  // predecessor lineage can exist; usage settlement is a separate step (§1.6).
  const terminal = yield* observeTerminal(attemptId, evidence)
  if (terminal.kind === "economy-hold" || terminal.kind === "economy-refusal") {
    return yield* Effect.fail(new EconomyDispatchRefused(terminal))
  }
  yield* Ref.update(chain, (list) => list.map((entry) => entry.attempt === attemptId ? { ...entry, terminal: true } : entry))
  return response
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
