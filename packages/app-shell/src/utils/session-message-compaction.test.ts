import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "../compat/vendored-client-promise"
import { normalizeSessionMessages } from "./session-message"

// Kept apart from session-message.test.ts, which loads the Solid server SDK the plain test runner cannot resolve.
describe("normalizeSessionMessages compaction", () => {
  const user = { id: "msg_1", type: "user", text: "hello", time: { created: 1 } } satisfies SessionMessageInfo
  const assistant = {
    id: "msg_2",
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content: [{ type: "text", text: "hi" }],
    time: { created: 2 },
  } satisfies SessionMessageInfo

  test("makes a manual compaction its own turn with the summary as the reply", () => {
    const result = normalizeSessionMessages("ses_1", [
      user,
      assistant,
      { id: "msg_3", type: "compaction", status: "completed", reason: "manual", summary: "sum", recent: "", time: { created: 3 } },
    ])

    expect(result.messages.map((message) => [message.id, message.role])).toEqual([
      ["msg_1", "user"],
      ["msg_2", "assistant"],
      ["msg_3", "user"],
      ["msg_3:assistant", "assistant"],
    ])
    expect(result.messages[3]).toMatchObject({ parentID: "msg_3", summary: true, agent: "build" })
    expect(result.parts.get("msg_1")?.map((part) => part.type)).toEqual(["text"])
    expect(result.parts.get("msg_3")).toMatchObject([{ id: "msg_3:compaction", type: "compaction", auto: false }])
    expect(result.parts.get("msg_3:assistant")).toMatchObject([{ type: "text", text: "sum" }])
  })

  test("continues the compaction turn with the work after an automatic compaction", () => {
    const result = normalizeSessionMessages("ses_1", [
      user,
      { id: "msg_3", type: "compaction", status: "completed", reason: "auto", summary: "sum", recent: "", time: { created: 3 } },
      { ...assistant, id: "msg_4", time: { created: 4 } },
    ])

    expect(result.messages.find((message) => message.id === "msg_4")).toMatchObject({ parentID: "msg_3" })
    expect(result.parts.get("msg_3")).toMatchObject([{ type: "compaction", auto: true }])
  })

  test("shows a running compaction as a divider before its summary arrives, and drops a failed one", () => {
    const running = normalizeSessionMessages("ses_1", [
      user,
      { id: "msg_3", type: "compaction", status: "running", reason: "manual", summary: "", recent: "", time: { created: 3 } },
    ])
    expect(running.parts.get("msg_3")).toMatchObject([{ type: "compaction" }])
    expect(running.parts.get("msg_3:assistant")).toEqual([])
    expect(running.messages.find((message) => message.id === "msg_3:assistant")?.time).toEqual({ created: 3 })

    const failed = normalizeSessionMessages("ses_1", [
      user,
      {
        id: "msg_3",
        type: "compaction",
        status: "failed",
        reason: "manual",
        error: { type: "unknown", message: "no" },
        time: { created: 3 },
      },
    ])
    expect(failed.messages.map((message) => message.id)).toEqual(["msg_1"])
  })
})
