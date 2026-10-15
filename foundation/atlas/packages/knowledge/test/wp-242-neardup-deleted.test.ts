// @atlas/knowledge — test/wp-242-neardup-deleted.test.ts  (#242 — NearDupConfig deleted, not wired)
//
// CONFIRMED by reading the bodies (not inferred): `writeDecision` (router.ts) and `upsert` (upsert.ts) both
// used to accept a `cfg: NearDupConfig` third parameter — parsed and validated end-to-end from
// `.atlas/policy.json` (`packages/adapter-io/src/policy.ts`) — that neither function's BODY ever read.
// `routeWrite` routes on the four already-resolved `RouteInputs` booleans alone; no claimNorm-similarity
// threshold has ever entered the decision. `nearDupConfig()` (the policy-side projection) had ZERO callers.
//
// DECISION (#242, stated rather than hedged): DELETED end-to-end, not wired. Post-#197 the sound arm's
// `claimNorm` is harness-generated and deterministic, so a text-similarity τ over it would compare generated
// sentences to generated sentences — a different, probably useless question from the one this knob was
// invented to answer. An admin could set it, watch it validate, and it guarded nothing (#152/#186/#178's
// class of defect).
//
// TEETH: this suite is a REVERT DETECTOR. If `cfg`/`NearDupConfig` is reintroduced onto either signature
// (even unread), `writeDecision.length`/`upsert.length` — the function's own declared ARITY — changes from
// 2 to 3, and this suite goes red without needing to know anything about what the reintroduced param does.

import { describe, expect, it } from "vitest"
import { writeDecision, upsert, emptyStore, nodeKey } from "../src/write/router.js"
import type { Candidate, PredicateSlot } from "../src/types.js"
import type { StructRef } from "@atlas/contracts"
import { asSubtreeHash } from "@atlas/kernel"

function sym(qualifiedPath: string): StructRef {
  return { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash(`sh:${qualifiedPath}`) }
}

const candidate: Candidate = {
  claimText: "the claim body prose",
  claimNorm: "cn-242",
  slot: "invariant" as PredicateSlot,
  grounding: { entries: [{ anchor: sym("pkg/x.ts::x"), path: "p" }] },
  provenance: { source: "agent://forge", trusted: true },
  tier: "T2" as const,
}

describe("#242 — the near-dup config parameter is GONE, not silently unread", () => {
  it("writeDecision has ARITY 2 (candidate, store) — a reintroduced 3rd param flips this RED", () => {
    expect(writeDecision.length).toBe(2)
  })

  it("upsert has ARITY 2 (store, req) — a reintroduced 3rd param flips this RED", () => {
    expect(upsert.length).toBe(2)
  })

  it("writeDecision routes correctly called with EXACTLY 2 arguments (by use, not by signature alone)", () => {
    expect(writeDecision(candidate, emptyStore())).toBe("CREATE")
    // idempotent re-check: the same candidate against a store already carrying its nodeKey is UPDATE
    const seeded = upsert(emptyStore(), {
      nodeKey: nodeKey(candidate) as unknown as string,
      contentHash: "ch-seed",
      family: "advisory",
      claimNorm: "cn-seed",
    }).store
    expect(writeDecision(candidate, seeded)).toBe("UPDATE")
  })
})
