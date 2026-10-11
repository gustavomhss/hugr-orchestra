import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { Archive } from "@/continuity/archive"
import { ProjectCheckpoint } from "@orchestra/core/project/checkpoint"
import { CheckpointContext } from "@/continuity/checkpoint-context"
import { validChecklist } from "@/continuity/checklist-seal"
import PROMPT from "@/continuity/prompt.txt"
import { ClaudeCodeStore } from "@/claude-code/store"
import { FSUtil } from "@orchestra/core/fs-util"
import { pollWithTimeout } from "../lib/effect"
import { ClaudeEngineFixture } from "./engine-fixture"

ClaudeEngineFixture.it.instance("SDK window triggers the actual SDK producer and loads accepted memory on resume without changing the native archive", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    ClaudeEngineFixture.state.producer = ClaudeEngineFixture.memoryProducer
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    const loaded: SessionStoreEntry[][] = []
    for (let index = 0; index < 6; index++) {
      ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50, loaded }))
      const reply = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`prompt-${index} ` + "source context ".repeat(120)) })
      expect(reply.info.role === "assistant" && reply.info.error).toBeUndefined()
    }
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000, version: "2.1.289", continuityPaused: null })
    const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "SDK producer never scheduled", "15 seconds")
    const done = yield* jobs.wait({ id: job.id, timeout: 15_000 })
    expect(done.info?.status).toBe("completed")
    expect(done.info?.output).toBe("applied")
    expect(ClaudeEngineFixture.state.producers).toBe(1)
    expect(ClaudeEngineFixture.state.reviews).toBe(0)
    const producers = ClaudeEngineFixture.state.queries.filter((query) => query.options?.persistSession === false)
    expect(producers).toHaveLength(1)
    expect(producers[0].options?.model).toBe("claude-haiku-4-5-20251001")
    expect(producers[0].options?.systemPrompt).toEqual({ type: "custom", prompt: PROMPT })
    expect(JSON.stringify(ClaudeEngineFixture.historicalMessages(producers[0]))).toContain("prompt-0")
    const checkpoints = yield* ProjectCheckpoint.Service.pipe(Effect.provide(ProjectCheckpoint.layer))
    const saved = (yield* checkpoints.list({ projectID: chat.projectID, directory: chat.directory })).items
    expect(saved).toHaveLength(1)
    const checkpoint = yield* checkpoints.read({ projectID: chat.projectID, id: saved[0].id })
    if (!checkpoint) throw new Error("Native producer spawned without a project checkpoint")
    const captured = CheckpointContext.decode(checkpoint.payload)
    if (!captured || typeof captured !== "object" || !("messages" in captured)) throw new Error("Missing captured messages")
    expect(captured).toMatchObject({ system: [], agent: { prompt: PROMPT }, tools: {}, purpose: "context-maintenance" })
    expect(producers[0].prompt).toBe("Historical messages (JSON, including original roles/content):\n" + JSON.stringify(captured.messages))
    expect(saved[0]).toMatchObject({ sessionID: chat.id, projectID: chat.projectID, attempt: 0 })
    const storage = yield* Archive.Service
    const memory = (yield* storage.readMemory(chat.id))?.context?.artifact
    expect(memory?.version).toBe(5)
    // Bun's asymmetric object matcher mutates its received object; keep sealed bytes untouched.
    expect(memory?.version === 5 && structuredClone(memory.checklist)).toMatchObject({ version: 1, critical: [], digest: expect.any(String) })
    expect(memory?.version === 5 && validChecklist(memory)).toBe(true)
    expect(memory).not.toHaveProperty("review")
    expect(memory?.text).toContain("SDK_MEMORY_NEEDLE_9C41")
    expect(memory?.items.length).toBeGreaterThan(0)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000, version: "2.1.289", continuityPaused: null })
    const prepared = yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })
    expect(prepared.system.join("\n")).toContain("SDK_MEMORY_NEEDLE_9C41")
    const context = yield* Effect.context<never>()
    const archive = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
      run: (effect) => Effect.runPromiseWith(context)(effect), rewrite: () => true, canRecall: true })
    const before = yield* archive.read
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(6, { loaded, inspect: (params) => {
      expect(params.options?.settings).toMatchObject({ autoCompactEnabled: false })
    } }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("recall the memory") })
    const view = loaded.at(-1)!
    expect(view[0].subtype).toBe("compact_boundary")
    expect(view[1].isCompactSummary).toBe(true)
    expect(JSON.stringify(view[1])).toContain("SDK_MEMORY_NEEDLE_9C41")
    expect(view.length).toBeLessThan(before.keys[0].entries.length)
    const after = yield* archive.read
    expect(after.keys[0].entries.slice(0, before.keys[0].entries.length)).toEqual(before.keys[0].entries)
    expect(after.mapping["api-0"]).toBe(before.mapping["api-0"])
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    ClaudeEngineFixture.state.producer = undefined
  }), 120_000)

