// @atlas/cli — test/wp-96-predicate-e2e.test.ts  (WP-96 · lucy Finding 1 — a MINED predicate, end to end)
//
// THE REACHABILITY PROOF the #96 exit predicate asks for each shape, mirroring `wp-96-r-relation-e2e.test.ts`
// but for the PREDICATE family: not "admitPredicate compiles" (that is pinned at admit-level by
// `mine-gate-shape-dispatch.test.ts`) but "an injected proposer emits a PredicateSeed → the mine driver stages
// a `family:'predicate'` row → it PROMOTES through the governed door → the read projection returns the node".
// Three legs, each the REAL production path:
//
//   1. MINE (stage)   — `runExtract` (the genesis S2 driver) drives an injected proposer emitting a PREDICATE
//                        seed; the gate is `makeAdmitGate` over the FROZEN `admit` (real admitPredicate:
//                        synthesize → HOLDS → teeth), so the predicate node is minted by the harness, never
//                        hand-built. The admitted fact feeds `decideStaging` → a `family:'predicate'` staging
//                        row whose `nodeKey` is the intrinsic key WITH the slot folded in and whose `claimNorm`
//                        is `normalizeCheck(check)`.
//   2. PROMOTE        — the SAME admitted predicate through `createGovernedEmit` (the leg `atlas promote`
//                        re-emits staged rows through) into a real on-disk store.
//   3. QUERY          — `rehydrateProjection(store).current.get(nodeKey)` (the exact projection every read leg
//                        rides) returns the promoted predicate node, family + claim intact.
//
// STAGING-ARM BUG THIS SUITE REVEALED (lucy F1, fixed in `admit-harness.ts` `buildPredicate`): the synthesized-
// check arm dropped `predicateSlot` off the emitted node, so `decideStaging` and the door BOTH minted a slot-
// FREE `nodeKey` — diverging from the true `hash(primaryAnchorId ‖ predicateSlot ‖ check)` identity and from the
// SOUND-oracle arm (`buildSound`, which carries the slot). The slot is now carried at source; the MINE leg pins
// that the staged key is slot-SENSITIVE (differs from the slot-free key).

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { asHash, asSubtreeHash, asNodeKey } from "@atlas/kernel"
import { emptyStore, nodeKey, normalizeCheck } from "@atlas/knowledge"
import type { Candidate as KnowledgeCandidate, Check } from "@atlas/knowledge"
import type { StructRef, Status } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import { admit, runExtract } from "@atlas/genesis"
import type { AdmitDeps, Candidate, Fact, PredicateProposal, SeedProposal, SiteProposer } from "@atlas/genesis"
import { createDiskStore, createGovernedEmit, rehydrateProjection } from "@atlas/adapter-io"
import type { TruthGate } from "@atlas/tools"
import { makeAdmitGate } from "../src/mine.js"
import { decideStaging } from "../src/mine-decide.js"
import { MINED_SCOPE } from "../src/mine-staging.js"

const SITE = "pkg/svc.ts::svc"
const site: StructRef = { kind: "symbol", qualifiedPath: SITE, subtreeHash: asSubtreeHash("st-svc") }
const cand: Candidate = {
  site,
  rank: 0,
  ppr: 1,
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
}
const indexNode: IndexNode = {
  axis: "dependency",
  level: "symbol",
  key: "svc",
  subtreeHash: asSubtreeHash("svc"),
  children: [],
  objects: [],
}
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budget = { ceiling: 10, deepening: { review: OFF, enrich: OFF, expand: OFF } }
const SLOT = "invariant" as const
const HELD: Check = { kind: "index-query", query: "exists|svc" }

/** An `AdmitDeps` whose synthesized-check path ADMITS: synthesize returns a check, verify HOLDS, teeth bite; the
 *  slot is NOT type-expressible so the predicate takes the synthesized-check arm (the one #96 emits). */
const admitAllDeps = (): AdmitDeps => ({
  predicate: { synthesize: () => HELD, verify: (): Status => "HOLDS", teeth: () => true },
  doors: { grounded: () => true, nonObvious: () => true },
  typeOracle: { expressible: () => false, diagnose: (): Status => "HOLDS" },
  refine: () => null,
  indexState: indexNode,
  K: 1,
})

