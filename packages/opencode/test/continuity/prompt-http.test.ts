import { expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Exit, Layer } from "effect"
import { SessionContinuity } from "@/continuity/service"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Plugin } from "@/plugin"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { SessionSummary } from "@/session/summary"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { httpError, raw, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(LayerNode.compile(LayerNode.group([
  SessionPrompt.node, SessionContinuity.node, Session.node, SessionProjector.node,
  Database.node, EventV2Bridge.node, CrossSpawnSpawner.node, llmNode,
]), [
  [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
  [Plugin.node, Layer.mock(Plugin.Service, {
    init: () => Effect.void, list: () => Effect.succeed([]), trigger: (_name, _input, output) => Effect.succeed(output),
  })],
  [SessionSummary.node, Layer.mock(SessionSummary.Service, {
    summarize: () => Effect.void, diff: () => Effect.succeed([]), computeDiff: () => Effect.succeed([]),
  })],
]))
type Match = Parameters<TestLLMServer["Service"]["pushMatch"]>[0]
type Hit = Parameters<Match>[0]
function messages(body: Record<string, unknown>) {
  if (!Array.isArray(body.messages)) throw new Error("expected chat-completions messages")
  return body.messages.map((message) => {
    if (!message || typeof message !== "object" || !("role" in message) || !("content" in message)) {
      throw new Error("expected wire message role/content")
    }
    return { role: message.role, content: message.content }
  })
}
const maintenance: Match = (hit) => messages(hit.body).some((message) =>
  message.role === "system" && JSON.stringify(message.content).includes("Summarize prior conversation for continuity"),
)
const parent = (marker: string): Match => (hit) => !maintenance(hit) &&
  JSON.stringify(messages(hit.body).findLast((message) => message.role === "user")?.content)?.includes(marker) === true
function answer(text: string, input = 100, cached = 0, wait?: PromiseLike<unknown>) {
  return raw({ wait, tail: [
    { id: "chatcmpl-continuity", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] },
    { id: "chatcmpl-continuity", object: "chat.completion.chunk", choices: [{ delta: { content: text } }] },
    { id: "chatcmpl-continuity", object: "chat.completion.chunk", choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: input, completion_tokens: 0, prompt_tokens_details: { cached_tokens: cached } } },
  ] })
}