ClaudeEngineFixture.it.instance("unknown transcript version keeps native compaction enabled and pauses Orchestra production", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  for (let index = 0; index < 2; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { version: "99.9.9", usage: 19_000 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("native only") })
  }
  expect(ClaudeEngineFixture.state.producers).toBe(0)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  expect(ClaudeEngineFixture.state.queries.every((query) => typeof query.options?.settings !== "string" && query.options?.settings?.autoCompactEnabled === true)).toBe(true)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: "Claude Code 99.9.9 not yet supported" })
}), 60_000)

ClaudeEngineFixture.it.instance("SDK init model aliases reconcile actual modelUsage without borrowing catalog limits", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(async function* (signal, params) {
    for await (const message of ClaudeEngineFixture.nativeReply(0, { modelKey: "claude-haiku-4-5" })(signal, params)) {
      yield message
      if (typeof message === "object" && message !== null && "type" in message && message.type === "assistant")
        yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "child", parent_tool_use_id: "ignored-child", message: { id: "child-api", model: "claude-opus-4-6",
          content: [{ type: "text", text: "ignored child" }], stop_reason: "end_turn", usage: {} } }
    }
  })
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("model alias") })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000,
    model: "claude-haiku-4-5-20251001", continuityPaused: null })
  expect(ClaudeEngineFixture.state.producers).toBe(0)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
}), 60_000)

ClaudeEngineFixture.it.instance("session-pattern recall denial disables masking while SDK memory production remains available", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  ClaudeEngineFixture.state.producer = ClaudeEngineFixture.memoryProducer
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const jobs = yield* BackgroundJob.Service
  const archive = yield* Archive.Service
  yield* sessions.setPermission({ sessionID: chat.id, permission: [{ permission: "*", pattern: "*", action: "allow" },
    { permission: "context_recall", pattern: chat.id, action: "deny" }] })
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 9_000 : 50, output: index === 0 ? "old output ".repeat(3000) : undefined }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`phase-${index} ` + "source padding ".repeat(120)) })
  }
  const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "producer did not schedule", "15 seconds")
  expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
  expect((yield* archive.readMemory(chat.id))?.masks).toEqual([])
  expect(ClaudeEngineFixture.state.producers).toBe(1)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  ClaudeEngineFixture.state.producer = undefined
}), 120_000)

ClaudeEngineFixture.it.instance("disabled continuity retains native compaction and never starts the SDK producer", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup({ enabled: false })
  for (let index = 0; index < 2; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: 19_000 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("continuity disabled") })
  }
  expect(ClaudeEngineFixture.state.producers).toBe(0)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  expect(ClaudeEngineFixture.state.queries.every((query) => typeof query.options?.settings !== "string" && query.options?.settings?.autoCompactEnabled === true)).toBe(true)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: "disabled" })
}), 60_000)

