// @atlas/adapter-io — src/pack-shape.ts  (the ONE fact→PackInvariant shaping + the ONE Pack-mint bound)
//
// Both read projections — the scope readback (projection-query-index.ts) and the dependency/trigger retrieval
// feed (retrieval-model.ts) — map a `(CurrentNode, GroundedFact)` pair to a `PackInvariant` the SAME way:
// the identity + claim come from the trusted projection `CurrentNode` (recomputed nodeKey + the set-union
// claim set), the tier from the CAS `GroundedFact`. Extracted so the two doors can never drift.
//
// They drifted anyway — on the half this module did NOT own. Shaping was shared; BOUNDING was not. The
// scope path's invariants are bounded downstream where `@atlas/tools` createQuery mints the `Pack`
// (`tier≥T1`, TOOLS-6), but `retrievalPack` mints its OWN `Pack` in this package and never applied that
// bound, so `--by dependency|trigger` served every tier — an ordinary auto-accepted `T2` served on the
// governing line form, and an off-lattice `T3` out of a committed `.atlas/` projection, which no write door
// ever saw.
//
// So the bound is placed HERE, at the MINT, not at each call site: `mintPack` is the only function in this
// package that assembles a `Pack`, and it bounds unconditionally. A future fourth retrieval mode gets the
// bound by construction — it cannot produce a pack without calling this.
//
// [AMENDED — ADR-0013, owner-ratified 2026-08-03] The bound is now a two-band SPLIT rather than a filter: a
// `T2` row is served in the ADVISORY band (separately capped, separately rendered, never on the governing
// line form) instead of being dropped. What did NOT change is the part the paragraph above was about —
// an off-lattice `T3` is still served on NEITHER band, because both predicates are stated as MEMBERSHIP.
// The split is IMPORTED from `@atlas/tools` (`splitBands`), so unlike `atLeastT1` below it exists once.
//
// `atLeastT1` remains duplicated between this file and `@atlas/tools` src/bands.ts. Its comment blames the
// layer DAG, and that reason does not hold — the DAG forbids `tools → adapter-io`, while the sharing this
// file needs runs the OTHER way (`adapter-io → tools`), which is exactly the edge the `splitBands` import
// above uses. The duplicate is left in place because both copies are pinned by tests and de-duplicating a
// live governance predicate is not this WP's change; it is recorded here rather than quietly inherited.

import { isTier } from "@atlas/knowledge"
import type { Freshness, Hash, NodeKey, Pack, PackInvariant } from "@atlas/contracts"
import type { CurrentNode, GroundedFact } from "@atlas/knowledge"
// The ADVISORY band is imported, NOT re-stated. `atLeastT1` below is the surviving second copy of the
// governing predicate and its comment explains why it was written twice; the advisory band gets exactly one
// definition from birth (`@atlas/tools` src/bands.ts) precisely so it can never repeat that history. The
// edge is legal: the layer DAG allows `adapter-io → tools` (this package already imports `createHandler`)
// and forbids only `tools → adapter-io`.
import { splitBands } from "@atlas/tools"

/**
 * The PER-FACT freshness oracle a pack producer must supply — the GROUND-1 verdict for one stored fact.
 *
 * It is a SEAM, not an import of `driftDetect` here, for one reason: `driftDetect(grounding, axes)` needs
 * the built index `Axes`, which the composition root builds ONCE per process and this leaf module has no
 * business acquiring. The composition root binds the seam to the real oracle over the axes it already has
 * (`wire.ts`), so the read path re-uses the very function the WRITE door's truth-gate runs (`compose.ts`
 * `buildGate`) rather than a second freshness notion.
 *
 * It returns the CANONICAL `Freshness` — the exact type `driftDetect` declares — so a producer that ever
 * has a `STALE` (GROUND-13 advisory drift) verdict carries it through instead of collapsing it.
 */
export type FreshnessOracle = (fact: GroundedFact) => Freshness

/**
 * Resolve one row's freshness through an oracle that MAY be absent, FAIL-CLOSED.
 *
 * The oracle is optional at the seam because the bare WIRE assembly (`wire.ts` with no composition-root
 * `axes` — the fake-driven tests) genuinely cannot build one. When it is absent the row reads `DRIFTED`,
 * which is the same choice `driftDetect` itself makes for every anchor it cannot verify (GROUND-3: an
 * unresolvable citation is DRIFTED, never a throw and never `FRESH`).
 *
 * It deliberately does NOT fall back to the stored `fact.freshness`. That field is written once at authoring
 * and never written back on a read path, so on the real mined graph it reads `FRESH` for 199/199 rows
 * regardless of the tree — a fallback onto it would report unverified rows as verified, which is the exact
 * false-PASS class this WP exists to close. Refusing to answer is honest; answering `FRESH` is not.
 *
 * IT ALSO CATCHES, and that is not belt-and-braces — it is a MEASURED requirement. `driftDetect` documents
 * itself pure + total, and it is total over every `Grounding`; it is NOT total over a fact that has no
 * `grounding` field at all (`isGrounded` reads `g.entries.length` and raises a `TypeError`). Such a fact is
 * reachable on this exact path: `.atlas/` is a COMMITTED artifact, so a repository can ship a CAS blob that
 * passed no write door, and the content re-hash on read confirms the bytes rather than their shape. Without
 * the catch, `atlas query --by dependency` over such a store returned a REJECTED verdict instead of a pack —
 * found by `retrieval-tier-bound.test.ts` and `wire-retrieval-freshness.test.ts`, whose fixtures carry
 * exactly that shape. A read door that throws on data it is asked to READ is a denial of service, so the
 * throw becomes the same fail-closed `DRIFTED` an unresolvable anchor already produces (GROUND-3).
 */
