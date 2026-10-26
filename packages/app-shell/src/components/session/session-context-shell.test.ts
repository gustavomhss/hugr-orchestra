import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Part, Session, UserMessage } from "@/v2-wire"
import type { ServerApi } from "@/utils/server"

import { createServerSession } from "@/context/server-session"
import { getSessionContext, getSessionCost } from "./session-context-metrics"

const session = {
  id: "ses_context",
  slug: "context",
  projectID: "project",
  directory: "/repo",
  title: "Context",
  version: "1",
  cost: 0,
  time: { created: 1, updated: 5 },
} satisfies Session
const user = {
  id: "msg_user",
  sessionID: session.id,
  role: "user",
  time: { created: 1 },
  agent: "build",
  model: { providerID: "provider", modelID: "model" },
} satisfies UserMessage
const assistant = {
  id: "msg_provider",
  sessionID: session.id,
  role: "assistant",
  parentID: user.id,
  agent: "build",
  mode: "build",
  modelID: "model",
  providerID: "provider",
  finish: "stop",
  path: { cwd: "/repo", root: "/repo" },
  time: { created: 2, completed: 3 },
  cost: 0,
  tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
} satisfies AssistantMessage
const shellUser = { ...user, id: "msg_shell_user", time: { created: 4 } }
const shell = {
  ...assistant,
  id: "msg_shell_assistant",
  parentID: shellUser.id,
  finish: undefined,
  time: { created: 4, completed: 5 },
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  // A user shell is projected as a synthetic assistant.
  synthetic: true,
} as AssistantMessage
const shellPart = {
  id: "prt_shell_tool",
  sessionID: session.id,
  messageID: shell.id,
  type: "tool",
  tool: "bash",
  callID: "call_shell",
  state: {
    status: "completed",
    input: { command: "pwd" },
    title: "",
    output: "/repo",
    metadata: { output: "/repo" },
    time: { start: 4, end: 5 },
  },
} satisfies Part
const providers = [{ id: "provider", models: { model: { limit: { context: 1000 }, cost: { input: 0, output: 0 } } } }]
const history = [
  { info: user, parts: [] },
  { info: assistant, parts: [] },
]
const shells = [
  { info: shellUser, parts: [] },
  { info: shell, parts: [shellPart] },
]

// History reaches the store as live events after an empty page load.
async function load(items: { info: UserMessage | AssistantMessage; parts: Part[] }[]) {
  const sessionApi = {
    get: async () => session,
    message: async () => {
      throw new Error("single message endpoint called")
    },
  } as unknown as Pick<ServerApi["session"], "get" | "message">
  const messageApi = { list: async () => ({ data: [], cursor: {} }) } as unknown as ServerApi["message"]
  const store = createServerSession(sessionApi, messageApi, { todo: async () => [] })
  store.remember(session)
  await store.sync(session.id)
  items.forEach((item) => store.transcript.putMessage(item.info))
  items.forEach((item) =>
    item.parts.forEach((part) => store.transcript.putPart(part)),
  )
  return store
}

describe("Context shell provenance", () => {
  test.each(["history", "live"])("retains provider usage after a completed shell through %s", async (mode) => {
    const store = await load(mode === "history" ? [...history, ...shells] : history)
    if (mode === "live") {
      expect(getSessionContext(store.data.message[session.id], providers)?.total).toBe(100)
      store.transcript.putMessage(shellUser)
      store.transcript.putMessage({ ...shell, time: { created: 4 } })
      store.transcript.putPart({
        ...shellPart,
        state: { status: "running", input: shellPart.state.input, time: { start: 4 } },
      })
      store.transcript.putMessage(shell)
      expect(getSessionContext(store.data.message[session.id], providers)?.total).toBe(100)
      store.transcript.putPart(shellPart)
    }
    expect(getSessionContext(store.data.message[session.id], providers)).toMatchObject({
      message: { id: assistant.id },
      total: 100,
      usage: 10,
    })
    expect(getSessionCost(0, store.data.message[session.id], providers)).toBe(0)
  })

  test("a shell-only session has no provider usage and needs no model pricing", async () => {
    const store = await load(shells)
    expect(getSessionContext(store.data.message[session.id], providers)).toBeUndefined()
    expect(getSessionCost(0, store.data.message[session.id], [])).toBe(0)
  })
})
