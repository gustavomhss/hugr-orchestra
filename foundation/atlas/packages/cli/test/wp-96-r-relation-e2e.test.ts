// @atlas/cli — test/wp-96-r-relation-e2e.test.ts  (WP-96-R · #96 — a MINED relation, end to end)
//
// THE REACHABILITY PROOF the DoD asks for: not "admitRelation compiles" but "an injected proposer emits a
// RelationSeed → the mine driver stages a relation → it PROMOTES → `relationsOf` returns it with the right
// direction and both endpoints resolving". Three legs, each the REAL production path:
//
//   1. MINE (stage)   — `runExtract` (the genesis S2 driver, GEN-2/4) drives an injected `SiteProposer` that
//                        emits a RELATION seed; the gate is `makeAdmitGate` over the FROZEN `admit` (real
//                        admitRelation, WP-96-R), so the fact is grounded+minted by the harness, never hand-
//                        built. The admitted facts feed `decideStaging` (the pure staging pass) → a staging
//                        `StoreProjection`. `relationsOf` over THAT projection already returns the edge — this
//                        is the READ half WP-96-SEAM flagged and this WP closed (the endpoint carriers +
//                        `claimNorm` triple now ride the staging WriteRequest).
//   2. PROMOTE        — the SAME admitted relation fact through `createGovernedEmit` (the exact leg
//                        `atlas promote` re-emits staged rows through — governed-promote.ts) into a real
//                        on-disk store.
//   3. QUERY          — `createRelationLeg(store)` / `relationsOf` off the PROMOTED projection returns the
//                        edge: `endpointA <relationKind> endpointB`, direction preserved, both endpoints
//                        resolving from either end.
//
// WHY IN-PROCESS, stated per the brief: the subprocess black-box (`atlas mine`) has NO seam to inject a
// relation-emitting proposer — the production proposer is the model adapter, and a relation seed would need a
// live model. The in-process chain drives the identical production functions (`runExtract` → `makeAdmitGate`
// → `admit` → `decideStaging`; `createGovernedEmit` → `createRelationLeg`) with a deterministic proposer, so
// every seam this WP touched is exercised for real. CONTRAST with the pre-fix stub is the last block.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import { emptyStore, relationKey, relationsOf } from "@atlas/knowledge"
import type { StructRef, Status } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import { admit, runExtract } from "@atlas/genesis"
import type {
  AdmitDeps,
  Candidate,
  GenesisBudget,
  Proposal,
  RelationProposal,
  SeedProposal,
  SiteProposer,
} from "@atlas/genesis"
import { createDiskStore, createGovernedEmit, createRelationLeg } from "@atlas/adapter-io"
import type { TruthGate } from "@atlas/tools"
import { makeAdmitGate } from "../src/mine.js"
import { decideStaging } from "../src/mine-decide.js"

// ── the relation under test: two units in DIFFERENT files (the cross-file pair `nodeKey` refuses) ───────────
const END_A = "src/payments/charge.ts::charge" // SUBJECT — `out` for A, `in` for B
const END_B = "src/orders/place.ts::place" //     OBJECT
const RELATION_KIND = "depends-on" as const

const site: StructRef = { kind: "symbol", qualifiedPath: END_A, subtreeHash: asSubtreeHash("st-a") }
const cand: Candidate = {
  site,
  rank: 0,
  ppr: 1,
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
}
const indexNode: IndexNode = {
  axis: "dependency",
  level: "symbol",
  key: "charge",
  subtreeHash: asSubtreeHash("charge"),
  children: [],
  objects: [],
}
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const budget: GenesisBudget = { ceiling: 10, deepening: { review: OFF, enrich: OFF, expand: OFF } }

/** An `AdmitDeps` whose truth door GROUNDS and whose obviousness predicate is deterministic. The relation
 *  path never touches the predicate check engine, so `synthesize` here is only a tripwire (asserted unused). */
const admitAllDeps = (grounded = true): AdmitDeps => ({
  predicate: {
    synthesize: () => {
      throw new Error("relation admission must not reach the predicate check engine")
    },
    verify: (): Status => "HOLDS",
    teeth: () => true,
  },
  doors: { grounded: () => grounded, nonObvious: () => true },
  typeOracle: { expressible: () => false, diagnose: (): Status => "HOLDS" },
  refine: () => null,
  indexState: indexNode,
  K: 1,
})

