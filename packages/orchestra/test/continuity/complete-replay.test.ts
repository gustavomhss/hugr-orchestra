import { expect } from "bun:test"
import { Effect, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { replay } from "../../script/continuity-bench/complete"
import { it } from "../lib/effect"
import { messages, model } from "./memory-fixture"
import { reviewing, retrying } from "./service-fixture"
import { validChecklist } from "@/continuity/checklist-seal"

// Scenario-authored output verifies the replay seam, not a real model's semantic retention.
const response = JSON.stringify({ now: { doing: "Verification remains open", next: "Verify the final observed receipt", src: ["a1"] }, ops: [] })

it.live("frozen logical replay uses one producer through production capture, decoder, structural checklist and coverage projection", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const calls = { producer: 0, review: 0 }
  const result = yield* replay({ messages: history, model, llm: { stream: (request) => {
    calls[reviewing(request) ? "review" : "producer"]++
    if (reviewing(request)) return Stream.fail(new Error("Unexpected continuity review request"))
    return Stream.make(LLMEvent.textDelta({ id: "memory", text: response }), LLMEvent.finish({ reason: "stop" }))
  } } })
  expect(calls).toEqual({ producer: 1, review: 0 })
  expect(result.requests).toHaveLength(1)
  expect(result.requests[0].agent.name).toBe("continuity")
  expect(result.requests[0].model).toEqual(model)
  expect(result.requests[0].parentSessionID).toBe(history[0].info.sessionID)
  expect(result.requests[0].tools).toEqual({})
  expect(result.requests[0].permission).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
  expect(result.artifact?.version).toBe(5)
  if (result.artifact?.version !== 5) throw new Error("Missing complete artifact")
  expect(result.artifact.review).toBeUndefined()
  expect(result.artifact.checklist).toEqual({ version: 1, critical: [], digest: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(validChecklist(result.artifact)).toBe(true)
  expect(validChecklist({ ...result.artifact, text: result.artifact.text + "corrupt" })).toBe(false)
  expect(result.coverage?.coveredThrough).toBe(history[1].info.id)
  expect(result.retainedNativeIDs).toEqual([history[0].info.id])
  expect(result.system[0]).toContain("Verify the final observed receipt")
  expect(result.representation).toContain("NOT exact historic provider wire")
}))

it.live("dry replay records the real request without an artifact; saved output reuses the closed production decoder", Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const dry = yield* replay({ messages: history, model })
  expect(dry.requests).toHaveLength(1)
  expect(dry.requests.filter(reviewing)).toEqual([])
  expect(dry.result).toEqual({ status: "dry-request-captured" })
  expect(dry.artifact).toBeUndefined()
  expect(dry.coverage).toBeUndefined()
  expect(dry.usage).toMatchObject({ providerCalls: 0, input: null, output: null, cached: null })
  const saved = yield* replay({ messages: history, model, response })
  expect(saved.requests).toHaveLength(1)
  expect(saved.requests.filter(reviewing)).toEqual([])
  expect(saved.artifact?.version).toBe(5)
  if (saved.artifact?.version !== 5) throw new Error("Missing saved complete artifact")
  expect(saved.artifact.review).toBeUndefined()
  expect(saved.artifact.checklist?.version).toBe(1)
  expect(validChecklist(saved.artifact)).toBe(true)
  expect(saved.retainedNativeIDs).toEqual([history[0].info.id])
  for (const malformed of ['{"ops":[]}', '{"now":{"doing":"","next":"Verify","src":["a1"]},"ops":[]}']) {
    const missing = yield* replay({ messages: history, model, response: malformed })
    expect(missing.result).toMatchObject({ check: "C15", failure: "invalid-schema", retried: true })
    expect(missing.requests).toHaveLength(2)
    expect(missing.requests.map((request) => request.agent.name)).toEqual(["continuity", "continuity"])
    expect(missing.requests.filter(reviewing)).toEqual([])
    expect(retrying(missing.requests[1])).toBe(true)
    expect(missing.artifact).toBeUndefined()
    expect(missing.coverage).toBeUndefined()
    expect(missing.system).toEqual([])
    expect(missing.retainedNativeIDs).toEqual(history.map((message) => message.info.id))
  }
}))

it.live("only a named failed check permits one corrected producer response in replay", Effect.gen(function* () {
  const calls = { producer: 0, review: 0 }
  const result = yield* replay({ messages: messages(["user", "assistant"]), model, llm: { stream: (request) => {
    calls[reviewing(request) ? "review" : "producer"]++
    if (reviewing(request)) return Stream.fail(new Error("Unexpected continuity review request"))
    return Stream.make(LLMEvent.textDelta({ id: "memory", text: retrying(request) ? response : '{"ops":[]}' }),
      LLMEvent.finish({ reason: "stop" }))
  } } })
  expect(calls).toEqual({ producer: 2, review: 0 })
  expect(result.requests).toHaveLength(2)
  expect(result.requests[1].messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining("HOST CHECK FAILED. C15:") })
  expect(result.result).toMatchObject({ retried: true })
  if (result.artifact?.version !== 5) throw new Error("Missing corrected complete artifact")
  expect(result.artifact.review).toBeUndefined()
  expect(result.artifact.checklist?.version).toBe(1)
  expect(validChecklist(result.artifact)).toBe(true)
}))
