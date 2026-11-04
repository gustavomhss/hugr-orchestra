import { describe, expect, test } from "bun:test"
import type { ClientEvent } from "@/session-types"
import type { SessionMessageInfo } from "@/session-types"

import { createV2SessionReducer, projectionTargets } from "./server-session-v2-reducer"
import { sessionStream } from "./server-session-stream.fixture"

const event = (input: object) => input as ClientEvent
const base = { created: 1, location: { directory: "/repo" }, durable: { aggregateID: "ses_1", seq: 1, version: 1 } }

describe("v2 session reducer", () => {
  test("projects promoted input and streaming assistant content", () => {
    const reducer = createV2SessionReducer()
    let messages: SessionMessageInfo[] = []
    const apply = (input: object) => {
      const result = reducer.reduce(messages, event(input))
      if (result) messages = result.messages
      return result
    }

    apply({
      ...base,
      id: "evt_admitted",
      type: "session.input.admitted",
      data: {
        sessionID: "ses_1",
        inputID: "msg_user",
        input: { type: "user", delivery: "steer", data: { text: "hello" } },
      },
    })
    apply({
      ...base,
      id: "evt_promoted",
      type: "session.input.promoted",
      data: { sessionID: "ses_1", inputID: "msg_user" },
    })
    apply({
      ...base,
      id: "evt_step",
      type: "session.step.started",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
      },
    })
    apply({
      ...base,
      id: "evt_text_start",
      type: "session.text.started",
      data: { sessionID: "ses_1", assistantMessageID: "msg_assistant", ordinal: 0 },
    })
    apply({
      ...base,
      id: "evt_text_delta",
      type: "session.text.delta",
      data: { sessionID: "ses_1", assistantMessageID: "msg_assistant", ordinal: 0, delta: "hel" },
    })
    apply({
      ...base,
      id: "evt_text_end",
      type: "session.text.ended",
      data: { sessionID: "ses_1", assistantMessageID: "msg_assistant", ordinal: 0, text: "hello" },
    })

    expect(messages[0]).toMatchObject({ id: "msg_user", type: "user", text: "hello" })
    expect(messages[1]).toMatchObject({
      id: "msg_assistant",
      type: "assistant",
      content: [{ type: "text", text: "hello" }],
    })
  })

  test("folds tool, retry, and completion events", () => {
    const reducer = createV2SessionReducer()
    let messages: SessionMessageInfo[] = []
    const apply = (input: object) => {
      const result = reducer.reduce(messages, event(input))
      if (result) messages = result.messages
    }

    apply({
      ...base,
      id: "evt_step",
      type: "session.step.started",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
      },
    })
    apply({
      ...base,
      id: "evt_tool_start",
      type: "session.tool.input.started",
      data: { sessionID: "ses_1", assistantMessageID: "msg_assistant", callID: "call_1", name: "bash" },
    })
    apply({
      ...base,
      id: "evt_tool_delta",
      type: "session.tool.input.delta",
      data: { sessionID: "ses_1", assistantMessageID: "msg_assistant", callID: "call_1", delta: "{}" },
    })
    apply({
      ...base,
      id: "evt_tool_called",
      type: "session.tool.called",
      data: { sessionID: "ses_1", assistantMessageID: "msg_assistant", callID: "call_1", input: {}, executed: true },
    })
    apply({
      ...base,
      id: "evt_tool_success",
      type: "session.tool.success",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_assistant",
        callID: "call_1",
        metadata: {},
        content: [{ type: "text", text: "done" }],
        executed: true,
      },
    })
    apply({
      ...base,
      id: "evt_retry",
      type: "session.retry.scheduled",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_assistant",
        attempt: 2,
        at: 10,
        error: { type: "ProviderError", message: "retry" },
      },
    })
    apply({
      ...base,
      id: "evt_done",
      type: "session.step.ended",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_assistant",
        finish: "stop",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    })

    expect(messages[0]).toMatchObject({
      type: "assistant",
      retry: undefined,
      content: [{ type: "tool", id: "call_1", state: { status: "completed", content: [{ text: "done" }] } }],
    })
  })

  test("requests hydration when promotion admission was missed", () => {
    const result = createV2SessionReducer().reduce(
      [],
      event({
        ...base,
        id: "evt_promoted",
        type: "session.input.promoted",
        data: { sessionID: "ses_1", inputID: "msg_user" },
      }),
    )

    expect(result).toMatchObject({ sessionID: "ses_1", missing: "msg_user", touched: [] })
  })
})

describe("v2 session reducer touched contract", () => {
  test("hands back every untouched message as the same object and lists what changed", () => {
    const reducer = createV2SessionReducer()
    let messages: SessionMessageInfo[] = []
    sessionStream("ses_1").events.forEach((input) => {
      const result = reducer.reduce(messages, input)
      if (!result) return
      const before = messages
      messages = result.messages
      expect(messages.length).toBeGreaterThanOrEqual(before.length)
      expect(messages.length).toBeLessThanOrEqual(before.length + 1)
      messages.forEach((message, index) => {
        if (result.touched.includes(message.id)) return
        // Untouched means the same object at the same place, or the projection would skip a real change.
        expect(message).toBe(before[index]!)
      })
      messages.slice(before.length).forEach((message) => expect(result.touched).toContain(message.id))
    })
    expect(messages.map((message) => message.id)).toEqual(
      expect.arrayContaining(["msg_1_user", "msg_2_assistant", "msg_5_assistant"]),
    )
  })

  test("projects a reply together with the turn it answers", () => {
    const messages = [
      { id: "msg_1", type: "user" },
      { id: "msg_2", type: "assistant" },
      { id: "msg_3", type: "user" },
      { id: "msg_4", type: "assistant" },
    ] as unknown as SessionMessageInfo[]
    expect(projectionTargets(messages, ["msg_4"])).toEqual(new Set(["msg_4", "msg_3"]))
    expect(projectionTargets(messages, ["msg_2"])).toEqual(new Set(["msg_2", "msg_1"]))
    expect(projectionTargets(messages, ["msg_3"])).toEqual(new Set(["msg_3"]))
  })

  test("adds the reply row of a shell or compaction and stops at a shell", () => {
    const messages = [
      { id: "msg_1", type: "user" },
      { id: "msg_2", type: "shell" },
      { id: "msg_3", type: "assistant" },
      { id: "msg_4", type: "synthetic", description: "Reminder" },
      { id: "msg_5", type: "assistant" },
      { id: "msg_6", type: "synthetic", description: " " },
      { id: "msg_7", type: "compaction" },
      { id: "msg_8", type: "assistant" },
    ] as unknown as SessionMessageInfo[]
    expect(projectionTargets(messages, ["msg_2"])).toEqual(new Set(["msg_2", "msg_2:assistant"]))
    expect(projectionTargets(messages, ["msg_3"])).toEqual(new Set(["msg_3"]))
    expect(projectionTargets(messages, ["msg_5"])).toEqual(new Set(["msg_5", "msg_4"]))
    expect(projectionTargets(messages, ["msg_7"])).toEqual(new Set(["msg_7", "msg_7:assistant"]))
    expect(projectionTargets(messages, ["msg_8"])).toEqual(new Set(["msg_8", "msg_7"]))
    expect(projectionTargets(messages, ["missing"])).toEqual(new Set(["missing"]))
  })
})
