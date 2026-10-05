import { expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Exit, Layer } from "effect"
import { Archive } from "@/continuity/archive"
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
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { httpError, raw, reply, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { FIRST, NONCE, body, fragments, jobFor, packet, wireMessages } from "./service-fixture"

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  SessionPrompt.node, SessionContinuity.node, Session.node, SessionProjector.node, BackgroundJob.node,
  Database.node, EventV2Bridge.node, CrossSpawnSpawner.node, Archive.node, llmNode,
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
const maintenance: Match = (hit) => wireMessages(hit.body).some((message) =>
  message.role === "system" && message.content.includes("CONTEXT CONTINUITY PRODUCER PROTOCOL v2"))
const parent = (marker: string): Match => (hit) => !maintenance(hit) &&
  wireMessages(hit.body).findLast((message) => message.role === "user")?.content.includes(marker) === true

function configure(url: string, directory: string, options: { toolcall?: boolean; permission?: unknown } = {}) {
  const config = testProviderConfig(url)
  config.provider.test.models["test-model"].tool_call = options.toolcall ?? true
  return Effect.promise(() => Bun.write(path.join(directory, "opencode.json"), JSON.stringify({
    ...config, model: "test/test-model", small_model: "test/test-model", enabled_providers: ["test"],
    plugin: [], mcp: {}, compaction: { auto: false },
    agent: { build: { permission: { context_recall: options.permission ?? "allow" } } },
  })))
}
function chunks(text: string, input = 100, cached = 0) {
  return [
    { id: "chatcmpl-memory", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] },
    { id: "chatcmpl-memory", object: "chat.completion.chunk", choices: [{ delta: { content: text } }] },
    { id: "chatcmpl-memory", object: "chat.completion.chunk", choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: input, completion_tokens: 0, prompt_tokens_details: { cached_tokens: cached } } },
  ]
}
const answer = (text: string, input = 100, cached = 0) => raw({ tail: chunks(text, input, cached) })
function forkAnswer(memory: string, match: Match, reference?: string, wait?: PromiseLike<unknown>) {
  const tail: unknown[] = []
  return { match: (hit: Hit) => {
    if (!match(hit)) return false
    expect(hit.body.tools ?? []).toEqual([])
    expect(hit.body.tool_choice ?? "none").toBe("none")
    const value = body(hit.body, memory, reference)
    expect(fragments(packet(hit.body)).every((entry) => /^[a-f0-9]{64}$/.test(entry.id))).toBe(true)
    tail.push(...chunks(JSON.stringify(value)))
    return true
  }, response: raw({ wait, tail }) }
}
function ledger() {
  const hits: { name: string; hit: Hit }[] = []
  return { hits, record: (name: string, match: Match): Match => (hit) => {
    if (!match(hit)) return false
    hits.push({ name, hit })
    return true
  } }
}
function hasRecall(hit: Hit) {
  const tools: unknown[] = Array.isArray(hit.body.tools) ? hit.body.tools : []
  return tools.some((value) => typeof value === "object" && value !== null && "function" in value &&
    typeof value.function === "object" && value.function !== null && "name" in value.function && value.function.name === "context_recall")
}
const gate = Effect.gen(function* () {
  const release = yield* Deferred.make<void>()
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  return { release, wait: Effect.runPromise(Deferred.await(release)) }
})

