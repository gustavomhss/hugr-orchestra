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

describe("atlas model: write path, health, memory and graphs", () => {
  test("runs the check gates in order and stops at the first refusal", () => {
    const model = createAtlasModel(atlasFixture())
    const gates = (key: string, options: Parameters<typeof model.checks>[1]) =>
      model.checks(model.byKey[key], options).gates.map((gate) => [gate.gate, gate.pass, gate.reached])
    expect(model.checks(model.byKey.k4, { tier: "T0", token: "billy" }).wouldEmit).toBe(true)
    expect(gates("k2", { tier: "T1", token: "k" })).toEqual([
      ["shape", true, true], ["truth", false, true], ["authz", true, false], ["ratify", true, false],
    ])
    const downgrade = model.checks(model.byKey.k1, { promote: true, token: "k" })
    expect(downgrade.wouldEmit).toBe(false)
    expect(downgrade.gates[2]).toEqual({ gate: "authz", pass: false, reason: "governance-downgrade", remedy: "raise-tier", reached: true })
    const draft = model.checks(model.byKey.k4, { draft: true, regrounds: true, token: "k" })
    expect(draft.gates[2]).toEqual({ gate: "authz", pass: false, reason: "unauthorized", remedy: "grant-scope", scope: "README.md", reached: true })
    expect(model.checks(model.byKey.k4, { tier: "T0", token: "k" }).gates[3]).toEqual({ gate: "ratify", pass: false, reason: "unratified", remedy: "token-billy", reached: true })
  })

  test("re-presents every staging row on promote, and refuses on a store in git", () => {
    const model = createAtlasModel(atlasFixture())
    const run = model.promoteRun("k")
    expect(run.rows.map((row) => [row.nodeKey, row.settled, row.rejected])).toEqual([
      ["k1", false, "governance-downgrade"], ["k2", false, "ungrounded"], ["k3", false, "governance-downgrade"], ["k4", true, undefined], ["k5", true, undefined],
    ])
    expect([run.read, run.candidates, run.promoted, run.refused]).toEqual([true, 5, 2, 3])
    const tracked = atlasFixture()
    const locked = createAtlasModel({ ...tracked, tracked: { ...tracked.tracked, cas: 3 } })
    expect(locked.writable()).toBe(false)
    expect(locked.promoteRun("k")).toEqual({ read: false, refusal: "untrusted", candidates: 0, promoted: 0, refused: 0, rows: [] })
    expect(locked.reconcile()).toEqual({ base: "927f47e8", drift: [], mechanical: [], semantic: [], regroundedCount: 0, reauthorCount: 0, exitCode: 0, blind: true })
  })

  test("reconciles drifted facts as semantic and plans their retirement", () => {
    const model = createAtlasModel(atlasFixture())
    const result = model.reconcile()
    expect([result.drift.map((item) => item.fact.key), result.reauthorCount, result.exitCode]).toEqual([["k2"], 1, 2])
    expect(model.why(model.byKey.k2)).toEqual({ class: "semantic", plan: "retire" })
    expect(model.why(model.byKey.k1)).toBeUndefined()
  })

  test("reports health from the store's own files", () => {
    expect(createAtlasModel(atlasFixture()).health()).toEqual({
      provenance: "trusted",
      cas: { objects: 5, referenced: 4, missing: 0, orphan: 1, corrupt: 0, unreadable: 0, sound: true },
      proofs: { sealedProven: 0, reProven: 0, broken: 0, unverifiable: 0, dangling: 0 },
      index: {
        scip: true,
        configured: [
          { lang: "ts", tool: "scip-typescript", version: "0.4.0", files: 4 },
          { lang: "py", tool: "scip-python", version: "0.6.6", files: 2 },
        ],
        holes: [],
      },
      generations: ["projection.json", "staging.json"],
      hotSet: 4,
    })
  })

  test("builds the unseeded header block and empty memory", () => {
    const model = createAtlasModel(atlasFixture())
    expect(model.headerText("jimmy")).toBe(
      '<atlas-header member="jimmy" rules="0" rule-words="0">\nAwareness:\n- mission: unseeded\n- constitution: unseeded\n- terrain: unseeded\n- ontology: unseeded\n- taste: unseeded\nOrientation: none recorded\nProject rules: none recorded\n</atlas-header>',
    )
    expect(model.memory.maestro.bound).toBe(false)
    expect(model.memory.backend).toEqual({ bound: true, tasks: [], prs: [], rules: [] })
    expect(model.header("backend")).toEqual({ injected: [], evicted: [] })
    expect(model.words("  a b  c ")).toBe(3)
    expect(model.frecency({ rule: "x", scope: "s", age: 2, from: "x" })).toBe(0.25)
    expect(model.activity()).toEqual([])
  })

  test("draws the unit graph and one unit's file graph", () => {
    const model = createAtlasModel(atlasFixture())
    expect(model.unitGraph().edges).toEqual([{ source: "packages/b", target: "packages/a", w: 1 }])
    expect(model.fileGraph("packages/a")).toEqual({
      files: ["packages/a/src/x.ts"],
      outside: [["packages/b", 1]],
      edges: [{ source: "unit:packages/b", target: "packages/a/src/x.ts", w: 1 }],
    })
  })
})
