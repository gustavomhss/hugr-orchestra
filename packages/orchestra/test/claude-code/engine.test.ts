import { expect } from "bun:test"
import { Effect } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeEngineFixture } from "./engine-fixture"

ClaudeEngineFixture.it.instance("a Claude Code agent's turn is mirrored and the loop ends on it; the next turn resumes the same session", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.state.queries.length = 0
     const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.reply("first answer", "msg_a"), ClaudeEngineFixture.reply("second answer", "msg_b"))
    const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("hello") })
    expect(first.info.role).toBe("assistant")
    expect((first.info as SessionV1.Assistant).finish).toBe("stop")
    expect(first.parts.some((part) => part.type === "text" && part.text === "first answer")).toBe(true)
    expect(ClaudeEngineFixture.state.queries[0].prompt).toBe("hello")
    expect(ClaudeEngineFixture.state.queries[0].options?.resume).toBeUndefined()
    expect(ClaudeEngineFixture.state.queries[0].options?.settingSources).toEqual([])
    expect(ClaudeEngineFixture.state.queries[0].options?.disallowedTools).toEqual(["Read", "Edit", "Write", "NotebookEdit", "Task"])
    expect(ClaudeEngineFixture.state.queries[0].options?.model).toBe("claude-haiku-4-5-20251001")
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ sessionId: "sdk-1", cost: 0.01 })

    const second = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("again") })
    expect(second.parts.some((part) => part.type === "text" && part.text === "second answer")).toBe(true)
    expect(ClaudeEngineFixture.state.queries).toHaveLength(2)
    expect(ClaudeEngineFixture.state.queries[1].prompt).toBe("again")
    expect(ClaudeEngineFixture.state.queries[1].options?.resume).toBe("sdk-1")
  }), 30_000)

ClaudeEngineFixture.it.instance("a failed turn answers with an error and does not fall back to Orchestra's loop", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.state.queries.length = 0
    const { prompt, chat } = yield* ClaudeEngineFixture.setup()
    ClaudeEngineFixture.state.scripts.push(async function* () { throw new Error("Claude Code is not logged in") })
    const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("hello") })
    const info = result.info as SessionV1.Assistant
    expect(info.finish).toBe("error")
    expect(info.error?.data).toMatchObject({ message: "Claude Code is not logged in" })
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  }), 30_000)

ClaudeEngineFixture.it.instance("SDK mirror_error is an explicit persistence failure and never resumes a dropped native batch", () => Effect.gen(function* () {
  ClaudeEngineFixture.state.queries.length = 0
  ClaudeEngineFixture.state.scripts.length = 0
  const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(async function* () {
    yield { type: "system", subtype: "init", ...ClaudeEngineFixture.frame }
    yield { type: "system", subtype: "mirror_error", error: "claude-code-corrupt-storage", key: { projectKey: "fixture", sessionId: "sdk-1" }, ...ClaudeEngineFixture.frame }
  })
  const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("persist this turn") })
  expect(first.info.role === "assistant" && first.info.error?.data).toMatchObject({ message: "Claude Code native transcript persistence failed; SDK resume is blocked until its archive is repaired." })
  expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ nativeArchiveFailed: true })
  const next = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("do not resume missing native entries") })
  expect(next.info.role === "assistant" && next.info.finish).toBe("error")
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
}), 60_000)
