// @atlas/memory — test/wp-6.24-a-mem.test.ts  (WP-6.24-a.MEM)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for MEM-11 (Awareness is a derived rollup, not a
// blob) + the MEM-12a/b memoization slice (facet cached on its OWN source hash; assembled once per
// root-state, shared across seats). The facet is imported DIRECTLY from ../src/awareness.js (the barrel is
// wired by the lead at SEAL). Identity + byte-identical assembly go through the SEALED @atlas/kernel
// `id`/`canonicalForm` seam (never a hand-rolled digest), so byte-identity assertions are RELATIONAL, never
// a fixed hex. Held-out `-2` fixtures (SCN-MEM-12a-2 `S50→S51`, 12b-2 two-seat `S50`) are NOT transcribed.
// SCN-MEM-12c-* (Orientation incremental fold) is the sibling WP-6.24-b facet — out of scope here.
//
// FLAG: the interface_contract / source_reqs / acceptance digests are `<filled-at-freeze>` (simulated) —
// resolved by disciplined judgment against the FROZEN ref/awareness.ts + ref/memoize.ts oracles, not a real
// freeze hash. The [PINNED] rendered facet `content` format is a WP concern (top-tier string), not invented.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import {
  atlasRoot,
  rollup,
  pullTail,
  awarenessTokens,
  awarenessBytes,
  makeAwarenessMemo,
  AWARENESS_TOK_CAP,
  UN_SEEDED,
  FACET_ORDER,
  type RootFacets,
  type FacetName,
} from "../src/awareness.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────

const anchor = (path: string, sha: string): StructRef => ({
  kind: "block",
  qualifiedPath: path,
  subtreeHash: asSubtreeHash(sha),
})

/** A fully-seeded root at `rState=S42` — all five facet sources present, each grounded `node@sha`. */
const seededFacets = (terrainSha = "t1"): RootFacets => ({
  mission: { grounding: [anchor("DEFINE.md#thesis", "m1")], tiers: ["ship a governed atlas", "tail A", "tail B"] },
  constitution: {
    grounding: [anchor("invariants.md#T0", "c1")],
    tiers: ["honesty is non-negotiable", "never fake green", "tail law"],
  },
  terrain: {
    grounding: [anchor("territory.md#top", terrainSha)],
    tiers: ["kernel · memory · retrieval", "tail territory"],
  },
  ontology: {
    grounding: [anchor("definitions.md#core", "o1")],
    definitions: [
      { slot: "definition", curatedBy: "walt", text: "Atlas: the shared grounded index" },
      { slot: "definition", curatedBy: "walt", text: "tail definition" },
    ],
  },
  taste: { grounding: [anchor("CONVENTIONS.md", "k1")], tiers: ["≤400 LOC per file", "tail taste"] },
})

// ── SCN-MEM-11a-1 — Awareness is a pure derivation of the Atlas root ─────────────────────────────────────────

describe("SCN-MEM-11a-1 — Awareness is a pure derivation of the Atlas root", () => {
  it("derives all five facets from the root; a later root edit changes the derived Awareness", () => {
    const a = rollup(atlasRoot(seededFacets()))
    expect(a.mission.content).toBe("ship a governed atlas")
    expect(a.constitution.content).toBe("honesty is non-negotiable")
    for (const name of FACET_ORDER) expect(a[name].state).toBe("seeded")

    // a root edit (mission source content changes) changes the derived Awareness — NOT read from a blob
    const edited = seededFacets()
    const a2 = rollup(
      atlasRoot({ ...edited, mission: { grounding: [anchor("DEFINE.md#thesis", "m2")], tiers: ["a new thesis"] } }),
    )
    expect(a2.mission.content).toBe("a new thesis")
    expect(a2.mission.content).not.toBe(a.mission.content)
  })
})

// ── SCN-MEM-11b-1 — a moved facet source is served drift-flagged ─────────────────────────────────────────────

