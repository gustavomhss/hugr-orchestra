import { expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { Archive } from "@/continuity/archive"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Plugin } from "@/plugin"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { SessionSummary } from "@/session/summary"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { httpError, raw, reply, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { FIRST, NONCE, PAD, body, fragments, jobFor, packet, wireMessages } from "./service-fixture"
import { MessageID, PartID } from "@/session/schema"
import { SessionV1 } from "@orchestra/core/v1/session"

const transform: { plan?: { entered: Deferred.Deferred<void>; release: Deferred.Deferred<void>; append?: string } } = {}
const preparation: { plan?: { systemCalls: number; paramCalls: number; system?: string; reserve?: number; once?: boolean;
  entered?: Deferred.Deferred<void>; release?: Deferred.Deferred<void> } } = {}

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  SessionPrompt.node, SessionContinuity.node, Session.node, SessionProjector.node, BackgroundJob.node,
  Database.node, EventV2Bridge.node, CrossSpawnSpawner.node, Archive.node, llmNode,
]), [
  [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
  [Plugin.node, Layer.mock(Plugin.Service, {
    init: () => Effect.void, list: () => Effect.succeed([]), trigger: (name, _input, output) => Effect.gen(function* () {
      const payload: unknown = output
      const preparing = preparation.plan
      if (preparing && payload && typeof payload === "object") {
        if (name === "experimental.chat.system.transform" && "system" in payload && Array.isArray(payload.system)) {
          preparing.systemCalls++
          payload.system.push(preparing.once && preparing.systemCalls > 1 ? "SECOND_PREP_OVERFLOW ".repeat(60_000) : preparing.system ?? "PREPARED_ONCE")
          if (preparing.entered && preparing.release) {
            const release = preparing.release
            preparing.release = undefined
            yield* Deferred.succeed(preparing.entered, undefined)
            yield* Deferred.await(release)
          }
        }
        if (name === "chat.params" && "maxOutputTokens" in payload) {
          preparing.paramCalls++
          if (preparing.reserve !== undefined) payload.maxOutputTokens = preparing.reserve
        }
      }
      const plan = name === "experimental.chat.messages.transform" ? transform.plan : undefined
      if (!plan || !payload || typeof payload !== "object" || !("messages" in payload) || !Array.isArray(payload.messages)) return output
      transform.plan = undefined
      const target: unknown[] = payload.messages
      const decoded = Schema.decodeUnknownSync(Schema.Array(SessionV1.WithParts))(target)
      target.splice(0, target.length, ...decoded.map((message) => message.info.role !== "user" || !plan.append ? message : { ...message,
        parts: [...message.parts, { id: PartID.ascending(), sessionID: message.info.sessionID, messageID: message.info.id, type: "text", text: plan.append, synthetic: true }] }))
      yield* Deferred.succeed(plan.entered, undefined)
      yield* Deferred.await(plan.release)
      return output
    }),
  })],
  [SessionSummary.node, Layer.mock(SessionSummary.Service, {
    summarize: () => Effect.void, diff: () => Effect.succeed([]), computeDiff: () => Effect.succeed([]),
  })],
]))
type Match = Parameters<TestLLMServer["Service"]["pushMatch"]>[0]
type Hit = Parameters<Match>[0]
const maintenance: Match = (hit) => {
  const wire = wireMessages(hit.body)
  return wire.some((message) => message.role === "system" && message.content.includes("CONTEXT CONTINUITY CHECKPOINT · working memory v5")) ||
    (wire.at(-1)?.role === "user" && /^(CONTEXT CONTINUITY CHECKPOINT|HOST CHECK FAILED)/.test(wire.at(-1)!.content))
}
const parent = (marker: string): Match => (hit) => !maintenance(hit) &&
  wireMessages(hit.body).findLast((message) => message.role === "user")?.content.includes(marker) === true

