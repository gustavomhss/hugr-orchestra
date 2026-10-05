// @atlas/adapter-io — test/support/bench-scorer.ts  (#196b WP-1 — the PER-ARM scorer, two co-primaries)
//
// AC-2 / AC-8. Turns (planted rows, gate outcomes) into the two co-primary numbers PER ARM:
//   · falseAdmit = |admitted ∧ label=FALSE| / |label=FALSE|   (SOUNDNESS — the headline; must be 0 where the
//                                                               gate carries a truth oracle)
//   · recallTrue = |admitted ∧ label=TRUE|  / |label=TRUE, groundable|  (COVERAGE — the co-primary)
// The old "blended coverage" is deleted (MISSING AC-11 folded): a single number that mixed the two hid whether
// a 0 came from soundness or from abstaining on everything.
//
// THE INDEPENDENCE RULE (AC-6). This module imports NO symbol from `admit-harness.ts` / `verify-fact-source.ts`.
// It reads a PLAIN `Outcome` the TEST adapts from `Admission` — a boolean `admitted` plus, for a rejection,
// whether the refusal was an ANCHORING failure (so AC-14 can exclude an un-groundable TRUE from the recall
// denominator: the bench measures the GATE, not the anchoring plumbing). No admission type crosses this seam.

import type { Arm, Row } from "./mutation-contract.js"

/**
 * The gate's decision on one planted row, reduced to exactly what the two co-primaries need — and NOTHING the
 * admission engine owns. `admitted` is the only positive. A rejection carries `anchorFailed`: true iff the
 * refusal was an ANCHORING / grounding failure (DROP_UNGROUNDED / target-unresolvable / malformed) rather than
 * the truth oracle declining — the AC-14 discriminant. A `dropped` for the truth reason and an `abstained` are
 * both `admitted:false, anchorFailed:false`: neither is a false admit and neither is an anchoring excuse.
 */
export type Outcome = { readonly admitted: true } | { readonly admitted: false; readonly anchorFailed: boolean }

/** The two co-primaries for one arm, plus the arm's population size. `NaN` denominators surface as `null` —
 *  an empty arm has no rate, and a scorer that returned 0 or 1 there would be inventing a measurement. */
export interface ArmScore {
  readonly falseAdmit: number | null // admitted∧FALSE / FALSE
  readonly recallTrue: number | null // admitted∧TRUE  / (TRUE ∧ groundable)
  readonly n: number //               rows in this arm (both labels)
  // The RAW counts the two ratios above are computed from, carried through UNCHANGED so a report can state the
  // fraction as MEASURED (read off the run) instead of INFERRED (re-derived by arithmetic from a printed
  // percentage). Reporting only — no assertion, no threshold and no scoring semantics reads these.
  readonly falseAdmitNum: number // |admitted ∧ label=FALSE|
  readonly falseAdmitDen: number // |label=FALSE|
  readonly recallNum: number //    |admitted ∧ label=TRUE ∧ groundable|
  readonly recallDen: number //    |label=TRUE ∧ groundable|
}

export type Score = Record<Arm, ArmScore>

const ARMS: readonly Arm[] = ["count", "relation", "dependency", "negation"]

/**
 * SCORE the run (AC-2). `rows[i]` was decided as `outcomes[i]` (parallel arrays; a length mismatch is a bug,
 * so it throws rather than score a misaligned pair). Per arm:
 *   falseAdmit numerator/denominator over label=FALSE; recallTrue over label=TRUE MINUS the un-groundable
 *   (AC-14). Pure + total.
 */
export function score(rows: readonly Row[], outcomes: readonly Outcome[]): Score {
  if (rows.length !== outcomes.length) throw new Error(`score: ${rows.length} rows vs ${outcomes.length} outcomes`)
  const acc: Record<Arm, { faNum: number; faDen: number; rNum: number; rDen: number; n: number }> = {
    count: z(),
    relation: z(),
    dependency: z(),
    negation: z(),
  }
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!,
      o = outcomes[i]!,
      a = acc[r.arm]
    a.n += 1
    if (r.label === "FALSE") {
      a.faDen += 1
      if (o.admitted) a.faNum += 1
    } else {
      // AC-14: a TRUE the pipeline could not ANCHOR (grounding/target failure) is EXCLUDED from recall —
      // that measures the anchoring plumbing, not the gate's discrimination.
      const groundable = o.admitted || !o.anchorFailed
      if (groundable) {
        a.rDen += 1
        if (o.admitted) a.rNum += 1
      }
    }
  }
  const out = {} as Record<Arm, ArmScore>
  for (const arm of ARMS) {
    const a = acc[arm]
    out[arm] = {
      falseAdmit: a.faDen === 0 ? null : a.faNum / a.faDen,
      recallTrue: a.rDen === 0 ? null : a.rNum / a.rDen,
      n: a.n,
      falseAdmitNum: a.faNum,
      falseAdmitDen: a.faDen,
      recallNum: a.rNum,
      recallDen: a.rDen,
    }
  }
  return out
}

function z(): { faNum: number; faDen: number; rNum: number; rDen: number; n: number } {
  return { faNum: 0, faDen: 0, rNum: 0, rDen: 0, n: 0 }
}

/** The emitted report (AC-8 shape-only + AC-10m disclaimer). Carries BOTH co-primaries per arm and the
 *  scope-limit disclaimer (the semantic residual is OUT of the sound headline). Non-load-bearing: the number's
 *  proof is `score` + the substrate run, not this shape. */
export interface BenchReport {
  readonly perArm: Score
  readonly scopeLimit: string // AC-10m — the disclaimer field (semantic slots are routed to spot-audit)
}

/** AC-10m disclaimer text — a constant so the report cannot ship without it and a shape check can pin it. */
export const SCOPE_LIMIT_DISCLAIMER =
  "SOUND HEADLINE = structural arms only (count / dependency / negation vs the independent tsc oracle). The " +
  "relation arm is MEASURED, not guaranteed (no direction oracle). Semantic slots (invariant / sideeffect / …) " +
  "tsc cannot witness are NOT sound-labeled and are routed to the labeled spot-audit (Arm-0 now ADMITS these " +
  "as grounded JUSTIFIED advisories — abstain ⇒ justified, unsealed), never the sound headline."

/** Build the report and VALIDATE its shape (AC-8): a per-arm entry missing either co-primary is rejected. */
export function buildReport(perArm: Score): BenchReport {
  for (const arm of ARMS) {
    const a = perArm[arm]
    if (a === undefined || !("falseAdmit" in a) || !("recallTrue" in a) || !("n" in a)) {
      throw new Error(`report shape invalid: arm ${arm} must carry {falseAdmit, recallTrue, n}`)
    }
  }
  return { perArm, scopeLimit: SCOPE_LIMIT_DISCLAIMER }
}

/** True iff a report object carries both co-primaries for every arm (AC-8 guard, usable on an untrusted shape). */
export function reportShapeValid(rep: unknown): boolean {
  if (typeof rep !== "object" || rep === null) return false
  const r = rep as { perArm?: Record<string, unknown>; scopeLimit?: unknown }
  if (typeof r.scopeLimit !== "string" || r.perArm === undefined) return false
  for (const arm of ARMS) {
    const a = r.perArm[arm] as Record<string, unknown> | undefined
    if (a === undefined) return false
    if (!("falseAdmit" in a) || !("recallTrue" in a) || !("n" in a)) return false
  }
  return true
}
