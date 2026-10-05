import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { Agent } from "@opencode-ai/sdk/v2/client"
import { createPromptState, DEFAULT_PROMPT } from "@/context/prompt-state"
import {
  agentDraft,
  agentFileInput,
  agentRoster,
  agentUnavailable,
  draftError,
  inheritedAction,
  PERMISSION_TOOLS,
} from "./agents-roster"

const agent = (name: string, mode: Agent["mode"], hidden = false): Agent => ({
  name,
  mode,
  hidden,
  permission: [],
  options: {},
})

describe("Agents roster", () => {
  test("excludes hidden agents and marks subagents without offering chat", () => {
    expect(
      agentRoster([agent("build", "primary"), agent("research", "subagent"), agent("secret", "all", true)]),
    ).toEqual([
      { agent: agent("build", "primary"), subagent: false, chat: true },
      { agent: agent("research", "subagent"), subagent: true, chat: false },
    ])
  })

  test("primary and all modes can open chat; an empty roster stays empty", () => {
    expect(agentRoster([agent("build", "primary"), agent("review", "all")]).map((item) => item.chat)).toEqual([
      true,
      true,
    ])
    expect(agentRoster([])).toEqual([])
  })

  test("only missing or unsupported endpoints are unavailable", () => {
    expect(agentUnavailable(new Error("missing", { cause: { status: 404 } }))).toBe(true)
    expect(agentUnavailable(new Error("unsupported", { cause: { status: 405 } }))).toBe(true)
    expect(agentUnavailable(new Error("failed", { cause: { status: 500 } }))).toBe(false)
    expect(agentUnavailable(new Error("offline"))).toBe(false)
  })
})

test("a chosen agent seeds only its blank draft and can be changed", () => {
  createRoot((dispose) => {
    const chosen = createPromptState({ agent: "review" })
    const other = createPromptState()
    expect(chosen.store[0]().agent).toBe("review")
    expect(chosen.current()).toEqual(DEFAULT_PROMPT)
    expect(chosen.dirty()).toBe(false)
    expect(other.store[0]().agent).toBeUndefined()
    chosen.store[1]("agent", "build")
    expect(chosen.store[0]().agent).toBe("build")
    expect(other.store[0]().agent).toBeUndefined()
    dispose()
  })
})

describe("Agent editor", () => {
  const plan: Agent = {
    ...agent("plan", "primary"),
    description: "Plans work",
    model: { providerID: "example", modelID: "reasoner" },
    steps: 7,
    prompt: "Resolved prompt",
    permission: [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "external_directory", pattern: "*", action: "ask" },
      { permission: "bash", pattern: "*", action: "ask" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "git *", action: "allow" },
    ],
  }
  const file = {
    path: "/repo/.opencode/agent/plan.md",
    exists: true,
    system: "File prompt",
    permission: { edit: "deny" as const, bash: { "git *": "allow" as const }, question: "allow" as const },
  }

  test("seeds from the project file before the resolved agent and marks pattern maps as custom", () => {
    const draft = agentDraft(plan, file)
    expect(draft).toMatchObject({
      name: "plan",
      mode: "primary",
      description: "Plans work",
      model: "example/reasoner",
      steps: "7",
      system: "File prompt",
    })
    expect(draft.permission.edit).toBe("deny")
    expect(draft.permission.bash).toBe("custom")
    expect(draft.permission.read).toBe("inherit")
    expect(Object.keys(draft.permission)).toEqual([...PERMISSION_TOOLS])
    expect(agentDraft(undefined, undefined)).toMatchObject({ name: "", mode: "subagent", model: "", steps: "" })
  })

  test("writes explicit choices, drops inherited ones and keeps patterns and unlisted tools", () => {
    const draft = agentDraft(plan, file)
    draft.permission.edit = "inherit"
    draft.permission.read = "ask"
    draft.model = ""
    draft.steps = " "
    expect(agentFileInput(draft, file)).toEqual({
      mode: "primary",
      description: "Plans work",
      system: "File prompt",
      permission: { bash: { "git *": "allow" }, question: "allow", read: "ask" },
    })
    draft.permission.bash = "deny"
    expect(agentFileInput(draft, file).permission).toEqual({ question: "allow", read: "ask", bash: "deny" })
  })

  test("validates the name, duplicates on create and a positive whole turn allowance", () => {
    const draft = agentDraft(undefined, undefined)
    expect(draftError({ ...draft, name: "../x" }, [], true)).toBe("name")
    expect(draftError({ ...draft, name: "Plan" }, ["plan"], true)).toBe("duplicate")
    expect(draftError({ ...draft, name: "plan" }, ["plan"], false)).toBeUndefined()
    for (const steps of ["0", "-1", "1.5", "2e3", "x"]) expect(draftError({ ...draft, name: "a", steps }, [], true)).toBe("steps")
    expect(draftError({ ...draft, name: "a", steps: "20" }, [], true)).toBeUndefined()
  })

  test("the inherited action ignores only this agent's own override", () => {
    expect(inheritedAction(plan.permission, "edit", "deny")).toBe("allow")
    expect(inheritedAction(plan.permission, "edit", undefined)).toBe("deny")
    expect(inheritedAction(plan.permission, "bash", { "git *": "allow" })).toBe("ask")
    expect(inheritedAction(plan.permission, "external_directory", undefined)).toBe("ask")
    expect(inheritedAction(plan.permission, "read", undefined)).toBe("allow")
    expect(inheritedAction([], "read", undefined)).toBeUndefined()
  })
})
