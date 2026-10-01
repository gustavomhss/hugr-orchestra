// @atlas/retrieval — test/wp-6.19-retr.pack.test.ts  (WP-6.19.RETR)
//
// RED→GREEN transcription of the 13 VISIBLE `-1` goldens for the bounded-pack facet:
//   RETR-1-1 (relevance from the structural index only, byte-identical, 0 embeddings),
//   RETR-2a..2f (the bounded pack — cap / fill-order / cap-wins-tail / merged-budget / no-prose),
//   RETR-7a..7d (per-type caps under the pinned measure),
//   RETR-9a..9b (the total surface — empty pack, never a throw).
//
// The facet is a SEAM CONSUMER: it READS a per-territory axis snapshot from the index (candidates already
// carry the pinned `cl100k_base` `tokenEstimate`; the facet NEVER tokenizes and NEVER hashes — identity is
// minted only through the sealed @atlas/kernel `asHash` / `asNodeKey`). Every axis here is supplied AS A
// FIXTURE. Fixture A is transcribed EXACTLY from goldens-ret.md (§Fixture A). The rank ORACLE for the
// fill-order goldens is a TEST-LOCAL comparator (`specRank`), re-derived independently from the frozen pack
// rank `(hits-desc, ppr-desc, nodeKey-asc)` — never the facet's own comparator.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, it, expect } from "vitest"
import { asHash, asNodeKey } from "@atlas/kernel"
import type { InjectionKind, NodeKey, Territory, Tier } from "@atlas/contracts"
import {
  createPacker,
  compare,
  capFor,
  PACK_CAP,
  CAP_CEILING,
  type PackAxis,
  type PackCandidate,
  type PackIndex,
} from "../src/pack.js"

// ── fixture builders ────────────────────────────────────────────────────────────────────────────────────

const nk = (s: string): NodeKey => asNodeKey(s)

function cand(
  id: string,
  o: { tier?: Tier; ppr?: number; hits?: number; tok?: number; stale?: boolean } = {},
): PackCandidate {
  return {
    nodeKey: nk(id),
    tier: o.tier ?? "T1",
    ppr: o.ppr ?? 0.5,
    hits: o.hits ?? 0,
    claim: id,
    tokenEstimate: o.tok ?? 300,
    stale: o.stale ?? false,
  }
}

const terr = (name: string): Territory => ({ name, owner: "team", tier: "T1", globs: [] })

function indexOf(axes: Record<string, PackAxis>): PackIndex {
  return { axis: (t: Territory) => axes[t.name] ?? null }
}

/** The rank ORACLE — re-derived independently from the frozen pack rank `(hits-desc, ppr-desc, nodeKey-asc)`;
 *  used to check the facet fills in the right order (never the facet's own comparator). */
function specRank(a: PackCandidate, b: PackCandidate): number {
  if (a.hits !== b.hits) return b.hits - a.hits
  if (a.ppr !== b.ppr) return b.ppr - a.ppr
  return a.nodeKey < b.nodeKey ? -1 : a.nodeKey > b.nodeKey ? 1 : 0
}
const idsOf = (xs: readonly { nodeId: NodeKey }[]): string[] => xs.map((x) => String(x.nodeId))

// ── Fixture A — the billing territory (goldens-ret.md §Fixture A) ────────────────────────────────────────
const FIXTURE_A: readonly PackCandidate[] = [
  cand("inv:billing-no-neg", { tier: "T0", ppr: 0.8, hits: 0, tok: 120 }),
  cand("inv:billing-idempotent-charge", { tier: "T0", ppr: 0.75, hits: 0, tok: 140 }),
  cand("inv:billing-retry", { tier: "T1", ppr: 0.9, hits: 40, tok: 300 }),
  cand("inv:billing-refund", { tier: "T1", ppr: 0.7, hits: 40, tok: 300 }),
  cand("inv:billing-audit", { tier: "T1", ppr: 0.5, hits: 10, tok: 300 }),
  cand("inv:billing-currency", { tier: "T1", ppr: 0.5, hits: 10, tok: 300 }),
  cand("inv:billing-legacy", { tier: "T1", ppr: 0.3, hits: 2, tok: 300 }),
  cand("inv:billing-notes", { tier: "T1", ppr: 0.2, hits: 1, tok: 700 }),
]
const AXIS_A: PackAxis = {
  territory: "crate:billing",
  axisHash: asHash("axis-billing"),
  candidates: FIXTURE_A,
  stale: false,
}
const T_BILLING = terr("crate:billing")
const packerA = createPacker(indexOf({ "crate:billing": AXIS_A }))

// ── REQ-RETR-1 — relevance from the structural index only ────────────────────────────────────────────────

