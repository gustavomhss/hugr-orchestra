import { expect } from "bun:test"
import { Effect } from "effect"
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { ClaudeCode } from "@/claude-code/engine"
import { ClaudeCodeStore } from "@/claude-code/store"
import { FSUtil } from "@orchestra/core/fs-util"
import { ClaudeEngineFixture } from "./engine-fixture"

// Claude mode's continuity is Claude Code's own auto-compaction (specs/claude-code-engine.md, "Continuity"). Orchestra
// sends no settings override, makes no side model call and swaps no prepared view into Claude Code's resume.

ClaudeEngineFixture.it.instance("Claude mode keeps native compaction: no settings override, no maintenance query, the native view resumes", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    const jobs = yield* BackgroundJob.Service
    const loaded: SessionStoreEntry[][] = []
    // The last turn reports a context well past Orchestra's own maintenance trigger.
    for (let index = 0; index < 6; index++) {
      ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50, loaded }))
      const reply = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`prompt-${index} ` + "source context ".repeat(120)) })
      expect(reply.info.role === "assistant" && reply.info.error).toBeUndefined()
    }
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(6, { loaded }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("continue") })
    expect(ClaudeEngineFixture.state.queries).toHaveLength(7)
    expect(ClaudeEngineFixture.state.queries.every((query) => query.options?.settings === undefined)).toBe(true)
    expect(ClaudeEngineFixture.state.producers).toBe(0)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    expect((yield* jobs.list()).filter((job) => job.metadata?.sessionId === chat.id)).toEqual([])
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ contextWindow: 20_000, maxOutputTokens: 2_000,
      version: "2.1.289", continuityPaused: ClaudeCode.NATIVE_COMPACTION })
    // The resume is Claude Code's own transcript, from the first turn on; no Orchestra summary replaces it.
    const view = loaded.at(-1)!
    expect(view[0].subtype).not.toBe("compact_boundary")
    expect(view.some((entry) => entry.uuid === "user-0")).toBe(true)
    expect(view.some((entry) => entry.uuid === "assistant-5")).toBe(true)
  }), 120_000)

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
    model: "claude-haiku-4-5-20251001", continuityPaused: ClaudeCode.NATIVE_COMPACTION })
  expect(ClaudeEngineFixture.state.producers).toBe(0)
}), 60_000)

ClaudeEngineFixture.it.instance("unknown deferred carrier resumes from the authoritative native transcript", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  for (let index = 0; index < 6; index++) {
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`carrier-boundary-${index} ` + "span text ".repeat(120)) })
  }
  const context = yield* Effect.context<never>()
  const continuity = yield* SessionContinuity.Service
  const native = ClaudeCodeStore.create({ sessionID: chat.id, sessions, continuity, fs: yield* FSUtil.Service,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => false })
  const key = (yield* native.read).keys[0].key
  yield* Effect.promise(() => native.store.append(key, [{ version: "2.1.289", sessionId: key.sessionId, isSidechain: false,
    type: "attachment", uuid: "unknown-carrier", parentUuid: "assistant-5", attachment: { type: "deferred_tools_record", entries: "new-version-shape" } }]))
  ClaudeEngineFixture.state.scripts.push(async function* (signal, params) {
    expect(params.options?.settings).toBeUndefined()
    const loaded = await params.options?.sessionStore?.load(key)
    expect(loaded?.some((entry) => entry.uuid === "unknown-carrier")).toBe(true)
    yield* ClaudeEngineFixture.nativeReply(6)(signal, params)
  })
  const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("continue with native fallback") })
  expect(result.info.role === "assistant" && result.info.finish).toBe("stop")
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).not.toMatchObject({ nativeArchiveFailed: true })
  expect(ClaudeEngineFixture.state.producers).toBe(0)
}), 120_000)

ClaudeEngineFixture.it.instance("a known SDK limit still rejects a huge next prompt before spawn", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(0, { usage: 50, snapshot: false }), ClaudeEngineFixture.nativeReply(1, { usage: 50, snapshot: false }))
  yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("small previous prompt") })
  const rejected = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("huge next prompt ".repeat(30_000)) })
  expect(rejected.info.role === "assistant" && rejected.info.error?.data).toMatchObject({ message: expect.stringContaining("native admission blocked before spawn") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect(ClaudeEngineFixture.state.queries[0].options?.settings).toBeUndefined()
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ continuityPaused: ClaudeCode.NATIVE_COMPACTION,
    nativeAdmission: { bounded: false } })
  expect(ClaudeEngineFixture.state.producers).toBe(0)
}), 120_000)
