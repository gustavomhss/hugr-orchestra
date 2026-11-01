import { describe, expect, test } from "bun:test"
import type { MessageListOutput } from "@/server-api"
import type { Session } from "@/v2-wire"
import type { ServerApi } from "@/utils/server"
import { compareMessages, normalizeSessionMessages } from "@/utils/session-message"
import { createServerSession, type ServerSession } from "./server-session"
import { sessionStream } from "./server-session-stream.fixture"

const id = "ses_child"

// The old projection normalized the whole session on every event, so the full normalization is the oracle.
function expectFullProjection(store: ServerSession) {
  const full = normalizeSessionMessages(id, store.data.session_message[id] ?? [])
  // Events that touch no message (a selection) leave the list unwritten, as before.
  expect(store.data.message[id] ?? []).toEqual(full.messages.toSorted(compareMessages))
  full.parts.forEach((parts, messageID) => expect(store.data.part[messageID] ?? []).toEqual(parts))
  expect(Object.keys(store.data.part).filter((messageID) => !full.parts.has(messageID))).toEqual([])
}

function seeded() {
  const session: Session = {
    id,
    slug: id,
    projectID: "project",
    directory: "/repo",
    title: id,
    version: "1",
    time: { created: 1, updated: 1 },
  }
  const store = createServerSession(
    { get: async () => session } as unknown as Pick<ServerApi["session"], "get" | "message">,
    { list: async () => ({ data: [], cursor: {} }) satisfies MessageListOutput } as unknown as ServerApi["message"],
    { todo: async () => [] },
  )
  store.remember(session)
  return store
}

describe("incremental projection", () => {
  test("matches the full normalization after every event of a multi-message session", () => {
    const store = seeded()
    const stream = sessionStream(id)
    stream.events.forEach((event) => {
      store.applyV2(event)
      expectFullProjection(store)
    })

    const rows = store.data.message[id]?.map((message) => message.id) ?? []
    // Row order is the oracle's concern (compareMessages); here only the set of rows matters.
    expect(rows.filter((row) => /^msg_\d+_/.test(row)).toSorted()).toEqual([
      "msg_1_user",
      "msg_2_assistant",
      "msg_3_user",
      "msg_4_user",
      "msg_5_assistant",
    ])
    expect(rows.some((row) => row.endsWith(":assistant"))).toBe(true)
    expect(store.data.part.msg_2_assistant?.map((part) => part.type)).toEqual(["reasoning", "text", "tool"])
    expect(store.data.part[stream.last]?.map((part) => part.type)).toEqual(["tool", "text"])
  })

  test("keeps untouched messages and parts identical while a reply streams", () => {
    const store = seeded()
    const stream = sessionStream(id)
    stream.events.slice(0, stream.streamStart + 1).forEach((event) => store.applyV2(event))
    const rows = store.data.message[id] ?? []
    const source = store.data.session_message[id] ?? []
    const before = {
      rows: rows.slice(0, -1),
      source: source.slice(0, -1),
      parts: new Map(rows.slice(0, -1).map((row) => [row.id, store.data.part[row.id]])),
      tool: store.data.part[stream.last]?.[0],
    }

    stream.events.slice(stream.streamStart + 1, -1).forEach((event) => {
      store.applyV2(event)
      expectFullProjection(store)
      before.rows.forEach((row, index) => expect(store.data.message[id]?.[index]).toBe(row))
      before.source.forEach((message, index) => expect(store.data.session_message[id]?.[index]).toBe(message))
      before.parts.forEach((parts, messageID) => expect(store.data.part[messageID]).toBe(parts))
      expect(store.data.part[stream.last]?.[0]).toBe(before.tool)
    })

    expect(store.data.part[stream.last]?.at(-1)).toMatchObject({ type: "text", text: expect.stringContaining("word19") })
  })
})
