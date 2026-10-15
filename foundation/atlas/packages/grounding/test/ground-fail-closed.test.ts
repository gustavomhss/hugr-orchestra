// @atlas/grounding — test/ground-fail-closed.test.ts   (ANCHOR-IDENTITY · finding E)
//
// GROUND-3's fail-closed drop is PER-ENTRY, which makes it fail-OPEN PER FACT: `ground()` walks the
// citations and `continue`s past every unresolvable one (src/ground.ts:78), so a fact that cited TWO sites
// and lost ONE re-grounds to a ONE-entry receipt that `isGrounded` and reads FRESH. Half the evidence
// vanished and the receipt came back clean. Only a fact whose EVERY citation dies is caught today, because
// the empty receipt is the ONLY state `isGrounded` rejects.
//
// A grounding receipt is a claim about WHAT the fact is anchored to. A receipt that silently lost evidence
// is a lie about grounding, and the drift oracle then certifies the fact against evidence it no longer has.
// The unit of fail-closed is therefore the FACT, not the entry.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { Axes, IndexNode } from "@atlas/index"
import { driftDetect, isGrounded } from "../src/drift.js"
import { ground, type Citation } from "../src/ground.js"

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
const cite = (qp: string): Citation => ({ kind: "symbol", qualifiedPath: qp, path: qp.split("#")[0] ?? qp })

const ARR = "billing.ts#computeArr"
const TAX = "billing.ts#tax"
const BOTH = axesWith([node(ARR, "sh-arr-01"), node(TAX, "sh-tax-01")])
const HALF = axesWith([node(ARR, "sh-arr-01")]) // the `tax` unit was DELETED

describe("GROUND-3 fail-closed is per FACT, not per entry", () => {
  it("E: a two-citation fact that loses ONE citation does not re-ground to a clean receipt", () => {
    const fact = { citations: [cite(ARR), cite(TAX)] }
    // PREMISE — with both units present the fact grounds fully and reads FRESH.
    const full = ground(fact, BOTH)
    expect(full.entries).toHaveLength(2)
    expect(isGrounded(full)).toBe(true)
    expect(driftDetect(full, BOTH)).toBe("FRESH")

    const lost = ground(fact, HALF)
    // teeth (breaks-on "the drop is per-ENTRY: half the evidence is discarded and the surviving half is
    // handed back as a real, FRESH grounding — a receipt that lies about what the fact is anchored to"):
    expect(isGrounded(lost)).toBe(false)
    expect(driftDetect(lost, HALF)).toBe("DRIFTED")
  })

  it("E: the loss is caught for EVERY non-empty proper subset of surviving citations", () => {
    const A = "a.ts#a"
    const B = "b.ts#b"
    const C = "c.ts#c"
    const fact = { citations: [cite(A), cite(B), cite(C)] }
    const all = [node(A, "ha"), node(B, "hb"), node(C, "hc")]
    for (const drop of [0, 1, 2]) {
      const src = axesWith(all.filter((_, i) => i !== drop))
      const g = ground(fact, src)
      // teeth (breaks-on "only the ALL-citations-dead case is caught — any surviving citation launders it"):
      expect(isGrounded(g)).toBe(false)
      expect(driftDetect(g, src)).toBe("DRIFTED")
    }
    // CONTROL — nothing lost ⇒ still a real, FRESH receipt (the fix is fail-CLOSED, not fail-ALWAYS).
    const intact = ground(fact, axesWith(all))
    expect(isGrounded(intact)).toBe(true)
    expect(driftDetect(intact, axesWith(all))).toBe("FRESH")
  })

  it("E: ground() stays TOTAL — an unresolvable citation is never a throw", () => {
    expect(() => ground({ citations: [cite("gone.ts#x")] }, HALF)).not.toThrow()
    expect(() => ground({ citations: [] }, HALF)).not.toThrow()
    expect(isGrounded(ground({ citations: [] }, HALF))).toBe(false)
  })
})
