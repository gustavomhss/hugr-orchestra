import { describe, expect, test } from "bun:test"
import { createAtlasModel } from "./atlas-model"
import { atlasFixture } from "./atlas-model.fixture"

const keys = (items: readonly { key: string }[]) => items.map((item) => item.key)

describe("atlas model: read side", () => {
  test("splits facts and candidates and keeps the CAS kind", () => {
    const model = createAtlasModel(atlasFixture())
    expect(keys(model.facts)).toEqual(["k1", "k2", "k3", "k4"])
    expect(keys(model.candidates)).toEqual(["k5"])
    expect(model.candidates[0].kind).toBe("candidate")
    expect(model.facts[0].kind).toBe("fact")
    expect(model.facts[0].factKind).toBe("advisory")
    expect(Object.keys(model.byKey).sort()).toEqual(["k1", "k2", "k3", "k4", "k5"])
    expect(keys(model.live())).toEqual(["k1", "k2", "k3", "k4"])
  })

  test("reads fresh, drifted and retired (authoring SUPERSEDED, D19)", () => {
    const model = createAtlasModel(atlasFixture())
    expect(["k1", "k2", "k3", "k4"].map((key) => model.state(model.byKey[key]))).toEqual(["fresh", "drifted", "retired", "fresh"])
  })

  test("folds files into units and groups", () => {
    const model = createAtlasModel(atlasFixture())
    expect(model.unitOf("packages/a/src/x.ts")).toBe("packages/a")
    expect(model.unitOf("README.md")).toBe("(root)")
    expect(model.unitOf("docs/x.md")).toBe("(root)")
    expect(model.unitOf("docs/guide/x.md")).toBe("docs/guide")
    expect([model.unitGroup("packages/a"), model.unitGroup("docs/guide"), model.unitGroup("harness/x"), model.unitGroup("(root)")]).toEqual(["code", "docs", "harness", "root"])
    expect(model.units().map((unit) => ({ ...unit, files: [...unit.files] }))).toEqual([
      { id: "packages/a", group: "code", level: "module", facts: 2, drifted: 1, governing: 1, unclassified: 1, files: ["packages/a/src/x.ts"] },
      { id: "packages/b", group: "code", level: "module", facts: 1, drifted: 0, governing: 1, unclassified: 0, files: ["packages/b/src/y.ts"] },
      { id: "(root)", group: "root", level: "module", facts: 1, drifted: 0, governing: 0, unclassified: 1, files: ["README.md"] },
    ])
  })

  test("counts stats, curation and code changes", () => {
    const model = createAtlasModel(atlasFixture())
    expect(model.stats()).toEqual({ facts: 4, governing: 2, advisory: 2, fresh: 2, drifted: 1, candidates: 1, toRatify: 0, files: 3 })
    expect(model.curationCount()).toBe(2)
    expect(model.codeChanges().map((change) => ({ sha: change.sha, subject: change.subject, facts: keys(change.facts) }))).toEqual([
      { sha: "c0ffee1", subject: "fix x", facts: ["k2"] },
    ])
  })

  test("builds the spatial tree and finds nodes", () => {
    const model = createAtlasModel(atlasFixture())
    const root = model.tree()
    expect([root.name, root.facts, root.candidates, root.drifted]).toEqual(["demo", 4, 1, 1])
    const unit = model.findNode("packages/a")
    expect([unit?.facts, unit?.candidates, unit?.drifted, unit?.file]).toEqual([2, 1, 1, false])
    expect(model.findNode("packages/a/src/x.ts")?.file).toBe(true)
    expect(model.findNode("nope")).toBeUndefined()
    expect(model.findNode("")).toEqual(root)
  })

  test("walks dependents transitively and outside the scope", () => {
    const model = createAtlasModel(atlasFixture())
    expect(model.dependents("packages/a")).toEqual(["packages/b/src/y.ts", "packages/c/src/z.ts"])
    expect(model.dependents("packages/b")).toEqual(["packages/c/src/z.ts"])
    expect(model.dependents("")).toEqual([])
    expect(model.dependentFacts("packages/a")).toBe(1)
  })

  test("composes the briefing in paid order", () => {
    const model = createAtlasModel(atlasFixture())
    const unit = model.briefing("packages/a")
    expect({ inv: keys(unit.inv), gotchas: keys(unit.gotchas), gov: keys(unit.gov), adv: keys(unit.adv), pull: keys(unit.pull) }).toEqual({
      inv: ["k1"], gotchas: [], gov: ["k1"], adv: ["k2"], pull: [],
    })
    expect(unit.pointers).toEqual([{ name: "own_src", path: "packages/a/src" }])
    expect([unit.pointerTotal, unit.used, unit.advUsed, unit.cap, unit.advCap]).toEqual([1, 51, 26, 1500, 750])
    expect(unit.depFiles).toEqual(["packages/b/src/y.ts", "packages/c/src/z.ts"])
    expect([keys(unit.depFacts), unit.depFactsTotal, unit.depsTotal]).toEqual([["k3"], 1, 2])
    const root = model.briefing("")
    expect({ inv: keys(root.inv), gotchas: keys(root.gotchas), adv: keys(root.adv), used: root.used, advUsed: root.advUsed }).toEqual({
      inv: ["k1"], gotchas: ["k3"], adv: ["k2", "k4"], used: 114, advUsed: 52,
    })
    expect(root.pointers).toEqual([{ name: "own_README.md", path: "README.md" }, { name: "own_packages", path: "packages" }])
  })

  test("names the most specific policy owner and reads provenance", () => {
    const model = createAtlasModel(atlasFixture())
    expect(model.packOwner("packages/a")).toEqual(["seat:orchestrator"])
    expect(model.packOwner("docs/guide")).toEqual([])
    expect(model.provenance()).toBe("trusted")
    const tracked = atlasFixture()
    expect(createAtlasModel({ ...tracked, tracked: { ...tracked.tracked, cas: 3 } }).provenance()).toBe("tracked-provable")
    expect(createAtlasModel({ ...tracked, tracked: { ...tracked.tracked, staging: true } }).provenance()).toBe("tracked-staging")
    expect(model.snapshot).toEqual({ revision: "", units: [], catalog: false, packs: {} })
    expect(model.territories()).toEqual([])
  })
})
