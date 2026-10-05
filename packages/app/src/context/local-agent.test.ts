import { describe, expect, test } from "bun:test"
import { agentChoiceVisible, agentKey, agentMention, hasCustomAgent, resolveAgent } from "./local-agent"

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

describe("renamed native seat", () => {
  // F1.11: a seat whose label is not its id is selected, stored and mentioned by id and rendered by label.
  const agents = [
    { id: "build", name: "build" },
    { id: "charlie", name: "Pikachu" },
  ]

  test("selection resolves by id, never by label", () => {
    expect(resolveAgent(agents, "charlie")?.name).toBe("Pikachu")
    expect(resolveAgent(agents, "Pikachu")?.id).toBe("build")
    expect(resolveAgent(agents, "Charlie")?.id).toBe("build")
    expect(agentKey(agents[1])).toBe("charlie")
  })

  test("legacy agents without an id key on their name", () => {
    expect(agentKey({ name: "custom" })).toBe("custom")
    expect(resolveAgent([{ name: "custom" }, { name: "build" }], "custom")?.name).toBe("custom")
  })

  test("a mention sends the id and shows the label", () => {
    expect(agentMention(agents[1])).toEqual({ type: "agent", name: "charlie", content: "@Pikachu", start: 0, end: 0 })
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