ClaudeEngineFixture.it.instance("context_compact uses the real SDK backend without awaiting its own unfinished tool; swap is deferred to resume", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  ClaudeEngineFixture.state.producer = ClaudeEngineFixture.memoryProducer
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`phase-${index} ` + "historical source ".repeat(120)) })
  }
  expect(ClaudeEngineFixture.state.producers).toBe(0)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.compactTurn)
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("compact now") }).pipe(Effect.timeout("20 seconds"))
  expect(result.info.role === "assistant" && result.info.error).toBeUndefined()
  const history = yield* sessions.messages({ sessionID: chat.id })
  const part = history.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.callID === "compact-call")
  expect(part?.type === "tool" && part.state.status).toBe("completed")
  expect(part?.type === "tool" && part.state.status === "completed" && part.state.metadata.outcome).toBe("applied")
  expect(ClaudeEngineFixture.state.producers).toBe(1)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  const archive = yield* Archive.Service
  const memory = (yield* archive.readMemory(chat.id))?.context?.artifact
  expect(memory?.version === 5 && structuredClone(memory.checklist)).toMatchObject({ version: 1, critical: [], digest: expect.any(String) })
  expect(memory?.version === 5 && validChecklist(memory)).toBe(true)
  expect(memory).not.toHaveProperty("review")
  const loaded: SessionStoreEntry[][] = []
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(8, { loaded }))
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("continue") })
  expect(loaded[0][0].subtype).toBe("compact_boundary")
  expect(JSON.stringify(loaded[0][1])).toContain("SDK_MEMORY_NEEDLE_9C41")
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  ClaudeEngineFixture.state.producer = undefined
}), 120_000)

ClaudeEngineFixture.it.instance("hard-limit admission waits before the next SDK query; Stop closes the held producer transport", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const entered = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  const gate: { release?: () => void; aborted: boolean } = { aborted: false }
  yield* Effect.addFinalizer(() => Effect.sync(() => gate.release?.()))
  ClaudeEngineFixture.state.producer = async function* (params) {
    const stopped = new Promise<void>((resolve) => {
      gate.release = resolve
      params.options?.abortController?.signal.addEventListener("abort", () => { gate.aborted = true; resolve() })
    })
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await stopped
    if (!gate.aborted) yield* ClaudeEngineFixture.memoryProducer(params)
  }
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`completed-${index} ` + "source payload ".repeat(120)) })
  }
  yield* Deferred.await(entered).pipe(Effect.timeout("15 seconds"))
  const next = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("next query must wait") }).pipe(Effect.forkChild)
  yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((list) =>
    list.some((message) => message.parts.some((part) => part.type === "text" && part.text === "next query must wait")) ? true : undefined)), "next input not admitted")
  expect(ClaudeEngineFixture.state.queries.filter((query) => query.options?.persistSession !== false)).toHaveLength(6)
  yield* prompt.cancel(chat.id)
  yield* Fiber.await(next)
  expect(gate.aborted).toBe(true)
  expect(ClaudeEngineFixture.state.producers).toBe(1)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  expect(ClaudeEngineFixture.state.queries.filter((query) => query.options?.persistSession !== false)).toHaveLength(6)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  ClaudeEngineFixture.state.producer = undefined
}), 120_000)

ClaudeEngineFixture.it.instance("exact native fallback admission refuses spawn even though the Orchestra prepared view fits", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  ClaudeEngineFixture.state.producer = ClaudeEngineFixture.memoryProducer
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const jobs = yield* BackgroundJob.Service
  const continuity = yield* SessionContinuity.Service
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`boundary-${index} ` + "span text ".repeat(120)) })
  }
  const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "missing producer")
  expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
  expect(ClaudeEngineFixture.state.producers).toBe(1)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  expect((yield* continuity.prepare({ sessionID: chat.id, messages: yield* sessions.messages({ sessionID: chat.id }), canRecall: true })).system).toHaveLength(1)
  const context = yield* Effect.context<never>()
  const native = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true })
  const stored = yield* native.read
  const key = stored.keys[0].key
  yield* Effect.promise(() => native.store.append(key, [{ version: "2.1.289", sessionId: key.sessionId, isSidechain: false,
    type: "assistant", uuid: "unmapped-large", parentUuid: "assistant-5", message: { id: "unmapped-api", role: "assistant", content: [{ type: "text", text: "overflow ".repeat(30_000) }] } }]))
  const before = ClaudeEngineFixture.state.queries.length
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("must not spawn") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("error")
  expect(JSON.stringify(result.info)).toContain("native admission blocked before spawn")
  expect(ClaudeEngineFixture.state.queries).toHaveLength(before)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, reason: "unmapped-native-message" } })
  ClaudeEngineFixture.state.producer = undefined
}), 120_000)

