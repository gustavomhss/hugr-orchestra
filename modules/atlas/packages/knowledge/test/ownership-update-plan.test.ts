import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { OwnershipArtifact, OwnershipInput, OwnershipManifest, OwnershipReceipt, OwnershipResult, OwnershipReview } from "../src/ownership/types.js"
import { readOwnership } from "../src/ownership/read.js"
import { planOwnershipUpdate } from "../src/ownership/update-plan.js"
import type { OwnershipInputObservation } from "../src/ownership/update-plan.js"

function fixture() {
  const store = createStore()
  const contract = store.put({ kind: "ownership-contract", version: 1, criteria: ["supported"] })
  const observations = new Map<string, OwnershipInputObservation>([
    ["file:source.ts", { kind: "present", version: "source-1" }],
    ["members:src", { kind: "present", version: "members-1" }],
    ["file:intent.md", { kind: "present", version: "intent-1" }],
    ["file:recipe.ts", { kind: "present", version: "recipe-1" }],
    ["file:independent.ts", { kind: "present", version: "independent-1" }],
  ])
  const artifact = (key: string, inputs: readonly OwnershipInput[], dependencies: OwnershipReceipt["dependencies"] = [], navigation: readonly string[] = [], basis = "explicit synthetic fixture") => {
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1,
      body: store.put({ kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(`Reviewed ${key}.\n`)) }),
      authority: { scope: "session-input", basis },
      validity: "supported", gaps: [], evidence: ["fixture, not semantic acceptance"],
    }
    const resultRef = store.put(result)
    const reviews = ["reviewer-1", "reviewer-2"].map((reviewer) => {
      const review: OwnershipReview = {
        kind: "ownership-review", version: 1, reviewer, contract,
        inputs: id({ inputs, dependencies }), result: resultRef, criteria: ["supported"], verdict: "pass",
        provenance: "synthetic test record; not a real judge decision",
      }
      return store.put(review)
    })
    const receipt: OwnershipReceipt = { kind: "ownership-receipt", version: 1, contract, inputs, dependencies, reviews }
    const value: OwnershipArtifact = {
      kind: "ownership-artifact", version: 1, key, scope: "session-input", title: key,
      layer: 4, need: "operational", result: resultRef, receipt: store.put(receipt), navigation,
    }
    return { value, ref: store.put(value), result, resultRef, receipt }
  }
  const base = artifact("base", [{ key: "file:source.ts", version: "source-1" }, { key: "members:src", version: "members-1" }])
  const flow = artifact("flow", [{ key: "file:intent.md", version: "intent-1" }], [{ key: "base", result: base.resultRef }])
  const skill = artifact("skill", [{ key: "file:recipe.ts", version: "recipe-1" }], [{ key: "flow", result: flow.resultRef }], ["independent", "missing-navigation"])
  const independent = artifact("independent", [{ key: "file:independent.ts", version: "independent-1" }])
  const manifest: OwnershipManifest = {
    kind: "ownership-manifest", version: 1, scope: "session-input",
    entries: [base, flow, skill, independent].map((entry) => ({ key: entry.value.key, artifact: entry.ref })),
    roots: { operational: "skill" },
  }
  const manifestRef = store.put(manifest)
  const observe = (key: string): OwnershipInputObservation => observations.get(key) ?? { kind: "unavailable" }
  return { store, artifact, base, flow, skill, independent, manifest, manifestRef, observations, observe }
}

