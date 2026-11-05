import { describe, expect, test } from "bun:test"
import type { ClientEvent } from "@/session-types"
import type { SessionMessageInfo } from "@/session-types"

import { createV2SessionReducer, projectionTargets } from "./server-session-v2-reducer"
import { createNativeEventAdapter } from "./server-event-native"
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

describe("native compaction failure projection", () => {
  const started = (messageID: string) => ({
    ...base,
    id: `evt_start_${messageID}`,
    type: "session.next.compaction.started",
    metadata: { origin: "start" },
    data: { timestamp: 100, sessionID: "ses_1", messageID, reason: "auto" },
  })
  const failed = (messageID: string, reason: "auto" | "manual" = "manual") => ({
    ...base,
    id: `evt_failure_${messageID}`,
    durable: { aggregateID: "ses_1", seq: 7, version: 1 as const },
    type: "session.next.compaction.failed",
    metadata: { origin: "failure" },
    data: {
      timestamp: 200,
      sessionID: "ses_1",
      messageID,
      reason,
      error: { type: "unknown" as const, message: "Compaction failed" },
    },
  })
  const projection = () => {
    const adapt = createNativeEventAdapter()
    const reducer = createV2SessionReducer()
    return <T extends { type: string }>(source: SessionMessageInfo[], input: T) => {
      const translated = adapt(input)
      expect(translated).toBeDefined()
      if (!translated) throw new Error("Native event was not translated")
      const result = reducer.reduce(source, translated)
      expect(result).toBeDefined()
      if (!result) throw new Error("Translated event was not reduced")
      return { translated, result }
    }
  }

  test("retains the durable envelope and settles the exact attempt without losing its metadata or time", () => {
    const apply = projection()
    const running = apply([], started("msg_compaction")).result.messages
    const input = failed("msg_compaction")
    const output = apply(running, input)

    expect(output.translated).toEqual({
      id: input.id,
      type: "session.compaction.failed",
      created: input.data.timestamp,
      metadata: input.metadata,
      location: input.location,
      durable: input.durable,
      data: {
        sessionID: "ses_1",
        messageID: "msg_compaction",
        reason: "manual",
        error: input.data.error,
      },
    })
    expect(output.result.sessionID).toBe("ses_1")
    expect(output.result.touched).toEqual(["msg_compaction"])
    expect(output.result.messages).toEqual([
      {
        id: "msg_compaction",
        type: "compaction",
        status: "failed",
        metadata: running[0]!.metadata,
        reason: "manual",
        error: input.data.error,
        time: { created: 100 },
      },
    ])
    expect(output.result.messages[0]!.metadata).toBe(running[0]!.metadata)
    expect(output.result.messages[0]!.time).toBe(running[0]!.time)
  })

  test("settles only the identified attempt when several attempts are running", () => {
    const apply = projection()
    const first = apply([], started("msg_first")).result.messages
    const running = apply(first, started("msg_latest")).result.messages
    const result = apply(running, failed("msg_first")).result

    expect(result.messages[0]).toMatchObject({ id: "msg_first", status: "failed" })
    expect(result.messages[1]).toBe(running[1]!)
    expect(result.messages[1]).toMatchObject({ id: "msg_latest", status: "running" })
    expect(result.touched).toEqual(["msg_first"])
  })

  test("deduplicates different terminal event IDs for an existing running attempt by message ID", () => {
    const apply = projection()
    const first = apply([], started("msg_compaction")).result.messages
    const running = apply(first, started("msg_other")).result.messages
    const source = apply(running, failed("msg_compaction")).result.messages
    const duplicate = failed("msg_compaction", "auto")
    duplicate.id = "evt_replayed_existing_failure"
    duplicate.data.error.message = "Compaction interrupted"
    const result = apply(source, duplicate).result

    expect(result.messages).toEqual(source)
    expect(result.messages[0]).toBe(source[0]!)
    expect(result.messages[1]).toBe(running[1]!)
    expect(result.messages.filter((message) => message.id === "msg_compaction")).toHaveLength(1)
    expect(result.touched).toEqual([])
  })

  test("appends only one orphan marker across different terminal event IDs without settling another attempt", () => {
    const apply = projection()
    const running = apply([], started("msg_other")).result.messages
    const source = apply(running, failed("msg_orphan")).result.messages
    expect(source).toHaveLength(2)
    expect(source[1]).toMatchObject({ id: "msg_orphan", type: "compaction", status: "failed" })
    const duplicate = failed("msg_orphan", "auto")
    duplicate.id = "evt_replayed_orphan_failure"
    duplicate.data.error.message = "Compaction interrupted"
    const result = apply(source, duplicate).result

    expect(result.messages).toEqual(source)
    expect(result.messages[0]).toBe(running[0]!)
    expect(result.messages[1]).toBe(source[1]!)
    expect(result.messages.filter((message) => message.id === "msg_orphan")).toHaveLength(1)
    expect(result.touched).toEqual([])
  })

  test("does not overwrite a completed attempt or settle a newer running attempt", () => {
    const apply = projection()
    const running = apply([], started("msg_completed")).result.messages
    const completed = apply(running, {
      ...base,
      id: "evt_completed",
      type: "session.next.compaction.ended",
      data: {
        timestamp: 150,
        sessionID: "ses_1",
        messageID: "msg_completed",
        reason: "auto",
        text: "Summary",
        recent: "Recent",
      },
    }).result.messages
    expect(completed[0]).toMatchObject({ id: "msg_completed", status: "completed", summary: "Summary" })
    const source = apply(completed, started("msg_latest")).result.messages
    const result = apply(source, failed("msg_completed")).result

    expect(result.messages).toEqual(source)
    expect(result.messages[0]).toBe(source[0]!)
    expect(result.messages[1]).toBe(source[1]!)
    expect(result.touched).toEqual([])
  })

  test("appends a failed marker with native identity when its start was missed", () => {
    const apply = projection()
    const running = apply([], started("msg_unrelated")).result.messages
    const input = failed("msg_missing", "auto")
    const result = apply(running, input).result

    expect(result.messages).toEqual([
      running[0]!,
      {
        id: "msg_missing",
        type: "compaction",
        status: "failed",
        metadata: input.metadata,
        reason: "auto",
        error: input.data.error,
        time: { created: 200 },
      },
    ])
    expect(result.messages[0]).toBe(running[0]!)
    expect(result.touched).toEqual(["msg_missing"])
  })

  test("never replaces a non-compaction message that owns the same ID", () => {
    const apply = projection()
    const source: SessionMessageInfo[] = [{ id: "msg_user", type: "user", text: "Hello", time: { created: 50 } }]
    const result = apply(source, failed("msg_user")).result

    expect(result.messages).toEqual(source)
    expect(result.messages[0]).toBe(source[0]!)
    expect(result.touched).toEqual([])
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