for (const cached of [0, 25_000]) it.instance(`next HTTP request uses fresh context and tail; cache=${cached}`, () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const continuity = yield* SessionContinuity.Service
  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "opencode.json"), JSON.stringify({
    ...testProviderConfig(llm.url), model: "test/test-model", small_model: "test/test-model",
    enabled_providers: ["test"], plugin: [], mcp: {}, compaction: { auto: false },
  })))
  const chat = yield* sessions.create({ title: "Pinned continuity HTTP test" })
  const head = "HEAD_ONLY_FACT_7E5D"
  const tail = "TAIL_KEEP_A129"
  const trigger = "TRIGGER_D492"
  const advance = "ADVANCE_WHILE_HELD_C723"
  const next = "NEXT_NEW_USER_E862"
  const stale = "STALE_SUMMARY_A_F491"
  const fresh = "FRESH_SUMMARY_B_93AD"
  const seed = Array.from({ length: 6 }, (_, index) => ({
    user: index === 0 ? head : index === 5 ? tail : `SEED_USER_${index}_D82A`,
    assistant: `SEED_REPLY_${index}_19BC`,
  }))
  const releaseA = yield* Deferred.make<void>()
  const releaseB = yield* Deferred.make<void>()
  const waitA = Effect.runPromise(Deferred.await(releaseA))
  const waitB = Effect.runPromise(Deferred.await(releaseB))
  yield* Effect.addFinalizer(() => Effect.all([
    Deferred.succeed(releaseA, void 0), Deferred.succeed(releaseB, void 0),
  ]).pipe(Effect.asVoid))
  const matched: Array<{ name: string; hit: Hit }> = []
  const unexpected: Hit[] = []
  const record = (name: string, match: Match): Match => (hit) => {
    if (!match(hit)) return false
    matched.push({ name, hit })
    return true
  }
  const control = (content: string, role: string): Hit => ({ url: new URL("/v1/chat/completions", llm.url), body: { messages: [{ role, content }] } })
  expect(maintenance(control("Summarize prior conversation for continuity", "system"))).toBe(true)
  expect(maintenance(control(trigger, "user"))).toBe(false)
  expect(parent(trigger)(control(trigger, "user"))).toBe(true)
  for (const turn of seed) yield* llm.pushMatch(record(turn.user, parent(turn.user)), answer(turn.assistant))
  yield* llm.pushMatch(record("trigger", parent(trigger)), answer("TRIGGER_DONE", 50_000, cached))
  yield* llm.pushMatch(record("A", (hit) => maintenance(hit) && !matched.some((item) => item.name === "A")), answer(stale, 100, 0, waitA))
  // Below-threshold completion still requests refresh of the now-stale snapshot.
  yield* llm.pushMatch(record("advance", parent(advance)), answer("PARENT_ADVANCED", 100))
  yield* llm.pushMatch(record("B", (hit) => maintenance(hit) && matched.some((item) => item.name === "A")), answer(fresh, 100, 0, waitB))
  yield* llm.pushMatch(record("next", parent(next)), answer("NEXT_DONE"))
  yield* llm.pushMatch((hit) => { unexpected.push(hit); return true }, httpError(400, { error: { message: "unexpected continuity HTTP request", type: "invalid_request_error" } }))
  const send = (text: string) => awaitWithTimeout(prompt.prompt({
    sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text }],
  }), `parent response did not complete: ${text}`, "30 seconds")
  for (const turn of seed) {
    const result = yield* send(turn.user)
    expect(result.parts.some((part) => part.type === "text" && part.text === turn.assistant)).toBe(true)
  }
  const fired = yield* send(trigger)
  if (fired.info.role !== "assistant") throw new Error("expected trigger assistant")
  expect(fired.info.error).toBeUndefined()
  expect(fired.info.tokens.input + fired.info.tokens.cache.read + fired.info.tokens.cache.write).toBe(50_000)
  yield* awaitWithTimeout(llm.wait(8), "maintenance A did not reach provider", "10 seconds")
  expect(matched.at(-1)?.name).toBe("A")
  expect(JSON.stringify(matched.at(-1)?.hit.body)).toContain(head)
  expect(JSON.stringify(matched.at(-1)?.hit.body)).not.toContain(tail)
  const advanced = yield* send(advance)
  expect(advanced.parts.some((part) => part.type === "text" && part.text === "PARENT_ADVANCED")).toBe(true)
  expect(yield* llm.calls).toBe(9)
  const rejected = yield* prompt.prompt({
    sessionID: chat.id, agent: "missing-continuity-test-agent", model, parts: [{ type: "text", text: "REJECTED_PROMPT" }],
  }).pipe(Effect.exit)
  expect(Exit.isFailure(rejected)).toBe(true)
  expect(yield* sessions.messages({ sessionID: chat.id })).toHaveLength(16)
  yield* Deferred.succeed(releaseA, void 0)
  yield* awaitWithTimeout(llm.wait(10), "replacement B did not start", "10 seconds")
  expect(matched.at(-1)?.name).toBe("B")
  const history = yield* sessions.messages({ sessionID: chat.id })
  const beforeB = yield* continuity.prepare({ sessionID: chat.id, messages: history })
  expect(beforeB.system).toEqual([])
  expect(beforeB.messages).toEqual(history)
  yield* Deferred.succeed(releaseB, void 0)
  const prepared = yield* pollWithTimeout(continuity.prepare({ sessionID: chat.id, messages: history }).pipe(
    Effect.map((value) => JSON.stringify(value.system).includes(fresh) ? value : undefined),
  ), "B never applied", "10 seconds")
  expect(prepared.messages.map((message) => message.info.id)).toEqual(history.slice(-8).map((message) => message.info.id))
  expect(JSON.stringify(prepared.system)).not.toContain(stale)
  const completed = yield* send(next)
  expect(completed.parts.some((part) => part.type === "text" && part.text === "NEXT_DONE")).toBe(true)
  const wire = matched.find((item) => item.name === "next")!.hit.body
  const wireMessages = messages(wire)
  const system = JSON.stringify(wireMessages.filter((message) => message.role === "system"))
  const conversation = JSON.stringify(wireMessages.filter((message) => message.role !== "system"))
  expect(system).toContain(fresh)
  expect(conversation).toContain(tail)
  expect(conversation).toContain(advance)
  expect(conversation).toContain(next)
  for (const message of prepared.messages) for (const part of message.parts) {
    if (part.type === "text" && part.text) expect(conversation).toContain(part.text)
  }
  for (const turn of seed.slice(0, 4)) {
    expect(conversation).not.toContain(turn.user)
    expect(conversation).not.toContain(turn.assistant)
  }
  expect(JSON.stringify(wire)).not.toContain(stale)
  expect(JSON.stringify(wire)).not.toContain(head)
  expect(conversation).not.toContain(fresh)
  expect(matched.map((item) => item.name)).toEqual([...seed.map((turn) => turn.user), "trigger", "A", "advance", "B", "next"])
  const hits = yield* llm.hits
  expect(hits).toHaveLength(11)
  expect(hits).toEqual(matched.map((item) => item.hit))
  expect(unexpected).toEqual([])
  expect(yield* llm.pending).toBe(1)
  const durable = yield* sessions.messages({ sessionID: chat.id })
  expect(durable).toHaveLength(18)
  expect(JSON.stringify(durable)).toContain(head)
  expect(JSON.stringify(durable)).not.toContain(stale)
  expect(JSON.stringify(durable)).not.toContain(fresh)
  expect(yield* sessions.children(chat.id)).toEqual([])
}), 120_000)