for (const cached of [0, 25_000]) it.instance(`held HTTP maintenance does not block parent; stale result loses; next turn recovers archived nonce; cache=${cached}`, () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const continuity = yield* SessionContinuity.Service
  yield* configure(llm.url, instance.directory)
  const chat = yield* sessions.create({ title: "HTTP working memory and recall" })
  const head = `HEAD_ONLY_FACT_7E5D: ${FIRST}\nRecorded nonce=${NONCE}`
  const tail = "TAIL_KEEP_A129"
  const seed = Array.from({ length: 6 }, (_, index) => ({ user: index === 0 ? head : index === 5 ? tail : `SEED_USER_${index}`, assistant: `SEED_REPLY_${index}` }))
  const a = yield* gate
  const b = yield* gate
  const capture = ledger()
  const control = (content: string, role: string): Hit => ({ url: new URL("/v1/chat/completions", llm.url), body: { messages: [{ role, content }] } })
  expect(maintenance(control("CONTEXT CONTINUITY PRODUCER PROTOCOL v2", "system"))).toBe(true)
  expect(maintenance(control("TRIGGER", "user"))).toBe(false)
  expect(parent("TRIGGER")(control("TRIGGER", "user"))).toBe(true)
  for (const turn of seed) yield* llm.pushMatch(capture.record(turn.user, parent(turn.user)), answer(turn.assistant))
  yield* llm.pushMatch(capture.record("trigger", parent("TRIGGER")), answer("TRIGGER_DONE", 50_000, cached))
  const stale = forkAnswer("# Work\nSTALE_HTTP_MEMORY", capture.record("A", maintenance), NONCE, a.wait)
  yield* llm.pushMatch(stale.match, stale.response)
  yield* llm.pushMatch(capture.record("advance", parent("ADVANCE_WHILE_HELD")), answer("PARENT_ADVANCED", 100))
  const fresh = forkAnswer(FIRST, capture.record("B", maintenance), NONCE, b.wait)
  yield* llm.pushMatch(fresh.match, fresh.response)
  const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
    parts: [{ type: "text", text }] }), `Parent did not complete: ${text}`, "30 seconds")
  for (const turn of seed) expect((yield* send(turn.user)).parts.some((part) => part.type === "text" && part.text === turn.assistant)).toBe(true)
  const triggered = yield* send("TRIGGER")
  if (triggered.info.role !== "assistant") throw new Error("Expected trigger assistant")
  expect(triggered.info.tokens.input + triggered.info.tokens.cache.read + triggered.info.tokens.cache.write).toBe(50_000)
  yield* awaitWithTimeout(llm.wait(8), "Maintenance A never reached HTTP", "10 seconds")
  expect(packet(capture.hits.at(-1)!.hit.body)).toContain(head)
  expect(packet(capture.hits.at(-1)!.hit.body)).not.toContain(tail)
  expect((yield* send("ADVANCE_WHILE_HELD")).parts.some((part) => part.type === "text" && part.text === "PARENT_ADVANCED")).toBe(true)
  expect(yield* Deferred.isDone(a.release)).toBe(false)
  const rejected = yield* prompt.prompt({ sessionID: chat.id, agent: "missing-continuity-test-agent", model,
    parts: [{ type: "text", text: "REJECTED_PROMPT" }] }).pipe(Effect.exit)
  expect(Exit.isFailure(rejected)).toBe(true)
  yield* Deferred.succeed(a.release, undefined)
  yield* awaitWithTimeout(llm.wait(10), "Replacement B never reached HTTP", "10 seconds")
  const history = yield* sessions.messages({ sessionID: chat.id })
  expect(yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })).toEqual({ messages: history, system: [] })
  yield* Deferred.succeed(b.release, undefined)
  const prepared = yield* pollWithTimeout(continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true }).pipe(
    Effect.map((value) => value.system[0]?.includes(FIRST) ? value : undefined)), "B never applied", "10 seconds")
  expect(prepared.messages).toEqual(history.slice(-8))
  expect(prepared.system[0]).not.toContain("STALE_HTTP_MEMORY")
  expect(prepared.system[0]).not.toContain(NONCE)
  expect(prepared.system[0]).not.toMatch(/continuity_handoff|"exact":|"provenance":|"reference_only":/)
  const providerB = capture.hits.find((entry) => entry.name === "B")!
  const reference = fragments(packet(providerB.hit.body)).find((entry) => entry.text.includes(NONCE))!.id
  expect(prepared.system[0]).toContain(reference)
  yield* llm.pushMatch(capture.record("next", parent("RECOVER_NONCE")), reply().tool("context_recall", { reference }))
  yield* llm.pushMatch(capture.record("recovered", (hit) => !maintenance(hit) && wireMessages(hit.body).some((entry) =>
    entry.role === "tool" && entry.content.includes(NONCE))), answer(`Continue read-only verification with ${NONCE}; deployment still awaits approval.`))
  yield* llm.pushMatch(() => true, httpError(400, { error: { message: "Unarmed HTTP request" } }))
  const continued = yield* send("RECOVER_NONCE")
  expect(continued.parts.some((part) => part.type === "text" && part.text.includes(NONCE))).toBe(true)
  const next = capture.hits.find((entry) => entry.name === "next")!.hit
  const wire = wireMessages(next.body)
  expect(hasRecall(next)).toBe(true)
  expect(wire.filter((entry) => entry.role === "system").map((entry) => entry.content).join("\n")).toContain(FIRST)
  const conversation = wire.filter((entry) => entry.role !== "system").map((entry) => entry.content).join("\n")
  expect(conversation).not.toContain(head)
  expect(conversation).not.toContain(NONCE)
  for (const message of prepared.messages) for (const part of message.parts)
    if (part.type === "text") expect(conversation).toContain(part.text)
  const durable = yield* sessions.messages({ sessionID: chat.id })
  const recovered = durable.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "context_recall")
  if (!recovered || recovered.type !== "tool" || recovered.state.status !== "completed") throw new Error("Real context_recall did not complete")
  expect(recovered.state.input).toEqual({ reference })
  expect(recovered.state.output).toContain(NONCE)
  expect(durable.slice(0, history.length)).toEqual(history)
  expect(capture.hits.map((entry) => entry.name)).toEqual([...seed.map((turn) => turn.user), "trigger", "A", "advance", "B", "next", "recovered"])
  expect(yield* llm.hits).toEqual(capture.hits.map((entry) => entry.hit))
  expect(yield* sessions.children(chat.id)).toEqual([])
}), 120_000)

