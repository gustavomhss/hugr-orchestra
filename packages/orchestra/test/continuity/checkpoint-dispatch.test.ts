import { expect } from "bun:test"
import { asSchema, jsonSchema, type JSONSchema7 } from "ai"
import { Cause, Deferred, Effect, Fiber, Stream } from "effect"
import { ProjectCheckpoint } from "@orchestra/core/project/checkpoint"
import { LLMEvent } from "@orchestra/llm"
import { CheckpointContext } from "@/continuity/checkpoint-context"
import { completeSnapshot, run } from "@/continuity/fork"
import { ParentReceipt } from "@/continuity/parent-receipt"
import type { LLM } from "@/session/llm"
import { LLMPrepared } from "@/session/llm/prepared"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { awaitWithTimeout, testEffect } from "../lib/effect"
import { host, messages, model, provider } from "./memory-fixture"
import { body, environment, FIRST } from "./service-fixture"

const it = testEffect(environment([], { node: ProjectCheckpoint.node }))

const fixture = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const store = yield* ProjectCheckpoint.Service
  const chat = yield* sessions.create({ title: "Checkpoint dispatch" })
  const history = messages(["user", "assistant"])
  const ids = history.map(() => MessageID.ascending())
  history.forEach((message, index) => {
    message.info.id = ids[index]
    message.info.sessionID = chat.id
    if (message.info.role === "assistant") {
      message.info.parentID = ids[0]
      message.info.tokens.input = 20_000
    }
    message.parts = [{ id: PartID.ascending(), messageID: ids[index], sessionID: chat.id,
      type: "text", text: `Exact source ${index}: 🪨漢字e\u0301\n${"historical context ".repeat(1000)}` }]
  })
  yield* Effect.forEach(history, (message) => sessions.updateMessage(message.info).pipe(
    Effect.andThen(Effect.forEach(message.parts, (part) => sessions.updatePart(part))),
  ))
  const captured = completeSnapshot(chat.id, history, undefined, true)
  if (!captured) throw new Error("Expected complete snapshot")
  const saves: ProjectCheckpoint.SaveInput[] = []
  const requests: LLM.StreamInput[] = []
  const debug: LLM.StreamInput[] = []
  const callbacks = {
    onRequest: (input: LLM.StreamInput) => Effect.sync(() => { debug.push(input) }),
    beforeDispatch: (input: Parameters<NonNullable<NonNullable<Parameters<typeof run>[3]>["beforeDispatch"]>>[0]) =>
      Effect.gen(function* () {
        const save = { sessionID: chat.id, ...input }
        saves.push(save)
        yield* store.save(save)
      }),
  }
  const llm: LLM.Interface = { stream: (input) => {
    requests.push(input)
    return Stream.make(LLMEvent.textDelta({ id: "reply", text: JSON.stringify(body(input, FIRST)) }),
      LLMEvent.finish({ reason: "stop" }))
  } }
  return { chat, history, captured, store, saves, requests, debug, callbacks, llm }
})

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected checkpoint object")
  return Object.fromEntries(Object.entries(value))
}

// Compare decoded fields directly to transport input, never to a second codec capture.
function matches(payload: string, sent: LLM.StreamInput) {
  const saved = object(CheckpointContext.decode(payload))
  for (const key of ["system", "messages", "user", "agent", "permission", "sessionID", "parentSessionID",
    "preflightParams", "responseSchema", "purpose", "contextMemory", "small", "retries", "toolChoice"] as const)
    expect(saved[key]).toEqual(sent[key])
  const descriptor = object(saved.model)
  const { headers, api, ...context } = sent.model
  expect(descriptor).toEqual({ ...context, family: context.family, variants: context.variants, api: { id: api.id, npm: api.npm } })
  expect(descriptor).not.toHaveProperty("headers")
  expect(descriptor.api).not.toHaveProperty("url")
  expect(saved).not.toHaveProperty("prepared")
  expect(Object.keys(object(saved.tools))).toEqual(Object.keys(sent.tools))
  Object.entries(sent.tools).forEach(([name, tool]) => {
    const definition = object(object(saved.tools)[name])
    expect(definition.description).toBe(tool.description)
    expect(definition.inputSchema).toEqual(asSchema(tool.inputSchema).jsonSchema)
    expect(definition.inputExamples).toEqual(tool.inputExamples)
    if (tool.outputSchema) expect(definition.outputSchema).toEqual(asSchema(tool.outputSchema).jsonSchema)
    for (const callback of ["execute", "onInputStart", "onInputDelta", "onInputAvailable", "toModelOutput", "needsApproval"])
      expect(definition).not.toHaveProperty(callback)
  })
}

