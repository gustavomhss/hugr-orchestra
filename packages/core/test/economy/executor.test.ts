// G1 / F2 — executor guard oracle (EA-05..EA-07, EA-28).
// Contract: modules/atlas/docs/design/genesis-g1-contract.md §3.1.
// Every test runs the real chain: LLMClient (openai-chat protocol) → RequestExecutor.layer →
// makeAdmissionGuard → synthetic HttpClient, over a real fixture database. No reimplemented
// economy anywhere in the oracle path.

import { describe, expect, test } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { LLM, LLMClient } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { RequestExecutor } from "@orchestra/llm/route"
import { Database } from "../../src/database/database"
import { seedEnvelope, type EconomyEnvelope } from "../../src/economy/admission"
import { makeAdmissionGuard, type AttemptContext } from "../../src/economy/executor"

const hitsOf = (hits: Ref.Ref<number>) => Effect.runSync(Ref.get(hits))

const synthetic = (responses: ReadonlyArray<Response>) => {
  const hits = Effect.runSync(Ref.make(0))
  const cursor = Effect.runSync(Ref.make(0))
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        yield* Ref.update(hits, (n) => n + 1)
        const index = yield* Ref.getAndUpdate(cursor, (n) => n + 1)
        const response = responses[Math.min(index, responses.length - 1)]!
        return HttpClientResponse.fromWeb(request, response)
      }),
    ),
  )
  return { layer, hits }
}

