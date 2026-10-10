import { expect } from "bun:test"
import { Effect, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { replay } from "../../script/continuity-bench/complete"
import { it } from "../lib/effect"
import { messages, model } from "./memory-fixture"

// Scenario-authored output verifies the replay seam, not a real model's semantic retention.
const response = JSON.stringify({ now: { doing: "Verification remains open", next: "Verify the final observed receipt", src: ["a1"] }, ops: [] })
const reviewResponse = JSON.stringify({ verdict: "accept", cursor: { supported: true, state: "active", next: "verify",
  reason: "Scenario-authored replay fixture; not a semantic quality claim.", src: ["a1"] }, critical: [], resolved: [], issues: [] })

it.live("frozen logical replay uses injected transport through production capture, C15 decoder and zero-covered-record projection", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const result = yield* replay({ messages: history, model, llm: { stream: (request) => Stream.make(
    LLMEvent.textDelta({ id: "memory", text: request.agent.name === "continuity-review" ? reviewResponse : response }),
    LLMEvent.finish({ reason: "stop" })) } })
  expect(result.requests).toHaveLength(2)
  expect(result.requests.map((request) => request.agent.name)).toEqual(["continuity", "continuity-review"])
  expect(result.requests[1].model).toEqual(result.requests[0].model)
  expect(result.requests[1].parentSessionID).toBe(history[0].info.sessionID)
  expect(result.requests[1].tools).toEqual({})
  expect(result.artifact?.version).toBe(5)
  expect(result.artifact?.version === 5 && result.artifact.review).toMatchObject({ version: 1, state: "active", next: "verify" })
  expect(result.coverage?.coveredThrough).toBe(history[1].info.id)
  expect(result.retainedNativeIDs).toEqual([history[0].info.id])
  expect(result.system[0]).toContain("Verify the final observed receipt")
  expect(result.representation).toContain("NOT exact historic provider wire")
}))

it.live("dry replay records the real request without an artifact; saved output reuses the closed production decoder", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const dry = yield* replay({ messages: history, model })
  expect(dry.requests).toHaveLength(1)
  expect(dry.result).toEqual({ status: "dry-request-captured" })
  expect(dry.artifact).toBeUndefined()
  expect(dry.coverage).toBeUndefined()
  expect(dry.usage).toMatchObject({ providerCalls: 0, input: null, output: null, cached: null })
  const unchecked = yield* replay({ messages: history, model, response })
  expect(unchecked.requests).toHaveLength(2)
  expect(unchecked.requests[1].agent.name).toBe("continuity-review")
  expect(unchecked.result).toMatchObject({ failure: "provider" })
  expect(unchecked.artifact).toBeUndefined()
  expect(unchecked.coverage).toBeUndefined()
  expect(unchecked.system).toEqual([])
  expect(unchecked.retainedNativeIDs).toEqual(history.map((message) => message.info.id))
  const saved = yield* replay({ messages: history, model, response, reviewResponse })
  expect(saved.requests).toHaveLength(2)
  expect(saved.artifact?.version).toBe(5)
  expect(saved.retainedNativeIDs).toEqual([history[0].info.id])
  const missing = yield* replay({ messages: history, model, response: '{"ops":[]}', reviewResponse })
  expect(missing.result).toMatchObject({ check: "C15" })
  expect(missing.requests.every((request) => request.agent.name === "continuity")).toBe(true)
  expect(missing.artifact).toBeUndefined()
  expect(missing.retainedNativeIDs).toEqual(history.map((message) => message.info.id))
}))
