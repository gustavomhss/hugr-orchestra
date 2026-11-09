// G2.2 F1 — incremental rebuild executor oracle (RB-01..RB-20, TC-01..TC-05). Contract:
// modules/atlas/docs/design/genesis-g2.2-contract.md §3.3/§3.4. Graph z → a → m, i independent,
// contra-alphabetical order. Expected affected sets and bodies are test constants. Every test must
// fail on the unimplemented seam (named failure), never on import/collection error.

import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { StoreApi } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { OwnershipArtifact, OwnershipInput, OwnershipManifest, OwnershipReceipt, OwnershipResult, OwnershipReview } from "@atlas/knowledge"
import { readOwnership } from "@atlas/knowledge"
import type { CasObject } from "@atlas/kernel"
import { rebuildOwnershipUpdate } from "../src/ownership-rebuild.js"
import type { OwnershipRecipe, OwnershipRecipeInput, OwnershipRebuildRequest } from "../src/ownership-rebuild.js"
import type { OwnershipInputObservation } from "../src/ownership-input.js"

const SCOPE = "g2.2-rebuild"
type Obs = OwnershipInputObservation
const present = (version: string): Obs => ({ kind: "present", version })

function bodyFrom(key: string, declared: readonly string[], captured: ReadonlyMap<string, Obs>): string {
  const tokens: string[] = []
  for (const input of declared) {
    const value = captured.get(input)
    if (value?.kind === "present") tokens.push(value.version)
  }
  return `Reviewed ${key} ${tokens.join(" ")}\n`
}

