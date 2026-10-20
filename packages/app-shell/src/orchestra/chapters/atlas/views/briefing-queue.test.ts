import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import { briefingQueue } from "./briefing-queue"

const rows = (items: ReturnType<typeof briefingQueue>) => items.map((item) => [item.band, item.cost, item.ok, item.label])

describe("atlas briefing queue", () => {
  test("pays governing rows, pointers, then hints, as own does", () => {
    const model = createAtlasModel(atlasFixture())
    expect(rows(briefingQueue(model, "packages/a"))).toEqual([
      ["gov", 18, true, "Writes are atomic."],
      ["ptr", 7, true, "own_src"],
      ["adv", 26, true, "Reads are cached per call."],
    ])
    const root = briefingQueue(model, "")
    expect(rows(root)).toEqual([
      ["gov", 18, true, "Writes are atomic."],
      ["gotcha", 19, true, "Never call y twice."],
      ["ptr", 13, true, "own_README.md"],
      ["ptr", 12, true, "own_packages"],
      ["adv", 26, true, "Reads are cached per call."],
      ["adv", 26, true, "The readme explains setup."],
    ])
    expect(root.filter((item) => item.ok).reduce((n, item) => n + item.cost, 0)).toBe(114)
    expect(root[2].pointer).toEqual({ name: "own_README.md", path: "README.md" })
    expect(root[0].fact?.key).toBe("k1")
  })

  test("a governing row over the cap is named but not sent, and long claims are cut in the label", () => {
    const fixture = atlasFixture()
    const model = createAtlasModel({
      ...fixture,
      facts: fixture.facts.map((x) => (x.key === "k1" ? { ...x, claim: "a".repeat(1600) } : x)),
    })
    const queue = briefingQueue(model, "packages/a")
    expect(queue.map((item) => [item.band, item.cost, item.ok])).toEqual([
      ["gov", 1600, false],
      ["ptr", 7, true],
      ["adv", 26, true],
    ])
    expect(queue[0].label).toBe(`${"a".repeat(64)}…`)
  })
})
