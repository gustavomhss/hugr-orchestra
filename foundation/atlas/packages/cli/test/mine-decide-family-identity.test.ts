// @atlas/cli — test/mine-decide-family-identity.test.ts  (WP-96-SEAM · bobby F1 — family-aware staging mint)
//
// THE LOAD-BEARING PROOF for the #96 seam. Before this WP, `decideStaging` minted identity GENERICALLY —
// `nodeKey(view)` + `primaryAnchorId(view)`, both assuming a single-anchor intrinsic node. A RELATION grounds
// over TWO distinct files, so `deepestCommonUnit` collapses to the empty wildcard and `primaryAnchorId` throws
// `DegenerateAnchorError` (router.ts) UNGUARDED inside `commitStaging` — crashing the whole mine pass. This
// suite pins that a relation (and a negation) now STAGES WITHOUT THROWING, minting its `relationKey` /
// `negationKey` rather than a collapsed intrinsic key, and that the advisory/predicate path is BYTE-IDENTICAL
// (its nodeKey is exactly `nodeKey(view)`, unchanged). The mint mirrors the governed door's
// `resolveWriteIdentity` (adapter-io/src/governed-emit-identity.ts:99-111) + the negation door
// (governed-emit-negation.ts:163) — this proves the STAGING half now agrees with them.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import { emptyStore, relationKey, negationKey, nodeKey, primaryAnchorId, DegenerateAnchorError } from "@atlas/knowledge"
import type { Candidate as KnowledgeCandidate, RelationNode, NegationNode } from "@atlas/knowledge"
import type { StructRef } from "@atlas/contracts"
import type { Fact } from "@atlas/genesis"
import { decideStaging } from "../src/mine-decide.js"
import { MINED_SCOPE } from "../src/mine-staging.js"
import { A, ZERO_SIGNALS, factFor } from "./mine-fixtures.js"

const cand: Candidate = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }
type Candidate = { site: StructRef; signals: typeof ZERO_SIGNALS; ppr: number; rank: number }

const ref = (path: string): StructRef => ({ kind: "symbol", qualifiedPath: path, subtreeHash: asSubtreeHash(path) })

// endpoints in TWO distinct files — the exact shape whose `deepestCommonUnit` is the empty wildcard.
const END_A = "pkg/a.ts::caller"
const END_B = "pkg/b.ts::callee"

/** A RELATION fact, grounding spanning two distinct files — the crash case, constructed directly (no proposer). */
const relationFact = (): Fact =>
  ({
    kind: "relation",
    id: asNodeKey("SHOULD-BE-REMINTED"), // trusted from NOBODY — the mint recomputes it
    tier: "T2",
    relationKind: "calls",
    endpointA: END_A,
    endpointB: END_B,
    grounding: {
      entries: [
        { anchor: ref(END_A), path: "pkg/a.ts" },
        { anchor: ref(END_B), path: "pkg/b.ts" },
      ],
    },
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
  }) satisfies RelationNode as unknown as Fact

/** A NEGATION fact — a scoped negative constructed directly. `scope` here is the identity/witness directory. */
const negationFact = (): Fact =>
  ({
    kind: "negation",
    id: asNodeKey("SHOULD-BE-REMINTED"),
    tier: "T2",
    relationKind: "calls",
    target: "pkg/x.ts::orphan",
    scope: "pkg/payments",
    grounding: {
      entries: [
        {
          anchor: { kind: "file", qualifiedPath: "pkg/payments", subtreeHash: asSubtreeHash("pkg/payments") },
          path: "pkg/payments",
        },
      ],
    },
    edgeModel: "v1",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  }) satisfies NegationNode as unknown as Fact

describe("decideStaging — family-aware identity mint (WP-96-SEAM · bobby F1)", () => {
  it("CRASH WITNESS — the OLD generic path (primaryAnchorId over a two-file grounding) DOES throw", () => {
    // The exact `view` the pass builds, run through the mint the fix replaced: it collapses to '' and throws.
    const view = { ...relationFact(), slot: undefined } as unknown as KnowledgeCandidate
    expect(() => primaryAnchorId(view)).toThrow(DegenerateAnchorError)
  })

  it("a RELATION fact STAGES WITHOUT THROWING and mints its relationKey (not a collapsed intrinsic key)", () => {
    let dec!: ReturnType<typeof decideStaging>
    expect(() => {
      dec = decideStaging(emptyStore(), [relationFact()], new Map())
    }).not.toThrow()
    const rows = [...dec.next!.current.values()]
    expect(rows.length).toBe(1)
    const row = rows[0]!
    expect(row.family).toBe("relation")
    expect(row.nodeKey).toBe(relationKey(END_A, "calls", END_B) as unknown as string) // §D2 mint, never nodeKey
    expect(row.primaryAnchor).toBe(END_A) // the directed relation binds on its SUBJECT endpoint
  })

  it("a NEGATION fact mints its negationKey over the PRESERVED witness scope — F3 authz/identity split (WP-96-N)", () => {
    let dec!: ReturnType<typeof decideStaging>
    expect(() => {
      dec = decideStaging(emptyStore(), [negationFact()], new Map())
    }).not.toThrow()
    const row = [...dec.next!.current.values()][0]!
    expect(row.family).toBe("negation")
    // F3: the witness `scope` ('pkg/payments') is PRESERVED as identity — NOT clobbered to MINED_SCOPE. The
    // mint reads the witness, so `negationKey`/`primaryAnchor` bind the real scope the negative ranges over.
    expect(row.nodeKey).toBe(negationKey("calls", "pkg/x.ts::orphan", "pkg/payments") as unknown as string)
    expect(row.primaryAnchor).toBe("pkg/payments")
    // and the ROW's governance scope is the witness too (matching the row the door produces at promote).
    expect(row.scope).toBe("pkg/payments")
    // MINED_SCOPE rides SEPARATELY as `authzScope` on the FACT BYTES promote rehydrates from CAS — the door's
    // authz gate binds `authzScope ?? scope`, so the orchestrator's `atlas:mined` grant authorizes it.
    const staged = [...dec.out.values()][0]! as unknown as { authzScope?: string; scope: string }
    expect(staged.authzScope).toBe(MINED_SCOPE)
    expect(staged.scope).toBe("pkg/payments") // witness identity preserved on the fact object too
  })

  it("REGRESSION — an ADVISORY row keeps its EXACT prior nodeKey (the intrinsic path is byte-identical)", () => {
    const advisory = factFor(cand, "greet returns a greeting")
    const dec = decideStaging(emptyStore(), [advisory], new Map())
    const row = [...dec.next!.current.values()][0]!
    // The view the pass builds for an intrinsic fact, and the key the UNCHANGED path mints from it.
    const view = { ...{ ...advisory, scope: MINED_SCOPE }, slot: undefined } as unknown as KnowledgeCandidate
    expect(row.nodeKey).toBe(nodeKey(view) as unknown as string)
    expect(row.primaryAnchor).toBe(primaryAnchorId(view) as unknown as string)
    // and it is NOT a relation/negation key — the intrinsic dispatch was taken.
    expect(row.family).toBe("advisory")
  })
})
