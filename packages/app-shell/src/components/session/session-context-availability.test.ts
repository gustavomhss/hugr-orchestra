import { describe, expect, test } from "bun:test"
import type { ModelListOutput, SessionMessageAssistant } from "@opencode-ai/client/promise"
import { normalizeProviderList } from "@/context/global-sync/utils"
import { normalizeSessionMessages } from "@/utils/session-message"
import { getSessionContext, getSessionCost } from "./session-context-metrics"
import { createSessionContextFormatter } from "./session-context-format"

const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
const message = {
  id: "msg_assistant",
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content: [],
  time: { created: 1, completed: 2 },
} satisfies SessionMessageAssistant
const model = {
  id: "model",
  modelID: "model",
  providerID: "provider",
  name: "Model",
  capabilities: { tools: false, input: ["text"], output: ["text"] },
  variants: [],
  time: { released: 0 },
  status: "active",
  enabled: true,
  limit: { context: 1000, output: 100 },
} satisfies Omit<ModelListOutput["data"][number], "cost">

const messages = (assistant: SessionMessageAssistant) =>
  normalizeSessionMessages("ses_test", [
    { id: "msg_user", type: "user", text: "Hello", time: { created: 0 } },
    assistant,
  ]).messages

const providers = (priced: boolean) => [
  ...normalizeProviderList(
    [{ id: "provider", name: "Provider", package: "@ai-sdk/provider" }],
    [{ ...model, cost: priced ? [{ input: 0, output: 0, cache: { read: 0, write: 0 } }] : [] }],
  ).all.values(),
]

describe("session context availability", () => {
  test("missing cost and unloaded messages remain unavailable", () => {
    expect(getSessionCost(undefined, [], providers(true))).toBeUndefined()
    expect(getSessionCost(0, undefined, providers(true))).toBeUndefined()
    expect(createSessionContextFormatter("en-US").currency(undefined)).toBe("—")
  })

  test("unpriced models cannot turn an unknown cost into a free session", () => {
    const reported = messages({ ...message, cost: 0, tokens })
    expect(getSessionCost(0, reported, providers(false))).toBeUndefined()
    expect(getSessionCost(0, reported, [])).toBeUndefined()
  })

  test("missing assistant cost stays unavailable even with pricing", () => {
    const reported = messages({ ...message, tokens })
    expect(getSessionCost(0, reported, providers(true))).toBeUndefined()
  })

  test("known free pricing, empty sessions, and reported nonzero cost are preserved", () => {
    const reported = messages({ ...message, cost: 0, tokens })
    expect(getSessionCost(0, reported, providers(true))).toBe(0)
    expect(getSessionCost(0, [], [])).toBe(0)
    expect(getSessionCost(1.25, undefined, [])).toBe(1.25)
    expect(createSessionContextFormatter("en-US").currency(0)).toBe("$0.00")
    expect(createSessionContextFormatter("en-US").currency(1.25)).toBe("$1.25")
  })

  test("completed messages with reported zero tokens retain real zero usage", () => {
    const reported = messages({ ...message, cost: 0, tokens })
    const context = getSessionContext(reported, providers(true))
    expect(context?.total).toBe(0)
    expect(context?.usage).toBe(0)
    expect(createSessionContextFormatter("en-US").number(context?.total)).toBe("0")
    expect(createSessionContextFormatter("en-US").percent(context?.usage)).toBe("0%")
  })

  test("absent token reports and absent model limits remain unavailable", () => {
    const missing = messages(message)
    expect(getSessionContext(missing, providers(true))).toBeUndefined()
    const reported = messages({ ...message, tokens: { ...tokens, input: 10 } })
    const context = getSessionContext(reported, [])
    expect(context?.total).toBe(10)
    expect(context?.usage).toBeNull()
    expect(createSessionContextFormatter("en-US").percent(context?.usage)).toBe("—")
    expect(createSessionContextFormatter("en-US").number(undefined)).toBe("—")
  })

  test("a completed shell does not replace provider usage or make an empty session unpriced", () => {
    const shell = {
      id: "msg_shell",
      type: "shell",
      shellID: "shell_1",
      command: "pwd",
      status: "exited",
      time: { created: 3, completed: 4 },
    } as const
    const source = normalizeSessionMessages("ses_test", [
      { id: "msg_user", type: "user", text: "Hello", time: { created: 0 } },
      { ...message, cost: 0, tokens: { ...tokens, input: 100 } },
      shell,
    ]).messages
    expect(getSessionContext(source, providers(true))?.total).toBe(100)
    expect(getSessionContext(source, providers(true))?.usage).toBe(10)
    const onlyShell = normalizeSessionMessages("ses_test", [shell]).messages
    expect(getSessionContext(onlyShell, providers(true))).toBeUndefined()
    expect(getSessionCost(0, onlyShell, [])).toBe(0)
  })

  test("a partial nonzero aggregate remains unavailable when another turn has unknown cost", () => {
    const known = messages({ ...message, cost: 1.25, tokens })
    const unknown = messages({ ...message, id: "msg_unknown", tokens })
    expect(getSessionCost(1.25, known, [])).toBe(1.25)
    expect(getSessionCost(1.25, [...known, ...unknown], providers(true))).toBeUndefined()
  })
})
