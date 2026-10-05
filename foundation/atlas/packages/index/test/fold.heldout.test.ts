// @atlas/index — test/fold.heldout.test.ts  (HELD-OUT GATE — 2.7-b drift arm)
//
// Cold-review held-out leg. The ONLY `-2` held-out fixtures that exist for the reqs owned by
// WP-2.7-a/2.7-b are the drift-oracle trio SCN-INDEX-5a-2 / 5b-2 / 5c-2 (goldens-idx.md:322-367).
// The structural reqs (2a-c, 12a-f) and the drift 12g-k are all `gen: PBT` with NO `-2` variant,
// so there is nothing held-out to transcribe for them. These three are authored INDEPENDENTLY of
// the builder's fold-drift.test.ts, against the EXISTING src/fold.ts, using the held-out fact `G`
// (anchor `bk-aa` ≠ current `bk-aax`) — never the visible fact `F`.

import { describe, it, expect } from "vitest"
import { createDriftFold } from "../src/fold.js"

describe("HELD-OUT — INDEX-5 drift oracle (-2 fixtures, fact G)", () => {
  it("SCN-INDEX-5a-2: G whose anchor bk-aa ≠ current bk-aax is visible + marked stale at query time", () => {
    const fold = createDriftFold([])
    const view = fold.queryStale("G", "bk-aa", "bk-aax") // byScope surfaces G, decided inline
    expect(view.value).toBe("G") // still VISIBLE
    expect(view.stale).toBe(true) // marked stale (anchor ≠ current)
    expect(view.anchor).not.toBe(view.current)
    // teeth: a matching anchor==current would be FRESH.
    expect(fold.queryStale("G", "bk-aa", "bk-aa").stale).toBe(false)
  })

  it("SCN-INDEX-5b-2: the drifted G is flagged/excluded from the FRESH set, never served clean", () => {
    const fold = createDriftFold([])
    const views = [
      fold.queryStale("G", "bk-aa", "bk-aax"), // drifted
      fold.queryStale("K", "bk-bb", "bk-bb"), // clean
    ]
    const fresh = views.filter((v) => !v.stale).map((v) => v.value)
    expect(views.find((v) => v.value === "G")!.stale).toBe(true)
    expect(fresh).not.toContain("G") // excluded from FRESH
    expect(fresh).toContain("K") // clean fact still served
  })

  it("SCN-INDEX-5c-2: drift over G decided by a subtreeHash comparison — 0 re-embedding, 0 sweep", () => {
    const fold = createDriftFold([])
    fold.queryStale("G", "bk-aa", "bk-aax")
    expect(fold.comparisons).toBeGreaterThan(0) // decided by a comparison
    expect(fold.reembedCount).toBe(0) // no re-embedding
    expect(fold.sweepCount).toBe(0) // no separate sweep
  })
})
