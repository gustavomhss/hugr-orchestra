import { describe, expect, test } from "bun:test"
import type { Agent } from "@orchestra/sdk/v2/client"
import {
  agentDraft,
  agentFileInput,
  agentRoster,
  agentUnavailable,
  draftError,
  inheritedAction,
  isMaestro,
  PERMISSION_TOOLS,
  removeInput,
} from "./agents-roster"

const agent = (name: string, mode: Agent["mode"], hidden = false): Agent => ({
  name,
  mode,
  hidden,
  permission: [],
  options: {},
})

describe("Agents roster", () => {
  test("excludes hidden agents and marks subagents", () => {
    expect(
      agentRoster([agent("maestro", "primary"), agent("research", "subagent"), agent("secret", "all", true)]),
    ).toEqual([
      { agent: agent("maestro", "primary"), subagent: false, chat: true },
      { agent: agent("research", "subagent"), subagent: true, chat: false },
    ])
  })

  test("only maestro opens chat, whatever the other agents' modes; an empty roster stays empty", () => {
    expect(
      agentRoster([
        agent("build", "primary"),
        agent("maestro", "primary"),
        agent("review", "all"),
        agent("research", "subagent"),
      ]).map((item) => item.chat),
    ).toEqual([false, true, false, false])
    expect(agentRoster([])).toEqual([])
  })

  test("a renamed maestro still opens chat, and no other agent can take its name", () => {
    expect(
      agentRoster([
        { ...agent("Conductor", "primary"), id: "maestro" },
        { ...agent("maestro", "subagent"), id: "impostor" },
      ]).map((item) => item.chat),
    ).toEqual([true, false])
  })

  test("only missing or unsupported endpoints are unavailable", () => {
    expect(agentUnavailable(new Error("missing", { cause: { status: 404 } }))).toBe(true)
    expect(agentUnavailable(new Error("unsupported", { cause: { status: 405 } }))).toBe(true)
    expect(agentUnavailable(new Error("failed", { cause: { status: 500 } }))).toBe(false)
    expect(agentUnavailable(new Error("offline"))).toBe(false)
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
    path: "/repo/.orchestra/agent/plan.md",
    exists: true,
    revision: "r1",
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

  test("writes explicit choices in the file's rule order and keeps patterns and unlisted tools", () => {
    const ordered = {
      ...file,
      permission: {
        "*": "ask" as const,
        edit: "deny" as const,
        bash: { "git *": "allow" as const },
        question: "allow" as const,
      },
    }
    const draft = agentDraft(plan, ordered)
    draft.permission.edit = "allow"
    draft.permission.read = "ask"
    expect(Object.entries(agentFileInput(draft, ordered, plan).permission ?? {})).toEqual([
      ["*", "ask"],
      ["edit", "allow"],
      ["bash", { "git *": "allow" }],
      ["question", "allow"],
      ["read", "ask"],
    ])
    draft.permission.edit = "inherit"
    draft.permission.bash = "deny"
    expect(Object.entries(agentFileInput(draft, ordered, plan).permission ?? {})).toEqual([
      ["*", "ask"],
      ["bash", "deny"],
      ["question", "allow"],
      ["read", "ask"],
    ])
  })

  test("never freezes a resolved value the file does not set; the file's own values stay editable", () => {
    const untouched = agentDraft(plan, undefined)
    expect(agentFileInput(untouched, { path: file.path, exists: false, revision: "" }, plan)).toEqual({
      permission: {},
      revision: "",
    })
    const draft = agentDraft(plan, file)
    draft.description = "Plans carefully"
    draft.steps = " "
    draft.system = ""
    expect(agentFileInput(draft, file, plan)).toEqual({
      description: "Plans carefully",
      permission: { edit: "deny", bash: { "git *": "allow" }, question: "allow" },
      revision: "r1",
    })
    const created = { ...agentDraft(undefined, undefined), name: "new", description: "New", steps: "4" }
    expect(agentFileInput(created, undefined, undefined)).toEqual({
      mode: "subagent",
      description: "New",
      steps: 4,
      permission: {},
    })
  })

  test("Maestro is found by its stable id, or by its name when the server sends no id", () => {
    expect(isMaestro(agent("maestro", "primary"))).toBe(true)
    expect(isMaestro({ ...agent("Conductor", "primary"), id: "maestro" })).toBe(true)
    expect(isMaestro({ ...agent("maestro", "primary"), id: "conductor" })).toBe(false)
    expect(isMaestro(agent("Maestro", "primary"))).toBe(false)
    expect(isMaestro(undefined)).toBe(false)
  })

  test("Maestro stays primary whatever its file or the server says, so a save writes it back as primary", () => {
    const maestro = { ...agent("maestro", "subagent"), id: "maestro" }
    const handEdited = {
      path: "/repo/.orchestra/agent/maestro.md",
      exists: true,
      revision: "m1",
      mode: "subagent" as const,
      disable: true,
    }
    const draft = agentDraft(maestro, handEdited)
    expect(draft.mode).toBe("primary")
    // `disable` is left out, so the save drops it from the file too.
    expect(agentFileInput(draft, handEdited, maestro)).toEqual({ mode: "primary", permission: {}, revision: "m1" })
    // Without a mode in the file, none is written.
    const missing = { path: handEdited.path, exists: false, revision: "" }
    expect(agentFileInput(agentDraft(maestro, missing), missing, maestro)).toEqual({ permission: {}, revision: "" })
    // Other agents still take the file's mode first.
    expect(agentDraft(plan, { ...file, mode: "subagent" }).mode).toBe("subagent")
  })

  test("disabling keeps the file's own fields and its revision", () => {
    expect(removeInput(file)).toEqual({
      description: undefined,
      mode: undefined,
      model: undefined,
      steps: undefined,
      system: "File prompt",
      permission: file.permission,
      disable: true,
      revision: "r1",
    })
    expect(removeInput(undefined)).toMatchObject({ disable: true })
  })

  test("validates the name, duplicates on create and a positive whole turn allowance", () => {
    const draft = agentDraft(undefined, undefined)
    for (const name of ["../x", "con", "a".repeat(65), ""])
      expect(draftError({ ...draft, name }, [], true)).toBe("name")
    expect(draftError({ ...draft, name: "Plan" }, ["plan"], true)).toBe("duplicate")
    expect(draftError({ ...draft, name: "plan" }, ["plan"], false)).toBeUndefined()
    for (const steps of ["0", "-1", "1.5", "2e3", "x"])
      expect(draftError({ ...draft, name: "a", steps }, [], true)).toBe("steps")
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
