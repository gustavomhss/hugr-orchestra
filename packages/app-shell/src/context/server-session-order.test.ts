import { describe, expect, test } from "bun:test"
import type { OpenCodeEvent } from "@/v2-legacy"
import type { Session } from "@/v2-wire"
import type { ServerApi, ServerSdk } from "@/utils/server"
import { createServerSession } from "./server-session"

type SessionApi = Pick<ServerApi["session"], "get" | "message">
type MessageApi = ServerApi["message"]

const session = (id: string): Session => ({
  id,
  slug: id,
  projectID: "project",
  directory: "/repo",
  title: id,
  version: "1",
  time: { created: 1, updated: 1 },
})

const client = {
  session: {
    get: async (input: { sessionID: string }) => ({ data: session(input.sessionID) }),
    messages: async () => ({ data: [], response: { headers: new Headers() } }),
    diff: async () => ({ data: [] }),
    todo: async () => ({ data: [] }),
  },
} as unknown as ServerSdk

// V2 parts follow the server's content order, never the sort order of their IDs.
describe("server session part order", () => {
  test("keeps live V2 parts in content order when opaque call IDs sort before or after text", () => {
    const store = createServerSession(client)
    store.remember(session("child"))
    store.set("session_message", "child", [{ id: "msg_1_user", type: "user", text: "hello", time: { created: 1 } }])
    const data = [
      {
        type: "session.step.started",
        data: { assistantMessageID: "msg_2_assistant", agent: "build", model: { id: "model", providerID: "provider" } },
      },
      { type: "session.text.started", data: { assistantMessageID: "msg_2_assistant", ordinal: 0 } },
      { type: "session.text.delta", data: { assistantMessageID: "msg_2_assistant", ordinal: 0, delta: "reading" } },
      { type: "session.tool.input.started", data: { assistantMessageID: "msg_2_assistant", callID: "toolu_01", name: "read" } },
      { type: "session.tool.input.started", data: { assistantMessageID: "msg_2_assistant", callID: "call_9", name: "grep" } },
      { type: "session.text.started", data: { assistantMessageID: "msg_2_assistant", ordinal: 1 } },
      { type: "session.text.delta", data: { assistantMessageID: "msg_2_assistant", ordinal: 1, delta: "done" } },
    ]
    data.forEach((event, index) =>
      store.applyV2({
        id: `evt_${index}`,
        created: index + 2,
        type: event.type,
        durable: { aggregateID: "child", seq: index + 1, version: 1 },
        location: { directory: "/repo" },
        data: { sessionID: "child", ...event.data },
      } as unknown as OpenCodeEvent),
    )

    expect(store.data.part.msg_2_assistant?.map((part) => part.id)).toEqual([
      "msg_2_assistant:text:0",
      "toolu_01",
      "call_9",
      "msg_2_assistant:text:1",
    ])
  })

  test("keeps fetched V2 parts in content order when opaque call IDs sort before text", async () => {
    const user = { id: "msg_1_user", type: "user", text: "hello", time: { created: 1 } }
    const assistant = {
      id: "msg_2_assistant",
      type: "assistant",
      agent: "build",
      model: { id: "model", providerID: "provider" },
      content: [
        { type: "text", text: "reading" },
        { type: "tool", id: "toolu_01", name: "read", state: { status: "streaming", input: "" }, time: { created: 2 } },
        { type: "tool", id: "call_9", name: "grep", state: { status: "streaming", input: "" }, time: { created: 2 } },
        { type: "text", text: "done" },
      ],
      time: { created: 2, completed: 3 },
    }
    const messageApi = {
      list: async () => ({ data: [assistant, user], cursor: { previous: null, next: null } }),
    } as unknown as MessageApi
    const store = createServerSession({} as ServerSdk, {} as SessionApi, messageApi)
    store.remember(session("root"))

    await store.sync("root")

    expect(store.data.part.msg_2_assistant?.map((part) => part.id)).toEqual([
      "msg_2_assistant:text:0",
      "toolu_01",
      "call_9",
      "msg_2_assistant:text:1",
    ])
  })
})