it.instance("awaits the real store sink; replay context stays detached while save is held", () => Effect.gen(function* () {
  const f = yield* fixture
  const reached = yield* Deferred.make<string>()
  const release = yield* Deferred.make<void>()
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  const user = f.history[0].info
  const last = f.history[1].info
  if (user.role !== "user" || last.role !== "assistant") throw new Error("Expected completed turn")
  const schema: JSONSchema7 = { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  const builds: string[] = []
  const callback = () => {}
  const validate = (value: unknown) => ({ success: true as const, value })
  const tools = yield* Effect.promise(() => LLMPrepared.tools({ read: {
    description: "Read exact path 🪨", inputExamples: [{ input: { path: "before" } }],
    inputSchema: jsonSchema(async () => { builds.push("input"); return schema }, { validate }),
    execute: async () => "host-only", onInputStart: callback, onInputDelta: callback, onInputAvailable: callback,
    toModelOutput: () => ({ type: "text", value: "host-only" }), needsApproval: () => true,
  } }))
  const source = ParentReceipt.capture({ input: {
    user, sessionID: f.chat.id, model: { ...model, headers: { Authorization: "TRANSPORT_SECRET" } },
    agent: { name: "build", mode: "primary", prompt: "Exact role", permission: [], options: { temperature: 0.2 } },
    permission: [{ permission: "read", pattern: "*", action: "allow" }], system: ["Parent system 🪨漢字e\u0301"],
    messages: [{ role: "user", content: [{ type: "text", text: "Exact prefix 🪨漢字e\u0301" },
      { type: "image", image: new Uint8Array([0, 128, 255]) },
      { type: "image", image: new URL("https://example.test/image?q=%F0%9F%AA%A8") }] },
      { role: "assistant", content: "Parent answer" }],
    tools, toolChoice: "auto", contextMemory: false, small: false, prepared: LLMPrepared.token(),
    preflightParams: { temperature: 0.3, topP: 0.9, topK: 3, maxOutputTokens: 2000, options: { cache: "exact" } },
  }, messageIDs: f.history.map((message) => message.info.id) }, last.id, f.history)
  ParentReceipt.complete(source, last)
  expect(ParentReceipt.matches(source, f.captured, model)).toBe(true)
  const prefix = structuredClone(source.input.messages)
  const system = [...source.input.system]
  const task = yield* run(f.captured, { provider: provider(), llm: f.llm }, host(f.history), {
    ...f.callbacks, parent: source, beforeDispatch: (input) => Effect.gen(function* () {
      yield* Deferred.succeed(reached, input.payload)
      yield* Deferred.await(release)
      yield* f.callbacks.beforeDispatch(input)
    }),
  }).pipe(Effect.forkChild)
  const payload = yield* awaitWithTimeout(Deferred.await(reached), "Checkpoint sink did not enter")
  expect(f.requests).toEqual([])
  expect((yield* f.store.list({ projectID: f.chat.projectID, directory: f.chat.directory })).items).toEqual([])
  expect(f.debug).toHaveLength(1)
  const original = f.debug[0]
  original.messages.push({ role: "user", content: "LATE MUTATION" })
  original.system[0] = "LATE SYSTEM"
  original.agent.options.temperature = 9
  original.user.model.variant = "late"
  original.model.options.reasoning = "late"
  original.tools.read.description = "LATE TOOL"
  schema.description = "LATE SCHEMA"
  if (!original.preflightParams) throw new Error("Missing captured preflight params")
  original.preflightParams.options.cache = "late"
  yield* Deferred.succeed(release, undefined)
  const result = yield* Fiber.join(task)
  expect(result.artifact).toBeDefined()
  expect(result.retried).toBe(false)
  expect(f.requests).toHaveLength(1)
  expect(f.saves).toHaveLength(1)
  const sent = f.requests[0]
  expect(sent.purpose).toBeUndefined() // Proves actual replay, not isolated fallback.
  expect(sent.messages.slice(0, -1)).toEqual(prefix)
  expect(sent.messages.at(-1)?.role).toBe("user")
  expect(String(sent.messages.at(-1)?.content)).toStartWith("CONTEXT CONTINUITY CHECKPOINT")
  expect(String(sent.messages.at(-1)?.content)).toContain("## Index of the new span")
  expect(sent.system).toEqual(system)
  expect(sent.agent.options.temperature).toBe(0.2)
  expect(sent.user.model.variant).toBe("parent-variant")
  expect(sent.preflightParams?.options.cache).toBe("exact")
  expect(sent.tools.read.description).toBe("Read exact path 🪨")
  expect(builds).toEqual(["input"])
  expect(sent.prepared).toBe(source.input.prepared)
  expect(sent.tools.read.onInputStart).toBe(callback)
  expect(asSchema(sent.tools.read.inputSchema).validate).toBe(validate)
  expect(typeof sent.tools.read.execute).toBe("function")
  const saved = yield* f.store.read({ projectID: f.chat.projectID, id: `${f.saves[0].forkID}:0` })
  expect(saved?.payload).toBe(payload)
  expect(payload).not.toContain("TRANSPORT_SECRET")
  matches(payload, sent)
}))

it.instance("save failure is checkpoint failure with no transport or correction", () => Effect.gen(function* () {
  const f = yield* fixture
  const attempts: number[] = []
  const result = yield* run(f.captured, { provider: provider(), llm: f.llm }, host(f.history), {
    ...f.callbacks, beforeDispatch: (input) => Effect.gen(function* () {
      attempts.push(input.attempt)
      return yield* new ProjectCheckpoint.CheckpointError({ reason: "storage" })
    }),
  })
  expect(result).toMatchObject({ failure: "checkpoint", retried: false })
  expect(result.artifact).toBeUndefined()
  expect(attempts).toEqual([0])
  expect(f.requests).toEqual([])
  expect((yield* f.store.list({ projectID: f.chat.projectID, directory: f.chat.directory })).items).toEqual([])
}))

it.instance("abort while save is held cannot dispatch or retry after release", () => Effect.gen(function* () {
  const f = yield* fixture
  const reached = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const attempts: number[] = []
  const task = yield* run(f.captured, { provider: provider(), llm: f.llm }, host(f.history), {
    ...f.callbacks, beforeDispatch: (input) => Effect.gen(function* () {
      attempts.push(input.attempt)
      yield* Deferred.succeed(reached, undefined)
      yield* Deferred.await(release)
      yield* f.callbacks.beforeDispatch(input)
    }),
  }).pipe(Effect.forkChild)
  yield* awaitWithTimeout(Deferred.await(reached), "Checkpoint sink did not enter")
  yield* Fiber.interrupt(task)
  yield* Deferred.succeed(release, undefined)
  const exit = yield* Fiber.await(task)
  expect(exit._tag).toBe("Failure")
  if (exit._tag === "Failure") expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  expect(attempts).toEqual([0])
  expect(f.requests).toEqual([])
  expect((yield* f.store.list({ projectID: f.chat.projectID, directory: f.chat.directory })).items).toEqual([])
}))

for (const failure of ["provider", "invalid-schema"] as const) it.instance(`${failure} retains immutable attempt checkpoints`, () => Effect.gen(function* () {
  const f = yield* fixture
  const result = yield* run(f.captured, { provider: provider(), llm: { stream: (input) => {
    f.requests.push(input)
    return failure === "provider" ? Stream.fail(new Error("Producer failed after checkpoint")) :
      Stream.make(LLMEvent.textDelta({ id: "invalid", text: "not JSON 🪨" }), LLMEvent.finish({ reason: "stop" }))
  } } }, host(f.history), f.callbacks)
  expect(result).toMatchObject({ failure, retried: failure === "invalid-schema" })
  expect(result.artifact).toBeUndefined()
  expect(f.saves.map((save) => save.attempt)).toEqual(failure === "provider" ? [0] : [0, 1])
  expect(f.requests).toHaveLength(f.saves.length)
  const rows = (yield* f.store.list({ projectID: f.chat.projectID, directory: f.chat.directory })).items
  expect(rows).toHaveLength(f.saves.length)
  expect(new Set(rows.map((row) => row.id)).size).toBe(f.saves.length)
  expect(new Set(rows.map((row) => row.forkID)).size).toBe(1)
  yield* Effect.forEach(f.saves, (save, index) => Effect.gen(function* () {
    const read = { projectID: f.chat.projectID, id: `${save.forkID}:${save.attempt}` }
    const stored = yield* f.store.read(read)
    expect(stored?.payload).toBe(save.payload)
    expect(stored?.boundary).toBe(f.captured.boundary)
    matches(save.payload, f.requests[index])
    expect(yield* f.store.save({ ...save, payload: "{}" }).pipe(Effect.flip)).toMatchObject({ reason: "conflict" })
    expect(yield* f.store.read(read)).toEqual(stored)
  }))
  if (failure === "invalid-schema") {
    expect(f.requests[1].messages.slice(0, -2)).toEqual(f.requests[0].messages)
    expect(f.requests[1].messages.at(-2)).toEqual({ role: "assistant", content: "not JSON 🪨" })
    expect(f.requests[1].messages.at(-1)?.role).toBe("user")
    expect(String(f.requests[1].messages.at(-1)?.content)).toStartWith("HOST CHECK FAILED.")
    expect(String(f.requests[1].messages.at(-1)?.content)).toContain("one complete, corrected JSON object")
  }
}))

for (const skip of ["workflow", "input-limit"] as const) it.instance(`${skip} uses the same callbacks without checkpointing`, () => Effect.gen(function* () {
  const f = yield* fixture
  const selected = skip === "workflow" ? { ...model, api: { ...model.api, npm: "gitlab-ai-provider", id: "duo-workflow-test" } } :
    { ...model, limit: { context: 100, output: 99 } }
  const result = yield* run(f.captured, { provider: provider(selected), llm: f.llm }, host(f.history), f.callbacks)
  expect(result.skip).toBe(skip)
  expect(result.retried).toBe(false)
  expect(result.failure).toBe(skip === "input-limit" ? "input-budget" : undefined)
  // Debug observes a constructed over-budget request, but is not a dispatch receipt.
  expect(f.debug).toHaveLength(skip === "input-limit" ? 1 : 0)
  expect(f.requests).toEqual([])
  expect(f.saves).toEqual([])
  expect((yield* f.store.list({ projectID: f.chat.projectID, directory: f.chat.directory })).items).toEqual([])
}))
