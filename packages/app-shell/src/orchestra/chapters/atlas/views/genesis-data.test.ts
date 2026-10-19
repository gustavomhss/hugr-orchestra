import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import {
  type GenesisQuestion,
  genesisConf,
  genesisQuery,
  INTERVIEW_CAP,
  interviewAnswer,
  KINDS,
  KNOBS,
  markRefutation,
  mineCommand,
  openQuestions,
  sampleFact,
  stages,
  storeCounts,
} from "./genesis-data"

const owner = (unit: string, facts: string, blast: string, rank: number): GenesisQuestion => ({
  kind: "owner",
  site: unit,
  ask: { key: "orchestra.atlas.genesis.iv.owner.ask", params: { unit } },
  why: { key: "orchestra.atlas.genesis.iv.owner.why", params: { facts, blast } },
  options: [
    { key: "orchestra.atlas.genesis.iv.owner.option.seat", params: { seat: "seat:orchestrator" } },
    { key: "orchestra.atlas.genesis.iv.owner.option.person", params: {} },
    { key: "orchestra.atlas.genesis.iv.owner.option.nobody", params: {} },
  ],
  rank,
})
const intent = (unit: string, facts: string, rank: number): GenesisQuestion => ({
  kind: "intent",
  site: unit,
  ask: { key: "orchestra.atlas.genesis.iv.intent.ask", params: { unit } },
  why: { key: "orchestra.atlas.genesis.iv.intent.why", params: { facts } },
  options: null,
  rank,
})

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

  test("asks owner and intent questions for every unit outside the root", () => {
    const result = openQuestions(createAtlasModel(atlasFixture()))
    expect(result.batch).toEqual([
      owner("packages/a", "2", "1", 1),
      owner("packages/b", "1", "1", 1),
      intent("packages/a", "2", 1),
      intent("packages/b", "1", 1),
    ])
    expect(result.deferred).toEqual([])
    expect(result.counts).toEqual({ owner: 2, tier: 0, contested: 0, intent: 2 })
  })

  test("ranks tier and contested questions by blast × tier weight", () => {
    const base = atlasFixture()
    const claim = `x never throws. ${"z".repeat(200)}`
    const result = openQuestions(
      createAtlasModel({ ...base, facts: [...base.facts, { ...base.facts[0], key: "k6", hash: "h-k6", tier: "T2", claim }] }),
    )
    expect(result.batch.map((question) => [question.kind, question.site, question.rank])).toEqual([
      ["tier", "packages/a/src/x.ts", 3],
      ["contested", "packages/a/src/x.ts", 2],
      ["owner", "packages/a", 1],
      ["owner", "packages/b", 1],
      ["intent", "packages/a", 1],
      ["intent", "packages/b", 1],
    ])
    expect(result.batch[0]).toEqual({
      kind: "tier",
      site: "packages/a/src/x.ts",
      key: "k6",
      ask: { key: "orchestra.atlas.genesis.iv.tier.ask", params: { claim: `x never throws. ${"z".repeat(183)}…` } },
      why: { key: "orchestra.atlas.genesis.iv.tier.why", params: { slot: "invariant", blast: "1" } },
      options: [
        { key: "orchestra.atlas.genesis.iv.tier.option.rule", params: {} },
        { key: "orchestra.atlas.genesis.iv.tier.option.core", params: {} },
        { key: "orchestra.atlas.genesis.iv.tier.option.hint", params: {} },
      ],
      rank: 3,
    })
    expect(result.batch[1]).toEqual({
      kind: "contested",
      site: "packages/a/src/x.ts",
      key: "k1",
      ask: { key: "orchestra.atlas.genesis.iv.contested.ask", params: { slot: "invariant", file: "x.ts" } },
      why: { key: "orchestra.atlas.genesis.iv.contested.why", params: { n: "2" } },
      options: [
        { key: "orchestra.atlas.genesis.iv.contested.option", params: { claim: "Writes are atomic." } },
        { key: "orchestra.atlas.genesis.iv.contested.option", params: { claim: `x never throws. ${"z".repeat(54)}` } },
        { key: "orchestra.atlas.genesis.iv.contested.option.both", params: {} },
      ],
      rank: 2,
    })
    expect(result.batch[2]).toEqual(owner("packages/a", "3", "1", 1))
    expect(result.counts).toEqual({ owner: 2, tier: 1, contested: 1, intent: 2 })
  })

  test("serves the top 20 and defers the rest", () => {
    const base = atlasFixture()
    const facts = Array.from({ length: 25 }, (_, i) => ({
      ...base.facts[3],
      key: `u${i}`,
      hash: `h-u${i}`,
      file: `packages/u${i}/src/f.ts`,
    }))
    const result = openQuestions(createAtlasModel({ ...base, facts }))
    expect([result.batch.length, result.deferred.length]).toEqual([20, 30])
    expect(result.batch[19]).toEqual(owner("packages/u19", "1", "0", 0))
    expect(result.deferred[0]).toEqual(owner("packages/u20", "1", "0", 0))
    expect(result.deferred[5]).toEqual(intent("packages/u0", "1", 0))
    expect(result.counts).toEqual({ owner: 25, tier: 0, contested: 0, intent: 25 })
  })
})