describe("G2.1 ownership affected-set planning", () => {
  it("UP-1 identical inputs return an explicit unchanged inventory, not an empty success", () => {
    const f = fixture()
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toEqual({
      kind: "ownership-update-plan", manifest: f.manifestRef, scope: "session-input",
      changes: [], affected: [], frontier: [], unaffected: ["base", "flow", "independent", "skill"],
    })
  })

  it("UP-2 source drift selects required dependents but schedules only the first revalidation frontier", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "present", version: "source-2" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["base", "flow", "skill"], frontier: ["base"], unaffected: ["independent"],
      changes: [{ artifact: "base", input: "file:source.ts", previous: "source-1", observed: { kind: "present", version: "source-2" } }],
    })
  })

  it("UP-3 intent changes invalidate flow and skill while preserving independent base evidence", () => {
    const f = fixture()
    f.observations.set("file:intent.md", { kind: "present", version: "intent-2" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["flow", "skill"], frontier: ["flow"], unaffected: ["base", "independent"],
    })
  })

  it("UP-4 recipe changes invalidate their actual users, not every artifact", () => {
    const f = fixture()
    f.observations.set("file:recipe.ts", { kind: "present", version: "recipe-2" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["skill"], frontier: ["skill"], unaffected: ["base", "flow", "independent"],
    })
  })

  it("UP-5 registered membership changes enter the affected set even when known file bytes match", () => {
    const f = fixture()
    f.observations.set("members:src", { kind: "present", version: "members-2" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["base", "flow", "skill"], frontier: ["base"],
      changes: [{ artifact: "base", input: "members:src", previous: "members-1", observed: { kind: "present", version: "members-2" } }],
    })
  })

  it("UP-6 an explicitly absent source requires revalidation rather than becoming an unknown read failure", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "absent" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["base", "flow", "skill"], frontier: ["base"],
      changes: [{ artifact: "base", input: "file:source.ts", previous: "source-1", observed: { kind: "absent" } }],
    })
  })

  it("UP-7 unavailable observations HOLD instead of returning a partial or empty worklist", () => {
    const f = fixture()
    f.observations.delete("file:source.ts")
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "hold", reason: "ownership-input-unavailable", evidence: ["base", "file:source.ts"],
    })
  })

  it("UP-8 navigation never creates build edges or forces a missing navigation target to exist", () => {
    const f = fixture()
    f.observations.set("file:independent.ts", { kind: "present", version: "independent-2" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["independent"], frontier: ["independent"], unaffected: ["base", "flow", "skill"],
    })
  })

  it("UP-9 simultaneous upstream and downstream edits cannot run a dependent before its changed prerequisite", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "present", version: "source-2" })
    f.observations.set("file:recipe.ts", { kind: "present", version: "recipe-2" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["base", "flow", "skill"], frontier: ["base"],
      changes: [
        { artifact: "base", input: "file:source.ts", previous: "source-1", observed: { kind: "present", version: "source-2" } },
        { artifact: "skill", input: "file:recipe.ts", previous: "recipe-1", observed: { kind: "present", version: "recipe-2" } },
      ],
    })
  })

  it("UP-10 manifest entry order does not change canonical planning order", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "present", version: "source-2" })
    f.observations.set("file:independent.ts", { kind: "present", version: "independent-2" })
    const reversed = f.store.put({ ...f.manifest, entries: [...f.manifest.entries].reverse() })
    const plan = planOwnershipUpdate(f.store, reversed, "session-input", f.observe)
    expect(plan).toMatchObject({ kind: "ownership-update-plan", affected: ["base", "flow", "independent", "skill"], frontier: ["base", "independent"], unaffected: [] })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toEqual({ ...plan, manifest: f.manifestRef })
  })

  it("UP-11 even a current-looking manifest must pass existing CAS review and required-dependency validation", () => {
    const f = fixture()
    const receipt = f.store.put({ ...f.skill.receipt, reviews: [f.skill.receipt.reviews[0]!] })
    const artifact = f.store.put({ ...f.skill.value, receipt })
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "skill" ? { ...entry, artifact } : entry) })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "malformed-ownership" })
  })

  it("UP-12 a wrong scope or wrong-need root cannot become an accepted update plan", () => {
    const f = fixture()
    expect(planOwnershipUpdate(f.store, f.manifestRef, "another-scope", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-scope" })
    const manifest = f.store.put({ ...f.manifest, roots: { entry: "skill" } })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-selection" })
  })

  it("UP-13 required dependency cycles HOLD rather than inventing a scheduling order", () => {
    const f = fixture()
    const cyclic = f.artifact("base", [], [{ key: "skill", result: f.skill.resultRef }])
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "base" ? { ...entry, artifact: cyclic.ref } : entry) })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-cycle" })
  })

  it("UP-14 empty or unavailable manifests cannot produce a vacuous successful inventory", () => {
    const f = fixture()
    expect(planOwnershipUpdate(f.store, id("missing manifest"), "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-missing" })
    const empty = f.store.put({ ...f.manifest, entries: [], roots: {} })
    expect(planOwnershipUpdate(f.store, empty, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "malformed-ownership" })
  })

  it("UP-15 an unbound changed prerequisite result is rejected, not treated as an already reviewed baseline", () => {
    const f = fixture()
    const result = f.store.put({ ...f.base.result, authority: { scope: "session-input", basis: "different authority" } })
    const base = f.store.put({ ...f.base.value, result })
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "base" ? { ...entry, artifact: base } : entry) })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-review" })
  })

  it("UP-16 a shared input is observed once per plan rather than mixing versions between artifacts", () => {
    const f = fixture()
    const flow = f.artifact("flow", [{ key: "file:recipe.ts", version: "recipe-1" }], [{ key: "base", result: f.base.resultRef }])
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "flow" ? { ...entry, artifact: flow.ref } : entry) })
    f.observations.set("file:recipe.ts", { kind: "present", version: "recipe-2" })
    const observed: string[] = []
    const plan = planOwnershipUpdate(f.store, manifest, "session-input", (key) => {
      observed.push(key)
      return f.observe(key)
    })
    expect(plan).toMatchObject({
      kind: "ownership-update-plan", affected: ["flow", "skill"], frontier: ["flow"], unaffected: ["base", "independent"],
      changes: [
        { artifact: "flow", input: "file:recipe.ts", previous: "recipe-1", observed: { kind: "present", version: "recipe-2" } },
        { artifact: "skill", input: "file:recipe.ts", previous: "recipe-1", observed: { kind: "present", version: "recipe-2" } },
      ],
    })
    expect(observed.filter((key) => key === "file:recipe.ts")).toHaveLength(1)
  })

  it("UP-17 analysis cannot write CAS objects or mint publication as a side effect", () => {
    const f = fixture()
    const readOnly = { get: f.store.get, put: () => { throw new Error("planning must not write") } }
    const plan = planOwnershipUpdate(readOnly, f.manifestRef, "session-input", f.observe)
    expect(plan).toMatchObject({ kind: "ownership-update-plan", affected: [], frontier: [] })
    expect(plan).not.toHaveProperty("body")
    expect(plan).not.toHaveProperty("emitted")
  })

  it("UP-18 an empty observed version is invalid evidence, not source deletion or a usable hash", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "present", version: "" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
  })

  it("UP-19 a reviewed new result still cannot replace a prerequisite without matching dependent bindings", () => {
    const f = fixture()
    const base = f.artifact("base", f.base.receipt.inputs, [], [], "separately reviewed changed authority")
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "base" ? { ...entry, artifact: base.ref } : entry) })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-dependency-changed" })
  })

  it("UP-20 inventory validation includes artifacts outside the selected operational root closure", () => {
    const f = fixture()
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "independent" ? { ...entry, artifact: id("missing independent artifact") } : entry) })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-missing" })
  })

  it("UP-21 noncanonical observed versions HOLD rather than being treated as changed canonical evidence", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "present", version: "cafe\u0301" })
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
  })

  it("UP-22 a failed plan does not revoke an independent valid read through the existing reader", () => {
    const f = fixture()
    const current = (key: string) => {
      const observed = f.observe(key)
      return observed.kind === "present" ? observed.version : undefined
    }
    const query = { scope: "session-input", key: "independent", maxBytes: 4096 }
    const before = readOwnership(f.store, f.manifestRef, query, current)
    expect(before).toMatchObject({ kind: "ready", artifact: f.independent.ref })
    f.observations.delete("file:source.ts")
    expect(planOwnershipUpdate(f.store, f.manifestRef, "session-input", f.observe)).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
    expect(readOwnership(f.store, f.manifestRef, query, current)).toEqual(before)
  })

  it("UP-23 every changed binding is retained in artifact/input order even with multiple edits and reversed entries", () => {
    const f = fixture()
    f.observations.set("file:source.ts", { kind: "present", version: "source-2" })
    f.observations.set("members:src", { kind: "present", version: "members-2" })
    f.observations.set("file:recipe.ts", { kind: "present", version: "recipe-2" })
    const reversed = f.store.put({ ...f.manifest, entries: [...f.manifest.entries].reverse() })
    expect(planOwnershipUpdate(f.store, reversed, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["base", "flow", "skill"], frontier: ["base"], unaffected: ["independent"],
      changes: [
        { artifact: "base", input: "file:source.ts", previous: "source-1", observed: { kind: "present", version: "source-2" } },
        { artifact: "base", input: "members:src", previous: "members-1", observed: { kind: "present", version: "members-2" } },
        { artifact: "skill", input: "file:recipe.ts", previous: "recipe-1", observed: { kind: "present", version: "recipe-2" } },
      ],
    })
  })

  it("UP-24 an unchanged prerequisite cannot delay lexicographic selection among affected artifacts", () => {
    const f = fixture()
    const z = f.artifact("z", [{ key: "file:independent.ts", version: "independent-1" }])
    const a = f.artifact("a", [{ key: "file:source.ts", version: "source-1" }], [{ key: "z", result: z.resultRef }])
    const b = f.artifact("b", [{ key: "file:recipe.ts", version: "recipe-1" }])
    const manifest = f.store.put({ ...f.manifest, entries: [a, b, z].map((entry) => ({ key: entry.value.key, artifact: entry.ref })), roots: { operational: "a" } })
    f.observations.set("file:source.ts", { kind: "present", version: "source-2" })
    f.observations.set("file:recipe.ts", { kind: "present", version: "recipe-2" })
    expect(planOwnershipUpdate(f.store, manifest, "session-input", f.observe)).toMatchObject({
      kind: "ownership-update-plan", affected: ["a", "b"], frontier: ["a", "b"], unaffected: ["z"],
    })
  })
})