function zamiFixture() {
  const store = createStore()
  const seeded: CasObject[] = []
  const putSeeded = (obj: CasObject): Hash => { seeded.push(obj); return store.put(obj) }
  const contractRef = putSeeded({ kind: "ownership-contract", version: 1, criteria: ["supported"] })
  const observations = new Map<string, Obs>([
    ["file:src/core/z.ts", present("z-source-1")],
    ["members:src/core", present("members-1")],
    ["file:intent-a.md", present("intent-1")],
    ["file:recipe-z.ts", present("recipe-z-1")],
    ["file:recipe-a.ts", present("recipe-a-1")],
    ["file:recipe-m.ts", present("recipe-m-1")],
    ["file:recipe-i.ts", present("recipe-i-1")],
    ["file:independent.ts", present("independent-1")],
  ])
  const memberSets = new Map<string, string[]>([["src/core", ["src/core/z.ts"]]])
  const observe = (key: string): Obs => observations.get(key) ?? { kind: "unavailable" }
  const listMembers = (dir: string): readonly string[] => memberSets.get(dir) ?? []
  const executed: string[] = []
  const declared: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
    ["z", ["file:src/core/z.ts", "members:src/core", "file:recipe-z.ts"]],
    ["a", ["file:intent-a.md", "file:recipe-a.ts"]],
    ["m", ["file:recipe-m.ts"]],
    ["i", ["file:independent.ts", "file:recipe-i.ts"]],
  ])
  const requiredMap: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
    ["z", []], ["a", ["z"]], ["m", ["a"]], ["i", []],
  ])
  const artifact = (key: string, inputs: readonly OwnershipInput[], dependencies: OwnershipReceipt["dependencies"], body: string, scope = SCOPE, basis = "explicit synthetic fixture") => {
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1,
      body: putSeeded({ kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(body)) }),
      authority: { scope, basis }, validity: "supported", gaps: [], evidence: ["fixture, not semantic acceptance"],
    }
    const resultRef = putSeeded(result)
    const reviews = ["fixture-1", "fixture-2"].map((reviewer) => {
      const review: OwnershipReview = {
        kind: "ownership-review", version: 1, reviewer, contract: contractRef,
        inputs: id({ inputs, dependencies }), result: resultRef, criteria: ["supported"], verdict: "pass",
        provenance: "synthetic fixture, not a real judge decision",
      }
      return putSeeded(review)
    })
    const receipt: OwnershipReceipt = { kind: "ownership-receipt", version: 1, contract: contractRef, inputs, dependencies, reviews }
    const value: OwnershipArtifact = {
      kind: "ownership-artifact", version: 1, key, scope, title: key,
      layer: 4, need: "operational", result: resultRef, receipt: putSeeded(receipt), navigation: [],
    }
    const ref = putSeeded(value)
    return { value, ref, result, resultRef, receipt }
  }
  const inputsFor = (key: string): OwnershipInput[] =>
    (declared.get(key) ?? []).flatMap((k) => { const v = observations.get(k); return v?.kind === "present" ? [{ key: k, version: v.version }] : [] })
  const runFor = (key: string) => (input: OwnershipRecipeInput) => {
    executed.push(key)
    if (key === "z") {
      const members = input.captured.get("members:src/core")
      const files = [...input.captured.entries()].filter(([k, v]) => k.startsWith("file:src/core/") && v.kind === "present").sort((x, y) => x[0] < y[0] ? -1 : 1).map(([, v]) => (v as { version: string }).version)
      const recipe = input.captured.get("file:recipe-z.ts")
      const tokens = [(members?.kind === "present" ? members.version : "members-absent"), ...files, ...(recipe?.kind === "present" ? [recipe.version] : [])]
      return { body: `Reviewed z ${tokens.join(" ")}\n`, authorityBasis: "fixture recipe z" }
    }
    return { body: bodyFrom(key, declared.get(key) ?? [], input.captured), authorityBasis: `fixture recipe ${key}` }
  }
  const recipeFor = (key: string, run?: OwnershipRecipe["run"], extra?: Partial<OwnershipRecipe>): OwnershipRecipe => ({
    key,
    recipeInputKey: `file:recipe-${key}.ts`,
    recipeVersion: (observations.get(`file:recipe-${key}.ts`) as { version: string }).version,
    declaredInputs: declared.get(key) ?? [],
    required: requiredMap.get(key) ?? [],
    run: run ?? runFor(key),
    ...extra,
  })
  const buildRecipes = (overrides: Partial<Record<string, OwnershipRecipe>> = {}): Map<string, OwnershipRecipe> =>
    new Map<string, OwnershipRecipe>(["z", "a", "m", "i"].map((k) => [k, overrides[k] ?? recipeFor(k)]))
  const capturedSnapshot = (): Map<string, Obs> => new Map(observations)
  const depsFor = (key: string, refs: ReadonlyMap<string, Hash>): OwnershipReceipt["dependencies"] =>
    (requiredMap.get(key) ?? []).map((dep) => ({ key: dep, result: refs.get(dep) as Hash }))
  const buildBaseline = () => {
    const snapshot = capturedSnapshot()
    const refs = new Map<string, Hash>()
    const bodies = new Map<string, string>()
    const order = ["z", "a", "m", "i"]
    const built = new Map<string, ReturnType<typeof artifact>>()
    for (const key of order) {
      const out = runFor(key)({ captured: snapshot, dependencies: refs })
      bodies.set(key, out.body)
      const current = artifact(key, inputsFor(key), depsFor(key, refs), out.body)
      built.set(key, current)
      refs.set(key, current.resultRef)
    }
    const manifest: OwnershipManifest = {
      kind: "ownership-manifest", version: 1, scope: SCOPE,
      entries: order.map((k) => ({ key: k, artifact: (built.get(k) as ReturnType<typeof artifact>).ref })),
      roots: { operational: "m" },
    }
    return { manifest, manifestRef: putSeeded(manifest), built, bodies, refs }
  }
  const baseline = buildBaseline()
  const request = (overrides: Partial<OwnershipRebuildRequest> = {}): OwnershipRebuildRequest => ({
    store, manifest: baseline.manifestRef, scope: SCOPE, observe, listMembers, recipes: buildRecipes(), contract: contractRef, ...overrides,
  })
  const rebuild = (overrides: Partial<OwnershipRebuildRequest> = {}) => rebuildOwnershipUpdate(request(overrides))
  const currentFor = (obs: ReadonlyMap<string, Obs>) => (key: string): string | undefined => {
    const v = obs.get(key); return v?.kind === "present" ? v.version : undefined
  }
  const receiptInputs = (manifestRef: Hash, key: string): readonly OwnershipInput[] => {
    const manifest = store.get(manifestRef) as OwnershipManifest | undefined
    if (manifest?.kind !== "ownership-manifest") throw new Error("manifest not found")
    const entry = manifest.entries.find((e) => e.key === key)
    const art = store.get(entry!.artifact) as OwnershipArtifact | undefined
    if (art?.kind !== "ownership-artifact") throw new Error("artifact not found")
    const receipt = store.get(art.receipt) as OwnershipReceipt | undefined
    if (receipt?.kind !== "ownership-receipt") throw new Error("receipt not found")
    return receipt.inputs
  }
  const reseed = (target: StoreApi): Hash => { for (const obj of seeded) target.put(obj); return baseline.manifestRef }
  return { store, contractRef, observations, memberSets, observe, listMembers, executed, artifact, inputsFor, depsFor, recipeFor, buildRecipes, runFor, capturedSnapshot, baseline, request, rebuild, currentFor, receiptInputs, reseed, putSeeded, declared, requiredMap }
}

