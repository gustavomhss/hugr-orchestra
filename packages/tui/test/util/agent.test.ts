import { describe, expect, test } from "bun:test"
import { agentKey, agentMention, agentTitle, findAgent } from "../../src/util/agent"

// F1.11: a seat whose label differs from its id is selected, submitted and mentioned by id and rendered by label.
describe("agent identity", () => {
  const renamed = { id: "backend", name: "Pikachu" }

  test("the key is the stable id, never the label", () => {
    expect(agentKey(renamed)).toBe("backend")
    expect([{ id: "build", name: "build" }, renamed].find((agent) => agentKey(agent) === "backend")?.name).toBe(
      "Pikachu",
    )
    expect([renamed].find((agent) => agentKey(agent) === "Pikachu")).toBeUndefined()
  })

  test("agents from servers without ids key on their name", () => {
    expect(agentKey({ name: "custom" })).toBe("custom")
  })

  test("lookup and title resolve by id and fall back to the id itself", () => {
    expect(findAgent([{ id: "build", name: "build" }, renamed], "backend")).toBe(renamed)
    expect(findAgent([renamed], "Pikachu")).toBeUndefined()
    expect(agentTitle([renamed], "backend")).toBe("Pikachu")
    expect(agentTitle([renamed], "unknown seat")).toBe("Unknown Seat")
  })

  test("a mention shows the label and sends the id", () => {
    expect(agentMention(renamed)).toEqual({
      text: "Pikachu",
      part: { type: "agent", name: "backend", source: { start: 0, end: 0, value: "" } },
    })
  })
})
