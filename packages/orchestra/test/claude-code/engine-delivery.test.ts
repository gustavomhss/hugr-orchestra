import { expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { SessionContinuity } from "@/continuity/service"
import { ClaudeCodeStore } from "@/claude-code/store"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { hash } from "@/continuity/archive-format"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { MessageID } from "@/session/schema"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelsDev } from "@orchestra/core/models-dev"
import { Provider } from "@/provider/provider"
import { hardLimit } from "@/continuity/trigger"
import { estimate } from "@/continuity/masking"
import { ClaudeEngineFixture } from "./engine-fixture"

ClaudeEngineFixture.it.instance("a queued user admitted before a late SDK assistant is delivered exactly once on the next query", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  ClaudeEngineFixture.state.scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    await params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "first-user", sessionId: "sdk-1", parentUuid: null, message: { role: "user", content: params.prompt } },
    ])
    await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
    await Effect.runPromiseWith(context)(Deferred.await(release))
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "first-late", message: { id: "first-late-api", content: [{ type: "text", text: "first done" }], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", total_cost_usd: 0, ...ClaudeEngineFixture.frame }
  }, ClaudeEngineFixture.reply("queued done", "queued-api"), ClaudeEngineFixture.reply("third done", "third-api"))
  const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("first payload") }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("queued payload"), noReply: true })
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(first)
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("third payload") })
  expect(ClaudeEngineFixture.state.queries[0].prompt).toBe("first payload")
  expect(ClaudeEngineFixture.state.queries[1].prompt).toBe("queued payload")
  expect(ClaudeEngineFixture.state.queries[2].prompt).toBe("third payload")
  expect(ClaudeEngineFixture.state.queries.filter((query) => String(query.prompt).includes("queued payload"))).toHaveLength(1)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toHaveProperty("delivered")
}), 120_000)

ClaudeEngineFixture.it.instance("assistant with uncommitted exact receipt cannot hand off; Stop joins callbacks without poisoning archive", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const returned = yield* Deferred.make<void>()
  const stopped = yield* Deferred.make<void>()
  const mirrored = yield* Deferred.make<void>()
  const context = yield* Effect.context<never>()
  const fs = yield* FSUtil.Service
  const data = yield* fs.realPath(Global.Path.data)
  yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
  ClaudeEngineFixture.state.scripts.push(async function* (signal, params) {
    const aborted = new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    ClaudeEngineFixture.state.heldRead.plan = { file: path.join(data, "claude-code", hash(chat.id)), entered, release }
    // SDK may return while a store RPC is still pending; engine must retain that callback.
    void params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "held-receipt", parentUuid: null, message: { role: "user", content: params.prompt } },
    ]).catch(() => {})
    await Effect.runPromiseWith(context)(Deferred.await(entered))
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "pending-receipt-answer", message: { id: "pending-api", content: [{ type: "text", text: "not a delivery receipt" }], usage: {} } }
    await Effect.runPromiseWith(context)(Deferred.succeed(mirrored, undefined))
    await aborted
    await Effect.runPromiseWith(context)(Deferred.succeed(returned, undefined))
  })
  const worker = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("held callback") }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* Deferred.await(mirrored)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ delivered: [] })
  const stop = yield* prompt.cancel(chat.id).pipe(Effect.andThen(Deferred.succeed(stopped, undefined)), Effect.forkChild)
  yield* Deferred.await(returned)
  yield* Effect.yieldNow
  expect(yield* Deferred.isDone(stopped)).toBe(false)
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(stop)
  yield* Fiber.await(worker)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ delivered: [] })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
}), 60_000)

ClaudeEngineFixture.it.instance("assistant frames without an exact durable receipt cannot hand off host input", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    await params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "unrelated-input", message: { role: "user", content: "not the admitted host prompt" }, parentUuid: null },
    ])
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "unreceipted-answer", message: { id: "unreceipted-api", content: [{ type: "text", text: "partial" }], usage: {} } }
    throw new Error("crash before exact native receipt")
  }, ClaudeEngineFixture.reply("retried", "retry-api"))
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("original input") })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ delivered: [] })
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("retry input") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(2)
  expect(ClaudeEngineFixture.state.queries[1].prompt).toBe("original input\n\nretry input")
}), 60_000)

ClaudeEngineFixture.it.instance("successful assistant without exact native receipt leaves original input pending on followup", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    await params.options?.sessionStore?.append({ projectKey: params.options.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "unrelated-success-input", parentUuid: null, message: { role: "user", content: "unrelated native input" } },
    ])
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "unreceipted-success", message: { id: "unreceipted-success-api",
      content: [{ type: "text", text: "successful but unreceipted" }], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...ClaudeEngineFixture.frame }
  }, ClaudeEngineFixture.reply("followup done", "receipted-followup"))
  const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("original input") })
  expect(first.info.role === "assistant" && first.info.finish).toBe("stop")
  const before = (yield* sessions.get(chat.id)).metadata?.claudeCode
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("followup input") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(2)
  expect(ClaudeEngineFixture.state.queries[1].prompt).toBe("original input\n\nfollowup input")
  expect(before).toMatchObject({ delivered: [] })
}), 60_000)

