import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Part, Session, UserMessage } from "@orchestra/sdk/v2/client"
import { createServerSession } from "@/context/server-session"
import { createSdkForServer } from "@/utils/server"
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
// V1 SessionPrompt.shellImpl identifies user shells through the synthetic parent part.
const shellUserPart = {
  id: "prt_shell_user",
  sessionID: session.id,
  messageID: shellUser.id,
  type: "text",
  synthetic: true,
  text: "The following tool was executed by the user",
} satisfies Part
const shell = {
  ...assistant,
  id: "msg_shell_assistant",
  parentID: shellUser.id,
  finish: undefined,
  time: { created: 4, completed: 5 },
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
} satisfies AssistantMessage
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
  { info: shellUser, parts: [shellUserPart] },
  { info: shell, parts: [shellPart] },
]

async function load(items: { info: UserMessage | AssistantMessage; parts: Part[] }[]) {
  const fetcher = Object.assign(async () => Response.json(items), { preconnect: fetch.preconnect })
  const store = createServerSession(createSdkForServer({ server: { url: "http://localhost:4096" }, fetch: fetcher }), {
    protocol: Promise.resolve("v1"),
  })
  store.remember(session)
  await store.sync(session.id)
  return store
}

describe("V1 Context shell provenance", () => {
  test.each(["history", "live"])("retains provider usage after a completed shell through %s", async (mode) => {
    const store = await load(mode === "history" ? [...history, ...shells] : history)
    if (mode === "live") {
      expect(getSessionContext(store.data.message[session.id], providers, store.data.part)?.total).toBe(100)
      store.apply({ type: "message.updated", properties: { info: shellUser } })
      store.apply({ type: "message.part.updated", properties: { part: shellUserPart } })
      store.apply({ type: "message.updated", properties: { info: { ...shell, time: { created: 4 } } } })
      store.apply({
        type: "message.part.updated",
        properties: {
          part: {
            ...shellPart,
            state: { status: "running", input: shellPart.state.input, time: { start: 4 } },
          },
        },
      })
      store.apply({ type: "message.updated", properties: { info: shell } })
      expect(getSessionContext(store.data.message[session.id], providers, store.data.part)?.total).toBe(100)
      store.apply({ type: "message.part.updated", properties: { part: shellPart } })
    }
    expect(getSessionContext(store.data.message[session.id], providers, store.data.part)).toMatchObject({
      message: { id: assistant.id },
      total: 100,
      usage: 10,
    })
    expect(getSessionCost(0, store.data.message[session.id], providers, store.data.part)).toBe(0)
  })

  test("a shell-only session has no provider usage and needs no model pricing", async () => {
    const store = await load(shells)
    expect(getSessionContext(store.data.message[session.id], providers, store.data.part)).toBeUndefined()
    expect(getSessionCost(0, store.data.message[session.id], [], store.data.part)).toBe(0)
  })

  test.each([
    { name: "provider finish", parent: shellUserPart, message: { ...shell, finish: "stop" } },
    { name: "ordinary user text", parent: { ...shellUserPart, synthetic: false }, message: shell },
    { name: "other synthetic input", parent: { ...shellUserPart, text: "Continue working" }, message: shell },
  ])("preserves explicit provider zero with $name", async ({ parent, message }) => {
    const store = await load([...history, { info: shellUser, parts: [parent] }, { info: message, parts: [shellPart] }])
    expect(getSessionContext(store.data.message[session.id], providers, store.data.part)).toMatchObject({
      message: { id: shell.id },
      total: 0,
      usage: 0,
    })
    expect(getSessionCost(0, store.data.message[session.id], providers, store.data.part)).toBe(0)
  })
})
