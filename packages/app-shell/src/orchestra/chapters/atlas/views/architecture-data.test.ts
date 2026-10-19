import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import { ARCH_LAYER_ROWS, ARCH_LAYERS, ARCH_RING, archLayerLinks, archSampleFact } from "./architecture-data"

const pick = (id?: string) => {
  const links = archLayerLinks(id)
  return [links.selected.id, [...links.selected.deps], links.users]
}

describe("atlas architecture data", () => {
  test("selects a package and names what it uses and what uses it", () => {
    expect(pick()).toEqual(["knowledge", ["kernel", "index", "grounding"], ["retrieval", "memory", "tools", "genesis"]])
    expect(pick("nope")).toEqual(pick())
    expect(pick("kernel")).toEqual(["kernel", ["contracts"], ["persist", "index", "grounding", "knowledge"]])
    expect(pick("index")).toEqual(["index", ["kernel"], ["grounding", "knowledge", "retrieval", "genesis"]])
    expect(pick("contracts")).toEqual(["contracts", [], ["kernel"]])
    expect(pick("cli")).toEqual(["cli", [], []])
  })

  test("lays the packages out top-down with the ring apart", () => {
    expect(ARCH_LAYERS.length).toBe(13)
    expect(ARCH_LAYER_ROWS.map((row) => [row[0], row[1].map((layer) => layer.id)])).toEqual([
      ["L8", ["genesis"]],
      ["L7", ["tools"]],
      ["L6", ["memory"]],
      ["L5", ["retrieval"]],
      ["L4", ["knowledge"]],
      ["L3", ["grounding"]],
      ["L2", ["persist", "index"]],
      ["L1", ["kernel"]],
      ["L0", ["contracts"]],
    ])
    expect(ARCH_RING.map((layer) => layer.id)).toEqual(["adapter-io", "cli", "mcp-server"])
  })

  test("samples the first live fact with reasoning, else the first live fact", () => {
    const fixture = atlasFixture()
    expect(archSampleFact(createAtlasModel(fixture))?.key).toBe("k1")
    const reasoned = { ...fixture, facts: fixture.facts.map((x) => (x.key === "k2" ? { ...x, why: "abcdef012345" } : x)) }
    expect(archSampleFact(createAtlasModel(reasoned))?.key).toBe("k2")
    expect(archSampleFact(createAtlasModel({ ...fixture, facts: [] }))).toBeUndefined()
  })
})