ClaudeEngineFixture.it.instance("unknown deferred carrier uses authoritative native fallback and auto-compaction before actual SDK spawn", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  ClaudeEngineFixture.state.producer = ClaudeEngineFixture.memoryProducer
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const jobs = yield* BackgroundJob.Service
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`carrier-boundary-${index} ` + "span text ".repeat(120)) })
  }
  const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "missing producer")
  expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
  expect(ClaudeEngineFixture.state.producers).toBe(1)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  const context = yield* Effect.context<never>()
  const continuity = yield* SessionContinuity.Service
  const native = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true })
  const key = (yield* native.read).keys[0].key
  yield* Effect.promise(() => native.store.append(key, [{ version: "2.1.289", sessionId: key.sessionId, isSidechain: false,
    type: "attachment", uuid: "unknown-carrier", parentUuid: "assistant-5", attachment: { type: "deferred_tools_record", entries: "new-version-shape" } }]))
  ClaudeEngineFixture.state.scripts.push(async function* (signal, params) {
    expect(params.options).toMatchObject({ settings: { autoCompactEnabled: true } })
    const loaded = await params.options?.sessionStore?.load(key)
    expect(loaded?.some((entry) => entry.uuid === "unknown-carrier")).toBe(true)
    yield* ClaudeEngineFixture.nativeReply(6)(signal, params)
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("continue with native fallback") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("stop")
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
  ClaudeEngineFixture.state.producer = undefined
}), 120_000)

ClaudeEngineFixture.it.instance("missing SDK snapshot keeps native compaction on, but known SDK limit still rejects huge ordinary next prompt", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(0, { usage: 50, snapshot: false }), ClaudeEngineFixture.nativeReply(1, { usage: 50, snapshot: false,
    inspect: (params) => expect(params.options?.settings).toMatchObject({ autoCompactEnabled: true }) }))
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("small previous prompt") })
  const rejected = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("huge next prompt ".repeat(30_000)) })
  expect(rejected.info.role === "assistant" && rejected.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect(ClaudeEngineFixture.state.queries[0].options?.settings).toMatchObject({ autoCompactEnabled: true })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: "SDK system/tool snapshot unavailable; native compaction enabled" })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { bounded: false } })
  expect(ClaudeEngineFixture.state.producers).toBe(0)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
}), 120_000)

ClaudeEngineFixture.it.instance("actual engine caller turns reuse the stable SDK backend while a soft producer is held", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  let aborted = false
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  ClaudeEngineFixture.state.producer = async function* (params) {
    params.options?.abortController?.signal.addEventListener("abort", () => { aborted = true })
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await Effect.runPromiseWith(context)(Deferred.await(release))
    yield* ClaudeEngineFixture.memoryProducer(params)
  }
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 9_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`soft-${index} ` + "source padding ".repeat(120)) })
  }
  yield* Deferred.await(entered)
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(6))
  const next = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("next caller turn") }).pipe(Effect.forkChild)
  yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((history) => history.some((message) =>
    message.parts.some((part) => part.type === "text" && part.text === "next caller turn")) ? true : undefined)), "next caller input not admitted")
  yield* Effect.sleep("50 millis")
  expect(aborted).toBe(false)
  expect(ClaudeEngineFixture.state.producers).toBe(1)
  expect(ClaudeEngineFixture.state.reviews).toBe(0)
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(next)
  ClaudeEngineFixture.state.producer = undefined
}), 120_000)
