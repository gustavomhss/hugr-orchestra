import { expect } from "bun:test"
import { Effect, Stream } from "effect"
import { SessionContinuity } from "@/continuity/service"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ProviderTest } from "../fake/provider"
import { it } from "../lib/effect"
import { FIRST, SECOND, applyFirst, begin, complete, environment, held, prepare, seed } from "./service-fixture"

it.instance("releasing or forgetting a configured backend restores default transport; release preserves memory", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  const second = yield* held(SECOND)
  let externalCalls = 0
  yield* Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    const model = ProviderTest.model({ id: ModelV2.ID.make("claude-haiku-4-5-20251001"), providerID: ProviderV2.ID.make("anthropic"),
      limit: { context: 20_000, output: 2_000 } })
    const llm = { stream: () => { externalCalls++; return Stream.fail(new Error("External backend must have been released")) } }
    yield* continuity.configure({ sessionID, model, llm })
    yield* continuity.pause(sessionID)
    expect((yield* prepare(sessionID)).system).toEqual([])
    yield* continuity.release(sessionID)
    expect((yield* prepare(sessionID)).system[0]).toContain(FIRST)
    yield* continuity.configure({ sessionID, model, llm })
    yield* continuity.forget(sessionID)
    yield* complete(yield* begin(sessionID, "default backend after forget"), "default reply", 50_000)
    yield* applyFirst(sessionID, second)
    expect(externalCalls).toBe(0)
  }).pipe(Effect.provide(environment([first, second])))
}), 120_000)
