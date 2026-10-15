// @atlas/cli — test/relations-seal-render.test.ts  (#99 R6 — AR-12: the CLI surfaces the relation seal + witness)
//
// Before R6 the relation renders dropped the seal: `atlas relations` printed `relation <kind> <A> -> <B>
// (<nodeKey>)` with no provenance, and the `atlas node` seal/witness render (render.ts:160) was gated to
// `advisory|predicate` and never fired for a relation — a proven `depends-on` looked identical to an advisory
// one at the user surface. Each tooth NAMES the mutant it kills; the render is a PURE function of `data`, so
// these tests drive it with literal verdict data (no store, per the R6 fixture rule).

import { describe, it, expect } from "vitest"
import type { Verdict } from "@atlas/tools"
import { renderVerdict } from "../src/render.js"

const guidance = { next: "do the next thing", invariant: "the governing invariant" }
const PREFIX = "status: ok\nnext: do the next thing\ninvariant: the governing invariant\n"

const A = "src/a.ts::f"
const B = "src/b.ts::g"

describe("#99 R6 — AR-12: `atlas relations` prints the seal per edge", () => {
  it("a sealed edge renders its seal; an unsealed edge stays byte-identical to before (back-compat)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        unit: A,
        direction: "out",
        relations: [
          { nodeKey: "r-proven", relationKind: "depends-on", endpointA: A, endpointB: B, seal: "proven" },
          { nodeKey: "r-adv", relationKind: "calls", endpointA: A, endpointB: "src/c.ts::h" },
        ],
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    // TEETH: before R6 neither line carried a seal — a proven edge read identically to an advisory one.
    expect(stdout).toContain(`  relation depends-on ${A} -> ${B} (r-proven) [proven]`)
    // an unsealed edge carries NO `[...]` suffix (never a silent [proven]) — the pre-R6 byte shape.
    expect(stdout).toContain(`  relation calls ${A} -> src/c.ts::h (r-adv)\n`)
    expect(stdout).not.toContain("r-adv) [")
  })
})

describe("#99 R6 — AR-12: `atlas node <addr>` prints a relation node`s seal + witness", () => {
  it("a proven relation node renders its endpoints, seal and RelationWitness (the 160-line gate now fires)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        id: "gen-rel-1",
        tier: "T2",
        kind: "relation",
        relationKind: "depends-on",
        endpointA: A,
        endpointB: B,
        grounding: { entries: [{ path: A }, { path: B }] },
        seal: "proven",
        witness: { relationKind: "depends-on", target: "scip:sym#g", sourceScope: "src/a.ts" },
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    // TEETH: pre-R6 the seal/witness render was gated to advisory|predicate ⇒ a relation node produced NO
    // data block at all. It must now surface identity, the directed triple, the seal, and the witness fields.
    expect(stdout).toBe(
      PREFIX +
        "data:\n" +
        "  node: gen-rel-1\n" +
        "  tier: T2\n" +
        "  kind: relation\n" +
        `  relation: ${A} depends-on ${B}\n` +
        "  seal: proven\n" +
        "  witness:\n" +
        "    relationKind: depends-on\n" +
        "    target: scip:sym#g\n" +
        "    sourceScope: src/a.ts\n",
    )
  })

  it("an unsealed relation node renders identity + triple but NO seal/witness lines (absent-tolerant)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        id: "gen-rel-2",
        tier: "T2",
        kind: "relation",
        relationKind: "calls",
        endpointA: A,
        endpointB: B,
        grounding: { entries: [{ path: A }, { path: B }] },
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    expect(stdout).toContain(`  relation: ${A} calls ${B}\n`)
    expect(stdout).not.toContain("seal:") // no seal ⇒ never a silent 'proven'
    expect(stdout).not.toContain("witness:")
  })
})
