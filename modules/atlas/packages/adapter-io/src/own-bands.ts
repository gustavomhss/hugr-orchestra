// @atlas/adapter-io — src/own-bands.ts  (the FACT SECTIONS of an `own_<scope>` briefing — the two bands)
//
// Split out of `own-source.ts` by ROLE: that module answers the eight `OwnSources` questions, and three of
// them — `invariants`, `advisory`, `gotchas` — are the ones that decide WHICH STORED FACTS a briefing may
// show. That is a governance decision and it now has one home, next to the predicates it applies.
//
// ── THE DEFECT THIS MODULE EXISTS TO CLOSE, MEASURED ─────────────────────────────────────────────────────
// `own-source.ts` applied `atLeastT1` (TOOLS-6) to BOTH fact sections, so `own` served only `tier≥T1`. On
// this repository's own mined store — 199 facts at `.atlas/`, measured through the built binary — that is
// 199/199 rows refused: every mined fact is `T2`. `atlas own packages/adapter-io/src/policy.ts` answered
// `0 invariant(s), 0 gotcha(s)` while `atlas query` on the SAME path, from the SAME store, served the row.
// Two read doors over one store disagreed about what the store contains.
//
// The bound's stated justification had expired. It read: "the alternative is a read door that serves a `T2`
// … that `atlas query` is correctly declining to show. A second read door with a laxer bound is a route
// around the first one." ADR-0013 (owner-ratified 2026-08-03) made `query` serve `T2` in a separately
// capped ADVISORY band, so `query` declines nothing of the sort any more; the sentence described a
// behaviour that had been deleted. `REQ-TOOLS-6f` as landed says "The `atlas-query` pack shall…" — the
// amendment was scoped to one door and never reached this one. `REQ-RETR-12m` extends it here.
//
// ── WHAT DID NOT CHANGE ──────────────────────────────────────────────────────────────────────────────────
// The GOVERNING band. `invariants` and `gotchas` still apply `atLeastT1`, still in the membership form
// (`isTier(t) && t !== 'T2'`, never the bare `t !== 'T2'`), so an off-lattice `T3` out of a committed
// projection is still served on NEITHER band — `isAdvisory` is `isTier(t) && t === 'T2'` and the two
// predicates are deliberately not complements. A scope with only `T1`-or-stricter facts gets byte-identical
// output to what it got before. Both predicates are IMPORTED from `@atlas/tools` src/bands.ts, the one
// place they are stated; the layer DAG allows `adapter-io → tools` and forbids only the reverse.

import { atLeastT1, isAdvisory } from "@atlas/tools"
import type { SizedGotcha, SizedInvariant } from "@atlas/retrieval"
import type { CurrentNode, GroundedFact, PredicateSlot } from "@atlas/knowledge"
import type { Freshness } from "@atlas/contracts"
import { factToInvariant } from "./pack-shape.js"

/** One fact as the projection + CAS see it: the trusted `CurrentNode` and the whole fact behind it. */
export interface Row {
  readonly node: CurrentNode
  readonly fact: GroundedFact
}

/** The per-fact GROUND-1 verdict for one stored fact — the caller's already-bound oracle, never a second one. */
export type RowFreshness = (fact: GroundedFact) => Freshness

/** The two slots the reference calls "the non-obvious ones" (atlas-retrieval:28) — routed to `gotchas`
 *  rather than `invariants` so the briefing's two sections mean different things. */
const GOTCHA_SLOTS = new Set<PredicateSlot>(["gotcha", "rationale"])

/** The slot a row lives at — the projection's carrier first (it is the trusted, recomputed copy), the fact's
 *  own optional field as the fallback for a row minted before the carrier existed. */
function slotOf(row: Row): PredicateSlot | undefined {
  // A RelationNode (ADR-0015 D2) and a NegationNode (ADR-0015 D3) carry no `predicateSlot`; narrow it away
  // (neither is a slotted fact).
  const factSlot = row.fact.kind === "advisory" || row.fact.kind === "predicate" ? row.fact.predicateSlot : undefined
  return row.node.slot ?? factSlot
}

/** Is this row one of the "non-obvious" slots the briefing keeps in its own section? */
const isGotchaSlot = (row: Row): boolean => GOTCHA_SLOTS.has(slotOf(row) as PredicateSlot)

/**
 * The GOVERNING invariants: `tier≥T1`, not in a gotcha/rationale slot. Unchanged by the amendment — same
 * predicate, same shaping, same per-row freshness oracle.
 */
export function governingInvariants(rows: readonly Row[], freshnessOf: RowFreshness): readonly SizedInvariant[] {
  const out: SizedInvariant[] = []
  for (const row of rows) {
    if (isGotchaSlot(row)) continue // routed to `gotchas` instead
    const inv = factToInvariant(row.node, row.fact, freshnessOf(row.fact))
    if (!atLeastT1(inv)) continue // TOOLS-6 — the GOVERNING band, exactly as `splitBands` states it
    out.push({ inv, ppr: 0, hits: 0, cost: inv.claim.length })
  }
  return out
}

/**
 * The GOVERNING gotchas: the gotcha/rationale slots at `tier≥T1`. The tier test runs over a shaped row with
 * a NON-READING `'FRESH'` placeholder, because `SizedGotcha` carries the whole `GroundedFact` and no
 * freshness field of this row is ever served — paying a drift re-derivation to answer a TIER question would
 * be cost with no reader.
 */
export function governingGotchas(rows: readonly Row[]): readonly SizedGotcha[] {
  return rows
    .filter(isGotchaSlot)
    .filter((r) => atLeastT1(factToInvariant(r.node, r.fact, "FRESH")))
    .map((r) => ({ fact: r.fact, cost: r.node.claims.join("; ").length }))
}

/**
 * The ADVISORY band (REQ-RETR-12m): every `T2` row under the scope, shaped as a `PackInvariant` carrying
 * its OWN GROUND-1 freshness verdict — the same oracle, the same vocabulary and the same row format the
 * query pack's advisory band uses, so an operator reads one advisory row type across both doors.
 *
 * IT DRAWS FROM BOTH SLOT CLASSES, and that is measured rather than assumed. A `T2` fact is a machine
 * proposal no ratifier saw; the gotcha/rationale SLOT is a curation assignment, and on the real store no
 * mined fact has one — 199/199 rows carry `slot: undefined` on the projection node and
 * `predicateSlot: undefined` in the CAS bytes. Splitting the advisory band by a field that is empty by
 * construction would invent a distinction the data does not carry; keeping the band whole means a `T2`
 * authored WITH a gotcha slot is served too, rather than being invisible on a technicality. What the band
 * never does is promote such a row into the `gotchas` section: an advisory row keeps its own verb.
 *
 * The band is NOT capped here. Bounding is the composer's job (`OWN_ADVISORY_CAP` inside `OWN_CAP`,
 * `packages/retrieval/src/own.ts`) — this feed's contract is to say what is available, honestly and in
 * full, exactly as it does for the governing band.
 */
export function advisoryBand(rows: readonly Row[], freshnessOf: RowFreshness): readonly SizedInvariant[] {
  const out: SizedInvariant[] = []
  for (const row of rows) {
    const inv = factToInvariant(row.node, row.fact, freshnessOf(row.fact))
    if (!isAdvisory(inv)) continue // MEMBERSHIP — an off-lattice tier is in NEITHER band
    out.push({ inv, ppr: 0, hits: 0, cost: inv.claim.length })
  }
  return out
}