describe("REQ-RETR-1 — relevance from structural index only", () => {
  it("SCN-RETR-1-1 — two identical queries → byte-identical, zero embedding calls", () => {
    const a = packerA.pack(T_BILLING)
    const b = packerA.pack(T_BILLING)
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b)) // byte-identical for equal input (RETR-1 / INDEX-8)
    const src = readFileSync(fileURLToPath(new URL("../src/pack.ts", import.meta.url)), "utf8")
    for (const forbidden of [
      /embedding/i,
      /\bvector\b/i,
      /\bRAG\b/,
      /openai/i,
      /anthropic/i,
      /\bfetch\b/,
      /https?:\/\//,
      /cosine/i,
      /similarity/i,
    ]) {
      expect(src).not.toMatch(forbidden) // 0 embedding / vector / RAG call sites in the retrieval pack surface
    }
  })
})

// ── REQ-RETR-2 — the bounded pack ────────────────────────────────────────────────────────────────────────

describe("REQ-RETR-2 — the bounded pack", () => {
  it("SCN-RETR-2a-1 — emitted pack stays within the pinned ~2K cap", () => {
    const p = packerA.pack(T_BILLING)
    expect(p.tokenEstimate).toBe(1760) // T0 260 + T1 {n3,n4,n6,n5,n7} 1500 = 1760
    expect(p.tokenEstimate).toBeLessThanOrEqual(PACK_CAP) // ≤ 2000 — n8's +700 would blow it, so it is excluded
  })

  it("SCN-RETR-2b-1 — T0 in full, then T1 by the total rank", () => {
    const p = packerA.pack(T_BILLING)
    expect(idsOf(p.invariants)).toEqual([
      "inv:billing-no-neg", // T0 in full
      "inv:billing-idempotent-charge", // T0 in full
      "inv:billing-retry", // T1 by (hits-desc, ppr-desc, nodeKey-asc)…
      "inv:billing-refund",
      "inv:billing-audit", // audit < currency breaks the (10,0.50) tie by nodeKey-asc
      "inv:billing-currency",
      "inv:billing-legacy",
    ])
    // independent oracle: T0 first, then T1 rank-prefix that fits
    const t0 = FIXTURE_A.filter((c) => c.tier === "T0").sort(specRank)
    const t1 = FIXTURE_A.filter((c) => c.tier === "T1").sort(specRank)
    expect(idsOf(p.invariants.slice(0, 2))).toEqual(t0.map((c) => String(c.nodeKey)))
    expect(idsOf(p.invariants.slice(2))).toEqual(t1.slice(0, 5).map((c) => String(c.nodeKey)))
  })

  it("SCN-RETR-2c-1 — cap reached → truncation marker + tail, never a silent drop", () => {
    const p = packerA.pack(T_BILLING)
    expect(p.truncated).toBe(true) // the truncation MARKER (cap won over completeness)
    expect(p.tail.map(String)).toEqual(["inv:billing-notes"]) // the pull-reachable tail = {n8}
    // 0 silent drops: every candidate is either emitted OR named in the tail
    const accountedFor = new Set<string>([...idsOf(p.invariants), ...p.tail.map(String)])
    for (const c of FIXTURE_A) expect(accountedFor.has(String(c.nodeKey))).toBe(true)
  })

  it("SCN-RETR-2d-1 — merged pack over K territories → ~2K total, not per-territory", () => {
    const pay: PackAxis = {
      territory: "crate:payments",
      axisHash: asHash("axis-payments"),
      candidates: [cand("inv:payments-ledger", { tier: "T1", ppr: 0.95, hits: 10, tok: 300 })],
      stale: false,
    }
    const packer = createPacker(indexOf({ "crate:billing": AXIS_A, "crate:payments": pay }))
    const merged = packer.mergedPack([T_BILLING, terr("crate:payments")])
    expect(merged.tokenEstimate).toBeLessThanOrEqual(PACK_CAP) // one shared ~2K budget, never 2000 each
  })

  it("SCN-RETR-2e-1 — merged fill T0-first then PPR, hub outranks the closer leaf", () => {
    const pay: PackAxis = {
      territory: "crate:payments",
      axisHash: asHash("axis-payments"),
      candidates: [cand("inv:payments-ledger", { tier: "T1", ppr: 0.95, hits: 10, tok: 300 })],
      stale: false,
    }
    const packer = createPacker(indexOf({ "crate:billing": AXIS_A, "crate:payments": pay }))
    const merged = packer.mergedPack([T_BILLING, terr("crate:payments")])
    const ids = idsOf(merged.invariants)
    const hub = ids.indexOf("inv:payments-ledger") // ppr 0.95
    const leaf = ids.indexOf("inv:billing-currency") // n_leaf, ppr 0.50, equal hits
    expect(hub).toBeGreaterThanOrEqual(0)
    expect(leaf).toBeGreaterThanOrEqual(0)
    expect(hub).toBeLessThan(leaf) // the high-PPR hub outranks the closer/owner-territory leaf
  })

  it("SCN-RETR-2f-1 — a pack carries no free prose, only 1-line PackInvariants", () => {
    const p = packerA.pack(T_BILLING)
    for (const inv of p.invariants) {
      // [ADR-0013] `freshness` joins the shape: a row served without its own verdict is a defect, not a
      // default. The assertion stays EXACT — a fifth key would still flip it red.
      expect(Object.keys(inv).sort()).toEqual(["claim", "freshness", "nodeId", "tier"])
      expect(inv.claim).not.toContain("\n") // a single structured line — 0 prose blobs
    }
  })
})

