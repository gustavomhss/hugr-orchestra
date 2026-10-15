// @atlas/genesis — src/coverage.ts  (WP-8.30.GEN · GEN-8 / GEN-12g — the per-site RUN LEDGER)
//
// A genesis run used to leave NO durable record of which sites it visited. `GenesisReport` carried no
// abstention field and `run-controller.ts`'s `visit` returned `.facts` only, so every `WhyNot` the S2 driver
// produced (`extract.ts:118`) was DROPPED on the floor. The consequence is not cosmetic: a site that
// ABSTAINED — which GEN-12g makes a first-class, valid outcome — and a site that was SILENTLY DROPPED print
// and store identically, so "this repository was mined completely" is a claim nothing can refute.
//
// This file is the vocabulary that closes that. It authors NO new concept: a row names the site by the
// anchored `StructRef` the `Candidate` already carries, an abstention IS the GEN-12 `WhyNot`, and a seeded
// row names its facts by the `Fact.id` the knowledge layer already mints. What is new is only that they are
// KEPT, one row per PLANNED site, and that a mechanical `reconcile` says whether the set closes.
//
// THREE THINGS THIS FILE REFUSES TO DO, each of which would fabricate coverage:
//   1. It never computes an outcome by SUBTRACTION. One site may yield more than one fact, so
//      `sites − facts` is not a residual and nothing here treats it as one.
//   2. It never invents an abstention reason. A `visit` port that hands back bare facts had a `WhyNot` and
//      did not pass it; that is `unrecorded` with the port named, not a manufactured `WhyNot`.
//   3. It never reads an ABSENT ledger as an empty one. `reconcile(undefined)` is UNEVALUABLE, the same
//      discipline the genesis-output probe applies when it declines to round a `?` up to a `✓`.

import type { Candidate, ExtractResult, Fact, RunCoverage, SiteOutcome, WhyNot } from "./types.js"

/**
 * What the `ControllerDeps.visit` port handed back, normalized.
 *
 * The port's return type is `readonly Fact[] | ExtractResult` — a UNION, not a replacement. `ExtractResult`
 * is the frozen S2 surface (`extract(cands, budget): { facts, abstained }`, atlas-genesis:188), so a driver
 * that wants the full record hands back what `runExtract` already returns instead of picking `.facts` off
 * it; a driver that keeps returning the bare array keeps working unchanged. `abstained` is therefore
 * OPTIONAL here, and its absence is a fact about the PORT rather than about the site.
 */
export interface VisitRecord {
  readonly facts: readonly Fact[]
  readonly abstained?: readonly WhyNot[]
}

/** The note an `unrecorded` row carries. Names the PORT, because that is what the limitation is about — the
 *  site may well have abstained with a perfectly good grounded reason that never left `visit`. */
export const UNRECORDED_NOTE =
  "the `visit` port returned facts only (a bare Fact[], not the ExtractResult `runExtract` produces), so this site's grounded WhyNot never reached the run — outcome not recorded rather than guessed"

/** Normalize either arm of the `visit` union. `Array.isArray` is the discriminant; there is no third shape. */
export function readVisit(r: readonly Fact[] | ExtractResult): VisitRecord {
  return Array.isArray(r) ? { facts: r as readonly Fact[] } : (r as ExtractResult)
}

/**
 * Classify ONE completed visit into its ledger row.
 *
 * The order of the three cases is the whole semantics:
 *   • facts came back  ⇒ `seeded`, naming them. The count is not enough — WHICH facts is what lets a reader
 *     join this row to the store, and one site may produce more than one.
 *   • no facts, and the port reported abstentions ⇒ `abstained`, carrying the FIRST grounded `WhyNot`
 *     verbatim. (A single-site visit produces at most one; the first is the one about this site.)
 *   • no facts, and the port reported nothing ⇒ `unrecorded`. NOT an abstention: nothing grounded it.
 */
export function classifyVisit(cand: Candidate, r: VisitRecord): SiteOutcome {
  const base = { rank: cand.rank, site: cand.site } as const
  if (r.facts.length > 0) {
    return { ...base, outcome: "seeded", facts: r.facts.map((f) => f.id as unknown as string) }
  }
  const whyNot = r.abstained?.[0]
  if (whyNot !== undefined) return { ...base, outcome: "abstained", whyNot }
  return { ...base, outcome: "unrecorded", note: UNRECORDED_NOTE }
}

