import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import {
  genesisConf,
  genesisQuery,
  INTERVIEW_CAP,
  interviewAnswer,
  KINDS,
  KNOBS,
  markRefutation,
  mineCommand,
  sampleFact,
  stages,
  storeCounts,
} from "./genesis-data"

describe("atlas genesis data", () => {
  test("numbers the six stages from the store", () => {
    const model = createAtlasModel(atlasFixture())
    expect(stages(model).map((stage) => [stage.id, stage.n, stage.ceiling, stage.params])).toEqual([
      ["scan", 6, false, {}],
      ["rank", 200, true, {}],
      ["propose", 5, false, {}],
      ["check", 0, false, {}],
      ["stage", 5, false, {}],
      ["accept", 4, false, { waiting: "1" }],
    ])
    const base = atlasFixture()
    const sealed = createAtlasModel({ ...base, candidates: base.candidates.map((x) => ({ ...x, seal: "proven" })) })
    expect(stages(sealed)[3].n).toBe(1)
    expect(storeCounts(sealed)).toEqual({ all: 5, proven: 1, justified: 0, folders: 3, links: 2 })
    expect(storeCounts(model)).toEqual({ all: 5, proven: 0, justified: 0, folders: 3, links: 2 })
  })

  test("lists the five kinds and the six knobs", () => {
    expect(KINDS.map((kind) => [kind.id, kind.on])).toEqual([
      ["advisory", true],
      ["dependency", true],
      ["count", true],
      ["definition", false],
      ["semantic", false],
    ])
    expect(KNOBS.map((knob) => [knob.id, knob.env, knob.options?.map((option) => option[1]) ?? null])).toEqual([
      ["kinds", "ATLAS_MINE_SLOT", ["", "advisory", "dependency", "count", "definition", "semantic"]],
      ["budget", "ATLAS_MINE_BUDGET", null],
      ["enrich", "ATLAS_ENRICH", ["", "1"]],
      ["proposals", "ATLAS_TASK_PROPOSALS", ["", "proposals.json"]],
      ["frontier", "ATLAS_FRONTIER", ["", "symbol"]],
      ["model", "ATLAS_MODEL_CONFIG", null],
    ])
    expect(INTERVIEW_CAP).toBe(20)
  })

  test("reads the knobs from the query and composes the mine command", () => {
    const conf = genesisConf({ "k-kinds": "semantic", "k-budget": "50", stage: "rank", fact: "k1" })
    expect(conf).toEqual({ kinds: "semantic", budget: "50", enrich: "", proposals: "", frontier: "", model: "" })
    expect(genesisQuery(conf, { stage: "check" })).toEqual({
      "k-kinds": "semantic",
      "k-budget": "50",
      "k-enrich": "",
      "k-proposals": "",
      "k-frontier": "",
      "k-model": "",
      stage: "check",
    })
    expect(mineCommand(conf)).toBe("ATLAS_MINE_SLOT=semantic ATLAS_MINE_BUDGET=50 atlas mine .")
    expect(mineCommand({ enrich: "1", kinds: "count" })).toBe("ATLAS_MINE_SLOT=count ATLAS_ENRICH=1 atlas mine .")
    expect(mineCommand({})).toBe("atlas mine .")
  })

  test("picks the first live fact with a stored answer and marks its refutation", () => {
    const base = atlasFixture()
    expect(sampleFact(createAtlasModel(base))).toBeUndefined()
    const answered = createAtlasModel({
      ...base,
      facts: base.facts.map((x) => (x.key === "k2" ? { ...x, why: "72de81ad9b9b" } : x)),
    })
    expect(sampleFact(answered)?.key).toBe("k2")
    expect(markRefutation("It holds. Refutation pass: none found.")).toEqual({
      before: "It holds. ",
      mark: "Refutation pass:",
      after: " none found.",
      more: false,
    })
    expect(markRefutation("I tried to REFUTE it twice.")).toEqual({ before: "I tried to ", mark: "REFUTE", after: " it twice.", more: false })
    expect(markRefutation("No objection.")).toEqual({ before: "No objection.", mark: "", after: "", more: false })
    const long = markRefutation(`${"a".repeat(950)} refuted`)
    expect([long.before.length, long.mark, long.after, long.more]).toEqual([900, "", "", true])
  })

    test("sends a tier pick as the tier itself and every other pick as its text", () => {
      const tier = { kind: "tier" as const, options: ["Rule · T1", "Core · T0", "Keep as a hint"] }
      expect([0, 1, 2].map((index) => interviewAnswer(tier, index))).toEqual(["T1", "T0", "Keep as a hint"])
      const owner = { kind: "owner" as const, options: ["seat:orchestrator", "a person on the team", "nobody yet"] }
      expect(interviewAnswer(owner, 1)).toBe("a person on the team")
      expect(interviewAnswer({ kind: "intent", options: null }, 0)).toBe("")
    })
})
