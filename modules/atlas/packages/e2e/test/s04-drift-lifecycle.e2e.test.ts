// @atlas/e2e — S4 · Drift lifecycle: when cited code moves, the fact is not trusted
// AXIS: behaviour + SECURITY (stale-not-trusted; the semantic block is a fail-closed review gate).
//
// STORY. S3 proved a DRIFTED fact is refused at the truth-gate. S4 is its sequel: what happens AFTER the
// drift is detected. When the code a fact cites moves under it, Atlas must (1) SEE the move — a unit
// recorded at one structural hash reads DRIFTED once its anchor moves to another; (2) key that verdict on
// STRUCTURE ALONE (GROUND-1) so a cosmetic reformat / line-shift is NEVER mistaken for a real change; then
// (3) RECONCILE the drift by splitting it into two disjoint classes — MECHANICAL (the anchor moved but the
// claim still re-derives ⇒ auto-re-grounded, no human, exit 0) vs SEMANTIC (the claim no longer re-derives
// ⇒ flips BROKEN, blocks the merge, exit 2) — with the human re-author count bounded to the semantic arm
// alone; and (4) FAIL CLOSED: a batch carrying any semantic block reports a blocking exit, never a clean
// one. Finally (5) it closes the loop — re-`ground()`-ing the moved unit yields a grounding that reads
// FRESH again against the source it was re-derived from.
//
// This composes the REAL wired runtime across the package seam: @atlas/grounding `driftDetect`/`ground`
// (the concrete subtreeHash-equality oracle + anchor builder, not fakes) and @atlas/knowledge
// `bindReconcile` (the drift classifier). The ONE legitimate seam is `bindReconcile`'s INJECTED PORT
// `ReDerives = (fact, newSha) => boolean` — the per-fact re-hash is grounding-owned, consume-only — wired
// here as a fixture double (a re-derives id-set), the same build-ahead discipline S3's `EmitDeps` used.
// The `exitCode` asserted below is a RETURNED FIELD on the reconcile record, NOT a process exit.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey, asHash } from "@atlas/kernel"
import { driftDetect, ground } from "@atlas/grounding"
import type { Grounding, Citation, GroundableUnit } from "@atlas/grounding"
import { bindReconcile } from "@atlas/knowledge"
import type { ReDerives, DriftedFact, GroundedFact } from "@atlas/knowledge"
import type { Hash } from "@atlas/contracts"
import type { Axes, Axis, IndexNode } from "@atlas/index"

// ── the cited unit + built-index snapshots (mirroring S3 / wp-4.10-a fixtures) ───────────────────────
const ANCHOR = "billing.ts#computeArr"
const leaf = (key: string, sh: string): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(sh),
  children: [],
  objects: [],
})
const emptyAxis = (axis: Axis): IndexNode => ({
  axis,
  level: "root",
  key: axis,
  subtreeHash: asSubtreeHash("empty"),
  children: [],
  objects: [],
})
/** A built-index snapshot in which ANCHOR currently hashes to `sh`. */
const srcWhereAnchorIs = (sh: string): Axes => ({
  spatial: {
    axis: "spatial",
    level: "repo",
    key: "repo",
    subtreeHash: asSubtreeHash("root"),
    children: [leaf(ANCHOR, sh)],
    objects: [],
  },
  territory: emptyAxis("territory"),
  dependency: emptyAxis("dependency"),
  edges: [],
})

// ── groundings ────────────────────────────────────────────────────────────────────────────────────
/** A grounding recording ANCHOR at subtreeHash `sh`; `displayLines` is a nav hint that must NEVER touch
 *  the drift oracle (GROUND-1). Under exactOptionalPropertyTypes the field is genuinely absent-or-value. */
const groundingAt = (sh: string, displayLines?: string): Grounding => {
  const anchor = { kind: "symbol" as const, qualifiedPath: ANCHOR, subtreeHash: asSubtreeHash(sh) }
  const entry =
    displayLines === undefined ? { anchor, path: "billing.ts" } : { anchor, path: "billing.ts", displayLines }
  return { entries: [entry] }
}

// ── knowledge-fact + drift fixtures (mirroring reconcile.know5) ──────────────────────────────────────
/** An advisory GroundedFact grounded at ANCHOR@`storedSha`. The stored `freshness`/`claims` legs are inert
 *  to the reconcile split — the mechanical/semantic arm is RECOMPUTED from the injected `reDerives`. */
const factAt = (id: string, storedSha: string): GroundedFact => ({
  kind: "advisory",
  id: asNodeKey(id),
  tier: "T2",
  claimNorm: `cn-${id}`,
  grounding: groundingAt(storedSha),
  freshness: "DRIFTED",
  claims: [],
  authoring: "ADVISORY",
})
const drifted = (fact: GroundedFact, newSha: string): DriftedFact => ({ fact, newSha: asHash(newSha) })

// INJECTED PORT (the seam): the grounding-owned per-fact re-hash `reDerives(fact, newSha)`, wired as a
// fixture double. A fact whose id is in `mechanicalIds` still re-derives at its new @sha (mechanical);
// every other fact fails closed (semantic). Consume-only — no hashing is computed in this test.
const reDerivesFor =
  (mechanicalIds: ReadonlySet<string>): ReDerives =>
  (fact: GroundedFact, _newSha: Hash): boolean =>
    mechanicalIds.has(String(fact.id))