function configure(url: string, directory: string, options: { toolcall?: boolean; permission?: unknown; context?: number } = {}) {
  const config = testProviderConfig(url)
  config.provider.test.models["test-model"].tool_call = options.toolcall ?? true
  if (options.context) config.provider.test.models["test-model"].limit.context = options.context
  return Effect.promise(() => Bun.write(path.join(directory, "orchestra.json"), JSON.stringify({
    ...config, model: "test/test-model", small_model: "test/test-model", enabled_providers: ["test"],
    plugin: [], mcp: {}, compaction: { auto: false },
    // Scenario turns report 50,000 tokens against the test model's 100,000-token window.
    continuity: { trigger: 0.5 },
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
    const value = body(hit.body, memory, reference)
    expect(fragments(packet(hit.body)).every((entry) => /^[uat][1-9][0-9]*$/.test(entry.id))).toBe(true)
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

for (const cached of [0, 25_000]) it.instance(`HTTP admission settles held producer; stale result loses; next turn recovers archived nonce; cache=${cached}`, () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const continuity = yield* SessionContinuity.Service
  yield* configure(llm.url, instance.directory)
  const chat = yield* sessions.create({ title: "HTTP working memory and recall" })
  const head = `HEAD_ONLY_FACT_7E5D: ${FIRST}\nRecorded nonce=${NONCE}`
  const tail = "TAIL_KEEP_A129"
  const seed = Array.from({ length: 6 }, (_, index) => ({ user: index === 0 ? head : index === 5 ? tail : `SEED_USER_${index}`, assistant: `SEED_REPLY_${index} ${PAD}` }))
  const a = yield* gate
  const b = yield* gate
  const capture = ledger()
  const control = (content: string, role: string): Hit => ({ url: new URL("/v1/chat/completions", llm.url), body: { messages: [{ role, content }] } })
  expect(maintenance(control("CONTEXT CONTINUITY CHECKPOINT · working memory v5", "system"))).toBe(true)
  expect(maintenance(control("CONTEXT CONTINUITY CHECKPOINT\nprotocol", "user"))).toBe(true)
  expect(maintenance(control("TRIGGER", "user"))).toBe(false)
  expect(parent("TRIGGER")(control("TRIGGER", "user"))).toBe(true)
  for (const turn of seed) yield* llm.pushMatch(capture.record(turn.user, parent(turn.user)), answer(turn.assistant))
  yield* llm.pushMatch(capture.record("trigger", parent("TRIGGER")), answer("TRIGGER_DONE", 50_000, cached))
  // The replayed instruction indexes the new span by alias with the opening words of each source.
  const stale = forkAnswer("Work: STALE_HTTP_MEMORY", capture.record("A", maintenance), "7E5D", a.wait)
  yield* llm.pushMatch(stale.match, stale.response)
  yield* llm.pushMatch(capture.record("advance", parent("ADVANCE_WHILE_HELD")), answer("PARENT_ADVANCED", 100))
  const fresh = forkAnswer(FIRST, capture.record("B", maintenance), "7E5D", b.wait)
  yield* llm.pushMatch(fresh.match, fresh.response)
  const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
    parts: [{ type: "text", text }] }), `Parent did not complete: ${text}`, "30 seconds")
  for (const turn of seed) expect((yield* send(turn.user)).parts.some((part) => part.type === "text" && part.text === turn.assistant)).toBe(true)
  const triggered = yield* send("TRIGGER")
  if (triggered.info.role !== "assistant") throw new Error("Expected trigger assistant")
  expect(triggered.info.tokens.input + triggered.info.tokens.cache.read + triggered.info.tokens.cache.write).toBe(50_000)
  yield* awaitWithTimeout(llm.wait(8), "Maintenance A never reached HTTP", "30 seconds")
  // Cache reuse: the maintenance request is the parent's trigger request plus one
  // appended instruction. Every other wire field, tools included, is unchanged.
  const fork = capture.hits.at(-1)!.hit.body
  const trigger = capture.hits.find((entry) => entry.name === "trigger")!.hit.body
  const { messages: forkMessages, ...forkRest } = fork
  const { messages: triggerMessages, ...triggerRest } = trigger
  expect(forkRest).toEqual(triggerRest)
  expect(Array.isArray(forkMessages) && Array.isArray(triggerMessages)).toBe(true)
  expect((forkMessages as unknown[]).slice(0, -1)).toEqual(triggerMessages as unknown[])
  expect(hasRecall(capture.hits.at(-1)!.hit)).toBe(true)
  expect(packet(fork)).toContain("## New span")
  expect(packet(fork)).toContain(tail)
  expect(packet(fork)).toContain("TRIGGER_DONE")
  const advancing = yield* send("ADVANCE_WHILE_HELD").pipe(Effect.forkChild)
  yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((history) => history.some((message) =>
    message.parts.some((part) => part.type === "text" && part.text === "ADVANCE_WHILE_HELD")) ? history : undefined)), "Concurrent prompt never admitted")
  expect(advancing.pollUnsafe()).toBeUndefined()
  expect(yield* Deferred.isDone(a.release)).toBe(false)
  const rejected = yield* prompt.prompt({ sessionID: chat.id, agent: "missing-continuity-test-agent", model,
    parts: [{ type: "text", text: "REJECTED_PROMPT" }] }).pipe(Effect.exit)
  expect(Exit.isFailure(rejected)).toBe(true)
  yield* Deferred.succeed(a.release, undefined)
  expect((yield* Fiber.join(advancing)).parts.some((part) => part.type === "text" && part.text === "PARENT_ADVANCED")).toBe(true)
  yield* awaitWithTimeout(llm.wait(10), "Replacement B never reached HTTP", "10 seconds")
  const history = yield* sessions.messages({ sessionID: chat.id })
  expect(yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })).toEqual({ messages: history, system: [] })
  yield* Deferred.succeed(b.release, undefined)
  const prepared = yield* pollWithTimeout(continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true }).pipe(
    Effect.map((value) => value.system[0]?.includes(FIRST) ? value : undefined)), "B never applied", "10 seconds")
  expect(prepared.messages).toEqual([history.at(-2)!])
  expect(prepared.system[0]).not.toContain("STALE_HTTP_MEMORY")
  // No historical user ledger repairs the memory; real alias recall recovers the nonce.
  expect(prepared.system[0]).not.toContain("## User messages (verbatim, host-collected)")
  expect(prepared.system[0]).not.toMatch(/continuity_handoff|"exact":|"provenance":|"reference_only":/)
  const providerB = capture.hits.find((entry) => entry.name === "B")!
  const reference = fragments(packet(providerB.hit.body)).find((entry) => entry.text.includes("7E5D"))!.id
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
  expect(conversation).not.toContain("PARENT_ADVANCED")
  expect(conversation).toContain("RECOVER_NONCE")
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

