// @atlas/e2e — S10 · Full pipeline: a fact grounded to a REAL built index is self-invalidating
// AXIS: functioning (the true cross-seam vertical — @atlas/index → @atlas/grounding → @atlas/knowledge).
//
// STORY (the capstone). A fact is born from a real repo, grounded against the ACTUAL output of `build()`,
// admitted through the fail-closed store, and reads FRESH while it HOLDS. The moment the exact file it
// cites is edited, its cited unit's `subtreeHash` changes — and, with no re-embedding and no re-index-the-
// world, the fact stops being served: DRIFTED, gate NA. This is the whole thesis in one test:
//
//   1. `build(repo, scip)`  (@atlas/index)          — a REAL index over a small FileTree (mirrors S1).
//   2. walk `axes.spatial` to the cited leaf and READ its real `subtreeHash` — the grounding anchor is
//      DERIVED from the built index (never a hardcoded hash), so it is genuinely anchored to real structure.
//   3. `driftDetect(grounding, axes)` (@atlas/grounding)  === 'FRESH' — fresh against the index it was cut to.
//   4. `bindEmit({ isGrounded, persist })` (@atlas/knowledge) over the REAL kernel CAS — admits + round-trips.
//   5. `bindGate({ isGrounded, driftDetect }).gateHolds('HOLDS', …)` (@atlas/grounding) === 'HOLDS' — served.
//   6. rebuild with the CITED FILE'S content changed → `axes2` → DRIFTED → gate NA. Trust self-invalidates.
//
// Why this is the capstone (not a re-test of one package): the grounding oracle CONSUMES `build()`'s output
// directly — no hand-made `Axes` anywhere. The three layers compose on real data, and Atlas's trust is
// self-invalidating under real change by DETERMINISTIC subtreeHash equality alone: no embeddings, no RAG,
// no re-index-the-world — just the sealed BLAKE3 rollup the index already mints.
//
// INJECTED PORT (the only one, exactly as S3): `EmitDeps.persist` = the REAL sealed @atlas/kernel CAS
// (`createStore().put`). Every other function is a concrete export driven end-to-end: `build`,
// `driftDetect`/`isGrounded`/`bindGate`, `bindEmit`, `createStore`/`id`/`asNodeKey`. The grounded/FRESH
// oracles are the real ones, so the invalidation teeth bite on real structural change.

import { describe, it, expect } from "vitest"
import { asNodeKey, createStore, id } from "@atlas/kernel"
import { bindGate, isGrounded, driftDetect } from "@atlas/grounding"
import { bindEmit } from "@atlas/knowledge"
import type { Grounding } from "@atlas/grounding"
import type { GroundedFact } from "@atlas/knowledge"
import type { FileTree, ScipOutput, IndexNode } from "@atlas/index"
import { build } from "@atlas/index"

// ── the real repo (mirrors S1's spatial tree) ───────────────────────────────────────────────────────
const CITED = "repo/db.ts" // the file the fact will cite (a real leaf in the built spatial axis)
const repoWith = (dbContent: string): FileTree => ({
  path: "repo",
  children: [
    { path: "repo/api.ts", children: [], content: "export const handler = () => query();" },
    { path: CITED, children: [], content: dbContent },
    { path: "repo/native.rs", children: [], content: "pub fn native() {}" },
  ],
})
const DB_V1 = "export const query = () => native();"
const DB_V2 = "export const query = () => native(/* audited */);" // the edit that moves the cited unit

// The SCIP output a single-language (TS) indexer emits (mirrors S1) — the FFI target stays an honest hole.
const scip: ScipOutput = {
  documents: [
    { relativePath: "repo/api.ts", occurrences: [{ symbol: "db#query", role: "reference" }] },
    {
      relativePath: CITED,
      occurrences: [
        { symbol: "db#query", role: "definition" },
        { symbol: "ffi#native", role: "reference" },
      ],
    },
  ],
}

/** Walk a rooted axis view to the leaf whose `key` is `key` (the FileTree path). Total: `undefined` if
 *  absent. This is how we DERIVE the anchor subtreeHash from `build()`'s real output — never hardcoded. */
function findLeaf(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const child of node.children) {
    const hit = findLeaf(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** Build a grounding anchored to the cited leaf AS BUILT: its real `subtreeHash` + `qualifiedPath` = key. */
const groundingTo = (leaf: IndexNode): Grounding => ({
  entries: [{ anchor: { kind: "file", qualifiedPath: leaf.key, subtreeHash: leaf.subtreeHash }, path: CITED }],
})

/** The fact, wrapped exactly as S3 (advisory, kernel-keyed) — the trust object that must self-invalidate. */
const advisory = (grounding: Grounding): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey("fact:db.query"),
  tier: "T2",
  claimNorm: "query() delegates to the native FFI target",
  grounding,
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})

