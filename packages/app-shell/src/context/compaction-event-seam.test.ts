import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { EventManifest } from "@orchestra/schema/event-manifest"
import { SessionEvent } from "@orchestra/schema/session-event"
import { createNativeEventAdapter } from "./server-event-native"
import { createV2SessionReducer } from "./server-session-v2-reducer"

const encode = Schema.encodeSync(Schema.Union(EventManifest.Definitions, { mode: "oneOf" }))

describe("canonical compaction event seam", () => {
  test("preserves the public failure envelope and deduplicates an orphan by attempt ID", () => {
    const wire = encode(failed())
    if (wire.type !== SessionEvent.Compaction.Failed.type) throw new Error("Expected canonical failure wire")
    expect(wire.data.timestamp).toBe(20)
    expect(typeof wire.data.timestamp).toBe("number")

    const translated = translatedDefined(wire)
    expect(translated).toEqual({
      id: "evt_failed",
      type: "session.compaction.failed",
      created: 20,
      durable: { aggregateID: "ses_seam", seq: 2, version: 1 },
      location: { directory: "/project" },
      metadata: { origin: "canonical" },
      data: {
        sessionID: "ses_seam",
        messageID: "msg_first",
        reason: "manual",
        error: { type: "unknown", message: "Compaction interrupted" },
      },
    })

    const reducer = createV2SessionReducer()
    const first = reductionDefined(reducer.reduce([], translated))
    expect(first).toEqual({
      sessionID: "ses_seam",
      messages: [{
        id: "msg_first",
        type: "compaction",
        status: "failed",
        metadata: { origin: "canonical" },
        reason: "manual",
        error: { type: "unknown", message: "Compaction interrupted" },
        time: { created: 20 },
      }],
      touched: ["msg_first"],
    })
    expect(first.messages[0]).not.toHaveProperty("summary")
    expect(first.messages[0]).not.toHaveProperty("recent")

    const duplicate = translatedDefined(encode(failed("evt_duplicate")))
    expect(duplicate.id).not.toBe(translated.id)
    const replay = reductionDefined(reducer.reduce(first.messages, duplicate))
    expect(replay.messages).toEqual(first.messages)
    expect(replay.messages).toHaveLength(1)
    expect(replay.messages[0]).toBe(first.messages[0])
    expect(replay.touched).toEqual([])
  })

  test("settles only the failed attempt while a newer attempt remains identical", () => {
    const reducer = createV2SessionReducer()
    const first = reductionDefined(reducer.reduce([], started("msg_first", 10)))
    const second = reductionDefined(reducer.reduce(first.messages, started("msg_second", 11)))
    const before = structuredClone(second.messages)
    const original = second.messages[0]
    if (!original) throw new Error("Expected first running compaction")
    expect(original).toMatchObject({ id: "msg_first", status: "running", time: { created: 10 } })
    const newer = second.messages[1]
    expect(newer).toMatchObject({ id: "msg_second", status: "running", time: { created: 11 } })

    const settled = reductionDefined(reducer.reduce(second.messages, translatedDefined(encode(failed()))))
    expect(settled.messages).toHaveLength(2)
    expect(settled.touched).toEqual(["msg_first"])
    expect(settled.messages[0]).toEqual({
      id: "msg_first",
      type: "compaction",
      status: "failed",
      metadata: { origin: "started-msg_first" },
      reason: "manual",
      error: { type: "unknown", message: "Compaction interrupted" },
      time: { created: 10 },
    })
    expect(settled.messages[0]?.metadata).toBe(original.metadata)
    expect(settled.messages[0]?.time).toBe(original.time)
    expect(settled.messages[1]).toBe(newer)
    expect(settled.messages[1]).toEqual(before[1])
    expect(settled.messages[1]).toMatchObject({ id: "msg_second", status: "running" })
  })

  test("ignores a late failure for a completed attempt without touching a newer running attempt", () => {
    const reducer = createV2SessionReducer()
    const first = reductionDefined(reducer.reduce([], started("msg_first", 10)))
    const completed = reductionDefined(reducer.reduce(first.messages, ended()))
    expect(completed.messages[0]).toMatchObject({
      id: "msg_first", status: "completed", summary: "Compacted summary", recent: "Recent context",
    })
    const second = reductionDefined(reducer.reduce(completed.messages, started("msg_second", 11)))
    const before = structuredClone(second.messages)

    const late = reductionDefined(reducer.reduce(second.messages, translatedDefined(encode(failed()))))
    expect(late.messages).toEqual(before)
    expect(second.messages).toEqual(before)
    expect(late.messages[0]).toBe(second.messages[0])
    expect(late.messages[1]).toBe(second.messages[1])
    expect(late.messages[1]).toMatchObject({ id: "msg_second", status: "running", time: { created: 11 } })
    expect(late.touched).toEqual([])
  })
})

function failed(id = "evt_failed") {
  return Schema.decodeUnknownSync(SessionEvent.Compaction.Failed)({
    id,
    type: SessionEvent.Compaction.Failed.type,
    durable: { aggregateID: "ses_seam", seq: 2, version: 1 },
    location: { directory: "/project" },
    metadata: { origin: "canonical" },
    data: {
      timestamp: 20,
      sessionID: "ses_seam",
      messageID: "msg_first",
      reason: "manual",
      error: { type: "unknown", message: "Compaction interrupted" },
    },
  })
}

function started(messageID: string, timestamp: number) {
  return translatedDefined(encode(Schema.decodeUnknownSync(SessionEvent.Compaction.Started)({
    id: `evt_started_${messageID}`,
    type: SessionEvent.Compaction.Started.type,
    durable: { aggregateID: "ses_seam", seq: timestamp, version: 1 },
    location: { directory: "/project" },
    metadata: { origin: `started-${messageID}` },
    data: { timestamp, sessionID: "ses_seam", messageID, reason: "manual" },
  })))
}

function ended() {
  return translatedDefined(encode(Schema.decodeUnknownSync(SessionEvent.Compaction.Ended)({
    id: "evt_ended_first",
    type: SessionEvent.Compaction.Ended.type,
    durable: { aggregateID: "ses_seam", seq: 12, version: 1 },
    location: { directory: "/project" },
    metadata: { origin: "ended" },
    data: {
      timestamp: 10.5,
      sessionID: "ses_seam",
      messageID: "msg_first",
      reason: "manual",
      text: "Compacted summary",
      recent: "Recent context",
    },
  })))
}

function translatedDefined(wire: Parameters<ReturnType<typeof createNativeEventAdapter>>[0]) {
  const translated = createNativeEventAdapter()(wire)
  expect(translated).toBeDefined()
  if (!translated) throw new Error(`translatedDefined: ${wire.type}`)
  return translated
}

function reductionDefined(reduction: ReturnType<ReturnType<typeof createV2SessionReducer>["reduce"]>) {
  expect(reduction).toBeDefined()
  if (!reduction) throw new Error("Expected a session reduction")
  return reduction
}