it.instance("large outgoing plugin append on first request emits completed overflow error and sends zero provider requests", () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  yield* configure(llm.url, instance.directory)
  const chat = yield* sessions.create({ title: "Actual outgoing guard" })
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  yield* Deferred.succeed(release, undefined)
  transform.plan = { entered, release, append: "LARGE_PLUGIN_APPEND ".repeat(60_000) }
  yield* Effect.addFinalizer(() => Effect.sync(() => { transform.plan = undefined }))
  const result = yield* prompt.prompt({ sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text: "FIRST_REQUEST" }] })
  expect(result.info).toMatchObject({ role: "assistant", finish: "error", parentID: expect.any(String), error: { name: "ContextOverflowError" } })
  expect(result.info.time).toHaveProperty("completed")
  expect(yield* llm.hits).toEqual([])
  const history = yield* sessions.messages({ sessionID: chat.id })
  expect(history.filter((message) => message.info.role === "assistant")).toHaveLength(1)
  expect(history.at(-1)?.info.time).toHaveProperty("completed")
}), 120_000)

for (const phase of ["system", "reserve"] as const) it.instance(`real one-shot ${phase} preflight rejects before processor allocation with completed error event and zero HTTP calls`, () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  yield* configure(llm.url, instance.directory)
  const chat = yield* sessions.create({ title: "Real preflight overflow" })
  const plan = { systemCalls: 0, paramCalls: 0, ...(phase === "system" ? { system: "REAL_SYSTEM_OVERFLOW ".repeat(60_000) } : { reserve: 100_000 }) }
  preparation.plan = plan
  yield* Effect.addFinalizer(() => Effect.sync(() => { preparation.plan = undefined }))
  const errors: unknown[] = []
  const off = yield* events.listen((event) => Effect.sync(() => {
    if (event.type === Session.Event.Error.type) errors.push(event.data)
  }))
  yield* Effect.addFinalizer(() => off)
  const result = yield* prompt.prompt({ sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text: "PREFLIGHT_FIRST_REQUEST" }] })
  expect(result.info).toMatchObject({ role: "assistant", finish: "error", error: { name: "ContextOverflowError" } })
  expect(result.info.time).toHaveProperty("completed")
  expect(plan.systemCalls).toBe(1)
  expect(plan.paramCalls).toBe(1)
  expect(yield* llm.hits).toEqual([])
  expect(errors).toContainEqual({ sessionID: chat.id, error: result.info.role === "assistant" ? result.info.error : undefined })
  const assistants = (yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")
  expect(assistants).toHaveLength(1)
  expect(assistants[0].info.time).toHaveProperty("completed")
}), 120_000)

