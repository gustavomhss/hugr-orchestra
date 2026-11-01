import { describe, expect, test } from "bun:test"
import { DateTime } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionMessage } from "@orchestra/core/session/message"
import { TaskTool } from "@orchestra/core/tool/task"

const created = DateTime.makeUnsafe(0)
const promptID = SessionMessage.ID.make("msg_prompt")
const prompt = SessionMessage.User.make({ id: promptID, type: "user", text: "work", time: { created } })

const reply = (input: { completed?: boolean; finish?: string; error?: string; content?: SessionMessage.Assistant["content"] }) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make("msg_reply"),
    type: "assistant",
    agent: "worker",
    model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    content: input.content ?? [],
    finish: input.finish,
    error: input.error === undefined ? undefined : { type: "unknown", message: input.error },
    time: { created, completed: input.completed === false ? undefined : created },
  })

describe("TaskTool.unfinishedReason", () => {
  test("names the child's recorded error", () => {
    expect(TaskTool.unfinishedReason([prompt, reply({ error: "provider quota exhausted", finish: "error" })], promptID)).toBe(
      "the child failed: provider quota exhausted",
    )
  })

  test("says an unfinished reply was interrupted or cancelled", () => {
    expect(TaskTool.unfinishedReason([prompt, reply({ completed: false })], promptID)).toContain("interrupted or cancelled")
  })

  test("names a terminal finish reason that is not a completed answer", () => {
    expect(TaskTool.unfinishedReason([prompt, reply({ finish: "content-filter" })], promptID)).toBe(
      `the child's reply ended with finish reason "content-filter"`,
    )
  })

  test("says when the child recorded no reply at all", () => {
    expect(TaskTool.unfinishedReason([prompt], promptID)).toBe("the child recorded no assistant reply to the prompt")
  })

  test("agrees with completedReply: a completed reply is found, anything else has a reason", () => {
    const done = reply({ finish: "stop" })
    expect(TaskTool.completedReply([prompt, done], promptID)).toBe(done)
    const failed = reply({ error: "boom", finish: "error" })
    expect(TaskTool.completedReply([prompt, failed], promptID)).toBeUndefined()
    expect(TaskTool.unfinishedReason([prompt, failed], promptID)).toContain("boom")
  })
})