/** A site the run never spent a call on, and WHY — the cold tail is a coverage fact, not an absence. */
export function unvisited(cand: Candidate, cause: "ceiling" | "after-interrupt"): SiteOutcome {
  return { rank: cand.rank, site: cand.site, outcome: "unvisited", cause }
}

/** A site whose `visit` threw. GEN-8c catches it WITHOUT a cause, so the row carries none either — the
 *  honest shape, and the reason `MinePass.refusal`/`onFault` exist beside the report rather than in it. */
export function interruptedAt(cand: Candidate): SiteOutcome {
  return { rank: cand.rank, site: cand.site, outcome: "interrupted" }
}

/** The ledger a run with no frontier produces. `plan` threw, so there is nothing to account for — and this
 *  says exactly that, which is NOT the same claim as "the repository has no sites". */
export const NO_FRONTIER: RunCoverage = { frontier: "unavailable", planned: 0, sites: [] }

/** The reconciliation verdict — whether a run's site set CLOSES over its own frontier. */
export interface Reconciliation {
  /** `true` only when a planned frontier was recorded, every planned site has exactly one row, and no site
   *  is recorded twice. Anything else is a ledger that cannot establish coverage. */
  readonly closes: boolean
  readonly planned: number
  readonly recorded: number
  readonly seeded: number
  readonly abstained: number
  readonly unrecorded: number
  readonly interrupted: number
  readonly unvisited: number
  /** Planned sites with no row — the sites that were DROPPED. Non-zero is the defect this ledger detects. */
  readonly unaccounted: number
  /** `qualifiedPath`s recorded more than once: a double-count inflates coverage as surely as a gap deflates it. */
  readonly duplicates: readonly string[]
  /** The verdict as one sentence, safe to print. Says UNEVALUABLE where it is, never PASS-by-default. */
  readonly why: string
}

const KINDS = ["seeded", "abstained", "unrecorded", "interrupted", "unvisited"] as const

/** Count the rows of one outcome kind. */
function tally(sites: readonly SiteOutcome[], kind: SiteOutcome["outcome"]): number {
  let n = 0
  for (const s of sites) if (s.outcome === kind) n += 1
  return n
}

/**
 * RECONCILE a run's ledger against its own frontier — the mechanical form of "no site was dropped".
 *
 * An ABSENT ledger is UNEVALUABLE and never closes. That is the absent-tolerant read: an artifact written
 * before the ledger existed still parses, and asking it about coverage yields "not recorded", which is a
 * different answer from "covered nothing" and from "covered everything".
 */
export function reconcile(coverage: RunCoverage | undefined): Reconciliation {
  const counts = Object.fromEntries(KINDS.map((k) => [k, tally(coverage?.sites ?? [], k)])) as Record<
    (typeof KINDS)[number],
    number
  >
  const seen = new Map<string, number>()
  for (const s of coverage?.sites ?? []) {
    const k = s.site.qualifiedPath
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k)
  const planned = coverage?.planned ?? 0
  const recorded = coverage?.sites.length ?? 0
  const unaccounted = Math.max(planned - recorded, 0)
  const base = { planned, recorded, ...counts, unaccounted, duplicates } as const

  if (coverage === undefined) {
    return {
      ...base,
      closes: false,
      why: "coverage UNEVALUABLE — this run recorded no site ledger, so its site set cannot be reconciled (an absent ledger is not an empty one)",
    }
  }
  if (coverage.frontier === "unavailable") {
    return {
      ...base,
      closes: false,
      why: "coverage UNEVALUABLE — the run never obtained a frontier (planning failed), so there is no site set to reconcile; this is not a claim that the repository is empty",
    }
  }
  if (unaccounted > 0) {
    return {
      ...base,
      closes: false,
      why: `coverage DOES NOT CLOSE — ${planned} site(s) planned but only ${recorded} accounted for: ${unaccounted} site(s) were DROPPED with no recorded outcome`,
    }
  }
  if (duplicates.length > 0) {
    return {
      ...base,
      closes: false,
      why: `coverage DOES NOT CLOSE — ${duplicates.length} site(s) recorded more than once (${duplicates.slice(0, 3).join(", ")}), so the row count overstates the frontier`,
    }
  }
  return {
    ...base,
    closes: true,
    why: `coverage CLOSES — all ${planned} planned site(s) accounted for: ${counts.seeded} seeded, ${counts.abstained} abstained, ${counts.unrecorded} unrecorded, ${counts.interrupted} interrupted, ${counts.unvisited} never visited`,
  }
}
