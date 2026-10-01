// @atlas/knowledge — test/upsert-raise-carry-forward.test.ts
//
// The ARCH-D3b claim-laundering fix (upsert.ts UPDATE branch) makes a GOVERNING tier-raise REPLACE the claim
// set, so a tokenless squat's claim cannot be laundered into the tier≥T1 band. That severance is scoped to
// `claims` ON PURPOSE. This file pins the DELIBERATE other half of the decision (flagged by the security +
// cold-review seats as worth an explicit test): on the same raise, `answerRef` and `sameAs` DO carry forward
// via `...prior`, and dropping either would be WRONG rather than safer.
//   · `answerRef` — opaque mine provenance, served by no read path as governing-band content; carries no
//     claim a raise could launder, and dropping it would lose a legitimate receipt.
//   · `sameAs` — established only by the SEPARATE `atlas-link` door (its own authz + ratifier over the whole
//     class); it is an EDGE, never a folded claim/tier, so it launders nothing. Severing it on an unrelated
//     emit-tier raise would silently SHRINK a governed equivalence class.

import { describe, it, expect } from "vitest"
import { emptyStore, upsert } from "../src/write/upsert.js"
import type { WriteRequest } from "../src/write/router.js"

const KEY = "nk-adv"

// A tokenless-style T2 CREATE carrying an answer receipt (the mine path stamps one).
const seedT2 = (answerRef: string): WriteRequest => ({
  nodeKey: KEY,
  contentHash: "ch-v0",
  family: "advisory",
  claimNorm: "weaker prior claim",
  tier: "T2",
  scope: "core",
  answerRef,
})

// A legitimate governing raise to T0 at the SAME node (a re-mine/human emit that omits a fresh receipt).
const raiseToT0 = (): WriteRequest => ({
  nodeKey: KEY,
  contentHash: "ch-v1",
  family: "advisory",
  claimNorm: "ratified T0 claim",
  tier: "T0",
  scope: "core",
})

describe("upsert — a governing tier-raise severs claims but carries answerRef + sameAs forward (by design)", () => {
  it("severs the prior claim (anti-laundering) yet preserves answerRef and a prior sameAs edge", () => {
    let s = emptyStore()
    s = upsert(s, seedT2("ref-mine-0")).store

    // Simulate a PRIOR governed `atlas-link` act: the node carries a sameAs equivalence edge. (sameAs is a
    // per-node field set by the link door, not a WriteRequest leg — seed it directly, as a prior link would,
    // through a fresh Map since `store.current` is a ReadonlyMap.)
    const withEdge = new Map(s.current)
    withEdge.set(KEY, { ...withEdge.get(KEY)!, sameAs: ["nk-peer"] })
    s = { ...s, current: withEdge }

    // The governing raise T2 → T0.
    s = upsert(s, raiseToT0()).store
    const row = s.current.get(KEY)!

    // Anti-laundering: the weaker prior claim is GONE; only the raiser's assertion survives.
    expect(row.claims).toEqual(["ratified T0 claim"])
    expect(row.claims).not.toContain("weaker prior claim")
    expect(row.tier).toBe("T0") // the raise really happened

    // Carry-forward BY DESIGN: neither of these is a laundering channel, and dropping them would be wrong.
    expect(row.answerRef).toBe("ref-mine-0") // opaque provenance, never served as governing-band content
    expect((row as { sameAs?: readonly string[] }).sameAs).toEqual(["nk-peer"]) // signed link edge, must not shrink
  })
})
