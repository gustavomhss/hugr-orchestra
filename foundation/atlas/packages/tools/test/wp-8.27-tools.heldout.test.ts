// @atlas/tools — test/wp-8.27-tools.heldout.test.ts   (WP-8.27.TOOLS — HELD-OUT GATE)
//
// Cold held-out transcription of the frozen `-2` goldens (held_out:true) for `atlas-init`, authored by the
// reviewer AFTER the impl was frozen — the impl never saw these fixtures. Same public `createInit` surface
// (../src/init.js) as the `-1` suite; DIFFERENT trees / heuristics (T′, dual-hit, kernel/):
//   - SCN-TOOLS-5a-2 (held-out) — a DIFFERENT tree T′ still consults NO LLM (structural, deterministic).
//   - SCN-TOOLS-5b-2 (held-out) — T0-free T′ still carries all three fields; flags == [] (present, empty).
//   - SCN-TOOLS-5c-2 (held-out) — TWO T0-keyword hits (auth/, kernel/) both still cap at T2.
//   - SCN-TOOLS-5d-2 (held-out) — multiple T0 candidates all flagged, promotions == 0.
//   - SCN-TOOLS-5e-2 (held-out) — the heuristic firing on kernel/ only flags — no tier / no blastRadius rewrite.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, Territory } from "@atlas/contracts"
import { createInit } from "../src/init.js"
import type { MoveInIndex, RawTerritory, T0Heuristic } from "../src/init.js"

// Tree T′ — a DIFFERENT skeleton with NO T0-keyword hit (SCN-TOOLS-5a-2 / 5b-2).
const TP: readonly RawTerritory[] = [
  { name: "docs/", owner: "wri", globs: ["docs/**"] },
  { name: "infra/", owner: "ops", globs: ["infra/**"] },
  { name: "api/", owner: "plat", globs: ["api/**"] },
]

// A dual-hit tree — both auth/ and kernel/ match a T0 keyword (SCN-TOOLS-5c-2 / 5d-2 / 5e-2).
const TDUAL: readonly RawTerritory[] = [
  { name: "finance/", owner: "fin", globs: ["finance/**"] },
  { name: "auth/", owner: "sec", globs: ["auth/**"] },
  { name: "kernel/", owner: "core", globs: ["kernel/**"] },
]

const BLAST_TP: readonly NodeKey[] = [asNodeKey("nk:docs/readme"), asNodeKey("nk:api/route")]
const BLAST_DUAL: readonly NodeKey[] = [asNodeKey("nk:auth/login"), asNodeKey("nk:kernel/sched")]

function fixedIndex(
  ts: readonly RawTerritory[],
  blast: readonly NodeKey[],
): {
  readonly index: MoveInIndex
  calls: () => number
} {
  let n = 0
  const index: MoveInIndex = {
    territories: (_p) => {
      n += 1
      return ts
    },
    blastRadius: (_p) => blast,
  }
  return { index, calls: () => n }
}

// Heuristics keyed by territory name (structural keyword match).
const hitsNone: T0Heuristic = { isCandidate: () => false }
const hitsDual: T0Heuristic = {
  isCandidate: (t) => t.name === "auth/" || t.name === "kernel/",
}
const hitsKernelOnly: T0Heuristic = { isCandidate: (t) => t.name === "kernel/" }

const maxTier = (ts: readonly Territory[]): string =>
  ts
    .map((t) => t.tier)
    .sort()
    .at(-1) ?? "T2"

describe("WP-8.27.TOOLS — atlas-init HELD-OUT (-2 goldens)", () => {
  it("SCN-TOOLS-5a-2: a different tree T′ also consults no LLM — structural, deterministic", () => {
    const { index, calls } = fixedIndex(TP, BLAST_TP)
    const init = createInit(index, hitsNone).init
    const a = init("repoTP@rev")
    const b = init("repoTP@rev")
    expect(calls()).toBeGreaterThan(0)
    expect(a).toEqual(b)
    expect(a).toEqual({
      territories: TP.map((t) => ({ ...t, tier: "T2" })),
      blastRadius: BLAST_TP,
      t0Candidates: [],
    })
  })

  it("SCN-TOOLS-5b-2: T0-free tree still returns all three fields — flags [] present", () => {
    const { index } = fixedIndex(TP, BLAST_TP)
    const out = createInit(index, hitsNone).init("repoTP@rev")
    expect(out.territories.map((t) => t.name)).toEqual(["docs/", "infra/", "api/"])
    expect(out.blastRadius).toEqual(BLAST_TP)
    expect(out.t0Candidates).toEqual([])
    expect(out).toHaveProperty("territories")
    expect(out).toHaveProperty("blastRadius")
    expect(out).toHaveProperty("t0Candidates")
  })

  it("SCN-TOOLS-5c-2: two T0-keyword hits both still cap at T2", () => {
    const { index } = fixedIndex(TDUAL, BLAST_DUAL)
    const out = createInit(index, hitsDual).init("repoD@rev")
    expect(out.territories.every((t) => t.tier === "T2")).toBe(true)
    expect(maxTier(out.territories)).toBe("T2")
    expect(out.territories.find((t) => t.name === "auth/")?.tier).toBe("T2")
    expect(out.territories.find((t) => t.name === "kernel/")?.tier).toBe("T2")
  })

  it("SCN-TOOLS-5d-2: multiple T0 candidates all flagged, none promoted — promotions == 0", () => {
    const { index } = fixedIndex(TDUAL, BLAST_DUAL)
    const out = createInit(index, hitsDual).init("repoD@rev")
    expect(out.t0Candidates).toEqual(["auth/", "kernel/"])
    const promotions = out.territories.filter((t) => t.tier !== "T2").length
    expect(promotions).toBe(0)
  })

  it("SCN-TOOLS-5e-2: the heuristic firing on kernel/ only flags — no tier / no blastRadius rewrite", () => {
    const { index } = fixedIndex(TDUAL, BLAST_DUAL)
    const flagged = createInit(index, hitsKernelOnly).init("repoD@rev")
    const unflagged = createInit(fixedIndex(TDUAL, BLAST_DUAL).index, hitsNone).init("repoD@rev")
    expect(flagged.t0Candidates).toEqual(["kernel/"])
    expect(unflagged.t0Candidates).toEqual([])
    expect(flagged.territories).toEqual(unflagged.territories) // no tier rewritten
    expect(flagged.blastRadius).toEqual(unflagged.blastRadius) // blastRadius untouched by the flag
    expect(flagged.territories.find((t) => t.name === "kernel/")).toEqual({
      name: "kernel/",
      owner: "core",
      tier: "T2",
      globs: ["kernel/**"],
    })
  })
})
