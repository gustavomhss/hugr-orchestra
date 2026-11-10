import { expect, test } from "bun:test"
import type { ClientEvent, SessionMessageInfo } from "@/session-types"
import type { Part, Session } from "@/v2-wire"
import type { ServerApi } from "@/utils/server"
import { sessionMessagePartID } from "@/utils/session-message"
import { createServerSession } from "./server-session"

type TextPart = Extract<Part, { type: "text" }>

const session = (id: string): Session => ({
  id,
  slug: id,
  projectID: "project",
  directory: "/repo",
  title: id,
  version: "1",
  time: { created: 1, updated: 1 },
})

const v2User = (id: string, created = 1, text = "text"): SessionMessageInfo => ({
  id,
  type: "user",
  text,
  time: { created },
})

const textPart = (messageID: string, input: Partial<TextPart> = {}): TextPart => ({
  id: sessionMessagePartID(messageID, "text", 0),
  sessionID: "ses_child",
  messageID,
  type: "text",
  text: "text",
  ...input,
})

function setup() {
  const sessionApi = {
    get: async () => {
      throw new Error("session get called")
    },
    message: async () => {
      throw new Error("single message endpoint called")
    },
  } as unknown as Pick<ServerApi["session"], "get" | "message">
  const messageApi = {
    list: async () => ({ data: [], cursor: {} }),
  } as unknown as ServerApi["message"]
  return { store: createServerSession(sessionApi, messageApi, { todo: async () => [] }) }
}

test("does not revive an evicted idle unpinned transcript", () => {
  const ctx = setup()
  const idle = "ses_idle"
  ctx.store.remember(session(idle))
  ctx.store.set("session_message", idle, [v2User("msg_old", 1, "gone")])
  ctx.store.set("part", "msg_old", [textPart("msg_old", { sessionID: idle, text: "gone" })])
  ctx.store.evict(idle)
  expect(ctx.store.data.session_message[idle]).toBeUndefined()
  expect(ctx.store.data.part.msg_old).toBeUndefined()

  const later = (sessionID: string) =>
    ({
      id: `evt_later_${sessionID}`,
      created: 2,
      type: "session.synthetic",
      durable: { aggregateID: sessionID, seq: 1, version: 1 },
      location: { directory: "/repo" },
      data: { sessionID, text: "later", description: "later" },
    }) as unknown as ClientEvent

  ctx.store.applyV2(later(idle))

  expect(ctx.store.data.session_message[idle]).toBeUndefined()
  expect(ctx.store.data.part[`msg_later_${idle}`]).toBeUndefined()
  expect(ctx.store.data.message[idle]).toBeUndefined()

  ctx.store.applyV2({
    id: "evt_retry_idle",
    created: 3,
    type: "session.retry.scheduled",
    durable: { aggregateID: idle, seq: 2, version: 1 },
    location: { directory: "/repo" },
    data: {
      sessionID: idle,
      assistantMessageID: "msg_assistant",
      attempt: 1,
      at: 5,
      error: { type: "unknown", message: "again" },
    },
  } as unknown as ClientEvent)
  expect(ctx.store.data.session_status[idle]).toEqual({
    type: "retry",
    attempt: 1,
    message: "again",
    next: 5,
  })
  expect(ctx.store.data.session_message[idle]).toBeUndefined()

  ctx.store.applyV2({
    id: "evt_moved_idle",
    created: 4,
    type: "session.moved",
    durable: { aggregateID: idle, seq: 3, version: 1 },
    location: { directory: "/repo" },
    data: { sessionID: idle, location: { directory: "/elsewhere" }, subpath: "child" },
  } as unknown as ClientEvent)
  expect(ctx.store.get(idle)?.directory).toBe("/elsewhere")
  expect(ctx.store.data.session_message[idle]).toBeUndefined()

  const pinned = "ses_pinned"
  ctx.store.remember(session(pinned))
  ctx.store.evict(pinned)
  ctx.store.pin(pinned)
  ctx.store.applyV2(later(pinned))
  expect(ctx.store.data.session_message[pinned]?.map((message) => message.id)).toEqual([`msg_later_${pinned}`])
  expect(ctx.store.data.part[`msg_later_${pinned}`]).toMatchObject([{ type: "text", text: "later" }])

  const busy = "ses_busy"
  ctx.store.remember(session(busy))
  ctx.store.evict(busy)
  ctx.store.set("session_status", busy, { type: "busy" })
  ctx.store.applyV2(later(busy))
  expect(ctx.store.data.session_message[busy]?.map((message) => message.id)).toEqual([`msg_later_${busy}`])
  expect(ctx.store.data.part[`msg_later_${busy}`]).toMatchObject([{ type: "text", text: "later" }])

  const loaded = "ses_loaded"
  ctx.store.remember(session(loaded))
  ctx.store.evict(loaded)
  ctx.store.set("session_message", loaded, [v2User("msg_kept", 1, "kept")])
  ctx.store.applyV2(later(loaded))
  expect(ctx.store.data.session_message[loaded]?.map((message) => message.id)).toContain(`msg_later_${loaded}`)

  const started = "ses_started"
  ctx.store.remember(session(started))
  ctx.store.evict(started)
  expect(ctx.store.data.session_message[started]).toBeUndefined()
  ctx.store.applyV2({
    id: "evt_step_started",
    created: 5,
    type: "session.step.started",
    durable: { aggregateID: started, seq: 1, version: 1 },
    location: { directory: "/repo" },
    data: {
      sessionID: started,
      assistantMessageID: "msg_assistant",
      agent: "build",
      model: { id: "model", providerID: "provider" },
    },
  } as unknown as ClientEvent)
  expect(ctx.store.data.session_message[started]?.map((message) => message.id)).toEqual(["msg_assistant"])
  expect(ctx.store.data.session_status[started]).toEqual({ type: "busy" })
})
