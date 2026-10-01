// @atlas/tools — src/bands.ts   (TOOLS-6 / ADR-0013 — the ONE two-band split of a Pack)
//
// The pack is TWO bands, not one filtered list: the GOVERNING band (`tier≥T1`, ratified) and the ADVISORY
// band (`T2`, machine proposals nobody ratified), separately bounded and separately rendered. This module
// owns the split, the advisory cap, and the one token estimator — in ONE place, so the shipped scope path
// (`./query.ts`) and the shipped dependency/trigger path (`@atlas/adapter-io` `pack-shape.ts`, which imports
// THIS module; the layer DAG allows `adapter-io → tools` and forbids only the reverse) cannot state the
// advisory band two different ways. `pack-shape.ts` records what the two-copy version of `atLeastT1` cost.
//
// ── BOTH BANDS ARE STATED AS MEMBERSHIP, AND THAT IS THE SECURITY PROPERTY ──────────────────────────────
// `atLeastT1` is `isTier(t) && t !== 'T2'`, never the bare `t !== 'T2'`: the negative form admitted every
// value that is not the literal string `'T2'`, including every off-lattice one, so a row carrying
// `tier:'T3'` was served as though it were ratified `T1`-or-stricter. Reachable with NO write door —
// `.atlas/` is a COMMITTED artifact, so a repository can ship a projection plus a CAS blob that never passed
// a gate, and the content re-hash on read confirms the BYTES, not their governance.
//
// The advisory band is stated the SAME way — `isTier(t) && t === 'T2'`, never "everything that is not ≥T1".
// The negative form would reopen the identical hole facing the other way: an off-lattice `T3` would fall
// into the advisory band and be served (marked as a mere proposal, but SERVED) instead of being refused.
// An unrecognized class is not `≥T1` and it is not `T2` either — it is not a class at all, and it belongs to
// NEITHER band. `isTier` is the ONE lattice guard; neither predicate here compares tier strings by hand.

import { isTier } from "@atlas/knowledge"
import type { PackInvariant } from "@atlas/contracts"

/**
 * The ADVISORY band's token cap — 2000, RATIFIED BY THE OWNER on 2026-08-03.
 *
 * It is a NEW constant, not a reused one, and saying so matters: the `≤ ~2K` bound `query.ts` documents for
 * the governing band is prose plus a size test, never a named constant on the shipped path. The number is a
 * ratification, not a derivation — ADR-0013 bounded it to `(0, CAP_CEILING − PACK_CAP)` by RETR-7b and left
 * the point in that range to the owner. It satisfies that ceiling: `PACK_CAP 2000 + 2000 < CAP_CEILING 5000`
 * (`@atlas/retrieval` src/pack.ts). It caps the ADVISORY band ONLY — the governing band's budget is
 * RESERVED and no advisory row may displace a governing one.
 */
export const ADVISORY_CAP = 2000

/**
 * The GOVERNING band predicate (TOOLS-6): `tier≥T1` (T0 or T1). MEMBERSHIP, never `!== 'T2'` — see header.
 */
export const atLeastT1 = (inv: PackInvariant): boolean => isTier(inv.tier) && inv.tier !== "T2"

/**
 * The ADVISORY band predicate (ADR-0013): `T2` exactly. MEMBERSHIP, never `!atLeastT1` — see header. The two
 * predicates are deliberately NOT complements: their union is the tier LATTICE, not the set of all strings,
 * so an off-lattice row satisfies neither and lands in neither band.
 */
export const isAdvisory = (inv: PackInvariant): boolean => isTier(inv.tier) && inv.tier === "T2"

/**
 * The ONE advisory size estimate — a deterministic char-count proxy over the claims. It is the estimator the
 * pack has always used (`query.ts`'s former local `tokenEstimate`, moved here so there is not a second one),
 * and it stays an ADVISORY size bound verified by a size test, never a correctness oracle
 * (method-tags-tls:158).
 */
export const packTokens = (invariants: readonly PackInvariant[]): number =>
  invariants.reduce((n, inv) => n + inv.claim.length, 0)

/** The two bands of one raw invariant list, plus the advisory truncation ledger. */
export interface Bands {
  /** `tier≥T1`, in input order. NOT capped by `ADVISORY_CAP` — its budget is reserved. */
  readonly governing: readonly PackInvariant[]
  /** `T2`, in input order, truncated at `ADVISORY_CAP`. */
  readonly advisory: readonly PackInvariant[]
  /** How many `T2` rows the cap dropped. Rides out beside the data — a truncated bounded set that does not
   *  say so reads as "we covered everything" (#130). */
  readonly advisoryDropped: number
}

/**
 * Split a raw invariant list into the two bands. Pure + total, and DETERMINISTIC in both directions:
 *
 *   - the GOVERNING band is every `tier≥T1` row, in input order, uncapped by this function — its content is
 *     byte-identical to what TOOLS-6 served before the amendment, so a reader who stops at it loses nothing;
 *   - the ADVISORY band is every `T2` row, in input order, filled greedily until the next row would exceed
 *     `ADVISORY_CAP`, at which point the CAP WINS and every remaining row is COUNTED into `advisoryDropped`;
 *   - an off-lattice row is in NEITHER band and is NOT counted as dropped — it was refused, not truncated,
 *     and folding a refusal into a truncation ledger would report a governance decision as a budget event.
 *
 * The fill is CAP-WINS rather than best-fit: once the cap has bitten, no later (smaller) row sneaks in ahead
 * of an earlier one. Best-fit would make the served set depend on the SIZE of rows the caller never sees,
 * so two callers with the same input order could get different bands — the opposite of deterministic. The
 * caller supplies the order (both shipped paths sort by `nodeId` before calling), so truncation is stable.
 */
export function splitBands(invariants: readonly PackInvariant[]): Bands {
  const governing: PackInvariant[] = []
  const advisory: PackInvariant[] = []
  let dropped = 0
  let used = 0
  let capped = false
  for (const inv of invariants) {
    if (atLeastT1(inv)) {
      governing.push(inv)
      continue
    }
    if (!isAdvisory(inv)) continue // off-lattice ⇒ NEITHER band, and NOT a truncation (see above)
    const cost = inv.claim.length
    if (!capped && used + cost <= ADVISORY_CAP) {
      advisory.push(inv)
      used += cost
    } else {
      capped = true
      dropped++
    }
  }
  return { governing, advisory, advisoryDropped: dropped }
}
