import { describe, expect, test } from "bun:test"
import type { SessionInfo, SessionMessageInfo } from "../compat/vendored-client-promise"
import { fetchSessionExport, type SessionExportApi, type SessionExportClient } from "./session-export"

const info: SessionInfo = {
  id: "ses_1",
  projectID: "project",
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 2 },
  title: "Export me",
  location: { directory: "/repo" },
}

const log: SessionMessageInfo[] = [
  { id: "msg_1", type: "user", text: "hello", time: { created: 1 } },
  {
    id: "msg_2",
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content: [{ type: "text", text: "hi" }],
    time: { created: 2 },
  },
  { id: "msg_3", type: "compaction", status: "completed", reason: "manual", summary: "sum", recent: "", time: { created: 3 } },
]

const filler: SessionMessageInfo[] = Array.from({ length: 200 }, (_, index) => ({
  id: `msg_0_${String(index).padStart(3, "0")}`,
  type: "agent-switched" as const,
  agent: "build",
  time: { created: 0 },
}))

const legacy: SessionExportClient = {
  session: {
    get: () => Promise.reject(new Error("the V1 route is not asked on V2")),
    messages: () => Promise.reject(new Error("the V1 route is not asked on V2")),
  },
}

describe("fetchSessionExport", () => {
  test("builds the V1 export shape from every page of the V2 message log", async () => {
    const requests: unknown[] = []
    const api: SessionExportApi = {
      session: { get: async () => info },
      message: {
        list: async (input) => {
          requests.push(input)
          // A full page of filler first, so the export follows the cursor; the short page that follows ends it.
          if (!input.cursor) return { data: filler, cursor: { next: "rest" } }
          return { data: log, cursor: { next: "end" } }
        },
      },
    }
    const data = await fetchSessionExport({ sessionID: "ses_1", client: legacy, api, protocol: Promise.resolve("v2") })

    expect(data.info).toMatchObject({ id: "ses_1", title: "Export me", directory: "/repo" })
    expect(data.messages.map((message) => [message.info.id, message.info.role])).toEqual([
      ["msg_1", "user"],
      ["msg_2", "assistant"],
      ["msg_3", "user"],
      ["msg_3:assistant", "assistant"],
    ])
    expect(data.messages[0]?.parts).toMatchObject([{ type: "text", text: "hello" }])
    expect(data.messages[2]?.parts).toMatchObject([{ type: "compaction", auto: false }])
    expect(data.messages[3]?.parts).toMatchObject([{ type: "text", text: "sum" }])
    expect(requests).toEqual([
      { sessionID: "ses_1", limit: 200, order: "asc" },
      { sessionID: "ses_1", limit: 200, cursor: "rest" },
    ])
  })
})