describe("SCN-MEM-11b-1 — a moved facet source is served drift-flagged, never silently stale", () => {
  it("re-grounds terrain to t2 with a drift marker after its source moves t1→t2", () => {
    const memo = makeAwarenessMemo()
    const first = memo.assemble(atlasRoot(seededFacets("t1")))
    expect(first.value.terrain.state).toBe("seeded")
    expect(first.value.terrain.grounding[0]?.subtreeHash).toBe("t1")

    const moved = memo.assemble(atlasRoot(seededFacets("t2")))
    expect(moved.value.terrain.state).toBe("drifted") // flagged, not served stale
    expect(moved.value.terrain.grounding[0]?.subtreeHash).toBe("t2") // re-grounded to the moved source
    expect(moved.receipt.reRolls).toBe(1) // only terrain re-rolled
  })
})

// ── SCN-MEM-11c-1 — only the top tier is carried, under the ~400 cap ─────────────────────────────────────────

describe("SCN-MEM-11c-1 — only the top tier is carried, under the ~400 cap", () => {
  it("carries only the top tier and stays ≤ ~400 tok, though the full tier list would exceed it", () => {
    const bigTier = Array.from({ length: 500 }, (_, i) => `law${i}`).join(" ")
    const facets: RootFacets = {
      ...seededFacets(),
      constitution: { grounding: [anchor("invariants.md#T0", "c1")], tiers: ["honesty is non-negotiable", bigTier] },
    }
    const a = rollup(atlasRoot(facets))
    expect(a.constitution.content).toBe("honesty is non-negotiable") // top tier only
    expect(awarenessTokens(a)).toBeLessThanOrEqual(AWARENESS_TOK_CAP)
    // teeth: injecting the full tier (the tail) instead would blow the cap
    expect(a.constitution.content.split(/\s+/).length + bigTier.split(/\s+/).length).toBeGreaterThan(AWARENESS_TOK_CAP)
  })
})

// ── SCN-MEM-11d-1 — ontology sources only walt-curated definition nodes ──────────────────────────────────────

describe("SCN-MEM-11d-1 — ontology sources only walt-curated definition nodes", () => {
  it("pulls only slot=definition walt nodes; a member non-definition fact does not leak in", () => {
    const facets: RootFacets = {
      ...seededFacets(),
      ontology: {
        grounding: [anchor("definitions.md#core", "o1")],
        definitions: [
          { slot: "fact", curatedBy: "alice", text: "a member non-definition fact" },
          { slot: "definition", curatedBy: "walt", text: "Atlas: the shared grounded index" },
        ],
      },
    }
    const a = rollup(atlasRoot(facets))
    expect(a.ontology.content).toBe("Atlas: the shared grounded index")
    expect(a.ontology.content).not.toContain("member non-definition")
  })
})

// ── SCN-MEM-11e-1 — an absent facet source renders a labeled UN-SEEDED sentinel ──────────────────────────────

describe("SCN-MEM-11e-1 — an absent facet source renders a labeled UN-SEEDED sentinel", () => {
  it("renders taste as UN-SEEDED when CONVENTIONS.md is absent — never a fabricated line", () => {
    const { taste: _drop, ...noTaste } = seededFacets()
    void _drop
    const a = rollup(atlasRoot(noTaste))
    expect(a.taste.state).toBe("UN-SEEDED")
    expect(a.taste.content.startsWith(UN_SEEDED)).toBe(true)
    expect(a.taste.grounding).toHaveLength(0) // nothing to ground — no fabricated anchor
  })
})

// ── SCN-MEM-11f-1 — a hand-written entry cannot author Awareness ──────────────────────────────────────────────

describe("SCN-MEM-11f-1 — a hand-written entry cannot author Awareness", () => {
  it("derives mission only from the root; a hand-written line is not a source", () => {
    const handWritten = "fabricated mission written by hand"
    const a = rollup(atlasRoot(seededFacets()))
    expect(a.mission.content).not.toContain(handWritten) // the root, never a hand-written entry
    // remove the root source ⇒ UN-SEEDED, NOT filled from any hand-written entry
    const { mission: _m, ...noMission } = seededFacets()
    void _m
    const a2 = rollup(atlasRoot(noMission))
    expect(a2.mission.state).toBe("UN-SEEDED")
    expect(a2.mission.content).not.toContain(handWritten)
  })
})