const SUCCESS = (): Response =>
  new Response(
    [
      `data: ${JSON.stringify({
        id: "chatcmpl_fixture",
        choices: [{ delta: { role: "assistant", content: "Hi" }, finish_reason: null }],
        usage: null,
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "chatcmpl_fixture",
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: null,
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "chatcmpl_fixture",
        choices: [],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  )

const envelope = (limits: EconomyEnvelope["limits"], authorityId = "auth-1"): EconomyEnvelope => ({
  envelopeId: "env-1",
  authorityId,
  scope: "core",
  provider: "fixture",
  model: "responses",
  route: "http",
  stages: ["prod"],
  limits,
  retryPolicy: { maxRetries: 0, statuses: [] },
})

const chain = (
  env: EconomyEnvelope,
  input: { logicalRequestId?: string; route?: string; key?: string },
  responses: ReadonlyArray<Response>,
): { guard: AttemptContext; hits: Ref.Ref<number>; app: Layer.Layer<unknown> } => {
  const { layer, hits } = synthetic(responses)
  const database = Database.layerFromPath(":memory:")
  const guard = makeAdmissionGuard({
    envelope: env,
    logical: {
      logicalRequestId: input.logicalRequestId ?? "req-1",
      stage: "prod",
      snapshot: `${input.key ?? "sha-1"}-snapshot`,
    },
    key: input.key ?? "k-chain",
    route: input.route ?? "http",
    protocol: "responses",
  })
  // The guard's layer builder captures Database.Service at build; give it the same fixture
  // database branch-merge, shared across the guard and the app wiring (one layer object →
  // one layer build → one in-memory database).
  const guarded = Layer.provide(guard.layer, Layer.mergeAll(layer, database))
  const executor = RequestExecutor.layer.pipe(Layer.provide(guarded))
  const app = Layer.mergeAll(
    executor,
    LLMClient.layer.pipe(Layer.provide(executor)),
    database,
  ) as Layer.Layer<unknown>
  return { guard, hits, app }
}

const model = () =>
  OpenAIChat.route.with({ endpoint: { baseURL: "https://api.openai.test/v1" } }).model({ id: "gpt-4o-mini" })

const transportMessage = (error: { readonly reason: unknown }): string =>
  (error.reason as { message?: string } | undefined)?.message ?? ""

describe("G1 executor guard", () => {
  test("EA-05 final-native-bound-required: absent native bound fails closed before any open", async () => {
    const env = envelope({ attempts: 5, outputTokens: 100, inFlight: 5 })
    const { hits, app } = chain(env, { key: "k-bound" }, [SUCCESS()])
    const failing = await Effect.runPromise(Effect.gen(function* () {
      yield* seedEnvelope(env)
      return yield* LLMClient.generate(LLM.request({ model: model(), prompt: "Say hello." })).pipe(Effect.flip)
    }).pipe(Effect.provide(app)))
    expect(hitsOf(hits)).toBe(0)
    expect(failing).toMatchObject({ module: "RequestExecutor", retryable: false })
    expect(transportMessage(failing)).toContain("economy-dispatch-refused")
    expect(transportMessage(failing)).toContain("bound")
  })

  test("EA-05 final-native-bound-valid: a native bound sealed from final bytes reaches reserve", async () => {
    const env = envelope({ attempts: 5, outputTokens: 100, inFlight: 5 })
    const { guard, hits, app } = chain(env, { key: "k-ok" }, [SUCCESS()])
    const observed = await Effect.runPromise(Effect.gen(function* () {
      yield* seedEnvelope(env)
      yield* LLMClient.generate(
        LLM.request({ model: model(), prompt: "Say hello.", generation: { maxTokens: 7 } }),
      )
      return { outcomes: yield* guard.outcomes, attempts: yield* guard.attempts }
    }).pipe(Effect.provide(app)))
    expect(hitsOf(hits)).toBe(1)
    expect(observed.outcomes).toHaveLength(1)
    expect(observed.outcomes[0]).toMatchObject({ kind: "economy-grant", consumable: true })
    expect(observed.attempts).toHaveLength(1)
    expect(observed.attempts[0]).toMatchObject({ logicalRequestId: "req-1", ordinal: 1 })
  })

  test("EA-06 sealed-request-identity-cannot-drift: same key with changed identity refuses; no second forward", async () => {
    const env = envelope({ attempts: 5, outputTokens: 100, inFlight: 5 })
    const { guard, hits, app } = chain(env, { key: "k-drift" }, [SUCCESS()])
    const observed = await Effect.runPromise(Effect.gen(function* () {
      yield* seedEnvelope(env)
      yield* LLMClient.generate(
        LLM.request({ model: model(), prompt: "Say hello.", generation: { maxTokens: 5 } }),
      )
      const failing = yield* LLMClient.generate(
        LLM.request({ model: model(), prompt: "Say hello.", generation: { maxTokens: 9 } }),
      ).pipe(Effect.flip)
      return { failing, outcomes: yield* guard.outcomes }
    }).pipe(Effect.provide(app)))
    expect(hitsOf(hits)).toBe(1)
    expect(transportMessage(observed.failing)).toContain("economy-dispatch-refused")
    expect(transportMessage(observed.failing)).toContain("conflict")
    expect(observed.outcomes.map((entry) => entry.kind)).toEqual(["economy-grant", "economy-refusal"])
    expect((observed.outcomes[1] as { reason?: string }).reason).toBe("conflict")
  })

  test("EA-07 incapable-route-or-guarantee-refuses: instrumented http only reaches the transport", async () => {
    const env = envelope({ attempts: 5, outputTokens: 100, inFlight: 5 })
    const { guard, hits, app } = chain(env, { key: "k-websocket", route: "websocket" }, [SUCCESS()])
    const observed = await Effect.runPromise(Effect.gen(function* () {
      yield* seedEnvelope(env)
      const failing = yield* LLMClient.generate(
        LLM.request({ model: model(), prompt: "Say hello.", generation: { maxTokens: 3 } }),
      ).pipe(Effect.flip)
      return { failing, outcomes: yield* guard.outcomes }
    }).pipe(Effect.provide(app)))
    expect(hitsOf(hits)).toBe(0)
    expect(transportMessage(observed.failing)).toContain("economy-dispatch-refused")
    expect(transportMessage(observed.failing)).toContain("route")
    expect(observed.outcomes).toMatchObject([{ kind: "economy-refusal", reason: "route" }])
  })

  test("EA-28 admission-refusal-remains-typed: an identified refusal, never a valid response", async () => {
    const env = envelope({ attempts: 0, inFlight: 0 })
    const { guard, hits, app } = chain(env, { key: "k-overflow" }, [SUCCESS()])
    const observed = await Effect.runPromise(Effect.gen(function* () {
      yield* seedEnvelope(env)
      const failing = yield* LLMClient.generate(
        LLM.request({ model: model(), prompt: "Say hello.", generation: { maxTokens: 2 } }),
      ).pipe(Effect.flip)
      return { failing, outcomes: yield* guard.outcomes }
    }).pipe(Effect.provide(app)))
    expect(hitsOf(hits)).toBe(0)
    expect(observed.failing).toMatchObject({ module: "RequestExecutor", retryable: false })
    expect(transportMessage(observed.failing)).toContain("economy-dispatch-refused")
    expect(transportMessage(observed.failing)).toContain("capacity")
    expect(observed.outcomes).toMatchObject([{ kind: "economy-refusal", reason: "capacity" }])
  })
})
