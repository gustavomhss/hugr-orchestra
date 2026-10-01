import { expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Exit, Layer } from "effect"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
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
import { bodyFromRequest, readSourceCatalogue, selectSource, wireInput } from "./fixtures"

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(LayerNode.compile(LayerNode.group([
  SessionPrompt.node, SessionContinuity.node, Session.node, SessionProjector.node, BackgroundJob.node,
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
  message.role === "system" && JSON.stringify(message.content).includes("MAINTENANCE FORK"),
)
const parent = (marker: string): Match => (hit) => !maintenance(hit) &&
  JSON.stringify(messages(hit.body).findLast((message) => message.role === "user")?.content)?.includes(marker) === true
function chunks(text: string, input = 100, cached = 0) {
  return [
    { id: "chatcmpl-continuity", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] },
    { id: "chatcmpl-continuity", object: "chat.completion.chunk", choices: [{ delta: { content: text } }] },
    { id: "chatcmpl-continuity", object: "chat.completion.chunk", choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: input, completion_tokens: 0, prompt_tokens_details: { cached_tokens: cached } } },
  ]
}
function answer(text: string, input = 100, cached = 0, wait?: PromiseLike<unknown>) {
  return raw({ wait, tail: chunks(text, input, cached) })
}
function forkAnswer(literal: string, match: Match, wait: PromiseLike<unknown>) {
  const tail: unknown[] = []
  return {
    match: (hit: Hit) => {
      if (!match(hit)) return false
      const data = wireInput(hit.body)
      const catalogue = readSourceCatalogue(data)
      expect(selectSource(catalogue.units, literal).role).toBe("user")
      expect(hit.body.tools ?? []).toEqual([])
      expect(hit.body.tool_choice ?? "none").toBe("none")
      const system = JSON.stringify(messages(hit.body).filter((message) => message.role === "system"))
      expect(system).toContain("MAINTENANCE FORK")
      expect(system).toContain("Do not")
      tail.push(...chunks(JSON.stringify(bodyFromRequest(data, literal))))
      return true
    },
    response: raw({ wait, tail }),
  }
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
  const stale = "SEED_USER_1_D82A"
  const fresh = head
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
  expect(maintenance(control("isolated Context Continuity MAINTENANCE FORK", "system"))).toBe(true)
  expect(maintenance(control(trigger, "user"))).toBe(false)
  expect(parent(trigger)(control(trigger, "user"))).toBe(true)
  for (const turn of seed) yield* llm.pushMatch(record(turn.user, parent(turn.user)), answer(turn.assistant))
  yield* llm.pushMatch(record("trigger", parent(trigger)), answer("TRIGGER_DONE", 50_000, cached))
  const a = forkAnswer(stale, record("A", (hit) => maintenance(hit) && !matched.some((item) => item.name === "A")), waitA)
  yield* llm.pushMatch(a.match, a.response)
  // Below-threshold completion still requests refresh of the now-stale snapshot.
  yield* llm.pushMatch(record("advance", parent(advance)), answer("PARENT_ADVANCED", 100))
  const b = forkAnswer(fresh, record("B", (hit) => maintenance(hit) && matched.some((item) => item.name === "A")), waitB)
  yield* llm.pushMatch(b.match, b.response)
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
  const aCatalogue = readSourceCatalogue(wireInput(matched.at(-1)!.hit.body))
  expect(aCatalogue.parentID).toBe(chat.id)
  expect(aCatalogue.previous).toBeNull()
  const snapshotHistory = yield* sessions.messages({ sessionID: chat.id })
  expect([...new Set(aCatalogue.units.map((unit) => unit.locator.messageID))]).toEqual(snapshotHistory.slice(0, -8).map((message) => message.info.id))
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
  expect(system).toContain(head)
  expect(conversation).not.toContain(head)
  expect(conversation).not.toContain("continuity_handoff")
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
  expect(JSON.stringify(durable)).not.toContain("continuity_handoff")
  expect(yield* sessions.children(chat.id)).toEqual([])
}), 120_000)

