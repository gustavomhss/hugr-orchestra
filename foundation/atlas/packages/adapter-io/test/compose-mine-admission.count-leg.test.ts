// @atlas/adapter-io — test/compose-mine-admission.count-leg.test.ts  (#196c — the WIRED count admission leg)
//
// `buildMineAdmission` supplies the REAL `verifyCount` leg the count admission arm (@atlas/genesis
// `admitPredicate`) consults — it must call the SAME sound `verifyCount` oracle (`createVerifyFactLeg`) the
// `atlas verify-fact count` verb drives, in LOWER-BOUND mode (`exact` unset). This pins the WIRING is faithful
// over a real `ScipOutput`: a witnessed lower bound proves, an `atLeast` ABOVE the witnessed caller count
// abstains (never a false proven), and the leg never sets `exact` (a closed-world claim we are not making).

import { describe, it, expect } from "vitest"
import type { Axes, IndexNode, ScipOutput } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { buildMineAdmission } from "../src/compose-mine-admission.js"

// HASH is defined in contracts and referenced by pay + order ⇒ 2 distinct caller units under `src`.
const HASH = "scip-ts npm fixture 1.0.0 `Hash`#"

const scip: ScipOutput = {
  documents: [
    { relativePath: "src/contracts/hash.ts", occurrences: [{ symbol: HASH, role: "definition" }] },
    { relativePath: "src/pay/pay.ts", occurrences: [{ symbol: HASH, role: "reference" }] },
    { relativePath: "src/order/order.ts", occurrences: [{ symbol: HASH, role: "reference" }] },
  ],
}

const node: IndexNode = {
  axis: "spatial",
  level: "repo",
  key: ".",
  subtreeHash: asSubtreeHash("root"),
  children: [],
  objects: [],
}
// A minimal `Axes` — the `verifyCount` leg closes over `scipOutput` (via `createVerifyFactLeg`) and never reads
// `axes`, so an inert spatial root is enough to construct the admission supply.
const axes: Axes = { spatial: node, territory: node, dependency: node, edges: [] }

describe("#196c — buildMineAdmission wires the SOUND verifyCount leg (lower-bound, same oracle as verify-fact)", () => {
  const { deps } = buildMineAdmission(axes, scip)
  const verifyCount = deps.verifyCount
  if (verifyCount === undefined) throw new Error("the count admission leg must be wired")

  it("atLeast ≤ witnessed ⇒ proven (a sound lower bound)", () => {
    expect(verifyCount(HASH, "src", 1)).toBe("proven") // 1 ≤ 2 witnessed
    expect(verifyCount(HASH, "src", 2)).toBe("proven") // exactly the witnessed count
  })

  it("atLeast ABOVE the witnessed count ⇒ abstain (never a false proven — the whole point)", () => {
    expect(verifyCount(HASH, "src", 3)).toBe("abstain") // only 2 callers witnessed under src
  })

  it("a caller only counts UNDER the segment-wise scope — a narrower scope drops out-of-scope callers", () => {
    // pay is under src/pay but order is NOT ⇒ only 1 witnessed under src/pay ⇒ ≥2 abstains, ≥1 proves.
    expect(verifyCount(HASH, "src/pay", 1)).toBe("proven")
    expect(verifyCount(HASH, "src/pay", 2)).toBe("abstain")
  })

  it("an unresolvable / phantom target ⇒ abstain (no count is groundable about a symbol with no definition)", () => {
    expect(verifyCount("scip-ts npm fixture 1.0.0 `phantom`#", "src", 1)).toBe("abstain")
  })
})