/** A proposer that emits ONE predicate seed at the site and abstains elsewhere — the injected S2 model. */
const predicateProposer = (): SiteProposer => ({
  propose: (c: Candidate): SeedProposal | null =>
    c.site.qualifiedPath === SITE ? { kind: "predicate", cand: c, claim: "svc holds its invariant", slot: SLOT } : null,
})

const HOLDS: TruthGate = { gateHolds: () => "HOLDS" }
const AT = asHash("deadbeef")

let disposers: Array<() => void>
beforeEach(() => {
  disposers = []
})
afterEach(() => {
  for (const d of disposers) d()
  vi.restoreAllMocks()
})

describe("WP-96 — a MINED predicate stages, promotes, and is queryable end-to-end (lucy F1)", () => {
  it("MINE (stage) — driver → real admitPredicate → decideStaging stages a family:predicate row, slot folded into the key", () => {
    const gate = makeAdmitGate(admitAllDeps())
    const { facts } = runExtract([cand], budget, { proposer: predicateProposer(), gate })
    expect(facts).toHaveLength(1)
    const pf = facts[0]!
    expect((pf as { kind: string }).kind).toBe("predicate") // admitPredicate ADMITTED — not dropped, not advisory
    expect((pf as { predicateSlot?: string }).predicateSlot).toBe(SLOT) // buildPredicate carries the slot (lucy F1 fix)
    expect((pf as { check?: Check }).check).toEqual(HELD) // the SYNTHESIZED check the harness attested

    const dec = decideStaging(emptyStore(), facts, new Map())
    const row = [...dec.next!.current.values()][0]!
    expect(row.family).toBe("predicate")
    // the staged nodeKey is the intrinsic predicate key over the SCRUBBED-view WITH slot folded in…
    const view = {
      ...(pf as unknown as KnowledgeCandidate),
      scope: MINED_SCOPE,
      slot: SLOT,
    } as unknown as KnowledgeCandidate
    expect(row.nodeKey).toBe(nodeKey(view) as unknown as string)
    // …and it is SLOT-SENSITIVE: the slot-free key (the pre-fix behaviour) is a DIFFERENT address.
    const slotless = {
      ...(pf as unknown as KnowledgeCandidate),
      scope: MINED_SCOPE,
      slot: undefined,
    } as unknown as KnowledgeCandidate
    expect(row.nodeKey).not.toBe(nodeKey(slotless) as unknown as string)
    // the set-union claim body is the normalized check (mirrors the door's claimNormOf predicate leg).
    expect(row.claims).toEqual([normalizeCheck(HELD)])
    expect(row.slot).toBe(SLOT) // the row carries the slot for KNOW-4g read-side grouping
  })

  it("PROMOTE + QUERY — the admitted predicate through the governed door is queryable off the projection", () => {
    const admitted = admit(
      {
        kind: "predicate",
        site: cand,
        slot: SLOT,
        nodeKey: asNodeKey(SITE),
        claimNorm: "svc holds its invariant",
        grounding: { entries: [{ anchor: site, path: SITE }] },
        tier: "T2",
      } satisfies PredicateProposal,
      admitAllDeps(),
    )
    expect(admitted.outcome).toBe("admitted")
    if (admitted.outcome !== "admitted") throw new Error("unreachable")
    expect((admitted.fact as { predicateSlot?: string }).predicateSlot).toBe(SLOT)

    const root = mkdtempSync(join(tmpdir(), "atlas-96p-e2e-"))
    disposers.push(() => rmSync(root, { recursive: true, force: true }))
    const store = createDiskStore(join(root, "cas"))
    const door = createGovernedEmit({
      store,
      gate: HOLDS,
      policy: { t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["bob"] } } },
      actor: "bob",
      ratifyToken: "billy",
    })
    // PROMOTE: the same admitted predicate, scoped for authz (the promote path rehydrates the scope-stamped fact).
    const out = door.emit({ ...admitted.fact, scope: "core" } as Fact, AT)
    expect(out.emitted).toBe(true)

    // QUERY: the promoted predicate is on the projection every read leg rides, at its slot-folded identity.
    const proj = rehydrateProjection(store)
    const key = nodeKey({
      ...(admitted.fact as unknown as KnowledgeCandidate),
      scope: "core",
      slot: SLOT,
    } as unknown as KnowledgeCandidate) as unknown as string
    const node = proj.current.get(key)
    expect(node).toBeDefined()
    expect(node!.family).toBe("predicate")
    expect(node!.slot).toBe(SLOT)
    expect(node!.claims).toEqual([normalizeCheck(HELD)])
  })
})
