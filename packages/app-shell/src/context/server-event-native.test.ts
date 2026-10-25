import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@/session-types"


import { SessionEvent } from "@orchestra/schema/session-event"
import { Schema } from "effect"
import { createNativeEventAdapter, executionStatus, sessionUsage } from "./server-event-native"
import { createV2SessionReducer } from "./server-session-v2-reducer"

const location = { directory: "/repo" }
const at = (timestamp: number) => ({ timestamp, sessionID: "ses_1" })
const model = { id: "claude-opus", providerID: "anthropic" }

// Wire payloads as `orchestra serve` streams them on /api/event; each one is checked against the V2 schema.
const stream = [
  {
    id: "evt_1",
    type: "session.next.prompt.admitted",
    location,
    data: { ...at(1), messageID: "msg_user", prompt: { text: "hello" }, delivery: "steer" },
  },
  {
    id: "evt_2",
    type: "session.next.prompted",
    location,
    data: { ...at(2), messageID: "msg_user", prompt: { text: "hello" }, delivery: "steer" },
  },
  {
    id: "evt_3",
    type: "session.next.step.started",
    location,
    data: { ...at(3), assistantMessageID: "msg_reply", agent: "maestro", model },
  },
  {
    id: "evt_4",
    type: "session.next.text.started",
    location,
    data: { ...at(4), assistantMessageID: "msg_reply", textID: "txt_a" },
  },
  {
    id: "evt_5",
    type: "session.next.text.delta",
    location,
    data: { ...at(5), assistantMessageID: "msg_reply", textID: "txt_a", delta: "hel" },
  },
  {
    id: "evt_6",
    type: "session.next.text.delta",
    location,
    data: { ...at(6), assistantMessageID: "msg_reply", textID: "txt_a", delta: "lo" },
  },
  {
    id: "evt_7",
    type: "session.next.text.started",
    location,
    data: { ...at(7), assistantMessageID: "msg_reply", textID: "txt_b" },
  },
  {
    id: "evt_8",
    type: "session.next.text.ended",
    location,
    data: { ...at(8), assistantMessageID: "msg_reply", textID: "txt_b", text: "world" },
  },
  {
    id: "evt_9",
    type: "session.next.step.ended",
    location,
    data: {
      ...at(9),
      assistantMessageID: "msg_reply",
      finish: "stop",
      cost: 0.01,
      tokens: { input: 3, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  },
]

describe("createNativeEventAdapter", () => {
  test("streams a V2 prompt and reply into the timeline reducer", () => {
    stream.forEach((event) => Schema.decodeUnknownSync(SessionEvent.All)(event))
    const adapt = createNativeEventAdapter()
    const reducer = createV2SessionReducer()
    const adapted = stream.map((event) => adapt(event))
    const messages = adapted.reduce<SessionMessageInfo[]>(
      (source, event) => (event ? (reducer.reduce(source, event)?.messages ?? source) : source),
      [],
    )

    expect(adapted.map((event) => event?.type)).toEqual([
      "session.input.admitted",
      "session.input.promoted",
      "session.step.started",
      "session.text.started",
      "session.text.delta",
      "session.text.delta",
      "session.text.started",
      "session.text.ended",
      "session.step.ended",
    ])
    // Busy from the first step, idle once the step settles without tool calls.
    expect(adapted.map((event) => event && executionStatus(event))).toEqual([
      undefined, undefined, "busy", undefined, undefined, undefined, undefined, undefined, "idle",
    ])
    expect(adapted[2]).toMatchObject({ created: 3, location, data: { sessionID: "ses_1" } })
    expect(messages).toMatchObject([
      { id: "msg_user", type: "user", text: "hello" },
      {
        id: "msg_reply",
        type: "assistant",
        agent: "maestro",
        finish: "stop",
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: "world" },
        ],
        time: { created: 3, completed: 9 },
      },
    ])
  })

  test("keeps the provider state of a V2 reasoning part", () => {
    const providerMetadata = { anthropic: { signature: "sig" } }
    const ended = {
      id: "evt_r",
      type: "session.next.reasoning.ended",
      location,
      data: { ...at(1), assistantMessageID: "msg_reply", reasoningID: "rsn_a", text: "thinking", providerMetadata },
    }
    Schema.decodeUnknownSync(SessionEvent.All)(ended)

    expect(createNativeEventAdapter()(ended)).toMatchObject({
      type: "session.reasoning.ended",
      data: { ordinal: 0, text: "thinking", state: providerMetadata },
    })
  })

  test("adds each settled V2 step's cost and tokens to the session's totals", () => {
    const step = createNativeEventAdapter()(stream[8]!) as unknown as Parameters<typeof sessionUsage>[1]
    const info = { id: "ses_1", cost: 1, tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 2, write: 0 } } }
    const total = sessionUsage(info, step)

    expect(total?.cost).toBeCloseTo(1.01)
    expect(total?.tokens).toEqual({ input: 13, output: 7, reasoning: 1, cache: { read: 2, write: 0 } })
    const fresh: { id: string; cost?: number } = { id: "ses_1" }
    expect(sessionUsage(fresh, step)).toMatchObject({ cost: 0.01, tokens: { input: 3, output: 2 } })
    expect(sessionUsage(info, createNativeEventAdapter()(stream[2]!) as unknown as typeof step)).toBeUndefined()
  })

  test("leaves events without a session.next name to the existing adapter", () => {
    expect(createNativeEventAdapter()({ type: "permission.v2.asked" })).toBeUndefined()
  })
})