it.instance("real prepared plan runs mutable system and params hooks once, then executes captured payload", () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  yield* configure(llm.url, instance.directory)
  const chat = yield* sessions.create({ title: "One-shot hooks" })
  const plan = { systemCalls: 0, paramCalls: 0, once: true, reserve: 4321 }
  preparation.plan = plan
  yield* Effect.addFinalizer(() => Effect.sync(() => { preparation.plan = undefined }))
  yield* llm.pushMatch(parent("ONE_SHOT_REQUEST"), answer("ONE_SHOT_DONE"))
  const result = yield* prompt.prompt({ sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text: "ONE_SHOT_REQUEST" }] })
  expect(result.parts.some((part) => part.type === "text" && part.text === "ONE_SHOT_DONE")).toBe(true)
  expect(plan.systemCalls).toBe(1)
  expect(plan.paramCalls).toBe(1)
  const hits = yield* llm.hits
  expect(hits).toHaveLength(1)
  expect(wireMessages(hits[0].body).some((message) => message.role === "system" && message.content.includes("PREPARED_ONCE"))).toBe(true)
  expect(hits[0].body.max_tokens).toBe(4321)
}), 120_000)

it.instance("queued caller during outgoing preparation rebinds agent/model/permissions/format before allocating assistant and delivers once", () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const cfg = testProviderConfig(llm.url)
  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "orchestra.json"), JSON.stringify({ ...cfg,
    provider: { ...cfg.provider, test: { ...cfg.provider.test, models: { ...cfg.provider.test.models,
      "alternate-model": { ...cfg.provider.test.models["test-model"], id: "alternate-model", limit: { context: 200_000, output: 10_000 } } } } }, model: "test/test-model", plugin: [], mcp: {},
    enabled_providers: ["test"], compaction: { auto: false }, agent: { build: { permission: { context_recall: "allow" } },
      alternate: { model: "test/alternate-model", permission: { bash: "deny" } } } })))
  const chat = yield* sessions.create({ title: "Queue caller binding" })
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  preparation.plan = { systemCalls: 0, paramCalls: 0, entered, release }
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.andThen(Effect.sync(() => { preparation.plan = undefined }))))
  yield* llm.pushMatch((hit) => hit.body.model === "alternate-model" && parent("NEW_BOUND_CALLER")(hit), reply().tool("StructuredOutput", { accepted: true }))
  const old = yield* prompt.prompt({ sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text: "OLD_BOUND_CALLER" }] }).pipe(Effect.forkChild)
  yield* awaitWithTimeout(Deferred.await(entered), "Caller preparation never reached plugin", "15 seconds").pipe(Effect.catch((error) =>
    Effect.fail(new Error(`${error.message}; caller=${String(old.pollUnsafe())}`))))
  expect((yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")).toEqual([])
  const newer = yield* prompt.prompt({ sessionID: chat.id, noReply: true, agent: "alternate", model: { providerID: model.providerID, modelID: ModelV2.ID.make("alternate-model") },
    tools: { bash: false }, format: { type: "json_schema", schema: { type: "object", properties: { accepted: { type: "boolean" } } } }, parts: [{ type: "text", text: "NEW_BOUND_CALLER" }] })
  yield* Deferred.succeed(release, undefined)
  const result = yield* Fiber.join(old)
  expect(result.info).toMatchObject({ role: "assistant", parentID: newer.info.id, agent: "alternate", modelID: "alternate-model", structured: { accepted: true } })
  const hits = yield* llm.hits
  expect(hits).toHaveLength(1)
  expect(JSON.stringify(hits[0].body.tools)).not.toContain('"name":"bash"')
  expect((yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")).toHaveLength(1)
}), 120_000)

it.instance("different user queued during real held catch-up retries stale admission instead of emitting terminal U1 error", () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const jobs = yield* BackgroundJob.Service
  yield* configure(llm.url, instance.directory)
  const chat = yield* sessions.create({ title: "Held catch-up caller race" })
  const seed = Array.from({ length: 6 }, (_, index) => `CATCHUP_SEED_${index}`)
  for (const text of seed) yield* llm.pushMatch(parent(text), answer(`DONE_${text} ${PAD}`, text === seed[5] ? 50_000 : 100))
  const first = forkAnswer(FIRST, maintenance)
  yield* llm.pushMatch(first.match, first.response)
  for (const text of seed) yield* prompt.prompt({ sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text }] })
  const before = yield* sessions.messages({ sessionID: chat.id })
  const latest = before.at(-1)!.info
  if (latest.role !== "assistant") throw new Error("Expected initial completed boundary")
  const job = yield* jobFor(chat.id, latest.id)
  expect((yield* jobs.wait({ id: job.id, timeout: 10_000 })).info?.output).toBe("applied")
  // Completed provider step arriving before first paying admission makes a real catch-up necessary.
  const delta = { ...latest, id: MessageID.ascending(), tokens: { ...latest.tokens, input: 100 },
    time: { created: Date.now(), completed: Date.now() } }
  yield* sessions.updateMessage(delta)
  yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: delta.id, type: "text", text: `NEW_COMPLETED_DELTA ${PAD}` })
  const hold = yield* gate
  const catchup = forkAnswer("HELD_CATCHUP_RESULT", maintenance, undefined, hold.wait)
  yield* llm.pushMatch(catchup.match, catchup.response)
  const replacement = forkAnswer("FRESH_CATCHUP_RESULT", maintenance)
  yield* llm.pushMatch(replacement.match, replacement.response)
  yield* llm.pushMatch(parent("QUEUED_U2_DURING_CATCHUP"), answer("U2_DELIVERED_ONCE"))
  const old = yield* prompt.prompt({ sessionID: chat.id, agent: "build", model, parts: [{ type: "text", text: "OLD_U1_CATCHUP_CALLER" }] }).pipe(Effect.forkChild)
  yield* awaitWithTimeout(llm.wait(8), "Real catch-up never reached HTTP", "15 seconds")
  expect((yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")).toHaveLength(7)
  const newer = yield* prompt.prompt({ sessionID: chat.id, noReply: true, agent: "build", model, parts: [{ type: "text", text: "QUEUED_U2_DURING_CATCHUP" }] })
  yield* Deferred.succeed(hold.release, undefined)
  const result = yield* awaitWithTimeout(Fiber.join(old), "Queued caller stranded by catch-up", "30 seconds")
  expect(result.info).toMatchObject({ role: "assistant", parentID: newer.info.id })
  expect(result.parts.some((part) => part.type === "text" && part.text === "U2_DELIVERED_ONCE")).toBe(true)
  const history = yield* sessions.messages({ sessionID: chat.id })
  expect(history.filter((message) => message.info.role === "assistant" && message.info.error)).toEqual([])
  expect(history.filter((message) => message.info.role === "assistant" && message.info.parentID === newer.info.id)).toHaveLength(1)
  const hits = yield* llm.hits
  expect(hits.filter(parent("QUEUED_U2_DURING_CATCHUP"))).toHaveLength(1)
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
    for (const text of seed) yield* llm.pushMatch(parent(text), answer(`REPLY_${text} ${PAD}`, text === seed[5] ? 50_000 : 100))
    const valid = forkAnswer(FIRST, maintenance)
    yield* llm.pushMatch(valid.match, valid.response)
    yield* llm.pushMatch(parent("REFRESH_CLOSED"), answer("REFRESH_DONE", 50_000))
    // The one retry after the failed check gets the same invalid reply.
    yield* llm.pushMatch(maintenance, answer(invalid))
    yield* llm.pushMatch(maintenance, answer(invalid))
    yield* llm.pushMatch(capture.record("next", parent("AFTER_INVALID")), answer("NEXT_VALID"))
    const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
      parts: [{ type: "text", text }] }), "Parent HTTP request stalled", "30 seconds")
    for (const text of seed) yield* send(text)
    const before = yield* pollWithTimeout(Effect.gen(function* () {
      const value = yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })
      return value.system[0]?.includes(FIRST) ? value : undefined
    }), "Valid HTTP memory never applied", "10 seconds").pipe(Effect.catch((error) => jobs.list().pipe(Effect.flatMap((list) =>
      Effect.fail(new Error(`${error.message}; jobs=${JSON.stringify(list.map((job) => ({ status: job.status, output: job.output, error: job.error })))}`))))))
    const refresh = yield* send("REFRESH_CLOSED")
    const job = yield* jobFor(chat.id, refresh.info.id)
    const result = yield* jobs.wait({ id: job.id, timeout: 10_000 })
    expect(result.timedOut).toBe(false)
    expect(result.info?.output).toBe("invalid-schema")
    const history = yield* sessions.messages({ sessionID: chat.id })
    const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })
    expect(prepared.system).toEqual(before.system)
    expect(prepared.messages).toEqual(history.slice(-2))
    yield* send("AFTER_INVALID")
    const wire = wireMessages(capture.hits[0].hit.body)
    expect(wire.filter((entry) => entry.role === "system").map((entry) => entry.content).join("\n")).toContain(FIRST)
    expect(JSON.stringify(wire)).not.toContain(invalid)
    expect(JSON.stringify(wire)).toContain("REFRESH_CLOSED")
  }), 120_000)
}

