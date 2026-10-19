import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import { anotherFact, blastOf, followFact, howStep, reasoningText, servedIn } from "./how-data"

describe("atlas follow one fact", () => {
  test("follows the named fact, else the first live fact", () => {
    const model = createAtlasModel(atlasFixture())
    expect(followFact(model, "k3")?.key).toBe("k3")
    expect(followFact(model, "nope")?.key).toBe("k1")
    expect(followFact(model, undefined)?.key).toBe("k1")
    expect(anotherFact(model, model.byKey.k2).key).toBe("k1")
  })

  test("clamps the stop to the five stops", () => {
    expect([howStep(undefined), howStep("2"), howStep("9"), howStep("x"), howStep("-1")]).toEqual([0, 2, 4, 0, 0])
  })

  test("says whether the briefing sends the fact and how much depends on its file", () => {
    const model = createAtlasModel(atlasFixture())
    expect(["k1", "k2", "k3", "k4"].map((key) => servedIn(model, model.byKey[key]))).toEqual([true, true, true, false])
    expect([blastOf(model, model.byKey.k1), blastOf(model, model.byKey.k4)]).toEqual([1, 0])
  })

  test("reads reasoning text only from a found entry", () => {
    expect(reasoningText({ state: "ok", id: "r1", text: "because" })).toBe("because")
    expect(reasoningText({ state: "missing", id: "r1" })).toBeUndefined()
    expect(reasoningText(undefined)).toBeUndefined()
  })
})