ClaudeEngineFixture.it.instance("durable receipt survives crash before onDelivery metadata handoff and is never resent", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const context = yield* Effect.context<never>()
  const fs = yield* FSUtil.Service
  const continuity = yield* SessionContinuity.Service
  ClaudeEngineFixture.state.scripts.push(async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    const history = await Effect.runPromiseWith(context)(sessions.messages({ sessionID: chat.id }))
    const ids = history.filter((message) => message.info.role === "user").map((message) => message.info.id)
    const archive = ClaudeCodeStore.create({ sessionID: chat.id, sessions, fs, continuity, userID: ids.at(-1), userIDs: ids,
      run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => false,
      onDelivery: () => Effect.die(new Error("crash between durable receipt and metadata handoff")) })
    await archive.store.append({ projectKey: params.options?.cwd ?? "fixture", sessionId: "sdk-1" }, [
      { type: "user", uuid: "committed-input", message: { role: "user", content: params.prompt }, parentUuid: null },
    ])
  }, ClaudeEngineFixture.reply("next", "after-gap"))
  const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("committed once") })
  expect(first.info.role === "assistant" && first.info.error?.data).toMatchObject({ message: expect.stringContaining("crash between durable receipt") })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ delivered: [] })
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("after crash") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(2)
  expect(ClaudeEngineFixture.state.queries[1].prompt).toBe("after crash")
}), 60_000)

for (const payload of ["prompt", "append"]) {
  ClaudeEngineFixture.it.instance(`huge first ${payload} blocks before query even without SDK overhead snapshot`, () => Effect.gen(function* () {
    ClaudeEngineFixture.state.queries.length = 0
    ClaudeEngineFixture.state.scripts.length = 0
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup(undefined, payload === "append" ? "huge append ".repeat(100_000) : undefined)
    const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(payload === "prompt" ? "huge input ".repeat(100_000) : "tiny input") })
    expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
    expect(ClaudeEngineFixture.state.queries).toHaveLength(0)
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, bounded: false } })
  }), 60_000)
}

ClaudeEngineFixture.it.instance("model change bounds known payload using selected catalog limit before query", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(0))
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("previous model") })
  const models = yield* Effect.gen(function* () {
    const catalog = yield* ModelsDev.Service
    return yield* catalog.get()
  }).pipe(Effect.provide(LayerNode.compile(ModelsDev.node)))
  if (!models.anthropic) throw new Error("Missing Anthropic catalog fixture")
  const selected = Object.values(Provider.fromModelsDevProvider(models.anthropic).models).find((model) =>
    model.id !== "claude-haiku-4-5-20251001" && model.limit.context > 0 && model.limit.output > 0 && hardLimit(model) > 0)
  if (!selected) throw new Error("Missing second bounded Anthropic catalog model")
  expect(hardLimit(selected)).toBeGreaterThan(0)
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("huge changed-model input ".repeat(hardLimit(selected))),
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: selected.id } })
  expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, limit: hardLimit(selected) } })
}), 60_000)

ClaudeEngineFixture.it.instance("first-turn tool schemas count toward admission even when prompt alone fits", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(0, { snapshot: false }))
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("measure selected limit") })
  const state = Schema.decodeUnknownSync(Schema.Struct({ nativeAdmission: Schema.Struct({ limit: Schema.Number }) }))(
    (yield* sessions.get(chat.id)).metadata?.claudeCode)
  const system = ClaudeEngineFixture.state.queries[0].options?.systemPrompt
  if (!system || typeof system === "string" || Array.isArray(system) || system.type !== "preset") throw new Error("Missing preset system options")
  const text = "x".repeat(4 * (state.nativeAdmission.limit - estimate({ append: system.append }) - estimate([]) - 5))
  expect(estimate(text) + estimate({ append: system.append }) + estimate([])).toBeLessThan(state.nativeAdmission.limit)
  const next = yield* sessions.create({ title: "Near-limit first turn", permission: chat.permission })
  const result = yield* prompt.prompt({ sessionID: next.id, ...ClaudeEngineFixture.say(text) })
  expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect((yield* sessions.get(next.id)).metadata?.claudeCode).toMatchObject({ nativeAdmission: { ready: false, bounded: false } })
}), 60_000)

ClaudeEngineFixture.it.instance("legacy sessionId without a complete host archive fails explicitly before query", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("old answered first"), noReply: true })
  const second = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("old answered second"), noReply: true })
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("legacy queued"), noReply: true })
  const answered = (parentID: MessageID) => ({ id: MessageID.ascending(), sessionID: chat.id, parentID, role: "assistant" as const,
    agent: "claude", mode: "claude", modelID: ModelV2.ID.make("claude-haiku-4-5-20251001"), providerID: ProviderV2.ID.make("anthropic"),
    path: { cwd: "/fixture", root: "/fixture" }, cost: 0, finish: "stop", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.now(), completed: Date.now() } })
  yield* sessions.updateMessage(answered(first.info.id))
  yield* sessions.updateMessage(answered(second.info.id))
  yield* sessions.setMetadata({ sessionID: chat.id, metadata: { claudeCode: { sessionId: "sdk-1", cost: 0 } } })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("new followup") })
  expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message:
    "Claude Code native archive unavailable; legacy SDK resume is blocked until a complete native archive is imported." })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(0)
  const context = yield* Effect.context<never>()
  const archive = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity: yield* SessionContinuity.Service, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => false })
  expect((yield* archive.read).keys).toHaveLength(0)
}), 120_000)