for (const invalid of ['{"status":"ready"}', "I resumed work and implemented the requested changes."]) {
  it.instance(`invalid HTTP maintenance never becomes memory: ${invalid}`, () => Effect.gen(function* () {
    const llm = yield* TestLLMServer
    const instance = yield* TestInstance
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    yield* Effect.promise(() => Bun.write(path.join(instance.directory, "opencode.json"), JSON.stringify({
      ...testProviderConfig(llm.url), model: "test/test-model", small_model: "test/test-model",
      enabled_providers: ["test"], plugin: [], mcp: {}, compaction: { auto: false },
    })))
    const chat = yield* sessions.create({ title: "Closed artifact HTTP validation" })
    const literal = "Keep project ID EXACT-913C; local read-only scope only."
    const ledger: Array<{ name: string; hit: Hit }> = []
    const record = (name: string, match: Match): Match => (hit) => {
      if (!match(hit)) return false
      ledger.push({ name, hit })
      return true
    }
    const seed = Array.from({ length: 6 }, (_, index) => index === 0 ? literal : `CLOSED_SEED_${index}`)
    for (const text of seed) yield* llm.pushMatch(record(text, parent(text)), answer(`REPLY_${text}`, text === seed[5] ? 50_000 : 100))
    const valid = forkAnswer(literal, record("valid", maintenance), Promise.resolve())
    yield* llm.pushMatch(valid.match, valid.response)
    yield* llm.pushMatch(record("refresh", parent("REFRESH_CLOSED")), answer("REFRESH_DONE", 50_000))
    yield* llm.pushMatch(record("invalid", maintenance), answer(invalid))
    yield* llm.pushMatch(record("next", parent("AFTER_INVALID")), answer("NEXT_VALID"))
    const unexpected: Hit[] = []
    yield* llm.pushMatch((hit) => { unexpected.push(hit); return true }, httpError(400, { error: { message: "unarmed request" } }))
    const send = (text: string) => awaitWithTimeout(prompt.prompt({
      sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text }],
    }), "closed-artifact parent did not finish", "30 seconds")
    for (const text of seed) yield* send(text)
    yield* pollWithTimeout(Effect.gen(function* () {
      const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }) })
      return prepared.system[0]?.includes(literal) ? prepared : undefined
    }), "valid HTTP artifact never applied", "10 seconds")
    const refresh = yield* send("REFRESH_CLOSED")
    yield* awaitWithTimeout(llm.wait(9), "invalid HTTP maintenance did not enter", "10 seconds")
    const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) =>
      job.metadata?.sessionId === chat.id && job.id.includes(`:${refresh.info.id}:`),
    ))), "invalid maintenance job not registered", "10 seconds")
    const terminal = yield* jobs.wait({ id: job.id, timeout: 10_000 })
    expect(terminal.timedOut).toBe(false)
    expect(terminal.info?.status).toBe("completed")
    expect(terminal.info?.output).toBe("discarded")
    const history = yield* sessions.messages({ sessionID: chat.id })
    const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: history })
    expect(prepared.system).toHaveLength(1)
    expect(prepared.system[0]).toContain(literal)
    expect(prepared.system[0]).not.toContain(invalid)
    expect(prepared.messages.map((message) => message.info.id)).toEqual(history.slice(4).map((message) => message.info.id))
    yield* send("AFTER_INVALID")
    const next = ledger.find((item) => item.name === "next")
    if (!next) throw new Error("missing next provider capture")
    const wire = messages(next.hit.body)
    expect(JSON.stringify(wire.filter((message) => message.role === "system"))).toContain(literal)
    expect(JSON.stringify(wire)).not.toContain(invalid)
    expect(JSON.stringify(wire.filter((message) => message.role !== "system"))).not.toContain(literal)
    expect(JSON.stringify(wire)).toContain("REFRESH_CLOSED")
    expect(ledger.map((item) => item.name)).toEqual([...seed, "valid", "refresh", "invalid", "next"])
    expect(unexpected).toEqual([])
    expect(JSON.stringify(yield* sessions.messages({ sessionID: chat.id }))).not.toContain("continuity_handoff")
    expect(yield* sessions.children(chat.id)).toEqual([])
  }), 120_000)
}
