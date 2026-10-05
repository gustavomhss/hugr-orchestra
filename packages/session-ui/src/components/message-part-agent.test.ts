import { describe, expect, test } from "bun:test"
import { findTaskAgent } from "./message-part-agent"

// F1.11: Task display resolves the seat by its stable id and renders whatever label it has.
describe("findTaskAgent", () => {
  const agents = [
    { id: "general", name: "general" },
    { id: "charlie", name: "Pikachu" },
  ]

  test("resolves a renamed seat by id and keeps its label", () => {
    expect(findTaskAgent("charlie", agents)?.name).toBe("Pikachu")
  })

  test("never resolves by label", () => {
    expect(findTaskAgent("Pikachu", agents)).toBeUndefined()
    expect(findTaskAgent("pikachu", agents)).toBeUndefined()
  })

  test("agents without an id still match their name", () => {
    expect(findTaskAgent("explore", [{ name: "Explore" }])?.name).toBe("Explore")
  })
})
