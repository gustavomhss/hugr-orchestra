// @atlas/index — test/unit-defs-memo.test.ts  (PERF waste-audit 2026-08-23 — the createUnitDefs memo)
//
// `createUnitDefs` got the same WeakMap-by-scip-identity memo as `createUnitDeps`/`createUnitExports` (the
// definition arm builds it twice per pass — candidate list + gate resolver — off one `slotScip`). lucy's
// cold review flagged it had no dedicated test; this pins the memo. Mutation-verified: drop the WeakMap and
// the two calls return distinct instances.

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "../src/types.js"
import { createUnitDefs } from "../src/unit-defs.js"

const DEF = "scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/charge()."
const scip: ScipOutput = {
  documents: [{ relativePath: "src/pay/pay.ts", occurrences: [{ symbol: DEF, role: "definition" }] }],
} as unknown as ScipOutput

describe("createUnitDefs — MEMOIZED by scip identity (PERF)", () => {
  it("two calls with the SAME scip object return the SAME api instance", () => {
    expect(createUnitDefs(scip)).toBe(createUnitDefs(scip))
  })
  it("a DIFFERENT scip object gets its own instance (keys on identity, not value)", () => {
    const other: ScipOutput = { documents: [] } as unknown as ScipOutput
    expect(createUnitDefs(other)).not.toBe(createUnitDefs(scip))
  })
})