for (const condition of ["allowed", "session-deny", "agent-deny", "user-false", "no-toolcall", "revoked", "session-pattern-deny", "agent-pattern-deny", "pattern-revoked"] as const) {
  // Memory needs no recall: without it the legacy compaction no longer stands in. Recall only gates masking.
  it.instance(`working memory applies whatever the recall capability: ${condition}`, () => Effect.gen(function* () {
    const llm = yield* TestLLMServer
    const instance = yield* TestInstance
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    yield* configure(llm.url, instance.directory, { toolcall: condition !== "no-toolcall", permission:
      condition === "agent-deny" ? "deny" : condition === "agent-pattern-deny" ? { "*": "allow", "ses_*": "deny" } : "allow" })
    const chat = yield* sessions.create({ title: `Working-memory capability ${condition}`,
      permission: condition === "session-deny" ? [{ permission: "context_recall", pattern: "*", action: "deny" }] : [] })
    if (condition === "session-pattern-deny") yield* sessions.setPermission({ sessionID: chat.id,
      permission: [{ permission: "context_recall", pattern: chat.id, action: "deny" }] })
    const capture = ledger()
    const seed = Array.from({ length: 6 }, (_, index) => `CAPABILITY_SEED_${index}`)
    for (const text of seed) yield* llm.pushMatch(capture.record(text, parent(text)), answer(`REPLY_${text} ${PAD}`, text === seed[5] ? 50_000 : 100))
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
    const job = yield* jobFor(chat.id, history.at(-1)!.info.id)
    const done = yield* jobs.wait({ id: job.id, timeout: 10_000 })
    expect(done.timedOut).toBe(false)
    expect(done.info?.output).toBe("applied")
    const saved = yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })
    expect(yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: false })).toEqual(saved)
    expect(saved.messages).toEqual([history.at(-2)!])
    expect(saved.coverage?.coveredThrough).toBe(history.at(-1)!.info.id)
    expect(saved.system.length > 0).toBe(true)
    if (condition === "revoked" || condition === "pattern-revoked") yield* sessions.setPermission({ sessionID: chat.id,
      permission: [{ permission: "context_recall", pattern: condition === "pattern-revoked" ? chat.id : "*", action: "deny" }] })
    const next = yield* send("CAPABILITY_NEXT")
    expect(next.parts.some((part) => part.type === "text" && part.text === "NEXT_DONE")).toBe(true)
    const hit = capture.hits.find((entry) => entry.name === "next")!.hit
    const wire = wireMessages(hit.body)
    const system = wire.filter((entry) => entry.role === "system").map((entry) => entry.content).join("\n")
    const conversation = wire.filter((entry) => entry.role !== "system").map((entry) => entry.content).join("\n")
    for (const text of seed) expect(conversation).not.toContain(text)
    expect(system).toContain("# Working memory")
    expect(system).toContain(FIRST)
    expect(conversation).not.toContain(seed[0])
    const patterned = condition === "session-pattern-deny" || condition === "agent-pattern-deny" || condition === "pattern-revoked"
    expect(hasRecall(hit)).toBe(condition === "allowed" || condition === "no-toolcall" || patterned)
    expect(hasRecall(capture.hits[0].hit)).toBe(condition === "allowed" || condition === "revoked" || condition === "pattern-revoked" ||
      condition === "no-toolcall" || patterned)
    expect(capture.hits.map((entry) => entry.name)).toEqual([...seed, "memory", "next"])
    expect(yield* llm.hits).toEqual(capture.hits.map((entry) => entry.hit))
    expect((yield* jobs.list()).filter((job) => job.metadata?.sessionId === chat.id)).toHaveLength(1)
    expect((yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })).system).toEqual(saved.system)
  }), 120_000)
}

