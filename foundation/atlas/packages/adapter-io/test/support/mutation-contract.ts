// @atlas/adapter-io — test/support/mutation-contract.ts  (#196b WP-1 — the SOUND mutation-bench LABEL-STORE)
//
// THE ANTI-CIRCULARITY SPINE (AC-1 / AC-6, the HARD RULE). This module is the LABEL-STORE: it plants
// ground-truth by MUTATION and derives the FALSE/TRUE label from the mutation RECORD + an INDEPENDENT tsc
// witness (`neg-bench-lib.ts:buildOracle`, a `ts.createProgram` — a DIFFERENT toolchain from the gate's SCIP
// `createVerifyFactLeg`). It imports NO symbol from `verify-fact-source.ts` or `admit-harness.ts` — if it did,
// the gate's own oracle could masquerade as ground truth and the whole 0-false-admit number would be vacuous.
// A grep-level independence guard lives in `semantic-bench.test.ts` (AC-6) and a load-bearing static check is
// that this file compiles with only the imports below.
//
// It also has NO knowledge of admission outcomes at all: it produces CLAIMS and LABELS; the TEST turns a claim
// into a typed `Proposal`, drives the shipped `admit`, and hands the outcome to the SCORER. Two disjoint halves.

/** The four measured arms — each a distinct fact SHAPE with its own gate (co-primary, never blended). */
export type Arm = "count" | "relation" | "dependency" | "negation"

/** The ground-truth label. FALSE is PLANTED by a mutation; TRUE is the un-mutated base. Never a gate verdict. */
export type Label = "TRUE" | "FALSE"

/** The enumerated per-arm mutation kinds (AC-1). `base` is the un-mutated TRUE row. Each FALSE kind is tagged
 *  with the arm it targets and is an edit-distance-1 edit of the base (AC-9m). */
export type MutationKind =
  | "base"
  | "count-boundary-flip" //          count:      atLeast → beyond the witnessed lower bound (quantifier flip)
  | "relation-direction-reversal" //  relation:   (A calls B) → (B calls A) — the ordered pair reversed
  | "dependency-assert-absent" //     dependency: assert the call in a scope where the tsc witness sees none
  | "negation-flip" //               negation:   "X not called in S" pinned to a scope where X IS called

/** The arm each FALSE mutation kind targets — a total map, so a mutation can never be mis-attributed. */
export const KIND_ARM: Readonly<Record<Exclude<MutationKind, "base">, Arm>> = {
  "count-boundary-flip": "count",
  "relation-direction-reversal": "relation",
  "dependency-assert-absent": "dependency",
  "negation-flip": "negation",
}

/**
 * A neutral CLAIM payload — the fact the arm asserts, stripped of any admission machinery. `endpoints` is a
 * SINGLE ordered field (the relation's identity) so a direction reversal is an edit-distance-1 edit of ONE
 * field (AC-9m), not two. Only the fields an arm uses are present.
 */
export interface Claim {
  readonly arm: Arm
  readonly target: string //          canonical SCIP symbol (count/dependency/negation) — the fact is ABOUT it
  readonly scope: string //           the directory the claim ranges over
  readonly atLeast?: number //        count arm — the asserted lower bound N
  readonly endpoints?: readonly [string, string] // relation arm — the ordered pair [A, B] (ONE identity field)
}

/** A planted row — a claim, its PLANTED label (from the mutation record), the kind that produced it, its arm. */
export interface Row {
  readonly claim: Claim
  readonly label: Label
  readonly kind: MutationKind
  readonly arm: Arm
}

/** The tsc witness a label is derived from — a PURE predicate `(claim) → is-the-positive-true?`. Supplied by
 *  the caller from `buildOracle` (a `ts.createProgram`), NEVER the gate. For count/dependency it answers "is X
 *  called in S?"; for negation the positive is the negative-of, so the caller inverts; for relation it answers
 *  "does A call B?" for the ordered endpoints. Kept abstract so this module imports no oracle at all. */
export type TscWitness = (claim: Claim) => boolean

/**
 * DERIVE the label from the edit + the tsc witness ALONE (AC-1). This is the ground-truth function: it calls
 * NO admission symbol — only the injected `tsc` predicate. For every arm the positive proposition is "the
 * fact holds"; the label is TRUE iff tsc witnesses it.
 *   · count       — TRUE iff at least `atLeast` callers of `target` under `scope` (tsc call witness ≥ N).
 *   · dependency  — TRUE iff `target` is called under `scope`.
 *   · negation    — the fact IS a negative ("X not called in S"); TRUE iff tsc sees NO call (¬ witness).
 *   · relation    — TRUE iff A calls B for the ordered endpoints (the tsc predicate reads `endpoints`).
 */
export function deriveLabel(claim: Claim, tsc: TscWitness): Label {
  const positiveHolds = claim.arm === "negation" ? !tsc(claim) : tsc(claim)
  return positiveHolds ? "TRUE" : "FALSE"
}

/** The fields that make up a claim's identity, for the edit-distance check (AC-9m). `endpoints` is ONE field. */
function fieldMap(c: Claim): Record<string, string> {
  const m: Record<string, string> = { arm: c.arm, target: c.target, scope: c.scope }
  if (c.atLeast !== undefined) m["atLeast"] = String(c.atLeast)
  if (c.endpoints !== undefined) m["endpoints"] = JSON.stringify(c.endpoints)
  return m
}

/** The number of identity fields in which two claims differ (AC-9m: a fair mutant differs by exactly one). */
export function editDistance(a: Claim, b: Claim): number {
  const fa = fieldMap(a),
    fb = fieldMap(b)
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)])
  let d = 0
  for (const k of keys) if (fa[k] !== fb[k]) d += 1
  return d
}

/**
 * The mutation contract (AC-1). Given a base (TRUE) row and an arm-appropriate FALSE `kind`, return the
 * mutated row carrying `label:'FALSE'` — a PURE function of the edit. The mutation is edit-distance-1 by
 * construction (one field changes); `flipScope`/`beyond` supply the arm-specific replacement value the caller
 * derives from the tsc witness (a scope where the call is ABSENT / a bound BEYOND the witnessed count / the
 * reversed pair). Throws on an arm↔kind mismatch — a mis-tagged mutation is a contract violation, never silent.
 */
export function mutate(
  base: Row,
  kind: Exclude<MutationKind, "base">,
  edit: { flipScope?: string; beyond?: number },
): Row {
  if (base.label !== "TRUE" || base.kind !== "base") throw new Error("mutate: base must be an un-mutated TRUE row")
  if (KIND_ARM[kind] !== base.arm) throw new Error(`mutate: kind ${kind} targets ${KIND_ARM[kind]}, not ${base.arm}`)
  const c = base.claim
  let claim: Claim
  switch (kind) {
    case "count-boundary-flip":
      if (edit.beyond === undefined)
        throw new Error("count-boundary-flip needs edit.beyond (a bound above the witnessed count)")
      claim = { ...c, atLeast: edit.beyond }
      break
    case "dependency-assert-absent":
    case "negation-flip":
      if (edit.flipScope === undefined)
        throw new Error(`${kind} needs edit.flipScope (a scope where the tsc witness differs)`)
      claim = { ...c, scope: edit.flipScope }
      break
    case "relation-direction-reversal": {
      if (c.endpoints === undefined) throw new Error("relation-direction-reversal needs endpoints on the base claim")
      claim = { ...c, endpoints: [c.endpoints[1], c.endpoints[0]] }
      break
    }
  }
  return { claim, label: "FALSE", kind, arm: base.arm }
}
