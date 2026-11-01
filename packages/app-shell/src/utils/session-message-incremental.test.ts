import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@/session-types"

import { normalizeSessionMessages, sameValue } from "./session-message"

// Kept apart from session-message.test.ts, which loads the Solid server SDK the plain test runner cannot resolve.
describe("normalizeSessionMessages with an id filter", () => {
  const model = { id: "model", providerID: "provider" }
  const assistant = (id: string, created: number, agent: string, text: string) => ({
    id,
    type: "assistant",
    agent,
    model,
    content: [
      { type: "text", text },
      { type: "reasoning", text: "because", time: { created } },
      {
        type: "tool",
        id: `${id}_call`,
        name: "edit",
        time: { created, ran: created, completed: created },
        state: { status: "completed", input: { path: "a.ts" }, metadata: {}, content: [{ type: "text", text: "ok" }] },
      },
    ],
    time: { created },
  })
  const source = [
    { id: "msg_a1", type: "agent-switched", agent: "plan", time: { created: 1 } },
    { id: "msg_m1", type: "model-switched", model, time: { created: 2 } },
    { id: "msg_user", type: "user", text: "hello", time: { created: 3 } },
    assistant("msg_reply", 4, "build", "first"),
    assistant("msg_reply2", 5, "review", "second"),
    { id: "msg_shell", type: "shell", shellID: "sh", command: "ls", status: "completed", exit: 0, time: { created: 6 } },
    assistant("msg_orphan", 7, "build", "no turn to answer"),
    { id: "msg_note", type: "synthetic", text: "note", description: "Reminder", time: { created: 8 } },
    assistant("msg_reply3", 9, "build", "third"),
    { id: "msg_compact", type: "compaction", status: "completed", reason: "auto", summary: "sum", recent: "", time: { created: 10 } },
    assistant("msg_reply4", 11, "build", "fourth"),
    { id: "msg_user2", type: "user", text: "again", time: { created: 12 } },
  ] as unknown as SessionMessageInfo[]
  const full = normalizeSessionMessages("ses_1", source)
  const rowIDs = full.messages.map((message) => message.id)

  const restricted = (ids: string[]) => {
    const only = new Set(ids)
    return {
      messages: full.messages.filter((message) => only.has(message.id)),
      parts: new Map([...full.parts].filter(([id]) => only.has(id))),
    }
  }

  test("builds exactly the requested rows and parts, identical to the full output", () => {
    // Every row alone, which includes the user turns whose agent and model follow a later reply.
    rowIDs.forEach((id) => expect(normalizeSessionMessages("ses_1", source, new Set([id]))).toEqual(restricted([id])))
    const some = ["msg_user", "msg_reply2", "msg_shell:assistant", "msg_compact", "msg_reply4"]
    expect(normalizeSessionMessages("ses_1", source, new Set(some))).toEqual(restricted(some))
    expect(normalizeSessionMessages("ses_1", source, new Set(rowIDs))).toEqual(full)
    expect(normalizeSessionMessages("ses_1", source, new Set())).toEqual({ messages: [], parts: new Map() })
  })

  test("gives a user turn the agent of its last reply even when only the turn is requested", () => {
    const [row] = normalizeSessionMessages("ses_1", source, new Set(["msg_user"])).messages
    expect(row).toMatchObject({ id: "msg_user", role: "user", agent: "review" })
    expect(normalizeSessionMessages("ses_1", source, new Set(["msg_user2"])).messages[0]).toMatchObject({ agent: "build" })
  })

  test("skips replies that have no turn to answer", () => {
    expect(rowIDs).not.toContain("msg_orphan")
    expect(normalizeSessionMessages("ses_1", source, new Set(["msg_orphan"]))).toEqual({
      messages: [],
      parts: new Map(),
    })
  })
})

describe("sameValue", () => {
  test("compares nested values structurally and treats a missing key as undefined", () => {
    expect(sameValue({ a: [1, { b: "x" }], c: undefined }, { a: [1, { b: "x" }] })).toBe(true)
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(true)
    expect(sameValue({ a: [1, 2] }, { a: [1, 2, 3] })).toBe(false)
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameValue({ a: 1 }, { a: 1, b: 0 })).toBe(false)
    expect(sameValue([], {})).toBe(false)
    expect(sameValue(null, {})).toBe(false)
  })
})