/** A proposer that emits ONE relation seed at the site and abstains elsewhere — the injected S2 model. */
const relationProposer = (): SiteProposer => ({
  propose: (c: Candidate): SeedProposal | null =>
    c.site.qualifiedPath === END_A
      ? {
          kind: "relation",
          cand: c,
          claim: "charge depends on place",
          relationKind: RELATION_KIND,
          endpointA: END_A,
          endpointB: END_B,
        }
      : null,
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

describe("WP-96-R — a MINED relation stages, promotes, and is queryable end-to-end", () => {
  it("MINE (stage) — driver → real admit → decideStaging → relationsOf returns the edge, direction preserved", () => {
    // (1) the S2 driver runs the injected proposer through the gate over the FROZEN admit (real admitRelation).
    const gate = makeAdmitGate(admitAllDeps()) // no reground — the hand-built one-identity-space branch
    const { facts } = runExtract([cand], budget, { proposer: relationProposer(), gate })
    expect(facts).toHaveLength(1)
    expect((facts[0] as { kind: string }).kind).toBe("relation") // admitRelation ADMITTED — not dropped, not advisory

    // (2) the admitted facts become the next staging snapshot — the pure mine pass.
    const dec = decideStaging(emptyStore(), facts, new Map())
    const next = dec.next!
    const rows = [...next.current.values()]
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // the staging row carries the D2 mint + the endpoint carriers + the canonical triple set-union element.
    expect(row.family).toBe("relation")
    expect(row.nodeKey).toBe(relationKey(END_A, RELATION_KIND, END_B) as unknown as string)
    expect(row.endpointA).toBe(END_A)
    expect(row.endpointB).toBe(END_B)
    expect(row.relationKind).toBe(RELATION_KIND)
    expect(row.claims).toEqual([`${END_A} ${RELATION_KIND} ${END_B}`]) // mirrors the governed door's claimNorm

    // (3) `relationsOf` over the staging projection returns the edge from BOTH ends, direction preserved.
    const outEdges = relationsOf(next, END_A, "out")
    expect(outEdges).toHaveLength(1)
    expect(outEdges[0]).toMatchObject({ relationKind: RELATION_KIND, endpointA: END_A, endpointB: END_B })
    const inEdges = relationsOf(next, END_B, "in")
    expect(inEdges).toHaveLength(1)
    expect(inEdges[0]!.endpointA).toBe(END_A) // A is the SUBJECT reached from B's object end
    // A has no `in` edge and B has no `out` edge — direction is meaningful, not symmetric.
    expect(relationsOf(next, END_A, "in")).toHaveLength(0)
    expect(relationsOf(next, END_B, "out")).toHaveLength(0)
  })

  it("PROMOTE + QUERY — the admitted relation through the governed emit door is queryable via relationsOf", () => {
    // The admitted fact, straight from the harness (mint recomputed by the door, never trusted).
    const admitted = admit(
      {
        kind: "relation",
        site: cand,
        relationKind: RELATION_KIND,
        endpointA: END_A,
        endpointB: END_B,
        grounding: { entries: [{ anchor: site, path: END_A }] },
        tier: "T2",
        scope: "core",
      } satisfies RelationProposal,
      admitAllDeps(),
    )
    expect(admitted.outcome).toBe("admitted")
    if (admitted.outcome !== "admitted") throw new Error("unreachable")

    // PROMOTE: the SAME leg `atlas promote` re-emits staged rows through (createGovernedEmit).
    const root = mkdtempSync(join(tmpdir(), "atlas-96r-e2e-"))
    disposers.push(() => rmSync(root, { recursive: true, force: true }))
    const store = createDiskStore(join(root, "cas"))
    const door = createGovernedEmit({
      store,
      gate: HOLDS,
      policy: { t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["bob"] } } },
      actor: "bob",
      ratifyToken: "billy",
    })
    const out = door.emit(admitted.fact, AT)
    expect(out.emitted).toBe(true)

    // QUERY: the promoted relation is returned by the read leg, both directions, endpoints resolving.
    const relations = createRelationLeg(store)
    const outEdges = relations(END_A, "out")
    expect(outEdges).toHaveLength(1)
    expect(outEdges[0]).toMatchObject({ relationKind: RELATION_KIND, endpointA: END_A, endpointB: END_B })
    expect(relations(END_B, "in")).toHaveLength(1)
    expect(relations(END_B, "in")[0]!.endpointA).toBe(END_A)
    expect(relations(END_A, "in")).toHaveLength(0) // direction preserved through the whole chain
  })

  it("CONTRAST — the truth door still GATES a relation: an ungrounded one is DROPPED (never staged)", () => {
    // Pre-WP the well-formed relation hit the `shape-not-yet-emitted` stub and dropped unconditionally. Now it
    // is admitted WHEN GROUNDED and dropped ONLY on an honest refusal — the truth door, not a stub.
    const gate = makeAdmitGate(admitAllDeps(false)) // truth door refuses
    const { facts, abstained } = runExtract([cand], budget, { proposer: relationProposer(), gate })
    expect(facts).toHaveLength(0) // nothing staged
    expect(abstained[0]!.reason).toContain("relation fails the truth door")

    // and a MALFORMED relation (self-relation) is refused at gate-0 with a distinct, honest reason.
    const selfRel = admit(
      {
        kind: "relation",
        site: cand,
        relationKind: RELATION_KIND,
        endpointA: END_A,
        endpointB: END_A,
        grounding: { entries: [{ anchor: site, path: END_A }] },
        tier: "T2",
      } satisfies RelationProposal,
      admitAllDeps(),
    )
    expect(selfRel.outcome).toBe("dropped")
    if (selfRel.outcome !== "dropped") throw new Error("unreachable")
    expect(selfRel.reason).toContain("malformed relation")
  })

  // compile-time: the relation proposal is a member of the admit `Proposal` union (exhaustive on `kind`).
  const _rel: RelationProposal["kind"] = "relation"
  void (_rel satisfies Proposal["kind"])
})
