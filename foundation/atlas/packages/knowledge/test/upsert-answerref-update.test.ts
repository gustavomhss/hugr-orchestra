// @atlas/knowledge — test/upsert-answerref-update.test.ts  (#195 b — the answer receipt on the UPDATE branch)
//
// The contract (docs/design/195-answer-provenance-contract.md §5) says answerProvenanceOf stamps the receipt
// in CREATE *and* UPDATE. The CREATE half is pinned by @atlas/cli's mine-answer-provenance test; the UPDATE
// half was UNPINNED — deleting `...answerProvenanceOf(req)` at upsert.ts (UPDATE branch) left the whole suite
// green (lucy, cold review of the provenance wave). This file kills that surviving mutant.
//
// The UPDATE branch is reachable on the shipped mine path: two mined facts at the SAME primaryAnchor‖slot in
// one pass route CREATE then UPDATE, so the second fact's re-mined answer receipt must WIN — else the row
// silently keeps the first answer's `answerRef` (a receipt pointing at the wrong bytes), unnoticed.

import { describe, it, expect } from "vitest"
import { emptyStore, upsert } from "../src/write/upsert.js"
import type { WriteRequest } from "../src/write/router.js"

const create = (answerRef?: string): WriteRequest => ({
  nodeKey: "nk-adv",
  contentHash: "ch-v0",
  family: "advisory",
  claimNorm: "cn-v0",
  ...(answerRef !== undefined ? { answerRef } : {}),
})
const update = (answerRef?: string): WriteRequest => ({
  nodeKey: "nk-adv", // SAME key ⇒ routes UPDATE (a re-mine of the same anchor·slot)
  contentHash: "ch-v1", // new bytes ⇒ not a DEDUP no-op
  family: "advisory",
  claimNorm: "cn-v1",
  ...(answerRef !== undefined ? { answerRef } : {}),
})

describe("upsert UPDATE branch — #195 b answer receipt re-states on re-mine", () => {
  it("a re-mine carrying a fresh answerRef REPLACES the prior receipt (kills the unpinned-stamp mutant)", () => {
    let s = emptyStore()
    s = upsert(s, create("ref-first")).store // CREATE stamps ref-first
    expect(s.current.get("nk-adv")!.answerRef).toBe("ref-first")

    s = upsert(s, update("ref-second")).store // UPDATE must re-state to ref-second, not keep ref-first
    const row = s.current.get("nk-adv")!
    expect(row.answerRef).toBe("ref-second") // ⚑ deleting answerProvenanceOf on UPDATE leaves this 'ref-first'
    expect(row.contentHash).toBe("ch-v1") // control: the UPDATE really happened
  })

  it("a re-mine that OMITS answerRef leaves the prior receipt intact (carry-forward, ADR-0009)", () => {
    let s = emptyStore()
    s = upsert(s, create("ref-first")).store
    s = upsert(s, update(undefined)).store // no receipt on the re-mine ⇒ `...prior` stands
    expect(s.current.get("nk-adv")!.answerRef).toBe("ref-first")
  })

  it("a CREATE with no receipt then an UPDATE WITH one stamps it (absent → present is not blocked)", () => {
    let s = emptyStore()
    s = upsert(s, create(undefined)).store
    expect(s.current.get("nk-adv")!.answerRef).toBeUndefined()
    s = upsert(s, update("ref-late")).store
    expect(s.current.get("nk-adv")!.answerRef).toBe("ref-late")
  })
})