for (const invalid of ['{"memory":"missing references"}', "I resumed work and implemented the changes."]) {
  it.instance(`invalid HTTP maintenance preserves prior Markdown: ${invalid}`, () => Effect.gen(function* () {
    const llm = yield* TestLLMServer
    const instance = yield* TestInstance
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    yield* configure(llm.url, instance.directory)
    const chat = yield* sessions.create({ title: "Closed working-memory HTTP validation" })
    const capture = ledger()
    const seed = Array.from({ length: 6 }, (_, index) => `CLOSED_SEED_${index}`)
    for (const text of seed) yield* llm.pushMatch(parent(text), answer(`REPLY_${text}`, text === seed[5] ? 50_000 : 100))
    const valid = forkAnswer(FIRST, maintenance)
    yield* llm.pushMatch(valid.match, valid.response)
    yield* llm.pushMatch(parent("REFRESH_CLOSED"), answer("REFRESH_DONE", 50_000))
    yield* llm.pushMatch(maintenance, answer(invalid))
    yield* llm.pushMatch(capture.record("next", parent("AFTER_INVALID")), answer("NEXT_VALID"))
    const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
      parts: [{ type: "text", text }] }), "Parent HTTP request stalled", "30 seconds")
    for (const text of seed) yield* send(text)
    const before = yield* pollWithTimeout(Effect.gen(function* () {
      const value = yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })
      return value.system[0]?.includes(FIRST) ? value : undefined
    }), "Valid HTTP memory never applied", "10 seconds")
    const refresh = yield* send("REFRESH_CLOSED")
    const job = yield* jobFor(chat.id, refresh.info.id)
    const result = yield* jobs.wait({ id: job.id, timeout: 10_000 })
    expect(result.timedOut).toBe(false)
    expect(result.info?.output).toBe("discarded")
    const history = yield* sessions.messages({ sessionID: chat.id })
    const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })
    expect(prepared.system).toEqual(before.system)
    expect(prepared.messages).toEqual(history.slice(4))
    yield* send("AFTER_INVALID")
    const wire = wireMessages(capture.hits[0].hit.body)
    expect(wire.filter((entry) => entry.role === "system").map((entry) => entry.content).join("\n")).toContain(FIRST)
    expect(JSON.stringify(wire)).not.toContain(invalid)
    expect(JSON.stringify(wire)).toContain("REFRESH_CLOSED")
  }), 120_000)
}