// A DRIFTED batch: 2 that re-derive (mechanical) + 2 that do not (semantic).
const mA = drifted(factAt("mA", "sh-1"), "sha-mA")
const mB = drifted(factAt("mB", "sh-1"), "sha-mB")
const sA = drifted(factAt("sA", "sh-1"), "sha-sA")
const sB = drifted(factAt("sB", "sh-1"), "sha-sB")
const MECHANICAL_IDS = new Set(["mA", "mB"])
const reconcile = bindReconcile(reDerivesFor(MECHANICAL_IDS))

// ── the groundable unit for the re-ground loop (mirroring wp-4.10-c) ─────────────────────────────────
const cite = (qp: string): Citation => ({ kind: "symbol", qualifiedPath: qp, path: qp.split("#")[0] ?? qp })
const unit = (...citations: Citation[]): GroundableUnit => ({ citations })

describe("S4 · drift lifecycle — stale-not-trusted, then split mechanical-reground vs semantic-block", () => {
  it("sees a real move: a unit recorded at sh-1 reads FRESH at sh-1 and DRIFTED once its anchor moves to sh-2", () => {
    const grounded = groundingAt("sh-1")
    expect(driftDetect(grounded, srcWhereAnchorIs("sh-1"))).toBe("FRESH")
    // the code at ANCHOR moved sh-1 → sh-2; the grounding still records sh-1 ⇒ the fact is not trusted.
    // teeth (breaks-on "a moved unit still reads FRESH — the drift oracle is blind"):
    expect(driftDetect(grounded, srcWhereAnchorIs("sh-2"))).toBe("DRIFTED")
  })

  it("keys drift on subtreeHash alone (GROUND-1): a cosmetic reformat / line-shift stays FRESH", () => {
    // a reformat is modelled by an IDENTICAL subtreeHash under a shifted displayLines nav hint — the
    // structure is byte-invariant, only the human line-range moved [40-52] → [44-56].
    const original = groundingAt("sh-1", "40-52")
    const reformatted = groundingAt("sh-1", "44-56") // same anchor subtreeHash, shifted lines
    const src = srcWhereAnchorIs("sh-1")
    // teeth (breaks-on "a cosmetic reformat is falsely flagged as drift"):
    expect(driftDetect(reformatted, src)).toBe("FRESH")
    // the verdict is invariant across the displayLines edit — the line-shift never enters the oracle.
    expect(driftDetect(reformatted, src)).toBe(driftDetect(original, src))
  })

  it("reconcile splits the DRIFTED batch: mechanical holds the re-derivers, semantic holds the rest, reauthor == |semantic|", () => {
    const r = reconcile([mA, mB, sA, sB])
    const ids = (fs: readonly GroundedFact[]) => new Set(fs.map((f) => String(f.id)))
    // mechanical = exactly the re-deriving facts (auto-re-grounded, no human).
    expect(ids(r.mechanical)).toEqual(new Set(["mA", "mB"]))
    // semantic = exactly the non-re-deriving facts (needs-human).
    // teeth (breaks-on "a semantic (needs-human) drift is silently auto-regrounded"):
    expect(ids(r.semantic)).toEqual(new Set(["sA", "sB"]))
    // the human re-author count is bounded to the semantic arm alone — never |DRIFTED|.
    expect(r.reauthorCount).toBe(r.semantic.length)
    expect(r.reauthorCount).toBe(2)
    expect(r.reauthorCount).not.toBe(4) // never |DRIFTED|
  })

  it("fails closed: exitCode is 2 when any semantic drift is present, 0 when all reconcile mechanically", () => {
    // `exitCode` is a RETURNED FIELD on the record — a blocking VALUE, not a process exit.
    const blocked = reconcile([mA, sA]) // one semantic present
    const clean = reconcile([mA, mB]) // all mechanical
    // teeth (breaks-on "a batch containing a semantic block reports a clean exit"):
    expect(blocked.exitCode).toBe(2)
    expect(blocked.semantic.length).toBeGreaterThan(0)
    expect(clean.exitCode).toBe(0)
    expect(clean.semantic.length).toBe(0)
  })

  it("closes the loop: re-ground()-ing the moved unit yields a grounding that reads FRESH again", () => {
    const movedSrc = srcWhereAnchorIs("sh-2") // the unit now lives at sh-2
    const staleGrounding = groundingAt("sh-1") // the pre-move anchor
    expect(driftDetect(staleGrounding, movedSrc)).toBe("DRIFTED") // detected

    // re-derive the anchor@src — ground() reads the CURRENT sh-2 from the moved index (never re-hashing).
    const reGrounded = ground(unit(cite(ANCHOR)), movedSrc)
    expect(reGrounded.entries[0]?.anchor.subtreeHash).toBe(asSubtreeHash("sh-2"))
    // teeth (breaks-on "a re-grounded fact still reads DRIFTED — the reground loop never converges"):
    expect(driftDetect(reGrounded, movedSrc)).toBe("FRESH")
  })
})