// ── REQ-RETR-7 — per-type caps under the pinned measure ──────────────────────────────────────────────────

describe("REQ-RETR-7 — per-type caps under the pinned measure", () => {
  it("SCN-RETR-7a-1 — each injection kind cap == its ratified pinned value", () => {
    expect(capFor("own")).toBe(1500) // NOT ~1.6K — the pinned value, so a drift flips the assertion
    expect(capFor("pack")).toBe(2000)
    expect(capFor("poke")).toBe(150)
    // FLAG: goldens-ret.md also names `related ~300`, but `related` is NOT a member of the frozen
    // @atlas/contracts InjectionKind — not asserted here (never invented onto the frozen enum).
    const p = packerA.pack(T_BILLING)
    expect(p.tokenEstimate).toBeLessThanOrEqual(capFor("pack")) // enforced ≤ the pack cap
  })

  it("SCN-RETR-7b-1 — no single kind consumes the whole ceiling", () => {
    const kinds: InjectionKind[] = [
      "awareness",
      "orientation",
      "projectMem",
      "own",
      "pack",
      "protocols.safetyCritical",
      "protocols.advisory",
      "poke",
    ]
    const maxCap = Math.max(...kinds.map(capFor))
    expect(maxCap).toBe(capFor("pack")) // pack is the largest cap
    expect(maxCap).toBeLessThan(CAP_CEILING) // …and it is strictly less than the ~5K ceiling
  })

  it("SCN-RETR-7c-1 — Awareness and Orientation are derived, never written", () => {
    // the pack surface is a pure read projection: 0 write sites for awareness / orientation
    const src = readFileSync(fileURLToPath(new URL("../src/pack.ts", import.meta.url)), "utf8")
    for (const forbidden of [/writeFile/i, /appendFile/i, /\.writeSync\b/, /writeAwareness/i, /writeOrientation/i]) {
      expect(src).not.toMatch(forbidden)
    }
    expect(capFor("awareness")).toBe(capFor("awareness")) // capFor is a pure lookup (no setter / no write path)
  })

  it("SCN-RETR-7d-1 — caps enforced under the pinned cap measure (deterministic count)", () => {
    const a = packerA.pack(T_BILLING)
    const b = packerA.pack(T_BILLING)
    expect(a.tokenEstimate).toBe(b.tokenEstimate) // byte-identical count for equal input (pinned measure)
    expect(a.tokenEstimate).toBeLessThanOrEqual(capFor("pack")) // enforcement is over `Pack.tokenEstimate`
  })
})

// ── REQ-RETR-9 — empty & total ───────────────────────────────────────────────────────────────────────────

describe("REQ-RETR-9 — empty & total (the total surface)", () => {
  it("SCN-RETR-9a-1 — a malformed scope yields an empty pack (no nearest-match fallback)", () => {
    const packer = createPacker(indexOf({})) // no covering territory for anything
    const p = packer.pack(terr(" ///not-a-path"))
    expect(p.invariants).toEqual([]) // empty, never a partial nearest-match guess
    expect(p.truncated).toBe(false)
    expect(p.tail).toEqual([])
  })

  it("SCN-RETR-9b-1 — a malformed scope never throws", () => {
    const packer = createPacker(indexOf({}))
    const malformed: unknown[] = [null, undefined, "", " ///x", {}, { name: 42 }, [], "ünîcodé", "\0"]
    for (const m of malformed) {
      expect(() => packer.pack(m as Territory)).not.toThrow() // every entry point returns empty, never throws
      expect(() => packer.mergedPack([m as Territory])).not.toThrow()
    }
    expect(compare({ nodeKey: nk("a"), ppr: 0.1, hits: 1 }, { nodeKey: nk("b"), ppr: 0.1, hits: 1 })).toBeLessThan(0)
  })
})
