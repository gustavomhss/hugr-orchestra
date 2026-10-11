// @atlas/memory — test/wp-6.24-a-mem.heldout.test.ts  (WP-6.24-a.MEM — HELD-OUT leg)
//
// Independent transcription of the `held_out: true` `-2` goldens in scope for this WP: SCN-MEM-12a-2
// (root-state S50→S51 bump, no facet moved ⇒ 0 re-rolls) + SCN-MEM-12b-2 (a TWO-seat wave shares one
// assembly). DIFFERENT concrete data than the `-1` fixtures (S50/S51 not S42/S43; a 2-seat wave not 3),
// SAME behaviour/branch. SCN-MEM-12c-2 (Orientation incremental fold) is the sibling WP-6.24-b facet and
// is deliberately NOT transcribed here. Identity/bytes go through the SEALED @atlas/kernel seam.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { atlasRoot, rollup, awarenessBytes, makeAwarenessMemo, type RootFacets } from "../src/awareness.js"

const anchor = (path: string, sha: string): StructRef => ({
  kind: "block",
  qualifiedPath: path,
  subtreeHash: asSubtreeHash(sha),
})

// A distinct fully-seeded root (different content than the -1 fixtures) — all five facet sources present.
const seeded = (): RootFacets => ({
  mission: { grounding: [anchor("DEFINE.md#thesis", "mm1")], tiers: ["hold the governed line", "tail m"] },
  constitution: { grounding: [anchor("invariants.md#T0", "cc1")], tiers: ["never fake green", "tail c"] },
  terrain: { grounding: [anchor("territory.md#top", "tt1")], tiers: ["kernel · memory", "tail t"] },
  ontology: {
    grounding: [anchor("definitions.md#core", "oo1")],
    definitions: [{ slot: "definition", curatedBy: "walt", text: "Node: an OR-Set of claims" }],
  },
  taste: { grounding: [anchor("CONVENTIONS.md", "kk1")], tiers: ["≤400 LOC per file", "tail k"] },
})

// ── SCN-MEM-12a-2 — a later root bump (S50→S51) with no facet moved still costs 0 re-rolls ────────────────────
describe("SCN-MEM-12a-2 (held-out) — S50→S51 bump, no facet moved ⇒ 0 re-rolls / 0 drift-checks", () => {
  it("cold assembles 5, then a root-state bump that moved no facet is 5 cache hits", () => {
    const memo = makeAwarenessMemo()
    const first = memo.assemble(atlasRoot(seeded(), { bump: "S50" }))
    expect(first.receipt.reRolls).toBe(5)
    expect(first.receipt.driftChecks).toBe(5)

    const second = memo.assemble(atlasRoot(seeded(), { bump: "S51" }))
    expect(second.receipt.reRolls).toBe(0) // keyed on each facet's OWN source hash, not rId‖rState
    expect(second.receipt.driftChecks).toBe(0)
  })
})

// ── SCN-MEM-12b-2 — a two-seat wave shares one assembly ───────────────────────────────────────────────────────
describe("SCN-MEM-12b-2 (held-out) — a two-seat wave is assembled once, shared byte-identically", () => {
  it("assembly counter is 1 (not 2) for a 2-seat wave; bytes match a solo re-rollup", () => {
    const memo = makeAwarenessMemo()
    const wave = memo.assembleForWave(["alice", "bob"], atlasRoot(seeded()))
    expect(wave.assemblies).toBe(1) // one assembly for both seats, not one-per-seat
    expect(wave.seats).toHaveLength(2)
    const solo = awarenessBytes(rollup(atlasRoot(seeded())))
    expect(Buffer.from(awarenessBytes(wave.awareness)).equals(Buffer.from(solo))).toBe(true)
  })
})
