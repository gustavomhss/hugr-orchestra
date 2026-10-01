// HELD-OUT GATE (reviewer-authored) — SCN-GROUND-3a-2 (goldens-grd.md:576-583, held_out:true) +
// synthesized GROUND-3 adversarial legs. Disjoint fixture universe: U_tax = pricing.ts#computeVat @sh-tax-01.
import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { Axes, IndexNode } from "@atlas/index"
import { driftDetect, isGrounded } from "../src/drift.js"
import { ground } from "../src/ground.js"
import type { Citation, GroundableUnit } from "../src/ground.js"

const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(sh),
  children,
  objects: [],
})
const axesWith = (leaves: IndexNode[]): Axes => ({
  spatial: node("repo", "root", leaves),
  territory: node("repo", "empty"),
  dependency: node("repo", "empty"),
  edges: [],
})
const cite = (qp: string, dl?: string): Citation => {
  const path = qp.split("#")[0] ?? qp
  const base = { kind: "symbol" as const, qualifiedPath: qp, path }
  return dl === undefined ? base : { ...base, displayLines: dl }
}
const unit = (...citations: Citation[]): GroundableUnit => ({ citations })

const QP_TAX = "pricing.ts#computeVat"
const src = axesWith([node(QP_TAX, "sh-tax-01")]) // E_tax resolves; E_gone2 absent

describe("HELD-OUT WP-4.10-c.GROUND", () => {
  // ⚠️ CONFLICT — REQ-GROUND-3a AS WRITTEN IS FAIL-OPEN, AND THE FIX CONTRADICTS IT (ANCHOR-IDENTITY, E).
  // The golden's Then clause ("`E_gone2` is filtered out (dropped); the resulting grounding contains only
  // `E_tax`") is fail-CLOSED for the ENTRY and fail-OPEN for the FACT: a fact citing two sites and losing one
  // re-grounded to a one-entry receipt that `isGrounded` accepted and `driftDetect` read FRESH — half the
  // evidence gone, receipt clean. `ground()` is now fail-closed at the FACT (src/ground.ts): one unresolvable
  // citation ⇒ NO receipt. The golden's TEETH still hold — the dangling citation never appears in the output.
  // Its ARITY and its FRESH verdict do not. The goldens file (docs/requirements/goldens-grd.md) is NOT edited
  // here; this transcription is updated to the shipped law and the amendment is ESCALATED for adjudication.
  it("SCN-GROUND-3a-2 [AMENDED]: E_gone2 is never retained, and the surviving E_tax does not read clean", () => {
    const f = unit(cite(QP_TAX, "88-96"), cite("purged.ts#gone2", "5-9"))
    const g = ground(f, src)
    expect(g.entries.map((e) => e.anchor.qualifiedPath)).not.toContain("purged.ts#gone2")
    expect(g.entries).toHaveLength(0)
    expect(isGrounded(g)).toBe(false)
    expect(driftDetect(g, src)).toBe("DRIFTED")

    // CONTROL — both units present ⇒ the full 2-entry receipt, re-derived @src, FRESH (not fail-ALWAYS).
    const both = axesWith([node(QP_TAX, "sh-tax-01"), node("purged.ts#gone2", "sh-gone2-01")])
    const intact = ground(f, both)
    expect(intact.entries).toHaveLength(2)
    expect(intact.entries[0]?.anchor.subtreeHash).toBe(asSubtreeHash("sh-tax-01"))
    expect(intact.entries[0]?.displayLines).toBe("88-96")
    expect(isGrounded(intact)).toBe(true)
    expect(driftDetect(intact, both)).toBe("FRESH")
  })

  it("synthesized: a 0-citation unit yields an empty Grounding, isGrounded false, no throw", () => {
    let g!: ReturnType<typeof ground>
    expect(() => (g = ground(unit(), src))).not.toThrow()
    expect(g.entries).toHaveLength(0)
    expect(isGrounded(g)).toBe(false)
    expect(driftDetect(g, src)).toBe("DRIFTED")
  })

  it("synthesized: every-citation-gone unit collapses to empty, DRIFTED, never FRESH", () => {
    const f = unit(cite("gone-a.ts#x"), cite("gone-b.ts#y", "1-2"), cite("nested/deep.ts#a.b.c"))
    const g = ground(f, src)
    expect(g.entries).toHaveLength(0)
    expect(isGrounded(g)).toBe(false)
    expect(driftDetect(g, src)).toBe("DRIFTED")
  })
})
