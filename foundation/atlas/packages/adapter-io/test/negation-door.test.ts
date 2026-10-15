// @atlas/adapter-io — test/negation-door.test.ts  (ADR-0015 D3 / #99b N2 — THE ABSTENTION DOOR, the honesty core)
//
// THE CRUX of #99b, proven at the COMPOSED door (real DiskStore, real gates) over the N0 completeness feed:
// a closed-world negative is SOUND ONLY IF the negated relation was computed COMPLETELY over its scope. This
// suite gives the crux TEETH — a scope OPEN over an unresolved reference ABSTAINS (durable AbstainedRecord),
// a real caller in scope REJECTS the false negative, and only the closed-empty case ADMITS a grounded
// negation. The soundness mutation (billy's trap — testing `reverseCallers==[]` instead of `holeSources∩S`)
// is killed by the OPEN-scope-with-no-callers case, which the sound door abstains and the naive one would
// admit as a lie.
//
// The N0 feed + the structural axes are FAKES here (the door reads them through injected deps), wired so the
// "hash" of a path IS the path (`nodeHashOfPath = identity`): a caller/hole is named by its file path, and
// `∩ S` is the SAME `underScope` predicate the read projection uses. This isolates the door's abstention
// LOGIC from `@atlas/index`'s build (N0 has its own unit tests) — the composed integration is N4's story.

import { describe, it, expect, afterEach } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import { negationKey, negationsOf } from "@atlas/knowledge"
import type { GroundedFact, NegationNode, RelationKind } from "@atlas/knowledge"
import type { Axes, Axis, IndexNode, SymbolReverseApi } from "@atlas/index"
import type { Hash, Tier } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import { REJECTED_MALFORMED_NEGATION, REJECTED_NEGATION_REFUTED } from "../src/governed-emit-negation.js"
import { HOLDS, freshWorkspace, policyOf, reasonOf } from "./door-regression-support.js"
import { rehydrateProjection, createDiskStore } from "../src/store.js"
import type { Workspace } from "./door-regression-support.js"

const S = "src/pay" // the closed scope directory the negatives range over
const TARGET = "scip:X#" // a GLOBAL SCIP symbol (NOT `local ` — the honest, groundable case)
const KIND: RelationKind = "calls"
const EDGE_MODEL = "ts@0.4.0,py@0.6.6"

// nodeHashOfPath = IDENTITY: the docHash of a path IS the path, so a fake feed names callers/holes by path and
// `∩ S` reduces to `underScope(path, S)` — the SAME predicate the read side scopes on.
const nodeHashOfPath = (p: string): Hash => p as unknown as Hash

/** A spatial IndexNode (a real folded hash `sh-<key>`, never the `subtreeHash===key` absent-sentinel). */
const inode = (key: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial" as Axis,
  level: "file",
  key,
  subtreeHash: asSubtreeHash("sh-" + key),
  children,
  objects: [],
})

/** Fake axes whose spatial tree carries the scope directory `src/pay` and two files under it — so
 *  `resolveCurrent(axes, 'src/pay')` returns a real hash and the two file paths map into scope. */
function axesWithScope(): Axes {
  const spatial = inode(".", [inode(S, [inode("src/pay/a.ts"), inode("src/pay/b.ts")]), inode("src/other.ts")])
  const empty = inode(".")
  return { spatial, territory: empty, dependency: empty, edges: [] }
}

/** A fake N0 feed: `reverseCallers(target)` and `holeSources()` name paths (identity-hashed). */
function feed(callers: readonly string[], holes: readonly string[]): SymbolReverseApi {
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => holes as unknown as readonly Hash[],
    opaqueRefSources: () => [],
    resolves: (sym: string) => sym === TARGET, // #220 — TARGET is the in-index-defined symbol under test
    definesAt: (sym: string) => (sym === TARGET ? ("src/x.ts" as unknown as Hash) : undefined), // #196d — unused by the negation door; a def-site for the resolvable target
  }
}

