import { describe, expect, test } from "bun:test"
import { agentChoiceVisible, hasCustomAgent, resolveAgent } from "./local-agent"

describe("hasCustomAgent", () => {
  test("detects explicitly custom agents", () => {
    expect(hasCustomAgent([{ native: true }, { native: false }])).toBe(true)
  })

  test("ignores built-in and unclassified agents", () => {
    expect(hasCustomAgent([{ native: true }, {}])).toBe(false)
  })
})

describe("resolveAgent", () => {
  const agents = [{ name: "plan" }, { name: "build" }, { name: "custom" }]

  test("uses the requested available agent", () => {
    expect(resolveAgent(agents, "custom")?.name).toBe("custom")
  })

  test("defaults to build", () => {
    expect(resolveAgent(agents)?.name).toBe("build")
    expect(resolveAgent(agents, "missing")?.name).toBe("build")
  })

  test("uses the first agent when build is unavailable", () => {
    expect(resolveAgent([{ name: "custom" }], "missing")?.name).toBe("custom")
  })
})

describe("agentChoiceVisible", () => {
  test("custom agents are always selectable", () => {
    expect(agentChoiceVisible({ custom: true })).toBe(true)
  })

  test("an explicit choice shows only in the draft that received it", () => {
    expect(agentChoiceVisible({ custom: false, explicitDraft: "d1", draftID: "d1" })).toBe(true)
    expect(agentChoiceVisible({ custom: false, explicitDraft: "d1", draftID: "d2" })).toBe(false)
    expect(agentChoiceVisible({ custom: false, explicitDraft: "d1" })).toBe(false)
  })

  test("sessions and drafts without an explicit choice keep the default", () => {
    expect(agentChoiceVisible({ custom: false, sessionID: "s1", explicitDraft: "d1", draftID: "d1" })).toBe(false)
    expect(agentChoiceVisible({ custom: false, draftID: "d1" })).toBe(false)
  })
})