it.instance("read shows nested rules again after working memory drops the turn that showed them", () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const jobs = yield* BackgroundJob.Service
  yield* configure(llm.url, instance.directory)
  const rules = path.join(instance.directory, "rules")
  yield* Effect.promise(() => Bun.write(path.join(rules, "AGENTS.md"), "NESTED_RULE_5C1E"))
  yield* Effect.promise(() => Bun.write(path.join(rules, "first.txt"), "first"))
  yield* Effect.promise(() => Bun.write(path.join(rules, "second.txt"), "second"))
  const chat = yield* sessions.create({ title: "Nested rules after working memory" })
  const capture = ledger()
  const seed = Array.from({ length: 6 }, (_, index) => `RULES_SEED_${index}`)
  yield* llm.pushMatch(parent(seed[0]), reply().tool("read", { filePath: path.join(rules, "first.txt") }))
  for (const text of seed) yield* llm.pushMatch(parent(text), answer(`REPLY_${text} ${PAD}`, text === seed[5] ? 50_000 : 100))
  const memory = forkAnswer(FIRST, maintenance)
  yield* llm.pushMatch(memory.match, memory.response)
  yield* llm.pushMatch(capture.record("next", parent("RULES_NEXT")), reply().tool("read", { filePath: path.join(rules, "second.txt") }))
  yield* llm.pushMatch(parent("RULES_NEXT"), answer("NEXT_DONE"))
  yield* llm.pushMatch(() => true, httpError(400, { error: { message: "Unexpected nested-rules request" } }))
  const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
    parts: [{ type: "text", text }] }), "Nested-rules HTTP request stalled", "30 seconds")
  for (const text of seed) yield* send(text)
  const history = yield* sessions.messages({ sessionID: chat.id })
  const job = yield* jobFor(chat.id, history.at(-1)!.info.id)
  const done = yield* jobs.wait({ id: job.id, timeout: 10_000 })
  expect(done.info?.output).toBe("applied")
  yield* send("RULES_NEXT")
  const durable = yield* sessions.messages({ sessionID: chat.id })
  const reads = durable.flatMap((message) => message.parts).flatMap((part) =>
    part.type === "tool" && part.tool === "read" && part.state.status === "completed" ? [part.state] : [])
  expect(reads).toHaveLength(2)
  expect(reads[0].output).toContain("NESTED_RULE_5C1E")
  // Working memory kept the first read's turn, and the rules it showed, out of the request that made the second read.
  const conversation = wireMessages(capture.hits[0].hit.body).filter((entry) => entry.role !== "system")
    .map((entry) => entry.content).join("\n")
  expect(conversation).not.toContain(seed[0])
  expect(conversation).not.toContain("NESTED_RULE_5C1E")
  expect(reads[1].output).toContain(`Instructions from: ${path.join(rules, "AGENTS.md")}\nNESTED_RULE_5C1E`)
  expect(reads[1].metadata.loaded).toEqual([path.join(rules, "AGENTS.md")])
}), 120_000)