/** A raw negation payload as it arrives at the door (grounding/edgeModel/id are CONSTRUCTED at admit). */
function negation(opts: { target?: string; scope?: string; kind?: RelationKind; tier?: Tier } = {}): NegationNode {
  return {
    kind: "negation",
    id: "ignored" as unknown as NegationNode["id"],
    tier: opts.tier ?? "T2",
    relationKind: opts.kind ?? KIND,
    target: opts.target ?? TARGET,
    scope: opts.scope ?? S,
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  } as unknown as NegationNode
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** A door over a real disk store, actor owning `src/pay`, with a configurable N0 feed. */
function negDoor(callers: readonly string[], holes: readonly string[], opts: { actor?: string } = {}) {
  ws ??= freshWorkspace()
  return createGovernedEmit({
    store: ws.store,
    gate: HOLDS,
    policy: policyOf({ [S]: ["bob"] }),
    actor: opts.actor ?? "bob",
    ratifyToken: "billy",
    symbolReverse: () => feed(callers, holes),
    axes: axesWithScope(),
    nodeHashOfPath,
    edgeModel: EDGE_MODEL,
  })
}

const KEY = String(negationKey(KIND, TARGET, S))
const abstainedOf = (w: Workspace) => rehydrateProjection(w.store).abstained?.get(KEY)
const currentOf = (w: Workspace) => rehydrateProjection(w.store).current.get(KEY)

describe("#99b N2 — the abstention door (the honesty core)", () => {
  it("THE CRUX: a scope OPEN over an unresolved reference ABSTAINS — durable AbstainedRecord, witness populated", () => {
    // `src/pay/a.ts` is a HOLE in S (an unresolved/dynamic reference the index cannot see).
    const out = negDoor([], ["src/pay/a.ts"]).emit(negation(), NaN as unknown as Hash)
    expect(out.emitted).toBe(false) // NOT admitted — the negative cannot be proven closed

    // The record is DURABLE and READABLE (not a silent fail-closed drop — closes #202), keyed by negationKey.
    const rec = abstainedOf(ws!)
    expect(rec).toBeDefined()
    expect(rec!.reason).toBe("scope-open")
    expect(rec!.witness.underApproxSources).toEqual(["src/pay/a.ts"]) // the offending docHashes ∩ S
    // and NOTHING was admitted into `current`.
    expect(currentOf(ws!)).toBeUndefined()
  })

  it(
    "SOUNDNESS (billy trap): an OPEN scope with NO callers of the target still ABSTAINS — a naive " +
      "`reverseCallers==[]` admit would ship the exact false negative §0 forbids",
    () => {
      // reverseCallers(target) == [] (no caller found) AND the scope is OPEN (a hole in S). The SOUND door reads
      // the hole and abstains. The naive mutant — testing `reverseCallers(target).length === 0` as the ADMIT
      // condition instead of `holeSources() ∩ S ≠ ∅` — would ADMIT here, minting a grounded LIE. This assertion
      // (emitted:false ∧ scope-open) is what KILLS that mutant.
      const out = negDoor([], ["src/pay/b.ts"]).emit(negation(), NaN as unknown as Hash)
      expect(out.emitted).toBe(false)
      expect(abstainedOf(ws!)!.reason).toBe("scope-open")
      expect(currentOf(ws!)).toBeUndefined() // the naive mutant would have a `current` row here
    },
  )

  it("a REAL caller in scope REJECTS the negative (it is FALSE) — a decision, NOT an abstention, no record", () => {
    const out = negDoor(["src/pay/b.ts"], []).emit(negation(), NaN as unknown as Hash)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe(reasonOf(REJECTED_NEGATION_REFUTED))
    // A refutation is not an abstention: no durable AbstainedRecord is written.
    expect(abstainedOf(ws!)).toBeUndefined()
    expect(currentOf(ws!)).toBeUndefined()
  })

  it("a caller OUTSIDE S does not refute — the negative over S still ADMITS (∩ S is segment-wise underScope)", () => {
    // `src/other.ts` calls the target, but it is NOT under `src/pay`, so it is not a witness against the
    // scoped negative. `sr` would NOT cover `src/pay` either — the containment is the shared `underScope`.
    const out = negDoor(["src/other.ts"], []).emit(negation(), NaN as unknown as Hash)
    expect(out.emitted).toBe(true)
  })

  it("the CLOSED-EMPTY case ADMITS a grounded negation — directory anchor with a real folded subtreeHash", () => {
    const out = negDoor([], []).emit(negation(), NaN as unknown as Hash)
    expect(out.emitted).toBe(true)

    const row = currentOf(ws!)
    expect(row?.family).toBe("negation")
    // Read the WHOLE fact back from CAS (the CAS bytes ARE the fact) — its §3 grounding + edgeModel.
    const fact = ws!.store.get(out.emitted ? (out.id as Hash) : ("" as Hash)) as unknown as NegationNode
    expect(fact.grounding.entries).toHaveLength(1)
    const anchor = fact.grounding.entries[0]!.anchor
    expect(anchor.kind).toBe("directory")
    expect(anchor.qualifiedPath).toBe(S)
    expect(String(anchor.subtreeHash)).toBe("sh-" + S) // the scope directory's CURRENT folded Merkle
    expect(fact.grounding.entries[0]!.path).toBe(S)
    expect(fact.edgeModel).toBe(EDGE_MODEL) // stamped from the extractor release
    expect(fact.id).toBe(KEY) // MINTED = negationKey, never trusted from the payload
  })

  it(
    "#220 THE TEETH: a PHANTOM target (global, no in-index definition) ABSTAINS target-unresolvable — a " +
      "closed-empty admit would ground a VACUOUS negative about a symbol Atlas cannot see",
    () => {
      // `scip:PHANTOM#` is a well-formed GLOBAL symbol, but it is NOT the defined `TARGET`, so the feed's
      // `resolves` is false and `reverseCallers` is [] BY CONSTRUCTION — the same [] a genuinely-uncalled real
      // symbol has. Scope is closed-empty (no callers, no holes, S resolves), so gates (a)/(b)/(c) all pass and
      // the pre-#220 door reached the CLOSED-EMPTY ADMIT (d), minting "PHANTOM is not called in src/pay" — a
      // negative about a phantom. The sound door abstains. MUTANT (drop the `resolves(target)` gate): this ADMITS.
      const PHANTOM = "scip:PHANTOM#"
      const out = negDoor([], []).emit(negation({ target: PHANTOM }), NaN as unknown as Hash)
      expect(out.emitted).toBe(false) // NOT admitted — the negative is not provably MEANINGFUL
      const rec = rehydrateProjection(ws!.store).abstained?.get(String(negationKey(KIND, PHANTOM, S)))
      expect(rec).toBeDefined() // durable + readable, not a silent drop
      expect(rec!.reason).toBe("target-unresolvable")
      // and NOTHING was admitted at the phantom's address.
      expect(rehydrateProjection(ws!.store).current.get(String(negationKey(KIND, PHANTOM, S)))).toBeUndefined()
    },
  )

  it(
    "#220 CONTRAST: the SAME closed-empty scope ADMITS when the target RESOLVES — the gate discriminates " +
      "phantom from genuinely-uncalled, it does not blanket-abstain",
    () => {
      // Identical scope/holes/callers as the phantom case above; only the target differs (TARGET resolves). Proves
      // the #220 gate is not a sledgehammer that kills every closed-empty admit — it fires ONLY on non-resolving
      // targets. (Belt-and-braces alongside the pre-existing closed-empty ADMIT test, keyed explicitly to #220.)
      const out = negDoor([], []).emit(negation({ target: TARGET }), NaN as unknown as Hash)
      expect(out.emitted).toBe(true)
      expect(currentOf(ws!)?.family).toBe("negation")
    },
  )

  it("INTEGRATION (lucy P0): a door-admitted negation SURFACES through `negationsOf` — the read fold sees the row", () => {
    // The seam this asserts: the door must stamp the `endpointB`/`relationKind` identity CARRIERS onto the
    // projection row, because `negationsOf` reads target off `endpointB` and kind off `relationKind` and SKIPS a
    // row missing either. Before the fix the door left them absent, so every door-emitted negation was dropped by
    // the read and `atlas negations` showed 0 — green in isolation (fold tests hand-stamped the carriers), dead
    // end-to-end. This test emits through the REAL door then reads the REAL rehydrated projection.
    const admitted = negDoor([], []).emit(negation(), NaN as unknown as Hash)
    expect(admitted.emitted).toBe(true)
    const found = negationsOf(rehydrateProjection(ws!.store), "src")
    expect(found).toHaveLength(1) // the admitted negation is VISIBLE (0 before the endpointB/relationKind fix)
    expect(found[0]).toMatchObject({ target: TARGET, relationKind: KIND, scope: S })
  })

  it("an EMPTY-STRING target is REFUSED malformed (nit N1 — the target.length guard has teeth)", () => {
    const out = negDoor([], []).emit(negation({ target: "" }), NaN as unknown as Hash)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe(reasonOf(REJECTED_MALFORMED_NEGATION))
  })

  it("a `local ` (document-scoped) target ABSTAINS target-not-global — its callers are intra-doc, out of v1", () => {
    const out = negDoor([], []).emit(negation({ target: "local 4" }), NaN as unknown as Hash)
    expect(out.emitted).toBe(false)
    const rec = rehydrateProjection(ws!.store).abstained?.get(String(negationKey(KIND, "local 4", S)))
    expect(rec?.reason).toBe("target-not-global")
  })

  it("a scope that does not resolve on the spatial rail ABSTAINS scope-empty (it cannot be grounded)", () => {
    const out = negDoor([], []).emit(negation({ scope: "no/such/dir" }), NaN as unknown as Hash)
    expect(out.emitted).toBe(false)
    const rec = rehydrateProjection(ws!.store).abstained?.get(String(negationKey(KIND, TARGET, "no/such/dir")))
    expect(rec?.reason).toBe("scope-empty")
  })

  it("a malformed relationKind is REJECTED fail-closed (no address to abstain at)", () => {
    const out = negDoor([], []).emit(
      negation({ kind: "implements" as unknown as RelationKind }),
      NaN as unknown as Hash,
    )
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe(reasonOf(REJECTED_MALFORMED_NEGATION))
  })

  it("the governance gates STILL apply — an actor not in the negation scope is denied", () => {
    const out = negDoor([], [], { actor: "mallory" }).emit(negation(), NaN as unknown as Hash)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("unauthorized")
  })

  it("the ADMITTED negation SUPERSEDES a prior abstention at the same negationKey (the §2 lifecycle)", () => {
    // First: an open scope abstains. Then: the hole is closed and the same question re-emits ⇒ ADMIT, and the
    // abstention at that address is DELETED as the fact lands ("couldn't decide" → "decided false").
    const openDoor = negDoor([], ["src/pay/a.ts"])
    expect(openDoor.emit(negation(), NaN as unknown as Hash).emitted).toBe(false)
    expect(abstainedOf(ws!)).toBeDefined()

    const closedDoor = negDoor([], []) // reuses the SAME workspace (ws is memoized)
    expect(closedDoor.emit(negation(), NaN as unknown as Hash).emitted).toBe(true)
    expect(abstainedOf(ws!)).toBeUndefined() // the abstention was superseded
    expect(currentOf(ws!)?.family).toBe("negation")
  })

  it("an abstention SURVIVES a store restart — round-trips through the sidecar persist/rehydrate (closes #202)", () => {
    const w = freshWorkspace()
    ws = w
    createGovernedEmit({
      store: w.store,
      gate: HOLDS,
      policy: policyOf({ [S]: ["bob"] }),
      actor: "bob",
      ratifyToken: "billy",
      symbolReverse: () => feed([], ["src/pay/a.ts"]),
      axes: axesWithScope(),
      nodeHashOfPath,
      edgeModel: EDGE_MODEL,
    }).emit(negation(), NaN as unknown as Hash)

    // A FRESH store instance over the same on-disk CAS — the abstention must rehydrate from the sidecar bytes.
    const reloaded = rehydrateProjection(createDiskStore(w.casPath)).abstained?.get(KEY)
    expect(reloaded).toBeDefined()
    expect(reloaded!.reason).toBe("scope-open")
    expect(reloaded!.witness.underApproxSources).toEqual(["src/pay/a.ts"])
  })
})