export function resolveFreshness(oracle: FreshnessOracle | undefined, fact: GroundedFact): Freshness {
  if (oracle === undefined) return "DRIFTED"
  try {
    return oracle(fact)
  } catch {
    return "DRIFTED" // fail-closed: a fact this oracle cannot judge is never reported as verified
  }
}

/** Shape one current node + its CAS fact into a structured `PackInvariant`: `nodeId` = the trusted (recomputed)
 *  projection `nodeKey`, `tier` = the fact's tier, `claim` = the node's set-union claim set joined, and
 *  `freshness` = the verdict the CALLER resolved for this fact.
 *
 *  `freshness` is a required PARAMETER rather than a field read off `fact.freshness`, and the difference is
 *  the whole point of this WP. `GroundedFact.freshness` is the value stored AT WRITE TIME; nothing on the
 *  live read path writes it back (`atlas reconcile` "persists nothing", INV-TOOLS-8), so on the real mined
 *  graph 199/199 rows read `FRESH` no matter what the tree did. A row shaped from that field would carry a
 *  freshness field that is structurally incapable of ever saying `DRIFTED`. */
export function factToInvariant(node: CurrentNode, fact: GroundedFact, freshness: Freshness): PackInvariant {
  return { nodeId: node.nodeKey as NodeKey, tier: fact.tier, claim: node.claims.join("; "), freshness }
}

/**
 * The pack bound (TOOLS-6): a pack carries `tier≥T1` (T0 or T1) only; `T2` and every off-lattice value are
 * bounded OUT. Stated as MEMBERSHIP — `isTier(t) && t !== 'T2'` — NEVER as the bare `t !== 'T2'`.
 *
 * The negative form is how this survived twice: it admits every value that is not the literal string `'T2'`,
 * including every value that is not a governance class at all, so a row carrying `tier:'T3'` was served as
 * though it were ratified `T1`-or-stricter. That is reachable with no write door at all — `.atlas/` is a
 * COMMITTED artifact, so a repository can ship a projection plus a CAS blob that never passed a gate, and
 * the content re-hash on read confirms the BYTES, not their governance. An unrecognized class is not `≥T1`;
 * it is not a class, and it is bounded out. Byte-exact via the ONE lattice guard (`isTier`), never a local
 * string comparison.
 */
export const atLeastT1 = (inv: PackInvariant): boolean => isTier(inv.tier) && inv.tier !== "T2"

/** The pack envelope fields the caller owns — everything about a `Pack` that is NOT its invariant set. */
export interface PackFrame {
  readonly territory: string
  readonly axisHash: Hash
  /** `true` MUST mean re-ground before trusting (TOOLS-6c) — never silently downgraded here. */
  readonly stale: boolean
}

/**
 * Mint a `Pack` from `(CurrentNode, GroundedFact)` pairs — THE single Pack-assembly seam in this package.
 * Shapes each pair through `factToInvariant` (resolving each row's freshness through the injected
 * `freshness` oracle), sorts by `nodeId` (deterministic: equal queries are byte-identical), then SPLITS the
 * sorted list into the two bands through the shared `splitBands` (@atlas/tools) — the same function
 * `createQuery` applies on the scope path, so the two shipped read paths cannot bound differently.
 *
 * SORT BEFORE SPLIT, deliberately: the advisory cap truncates in list order, so sorting afterwards would
 * make WHICH rows survive the cap depend on nothing the caller can see. Pure + total.
 */
export function mintPack(
  frame: PackFrame,
  pairs: Iterable<readonly [CurrentNode, GroundedFact]>,
  freshness: FreshnessOracle,
): Pack {
  const rows: PackInvariant[] = []
  // Through `resolveFreshness`, never a bare `freshness(fact)`: that is the one TOTAL entry point, and a
  // read door that throws on a fact it was asked to read is a denial of service (see above).
  for (const [node, fact] of pairs) rows.push(factToInvariant(node, fact, resolveFreshness(freshness, fact)))
  rows.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))
  const bands = splitBands(rows) // TOOLS-6 + ADR-0013 — applied at the MINT, so no mode can forget it
  return {
    territory: frame.territory,
    axisHash: frame.axisHash,
    invariants: bands.governing,
    advisory: bands.advisory,
    advisoryDropped: bands.advisoryDropped,
    tokenEstimate:
      bands.governing.reduce((s, i) => s + i.claim.length, 0) + bands.advisory.reduce((s, i) => s + i.claim.length, 0),
    stale: frame.stale,
  }
}