// ── SCN-MEM-11g-1 — two seats get byte-identical Awareness from one root ──────────────────────────────────────

describe("SCN-MEM-11g-1 — two seats get byte-identical Awareness from one root", () => {
  it("alice bytes == bob bytes (no per-seat input folded into the rollup)", () => {
    const root = atlasRoot(seededFacets())
    const alice = awarenessBytes(rollup(root)) // rollup takes NO seat argument
    const bob = awarenessBytes(rollup(root))
    expect(Buffer.from(alice).equals(Buffer.from(bob))).toBe(true)
  })
})

// ── SCN-MEM-11h-1 — the truncated tail stays pull-reachable, not injected ─────────────────────────────────────

describe("SCN-MEM-11h-1 — the truncated tail stays pull-reachable, not injected", () => {
  it("injects only the top tier while the tail is fetchable on demand, not dropped", () => {
    const root = atlasRoot(seededFacets())
    const a = rollup(root)
    const tail = pullTail(root, "terrain" as FacetName)
    expect(tail).toContain("tail territory") // still reachable
    expect(a.terrain.content).not.toContain("tail territory") // not injected
    expect(a.terrain.content).toBe("kernel · memory · retrieval") // top tier only
  })
})

// ── SCN-MEM-11i-1 — a generic language/stack card never stands in for Awareness ──────────────────────────────

describe("SCN-MEM-11i-1 — a generic language/stack card never stands in for Awareness", () => {
  it("serves UN-SEEDED when the root sources are unavailable — the generic card never substitutes", () => {
    const genericCard = "a TypeScript/Node project"
    const a = rollup(atlasRoot({})) // no facet sources available this turn
    for (const name of FACET_ORDER) {
      expect(a[name].state).toBe("UN-SEEDED")
      expect(a[name].content).not.toContain(genericCard)
    }
  })
})

// ── SCN-MEM-12a-1 — an unchanged root ⇒ 0 facet re-rolls (cached on the facet's own source hash) ─────────────

describe("SCN-MEM-12a-1 — an unchanged root ⇒ 0 facet re-rolls (cached on the facet own source hash)", () => {
  it("a root bump S42→S43 that moved no facet costs 0 re-rolls / 0 drift-checks", () => {
    const memo = makeAwarenessMemo()
    const first = memo.assemble(atlasRoot(seededFacets(), { bump: "S42" }))
    expect(first.receipt.reRolls).toBe(5) // cold: all five roll once
    expect(first.receipt.driftChecks).toBe(5)

    // root bumps (an unrelated marker moves `rId‖rState` S42→S43) but NO facet source moved
    const second = memo.assemble(atlasRoot(seededFacets(), { bump: "S43" }))
    expect(second.receipt.reRolls).toBe(0) // every facet a cache hit despite the root bump
    expect(second.receipt.driftChecks).toBe(0)
  })
})

// ── SCN-MEM-12b-1 — one shared assembly per wave, not one per seat ───────────────────────────────────────────

describe("SCN-MEM-12b-1 — one shared assembly per wave, not one per seat", () => {
  it("a wave of 3 seats is assembled once (counter 1), shared byte-identically", () => {
    const memo = makeAwarenessMemo()
    const wave = memo.assembleForWave(["alice", "bob", "orch"], atlasRoot(seededFacets()))
    expect(wave.assemblies).toBe(1) // one assembly for the whole wave, not 3
    expect(wave.seats).toHaveLength(3)
    // byte-identical by MEM-11 — a re-rollup of the same root matches the shared bytes
    const solo = awarenessBytes(rollup(atlasRoot(seededFacets())))
    expect(Buffer.from(awarenessBytes(wave.awareness)).equals(Buffer.from(solo))).toBe(true)
  })
})