it.instance("read shows nested rules again after masking hides the read that showed them", () => Effect.gen(function* () {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const jobs = yield* BackgroundJob.Service
  // A 50,000-token window starts maintenance at 25,000 tokens; masking alone settles it under 17,500, so no fork runs.
  yield* configure(llm.url, instance.directory, { context: 50_000 })
  const rules = path.join(instance.directory, "rules")
  yield* Effect.promise(() => Bun.write(path.join(rules, "AGENTS.md"), "NESTED_RULE_8D2A"))
  // About 10,000 tokens of read output: masking it frees enough on its own.
  yield* Effect.promise(() => Bun.write(path.join(rules, "first.txt"), "filler line that gives the first read its weight\n".repeat(800)))
  yield* Effect.promise(() => Bun.write(path.join(rules, "second.txt"), "second"))
  const chat = yield* sessions.create({ title: "Nested rules after masking" })
  const capture = ledger()
  const seed = Array.from({ length: 6 }, (_, index) => `MASKED_RULES_SEED_${index}`)
  yield* llm.pushMatch(parent(seed[0]), reply().tool("read", { filePath: path.join(rules, "first.txt") }))
  for (const text of seed) yield* llm.pushMatch(parent(text), answer(`REPLY_${text}`, text === seed[5] ? 25_000 : 100))
  yield* llm.pushMatch(capture.record("next", parent("MASKED_RULES_NEXT")), reply().tool("read", { filePath: path.join(rules, "second.txt") }))
  yield* llm.pushMatch(parent("MASKED_RULES_NEXT"), answer("NEXT_DONE"))
  yield* llm.pushMatch(() => true, httpError(400, { error: { message: "Unexpected masked-rules request" } }))
  const send = (text: string) => awaitWithTimeout(prompt.prompt({ sessionID: chat.id, agent: "build", model,
    parts: [{ type: "text", text }] }), "Masked-rules HTTP request stalled", "30 seconds")
  for (const text of seed) yield* send(text)
  const history = yield* sessions.messages({ sessionID: chat.id })
  const job = yield* jobFor(chat.id, history.at(-1)!.info.id)
  const done = yield* jobs.wait({ id: job.id, timeout: 10_000 })
  expect(done.info?.output).toBe("masked")
  yield* send("MASKED_RULES_NEXT")
  const durable = yield* sessions.messages({ sessionID: chat.id })
  const reads = durable.flatMap((message) => message.parts).flatMap((part) =>
    part.type === "tool" && part.tool === "read" && part.state.status === "completed" ? [part.state] : [])
  expect(reads).toHaveLength(2)
  expect(reads[0].output).toContain("NESTED_RULE_8D2A")
  // The request that made the second read still carried the first read, masked, without the rules it showed.
  const conversation = wireMessages(capture.hits[0].hit.body).filter((entry) => entry.role !== "system")
    .map((entry) => entry.content).join("\n")
  expect(conversation).toContain(`[masked tool result: read filePath=${path.join(rules, "first.txt")} → completed`)
  expect(conversation).not.toContain("NESTED_RULE_8D2A")
  expect(reads[1].output).toContain(`Instructions from: ${path.join(rules, "AGENTS.md")}\nNESTED_RULE_8D2A`)
  expect(reads[1].metadata.loaded).toEqual([path.join(rules, "AGENTS.md")])
}), 120_000)