describe("G2.2 incremental rebuild", () => {
  it("RB-01 unchanged generation reuses with zero calls", () => {
    const f = zamiFixture()
    expect(f.rebuild()).toEqual({ kind: "candidate", manifest: f.baseline.manifestRef, affected: [], calls: [] })
    expect(f.executed).toEqual([])
  })
  it("RB-02 source edit rebuilds the independently expected closure", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    const result = f.rebuild()
    expect(result).toMatchObject({ kind: "candidate", affected: ["z", "a", "m"], calls: ["z", "a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const read = readOwnership(f.store, result.manifest, { scope: SCOPE, key: "m", maxBytes: 4096 }, f.currentFor(new Map(f.observations)))
    expect(read).toMatchObject({ kind: "ready", body: "Reviewed m recipe-m-1\n" })
    const readZ = readOwnership(f.store, result.manifest, { scope: SCOPE, key: "z", maxBytes: 4096 }, f.currentFor(new Map(f.observations)))
    expect(readZ).toMatchObject({ kind: "ready", body: "Reviewed z members-1 z-source-2 recipe-z-1\n" })
  })
  it("RB-03 source addition is consumed and bound", () => {
    const f = zamiFixture()
    f.observations.set("members:src/core", present("members-2"))
    f.observations.set("file:src/core/new.ts", present("new-1"))
    f.memberSets.set("src/core", ["src/core/new.ts", "src/core/z.ts"])
    const result = f.rebuild()
    expect(result).toMatchObject({ kind: "candidate", affected: ["z", "a", "m"], calls: ["z", "a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const inputs = f.receiptInputs(result.manifest, "z").map((i) => i.key)
    expect(inputs).toContain("file:src/core/new.ts")
    expect(inputs).toContain("members:src/core")
    const readZ = readOwnership(f.store, result.manifest, { scope: SCOPE, key: "z", maxBytes: 4096 }, f.currentFor(new Map(f.observations)))
    expect(readZ).toMatchObject({ kind: "ready", body: "Reviewed z members-2 new-1 z-source-1 recipe-z-1\n" })
  })
  it("RB-04 unstaged source removal completes a guarded rebuild", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", { kind: "absent" })
    f.observations.set("members:src/core", present("members-2"))
    f.memberSets.set("src/core", [])
    const result = f.rebuild()
    expect(result).toMatchObject({ kind: "candidate", affected: ["z", "a", "m"], calls: ["z", "a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const inputs = f.receiptInputs(result.manifest, "z").map((i) => i.key)
    expect(inputs).not.toContain("file:src/core/z.ts")
    expect(inputs).toContain("members:src/core")
    const readZ = readOwnership(f.store, result.manifest, { scope: SCOPE, key: "z", maxBytes: 4096 }, f.currentFor(new Map(f.observations)))
    expect(readZ).toMatchObject({ kind: "ready", body: "Reviewed z members-2 recipe-z-1\n" })
  })
  it("RB-05 accepted removal remains stable and detects recreation", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", { kind: "absent" })
    f.observations.set("members:src/core", present("members-2"))
    f.memberSets.set("src/core", [])
    const removed = f.rebuild()
    if (removed.kind !== "candidate") throw new Error("expected candidate")
    expect(f.rebuild({ manifest: removed.manifest })).toEqual({ kind: "candidate", manifest: removed.manifest, affected: [], calls: [] })
    f.observations.set("file:src/core/z.ts", present("z-source-1"))
    f.observations.set("members:src/core", present("members-1"))
    f.memberSets.set("src/core", ["src/core/z.ts"])
    const restored = f.rebuild({ manifest: removed.manifest })
    expect(restored).toMatchObject({ kind: "candidate", calls: ["z", "a", "m"] })
    if (restored.kind !== "candidate") throw new Error("expected candidate")
    expect(f.receiptInputs(restored.manifest, "z").map((i) => i.key)).toContain("file:src/core/z.ts")
  })
  it("RB-06 intent edit rebuilds only its required closure", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const result = f.rebuild()
    expect(result).toMatchObject({ kind: "candidate", affected: ["a", "m"], calls: ["a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const manifest = f.store.get(result.manifest) as OwnershipManifest
    const orig = f.store.get(f.baseline.manifestRef) as OwnershipManifest
    expect(manifest.entries.find((e) => e.key === "z")!.artifact).toBe(orig.entries.find((e) => e.key === "z")!.artifact)
    expect(manifest.entries.find((e) => e.key === "i")!.artifact).toBe(orig.entries.find((e) => e.key === "i")!.artifact)
    expect(f.executed).toEqual(["a", "m"])
  })
  it("RB-07 recipe change executes the newly bound implementation", () => {
    const f = zamiFixture()
    f.observations.set("file:recipe-a.ts", present("recipe-a-2"))
    const recipes = f.buildRecipes({ a: f.recipeFor("a", (input) => { f.executed.push("a"); return { body: "Reviewed a intent-1 recipe-a-2 v2\n", authorityBasis: "fixture recipe a" } }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "candidate", calls: ["a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const read = readOwnership(f.store, result.manifest, { scope: SCOPE, key: "a", maxBytes: 4096 }, f.currentFor(new Map(f.observations)))
    expect(read).toMatchObject({ kind: "ready", body: "Reviewed a intent-1 recipe-a-2 v2\n" })
    expect(f.receiptInputs(result.manifest, "a").map((i) => i.version)).toContain("recipe-a-2")
  })
  it("RB-08 equal result renews receipt and stops downstream calls", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    const stableBody = f.baseline.bodies.get("z") as string
    const recipes = f.buildRecipes({ z: f.recipeFor("z", (input) => { f.executed.push("z"); return { body: stableBody, authorityBasis: "fixture recipe z" } }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "candidate", affected: ["z", "a", "m"], calls: ["z"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const manifest = f.store.get(result.manifest) as OwnershipManifest
    const orig = f.store.get(f.baseline.manifestRef) as OwnershipManifest
    expect(manifest.entries.find((e) => e.key === "a")!.artifact).toBe(orig.entries.find((e) => e.key === "a")!.artifact)
    expect(manifest.entries.find((e) => e.key === "m")!.artifact).toBe(orig.entries.find((e) => e.key === "m")!.artifact)
    const zArt = f.store.get(manifest.entries.find((e) => e.key === "z")!.artifact) as OwnershipArtifact
    const zOrig = f.store.get(orig.entries.find((e) => e.key === "z")!.artifact) as OwnershipArtifact
    expect(zArt.result).toBe(zOrig.result)
    expect(zArt.receipt).not.toBe(zOrig.receipt)
  })
  it("RB-09 child renewal stops propagation at its unchanged result", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    const result = f.rebuild()
    expect(result).toMatchObject({ kind: "candidate", affected: ["z", "a", "m"], calls: ["z", "a"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const manifest = f.store.get(result.manifest) as OwnershipManifest
    const orig = f.store.get(f.baseline.manifestRef) as OwnershipManifest
    expect(manifest.entries.find((e) => e.key === "m")!.artifact).toBe(orig.entries.find((e) => e.key === "m")!.artifact)
    expect(f.executed).toEqual(["z", "a"])
  })
  it("RB-10 parent equality cannot hide a direct child change", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    f.observations.set("file:intent-a.md", present("intent-2"))
    const recipes = f.buildRecipes({
      z: f.recipeFor("z", (input) => { f.executed.push("z"); return { body: f.baseline.bodies.get("z") as string, authorityBasis: "fixture recipe z" } }),
      a: f.recipeFor("a", (input) => { f.executed.push("a"); return { body: f.baseline.bodies.get("a") as string, authorityBasis: "fixture recipe a" } }),
    })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "candidate", calls: ["z", "a"] })
    expect(f.executed).toContain("a")
  })
  it("RB-11 all prerequisites settle before one dependent execution", () => {
    const f = zamiFixture()
    f.observations.set("file:recipe-b.ts", present("recipe-b-1"))
    const b = f.artifact("b", [{ key: "file:recipe-b.ts", version: "recipe-b-1" }], [], "Reviewed b recipe-b-1\n")
    const aNew = f.artifact("a", f.inputsFor("a"), [{ key: "z", result: f.baseline.built.get("z")!.resultRef }, { key: "b", result: b.resultRef }], f.baseline.bodies.get("a") as string)
    const manifest: OwnershipManifest = {
      kind: "ownership-manifest", version: 1, scope: SCOPE,
      entries: [
        { key: "z", artifact: f.baseline.built.get("z")!.ref },
        { key: "a", artifact: aNew.ref },
        { key: "m", artifact: f.baseline.built.get("m")!.ref },
        { key: "i", artifact: f.baseline.built.get("i")!.ref },
        { key: "b", artifact: b.ref },
      ],
      roots: { operational: "m" },
    }
    const manifestRef = f.store.put(manifest)
    const recipes = f.buildRecipes()
    recipes.set("b", { key: "b", recipeInputKey: "file:recipe-b.ts", recipeVersion: "recipe-b-1", declaredInputs: ["file:recipe-b.ts"], required: [], run: (input) => { f.executed.push("b"); return { body: bodyFrom("b", ["file:recipe-b.ts"], input.captured), authorityBasis: "fixture recipe b" } } })
    recipes.set("a", f.recipeFor("a", f.runFor("a"), { declaredInputs: ["file:intent-a.md", "file:recipe-a.ts"], required: ["z", "b"] }))
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    f.observations.set("file:recipe-b.ts", present("recipe-b-2"))
    const result = rebuildOwnershipUpdate(f.request({ manifest: manifestRef, recipes }))
    expect(result).toMatchObject({ kind: "candidate", affected: ["b", "z", "a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const idx = (k: string): number => result.calls.indexOf(k)
    expect(["b", "z", "a", "m"].every((k) => idx(k) >= 0)).toBe(true)
    expect(idx("a") > idx("b") && idx("a") > idx("z")).toBe(true)
    expect(result.calls.filter((k) => k === "a")).toHaveLength(1)
  })
  it("RB-12 full result identity controls propagation", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    const recipes = f.buildRecipes({ z: f.recipeFor("z", (input) => { f.executed.push("z"); return { body: f.baseline.bodies.get("z") as string, authorityBasis: "different authority" } }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "candidate", calls: ["z", "a", "m"] })
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const manifest = f.store.get(result.manifest) as OwnershipManifest
    const zArt = f.store.get(manifest.entries.find((e) => e.key === "z")!.artifact) as OwnershipArtifact
    expect(zArt?.kind === "ownership-artifact" ? zArt.result : "missing").not.toBe(f.baseline.built.get("z")!.resultRef)
  })
  it("RB-13 rejected or unbound revalidation cannot renew a receipt", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const blocked = rebuildOwnershipUpdate(f.request({ recipes: f.buildRecipes({ a: f.recipeFor("a", () => ({ body: "Blocked body\n", validity: "blocked" as const, gaps: ["ixture gap"] })) }) }))
    expect(blocked).toEqual({ kind: "hold", reason: "ownership-blocked", evidence: expect.anything() })
    expect(blocked).not.toHaveProperty("manifest")
    const g = zamiFixture()
    const badReviews = g.baseline.built.get("i")!.receipt.reviews
    const badReceipt: OwnershipReceipt = { ...g.baseline.built.get("a")!.receipt, reviews: badReviews }
    const badRef = g.store.put(badReceipt)
    const badArt = g.store.put({ ...g.baseline.built.get("a")!.value, receipt: badRef })
    const manifest = g.store.put({ ...g.baseline.manifest, entries: g.baseline.manifest.entries.map((e) => e.key === "a" ? { key: "a", artifact: badArt } : e) })
    expect(rebuildOwnershipUpdate(g.request({ manifest }))).toMatchObject({ kind: "hold", reason: "ownership-review" })
    expect(g.executed).toEqual([])
  })
  it("RB-14 an omitted declared input prevents successful rebuild", () => {
    const f = zamiFixture()
    const zThin = f.artifact("z", [{ key: "file:src/core/z.ts", version: "z-source-1" }, { key: "file:recipe-z.ts", version: "recipe-z-1" }], [], f.baseline.bodies.get("z") as string)
    const manifest = f.store.put({ ...f.baseline.manifest, entries: f.baseline.manifest.entries.map((e) => e.key === "z" ? { key: "z", artifact: zThin.ref } : e) })
    expect(f.rebuild({ manifest })).toMatchObject({ kind: "hold", reason: "malformed-ownership" })
    expect(f.executed).toEqual([])
    expect(f.rebuild({ manifest })).not.toHaveProperty("manifest")
  })
  it("RB-15 an omitted required edge prevents successful rebuild", () => {
    const f = zamiFixture()
    const aThin = f.artifact("a", f.inputsFor("a"), [], f.baseline.bodies.get("a") as string)
    const manifest = f.store.put({ ...f.baseline.manifest, entries: f.baseline.manifest.entries.map((e) => e.key === "a" ? { key: "a", artifact: aThin.ref } : e) })
    expect(f.rebuild({ manifest })).toMatchObject({ kind: "hold", reason: "ownership-dependency-changed" })
    expect(f.executed).toEqual([])
  })
  it("RB-16 recipe or evaluation-contract mismatch cannot hit reuse", () => {
    const f = zamiFixture()
    const wrongRecipe = f.buildRecipes({ a: f.recipeFor("a", undefined, { recipeVersion: "recipe-a-999" }) })
    expect(rebuildOwnershipUpdate(f.request({ recipes: wrongRecipe }))).toMatchObject({ kind: "hold", reason: "malformed-ownership" })
    const otherContract = f.store.put({ kind: "ownership-contract", version: 1, criteria: ["other"] })
    expect(rebuildOwnershipUpdate(f.request({ contract: otherContract }))).toMatchObject({ kind: "hold", reason: "ownership-review" })
    expect(f.executed).toEqual([])
  })
  it("RB-17 missing mandatory input or membership root holds", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", { kind: "absent" })
    expect(f.rebuild()).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
    const g = zamiFixture()
    g.observations.set("members:src/core", { kind: "absent" })
    expect(g.rebuild()).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
  })
  it("RB-18 invalid baseline never dispatches work", () => {
    const f = zamiFixture()
    expect(f.rebuild({ manifest: id("missing manifest") })).toMatchObject({ kind: "hold", reason: "ownership-missing" })
    expect(f.executed).toEqual([])
    const g = zamiFixture()
    const empty = g.store.put({ ...g.baseline.manifest, entries: [], roots: {} })
    expect(g.rebuild({ manifest: empty })).toMatchObject({ kind: "hold", reason: "malformed-ownership" })
    expect(g.executed).toEqual([])
    const h = zamiFixture()
    const cyclic = h.artifact("z", h.inputsFor("z"), [{ key: "m", result: h.baseline.built.get("m")!.resultRef }], h.baseline.bodies.get("z") as string)
    const manifest = h.store.put({ ...h.baseline.manifest, entries: h.baseline.manifest.entries.map((e) => e.key === "z" ? { key: "z", artifact: cyclic.ref } : e) })
    expect(h.rebuild({ manifest })).toMatchObject({ kind: "hold", reason: "ownership-cycle" })
    expect(h.executed).toEqual([])
  })
  it("RB-19 persisted candidate supports zero-call reuse after reopen", () => {
    const f = zamiFixture()
    const candidate = f.rebuild()
    if (candidate.kind !== "candidate") throw new Error("expected candidate")
    const reopened = createStore()
    f.reseed(reopened)
    const again = rebuildOwnershipUpdate({ store: reopened, manifest: candidate.manifest, scope: SCOPE, observe: (k) => f.observations.get(k) ?? { kind: "unavailable" }, listMembers: f.listMembers, recipes: f.buildRecipes(), contract: f.contractRef })
    expect(again).toEqual({ kind: "candidate", manifest: candidate.manifest, affected: [], calls: [] })
    expect(f.executed).toEqual([])
  })
  it("RB-20 preparation never activates or poisons another scope", () => {
    const f = zamiFixture()
    const other = f.artifact("other", [{ key: "file:independent.ts", version: "independent-1" }], [], "Reviewed other independent-1\n", "other-scope")
    const otherManifest: OwnershipManifest = { kind: "ownership-manifest", version: 1, scope: "other-scope", entries: [{ key: "other", artifact: other.ref }], roots: { operational: "other" } }
    const otherRef = f.store.put(otherManifest)
    const current = f.currentFor(new Map(f.observations))
    expect(f.rebuild()).toMatchObject({ kind: "candidate" })
    expect(readOwnership(f.store, otherRef, { scope: "other-scope", key: "other", maxBytes: 4096 }, current)).toMatchObject({ kind: "ready" })
    f.observations.set("file:intent-a.md", { kind: "absent" })
    expect(f.rebuild()).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
    expect(f.rebuild()).not.toHaveProperty("manifest")
    expect(readOwnership(f.store, otherRef, { scope: "other-scope", key: "other", maxBytes: 4096 }, current)).toMatchObject({ kind: "ready" })
    const g = zamiFixture()
    const broken = g.store.put({ ...g.baseline.manifest, entries: g.baseline.manifest.entries.map((e) => e.key === "i" ? { key: "i", artifact: id("missing independent artifact") } : e) })
    expect(g.rebuild({ manifest: broken })).toMatchObject({ kind: "hold", reason: "ownership-missing" })
    expect(g.executed).toEqual([])
  })
})

describe("G2.2 concurrency", () => {
  it("TC-01 drift before first dispatch invalidates the plan", () => {
    const f = zamiFixture()
    const seen = new Set<string>()
    const observe = (key: string): Obs => {
      if (!seen.has(key)) { seen.add(key); return f.observations.get(key) ?? { kind: "unavailable" } }
      return key === "file:src/core/z.ts" ? present("z-source-2") : (f.observations.get(key) ?? { kind: "unavailable" })
    }
    const result = rebuildOwnershipUpdate(f.request({ observe }))
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(f.executed).toEqual([])
    expect(result).not.toHaveProperty("manifest")
  })
  it("TC-02 drift during production rejects the captured attempt", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const recipes = f.buildRecipes({ a: f.recipeFor("a", (input) => { f.executed.push("a"); f.observations.set("file:intent-a.md", present("intent-3")); return { body: "Reviewed a intent-2 recipe-a-1\n", authorityBasis: "fixture recipe a" } }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(result).not.toHaveProperty("manifest")
    expect(f.executed).toEqual(["a"])
  })
  it("TC-03 drift in a reused artifact fails the final sweep", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    const recipes = f.buildRecipes({ z: f.recipeFor("z", (input) => { f.observations.set("file:independent.ts", present("independent-2")); return f.runFor("z")(input) }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(result).not.toHaveProperty("manifest")
    expect(f.executed).toEqual(["z"])
  })
  it("TC-04 membership churn cannot be silently absorbed after planning", () => {
    const f = zamiFixture()
    f.observations.set("file:src/core/z.ts", present("z-source-2"))
    const recipes = f.buildRecipes({ z: f.recipeFor("z", (input) => { f.observations.set("members:src/core", present("members-3")); f.observations.set("file:src/core/new.ts", present("new-1")); f.memberSets.set("src/core", ["src/core/new.ts", "src/core/z.ts"]); return f.runFor("z")(input) }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(result).not.toHaveProperty("manifest")
  })
  it("TC-05 ABA cannot change the bytes consumed by the recipe", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const seenByRecipe: Obs[] = []
    const recipes = f.buildRecipes({ a: f.recipeFor("a", (input) => {
      f.executed.push("a")
      const captured = input.captured.get("file:intent-a.md") as Obs
      seenByRecipe.push(captured)
      f.observations.set("file:intent-a.md", present("intent-3"))
      f.observations.set("file:intent-a.md", present("intent-2"))
      return { body: "Reviewed a intent-2 recipe-a-1\n", authorityBasis: "fixture recipe a" }
    }) })
    const result = rebuildOwnershipUpdate(f.request({ recipes }))
    expect(result).toMatchObject({ kind: "candidate", calls: ["a", "m"] })
    expect(seenByRecipe).toEqual([present("intent-2")])
    if (result.kind !== "candidate") throw new Error("expected candidate")
    const read = readOwnership(f.store, result.manifest, { scope: SCOPE, key: "a", maxBytes: 4096 }, f.currentFor(new Map(f.observations)))
    expect(read).toMatchObject({ kind: "ready", body: "Reviewed a intent-2 recipe-a-1\n" })
  })
})