for (const condition of ["allowed", "session-deny", "agent-deny", "user-false", "no-toolcall", "revoked", "session-pattern-deny", "agent-pattern-deny", "pattern-revoked"] as const) {
  it.instance(`encoded HTTP tool capability controls memory application: ${condition}`, () => Effect.gen(function* () {
    const llm = yield* TestLLMServer
    const instance = yield* TestInstance
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    const allowed = condition === "allowed" || condition === "revoked" || condition === "pattern-revoked"
    yield* configure(llm.url, instance.directory, { toolcall: condition !== "no-toolcall", permission:
      condition === "agent-deny" ? "deny" : condition === "agent-pattern-deny" ? { "*": "allow", "ses_*": "deny" } : "allow" })
    const chat = yield* sessions.create({ title: `Working-memory capability ${condition}`,
      permission: condition === "session-deny" ? [{ permission: "context_recall", pattern: "*", action: "deny" }] : [] })
    if (condition === "session-pattern-deny") yield* sessions.setPermission({ sessionID: chat.id,
      permission: [{ permission: "context_recall", pattern: chat.id, action: "deny" }] })
    const capture = ledger()
    const seed = Array.from({ length: 6 }, (_, index) => `CAPABILITY_SEED_${index}`)
    for (const text of seed) yield* llm.pushMatch(capture.record(text, parent(text)), answer(`REPLY_${text}`, text === seed[5] ? 50_000 : 100))
    const response = forkAnswer(FIRST, capture.record("memory", maintenance), seed[0])
    yield* llm.pushMatch(response.match, response.response)
    yield* llm.pushMatch(capture.record("next", parent("CAPABILITY_NEXT")), answer("NEXT_DONE"))
    yield* llm.pushMatch(() => true, httpError(400, { error: { message: "Unexpected capability request" } }))
    const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
      parts: [{ type: "text", text }], tools: condition === "user-false" ? { context_recall: false } : undefined }), "Capability HTTP request stalled", "30 seconds")
    for (const text of seed) {
      const result = yield* send(text)
      if (result.info.role !== "assistant") throw new Error("Expected assistant")
      expect(result.info.error).toBeUndefined()
    }
    const history = yield* sessions.messages({ sessionID: chat.id })
    if (allowed) {
      const job = yield* jobFor(chat.id, history.at(-1)!.info.id)
      const done = yield* jobs.wait({ id: job.id, timeout: 10_000 })
      expect(done.timedOut).toBe(false)
      expect(done.info?.output).toBe("applied")
    }
    expect(yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: false })).toEqual({ messages: history, system: [] })
    const saved = yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })
    expect(saved.messages).toEqual(allowed ? history.slice(4) : history)
    expect(saved.system.length > 0).toBe(allowed)
    if (condition === "revoked" || condition === "pattern-revoked") yield* sessions.setPermission({ sessionID: chat.id,
      permission: [{ permission: "context_recall", pattern: condition === "pattern-revoked" ? chat.id : "*", action: "deny" }] })
    const next = yield* send("CAPABILITY_NEXT")
    expect(next.parts.some((part) => part.type === "text" && part.text === "NEXT_DONE")).toBe(true)
    const hit = capture.hits.find((entry) => entry.name === "next")!.hit
    const wire = wireMessages(hit.body)
    const system = wire.filter((entry) => entry.role === "system").map((entry) => entry.content).join("\n")
    const conversation = wire.filter((entry) => entry.role !== "system").map((entry) => entry.content).join("\n")
    for (const message of condition === "allowed" ? history.slice(4) : history) for (const part of message.parts)
      if (part.type === "text") expect(conversation).toContain(part.text)
    expect(system.includes("# Historical working memory")).toBe(condition === "allowed")
    if (condition === "allowed") {
      expect(system).toContain(FIRST)
      expect(conversation).not.toContain(seed[0])
    }
    const patterned = condition === "session-pattern-deny" || condition === "agent-pattern-deny" || condition === "pattern-revoked"
    expect(hasRecall(hit)).toBe(condition === "allowed" || condition === "no-toolcall" || patterned)
    expect(hasRecall(capture.hits[0].hit)).toBe(allowed || condition === "no-toolcall" || patterned)
    expect(capture.hits.map((entry) => entry.name)).toEqual([...seed, ...(allowed ? ["memory"] : []), "next"])
    expect(yield* llm.hits).toEqual(capture.hits.map((entry) => entry.hit))
    expect((yield* jobs.list()).filter((job) => job.metadata?.sessionId === chat.id)).toHaveLength(allowed ? 1 : 0)
    expect((yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })).system).toEqual(saved.system)
  }), 120_000)
}
