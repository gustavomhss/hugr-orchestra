// @atlas/index — src/coverage.ts  (INDEX-16: the STANDING coverage gate, not reactive)
//
// The unresolved-edge ratio (unresolved/total) is a per-territory published health metric; a T0 territory
// over the >15% ceiling FAILS the gate from day one. Coverage-gate rule ONLY — it does not record edges
// or assign territory; the per-territory tallies are consumed as FROZEN upstream inputs, never computed.

import type { Territory } from "@atlas/contracts"

/**
 * The standing coverage gate (INDEX-16): the `unresolved/total` ratio is a per-territory published health
 * metric; a T0 territory over the >15% ceiling FAILS the gate from day one (atlas-index:202-205).
 */
export interface CoverageApi {
  /** The per-territory published health metric: `unresolvedEdges / totalEdges` (INDEX-16). Readable on
   *  the rollup. (method-tags-idx:129) */
  ratio(territory: Territory): number

  /** The standing gate: reference `gate(territory) = tier==T0 ∧ ratio>0.15 ⇒ FAIL` (method-tags-idx:129).
   *
   *  [FLAG — boolean polarity not pinned] The reference states the FAIL CONDITION but not whether the
   *  returned `boolean` is `true`=pass or `true`=fail. Transcribed as the reference gives it (a boolean
   *  verdict) WITHOUT choosing a polarity — flagged for the WP to fix the convention (recommend
   *  `true`=PASS to read as a gate predicate, but not invented here). */
  gate(territory: Territory): boolean
}

/** The T0 unresolved-edge ceiling (INDEX-16): a T0 territory with ratio strictly above this FAILs. */
export const T0_COVERAGE_CEILING = 0.15

/** A per-territory unresolved-edge tally — the FROZEN UPSTREAM INPUT. `territory` is the name assigned
 *  upstream (EPIC-9-a); `unresolved`/`total` summarise the upstream edge set (EPIC-8-b). Not a contract. */
export interface TerritoryEdgeTally {
  readonly territory: string
  readonly unresolved: number
  readonly total: number
}

/** Build the CoverageApi over a frozen set of per-territory unresolved-edge tallies. */
export function createCoverage(tallies: readonly TerritoryEdgeTally[]): CoverageApi {
  const byName = new Map<string, TerritoryEdgeTally>()
  for (const t of tallies) byName.set(t.territory, t)

  const ratioOf = (territory: Territory): number => {
    const t = byName.get(territory.name)
    if (t === undefined || t.total === 0) return 0
    return t.unresolved / t.total
  }

  return {
    ratio(territory: Territory): number {
      return ratioOf(territory)
    },
    gate(territory: Territory): boolean {
      // Reference FAIL condition: tier==T0 ∧ ratio > 0.15 ⇒ FAIL.
      // Boolean polarity: `true`=PASS (ref recommendation; goldens pin the semantic FAIL, not the bit),
      // so a FAILing gate returns `false`.
      const fails = territory.tier === "T0" && ratioOf(territory) > T0_COVERAGE_CEILING
      return !fails
    },
  }
}