describe("S10 · full pipeline — grounded-to-real-index fact is self-invalidating under real change", () => {
  // ── steps 1-2: build the REAL index, then DERIVE the anchor from its actual spatial leaf ─────────────
  const axes = build(repoWith(DB_V1), scip)
  const leaf = findLeaf(axes.spatial, CITED)
  const grounding = groundingTo(leaf!)
  const gate = bindGate({ isGrounded, driftDetect }) // the REAL oracles composed across the seam

  it("grounds a fact to the ACTUAL subtreeHash minted by build() — anchor is derived, not hardcoded", () => {
    expect(leaf).toBeDefined()
    expect(leaf!.axis).toBe("spatial")
    // the anchor's subtreeHash IS the leaf's as-built value (came from build(), never a literal).
    // teeth (breaks-on "the grounding anchor drifts from build()'s real output — a hand-made hash leaked in"):
    expect(grounding.entries[0]!.anchor.subtreeHash).toBe(leaf!.subtreeHash)
    expect(grounding.entries[0]!.anchor.qualifiedPath).toBe(CITED)
    expect(String(leaf!.subtreeHash).length).toBeGreaterThan(0)
    expect(isGrounded(grounding)).toBe(true) // ≥1 entry, non-empty subtreeHash
  })

  // ── step 3: the fact reads FRESH against the very index it was grounded to ───────────────────────────
  it("reads FRESH against the real built index it was grounded to (driftDetect over build() output)", () => {
    // teeth (breaks-on "a fact grounded to build()'s own output fails to read FRESH — the oracle can't
    // consume the real index"):
    expect(driftDetect(grounding, axes)).toBe("FRESH")
  })

  // ── step 4: admit through the fail-closed store wired to the REAL kernel CAS ──────────────────────────
  it("is admitted through the fail-closed store and round-trips from the real kernel CAS", () => {
    const store = createStore()
    let writes = 0
    const emit = bindEmit({
      isGrounded,
      persist: (n) => {
        writes += 1
        return store.put(n)
      },
    })

    const node = advisory(grounding)
    const verdict = emit.admit(node)

    expect(verdict.emitted).toBe(true)
    expect(writes).toBe(1) // persisted exactly once through the injected CAS port
    // the receipt id is the sealed kernel content-address — re-derived, never fabricated.
    expect(verdict.id).toBe(id(node))
    // teeth (breaks-on "the admitted fact is not truly persisted / not retrievable — the store is a no-op"):
    expect(store.get(verdict.id!)).toEqual(node)
  })

  // ── step 5: the served fact HOLDS against the live index ──────────────────────────────────────────────
  it("HOLDS at the truth-gate against the live index (grounded ∧ FRESH ⇒ HOLDS)", () => {
    // teeth (breaks-on "a genuinely grounded+fresh fact is refused at the gate — false-negative truth"):
    expect(gate.gateHolds("HOLDS", grounding, axes)).toBe("HOLDS")
  })

  // ── step 6: THE INVALIDATION — edit the cited file, rebuild, the fact stops being served ──────────────
  it("stops being served the moment its cited file is edited — DRIFTED + gate NA (self-invalidating)", () => {
    // rebuild the SAME repo with ONLY the cited file's content changed.
    const axes2 = build(repoWith(DB_V2), scip)
    const leaf2 = findLeaf(axes2.spatial, CITED)
    expect(leaf2).toBeDefined()

    // the cited leaf's real subtreeHash moved — deterministic BLAKE3 rollup, no embedding, no re-RAG.
    // teeth (breaks-on "editing the cited file leaves its subtreeHash unchanged — drift is undetectable"):
    expect(leaf2!.subtreeHash).not.toBe(leaf!.subtreeHash)

    // the fact, still recording the OLD subtreeHash, now reads DRIFTED against the rebuilt index.
    // teeth (breaks-on "a fact stays FRESH after the exact file it cites was edited"):
    expect(driftDetect(grounding, axes2)).toBe("DRIFTED")

    // and the truth-gate downgrades HOLDS→NA — the fact born fresh is automatically no longer served.
    // teeth (breaks-on "a fact stays served (HOLDS) after the exact file it cites was edited"):
    expect(gate.gateHolds("HOLDS", grounding, axes2)).toBe("NA")

    // untouched files are irrelevant to this fact's grounding: only the CITED unit's hash gates it — but the
    // repo-root hash also moved (a child changed), proving the edit is real, not a fixture swap.
    expect(axes2.spatial.subtreeHash).not.toBe(axes.spatial.subtreeHash)
  })
})
