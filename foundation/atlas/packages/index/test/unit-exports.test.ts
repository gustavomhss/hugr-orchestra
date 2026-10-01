// @atlas/index — test/unit-exports.test.ts  (#196c candidate-grounded — the CARDINALITY recall source)
//
// `createUnitExports` is the fan-IN dual of `createUnitDeps`. It answers two questions count genesis needs over
// one SCIP output:
//   exportsWithCallersFor(unit) — the unit's exported NAMES that ≥1 OTHER unit references (candidate set)
//   resolveExportFor(unit, name) — that name → the unit's OWN symbol + harness-derived atLeast/scope (gate leg)
// The load-bearing properties: (1) an own-vocab-only symbol (defined + only self-referenced) is EXCLUDED; (2) an
// externally-called export is INCLUDED with the WITNESSED distinct-caller count; (3) an off-unit name resolves
// null (the lucy BLOCKER — never ride a sibling's same-named symbol); (4) atLeast is the harness's, never asked.

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "../src/types.js"
import { createUnitExports } from "../src/unit-exports.js"

// contracts DEFINES Hash; it is referenced (called) by two OTHER units (pay, order) ⇒ a real cross-unit export
// with witnessed count 2 under their common prefix `src`.
const HASH = "scip-typescript npm @atlas/contracts 0.0.0 src/`hash.ts`/Hash#" //     defined in contracts
// pay DEFINES charge and references it ONLY itself ⇒ own-vocab-only, EXCLUDED from pay's candidates.
const CHARGE = "scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/charge()." //      defined+self-ref in pay
const LOCAL_T = "scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/PayInput#" //     defined+used IN pay (own vocab)

const scip: ScipOutput = {
  documents: [
    {
      relativePath: "src/contracts/hash.ts",
      occurrences: [{ symbol: HASH, role: "definition" }], // contracts only DEFINES Hash
    },
    {
      relativePath: "src/pay/pay.ts",
      occurrences: [
        { symbol: CHARGE, role: "definition" }, //   pay defines charge…
        { symbol: CHARGE, role: "reference" }, //     …and references it ITSELF (own vocab — not an external caller)
        { symbol: LOCAL_T, role: "definition" }, //  …and its own PayInput type…
        { symbol: LOCAL_T, role: "reference" }, //    …also self-referenced (own vocab)
        { symbol: HASH, role: "reference" }, //       …and CALLS contracts' Hash (cross-unit caller #1)
      ],
    },
    {
      relativePath: "src/order/order.ts",
      occurrences: [{ symbol: HASH, role: "reference" }], // order also CALLS Hash (cross-unit caller #2)
    },
  ],
} as unknown as ScipOutput

describe("#196c createUnitExports — the candidate-grounded cardinality recall source", () => {
  const ex = createUnitExports(scip)

  it("exportsWithCallersFor returns ONLY externally-called exports — own-vocab + uncalled excluded", () => {
    // contracts' Hash is defined here and referenced by pay + order ⇒ an externally-called export.
    expect(ex.exportsWithCallersFor("src/contracts/hash.ts")).toEqual(["Hash"])
    // teeth: pay defines charge + PayInput but references BOTH only itself ⇒ no cross-unit caller ⇒ EXCLUDED.
    expect(ex.exportsWithCallersFor("src/pay/pay.ts")).toEqual([])
  })

  it("exportsWithCallersFor is empty (never throws) for an unknown path", () => {
    expect(ex.exportsWithCallersFor("src/nope.ts")).toEqual([])
  })

  it("resolveExportFor binds the name to THIS unit's symbol + the WITNESSED atLeast and common-prefix scope", () => {
    // Hash is called by pay (src/pay/pay.ts) and order (src/order/order.ts) ⇒ 2 distinct caller units, common
    // segment-prefix `src`. The number is the HARNESS'S — the model never emits it.
    expect(ex.resolveExportFor("src/contracts/hash.ts", "Hash")).toEqual({ symbol: HASH, atLeast: 2, scope: "src" })
  })

  it("resolveExportFor returns null for an OFF-UNIT / own-vocab / off-list name — the lucy BLOCKER", () => {
    // teeth (lucy BLOCKER): `Hash` IS an externally-called export, but NOT of `pay` — an index-wide lookup would
    // ride contracts' symbol; the per-unit resolver returns null so it is never attributed to pay.
    expect(ex.resolveExportFor("src/pay/pay.ts", "Hash")).toBeNull()
    // charge is pay's OWN symbol but only self-referenced ⇒ not an external export ⇒ null.
    expect(ex.resolveExportFor("src/pay/pay.ts", "charge")).toBeNull()
    // an off-list name of the RIGHT unit ⇒ null (the parser then abstains).
    expect(ex.resolveExportFor("src/contracts/hash.ts", "bogus")).toBeNull()
  })
})
