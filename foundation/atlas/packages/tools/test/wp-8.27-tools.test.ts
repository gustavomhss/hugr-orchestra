// @atlas/tools — test/wp-8.27-tools.test.ts   (WP-8.27.TOOLS — TOOLS-5, spec A-5/A-6)
//
// RED→GREEN transcription of the frozen `-1` goldens for `atlas-init`, the `$0`-LLM STRUCTURAL move-in,
// run against src/init.ts via the FROZEN oracle surface (co-located `InitApi` + `src/types.ts` `InitOut`).
// Tree `T` = territories `[finance/, auth/, kernel/]` where `auth/` hits the T0 keyword
// `security-invariant`. Held-out `-2` goldens are NOT transcribed here (GATE-only, out of this facet):
//   - SCN-TOOLS-5a-1 (happy) — move-in consults NO LLM; output is a pure structural function of the seams.
//   - SCN-TOOLS-5b-1 (happy) — the InitOut carries all three fields (skeleton + blast radius + flags).
//   - SCN-TOOLS-5c-1 (guard) — every territory caps at T2, even the `auth/` T0-keyword hit.
//   - SCN-TOOLS-5d-1 (guard) — `auth/` is FLAGGED `t0Candidate`, never promoted (promotions == 0).
//   - SCN-TOOLS-5e-1 (happy) — the T0 heuristic ONLY flags: it sets no tier and writes no other state.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, Territory } from "@atlas/contracts"
import { createInit } from "../src/init.js"
import type { MoveInIndex, RawTerritory, T0Heuristic } from "../src/init.js"

// Tree `T` — the structurally-walked raw territories (name/owner/globs), pre-tier. `auth/` will hit the
// T0 keyword. Frozen skeleton `[finance/, auth/, kernel/]` (SCN-TOOLS-5b-1).
const T: readonly RawTerritory[] = [
  { name: "finance/", owner: "fin", globs: ["finance/**"] },
  { name: "auth/", owner: "sec", globs: ["auth/**"] },
  { name: "kernel/", owner: "core", globs: ["kernel/**"] },
]

// The reverse-dep blast radius the index axis hands the mover (NodeKey set — atlas-tools:19 / oracle #3).
const BLAST: readonly NodeKey[] = [asNodeKey("nk:finance/ledger"), asNodeKey("nk:auth/login")]

// A structural move-in seam over tree `T`; counts calls so the test can prove the walk is structural
// (index consulted) and, crucially, that NO model seam exists — `createInit` accepts none.
function treeIndex(): { readonly index: MoveInIndex; calls: () => number } {
  let n = 0
  const index: MoveInIndex = {
    territories: (_path) => {
      n += 1
      return T
    },
    blastRadius: (_path) => BLAST,
  }
  return { index, calls: () => n }
}

// The T0-keyword heuristic (structural keyword match). Fires ONLY on `auth/` (keyword `security-invariant`).
const T0_KEYWORDS = ["security-invariant"] as const
const KEYWORD_HITS: Readonly<Record<string, string>> = { "auth/": "security-invariant" }
const heuristic: T0Heuristic = {
  isCandidate: (t) => T0_KEYWORDS.includes(KEYWORD_HITS[t.name] as (typeof T0_KEYWORDS)[number]),
}

// A heuristic that never fires — the reference point proving the T0 flag is the heuristic's ONLY effect.
const neverFlags: T0Heuristic = { isCandidate: () => false }

const byName = (ts: readonly Territory[]): string[] => ts.map((t) => t.name)
const maxTier = (ts: readonly Territory[]): string =>
  ts
    .map((t) => t.tier)
    .sort()
    .at(-1) ?? "T2" // 'T2' > 'T1' > 'T0' lexically — the honest max

describe("WP-8.27.TOOLS — atlas-init $0-LLM structural move-in (-1 goldens)", () => {
  it("SCN-TOOLS-5a-1: move-in consults no LLM — output is a pure structural function of the seams", () => {
    const { index, calls } = treeIndex()
    const init = createInit(index, heuristic).init

    const a = init("repo@rev")
    const b = init("repo@rev")

    // No model seam is available to the facet (createInit takes only structural ports); the structural
    // index WAS consulted, and re-running yields a byte-identical result — $0-LLM, deterministic.
    expect(calls()).toBeGreaterThan(0)
    expect(a).toEqual(b)
    expect(a).toEqual({
      territories: T.map((t) => ({ ...t, tier: "T2" })),
      blastRadius: BLAST,
      t0Candidates: ["auth/"],
    })
  })

  it("SCN-TOOLS-5b-1: the InitOut carries all three fields — skeleton + blast radius + flags", () => {
    const { index } = treeIndex()
    const out = createInit(index, heuristic).init("repo@rev")

    expect(byName(out.territories)).toEqual(["finance/", "auth/", "kernel/"]) // skeleton
    expect(out.blastRadius).toEqual(BLAST) // blast radius present
    expect(out.t0Candidates).toEqual(["auth/"]) // T0-candidate flags
    expect(out).toHaveProperty("territories")
    expect(out).toHaveProperty("blastRadius")
    expect(out).toHaveProperty("t0Candidates")
  })

  it("SCN-TOOLS-5c-1: every territory caps at T2 — even the auth/ T0-keyword hit", () => {
    const { index } = treeIndex()
    const out = createInit(index, heuristic).init("repo@rev")

    expect(out.territories.every((t) => t.tier === "T2")).toBe(true)
    expect(maxTier(out.territories)).toBe("T2") // max(tier) == T2 — never above
    const auth = out.territories.find((t) => t.name === "auth/")
    expect(auth?.tier).toBe("T2") // the keyword hit is T2, not T1/T0
  })

  it("SCN-TOOLS-5d-1: auth/ is flagged t0Candidate, never promoted — promotions == 0", () => {
    const { index } = treeIndex()
    const out = createInit(index, heuristic).init("repo@rev")

    expect(out.t0Candidates).toContain("auth/") // flagged
    const auth = out.territories.find((t) => t.name === "auth/")
    expect(auth?.tier).toBe("T2") // remains T2 — the promotion decision is left to a human step
    const promotions = out.territories.filter((t) => t.tier !== "T2").length
    expect(promotions).toBe(0) // NOTHING auto-promoted during move-in
  })

  it("SCN-TOOLS-5e-1: the T0 heuristic only flags — sets no tier, writes no other state", () => {
    const { index } = treeIndex()
    const flagged = createInit(index, heuristic).init("repo@rev")
    const unflagged = createInit(treeIndex().index, neverFlags).init("repo@rev")

    // The heuristic firing on `auth/` produces EXACTLY the flag — nothing else changes vs a no-flag run.
    expect(flagged.t0Candidates).toEqual(["auth/"])
    expect(unflagged.t0Candidates).toEqual([])
    expect(flagged.territories).toEqual(unflagged.territories) // no tier / no state rewritten
    expect(flagged.blastRadius).toEqual(unflagged.blastRadius) // blastRadius untouched by the flag
    const auth = flagged.territories.find((t) => t.name === "auth/")
    expect(auth).toEqual({ name: "auth/", owner: "sec", tier: "T2", globs: ["auth/**"] })
  })
})
