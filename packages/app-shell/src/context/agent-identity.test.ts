import { describe, expect, test } from "bun:test"
import { agentKey, agentMention } from "./agent-identity"

describe("agent identity", () => {
  const renamed = { id: "backend", name: "Pikachu" }

  test("keys an agent by its stable id, falling back to its name", () => {
    expect(agentKey(renamed)).toBe("backend")
    expect(agentKey({ name: "custom" })).toBe("custom")
  })

  test("a mention routes by id and shows the label", () => {
    expect(agentMention(renamed)).toEqual({ type: "agent", name: "backend", content: "@Pikachu", start: 0, end: 0 })
  })
})
