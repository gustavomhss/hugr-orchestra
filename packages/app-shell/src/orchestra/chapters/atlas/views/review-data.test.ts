import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import type { AtlasPromoteRecord } from "../sheets/state"
import { changedFacts, changedUnits, lastRun, rowOutcome, waiting } from "./review-data"

const keys = (items: readonly { key: string }[]) => items.map((item) => item.key)
const record: AtlasPromoteRecord = {
  run: {
    state: "ok",
    read: true,
    candidates: 3,
    promoted: 1,
    refused: 2,
    rows: [
      { nodeKey: "k5", settled: true },
      { nodeKey: "k6", settled: false, rejected: "ungrounded" },
      { nodeKey: "k1", settled: false, rejected: "governance-downgrade" },
    ],
  },
  staged: ["k5", "k6"],
}

describe("atlas review data", () => {
  test("lists drifted facts, narrowed by unit and commit", () => {
    const model = createAtlasModel(atlasFixture())
    expect(keys(changedFacts(model, {}))).toEqual(["k2"])
    expect(keys(changedFacts(model, { unit: "packages/a" }))).toEqual(["k2"])
    expect(keys(changedFacts(model, { unit: "packages/b" }))).toEqual([])
    expect(keys(changedFacts(model, { commit: "c0ffee1" }))).toEqual(["k2"])
    expect(keys(changedFacts(model, { commit: "0000000" }))).toEqual([])
    expect(changedUnits(model)).toEqual(["packages/a"])
  })

  test("lists the waiting suggestions", () => {
    expect(keys(waiting(createAtlasModel(atlasFixture())))).toEqual(["k5"])
  })

  test("counts the last run over the suggestions that were staged", () => {
    expect(lastRun(record)).toEqual({ fresh: 1, refused: 1 })
    expect(rowOutcome(record, "k6")?.rejected).toBe("ungrounded")
    expect(rowOutcome(record, "k9")).toBeUndefined()
    expect(rowOutcome(undefined, "k6")).toBeUndefined()
  })
})
