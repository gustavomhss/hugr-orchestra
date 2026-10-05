// @atlas/grounding — src/emit-guard.ts   (WP-4.11-a.GROUND · GROUND-6, GROUND-9)
//
// The fail-closed emit guard: the two DECISIONS the truth-gate contributes at `emit` so that an
// ungrounded or free-prose fact never enters the store.
//   - `truthDoorHolds` (GROUND-6, spec A-2) — the emit truth door: a fact may enter ONLY if the gate
//     serves `HOLDS` (grounded ∧ FRESH, GROUND-4). An ungrounded/drifted candidate ⇒ `NA` ⇒ blocked ⇒
//     nothing persists. This is the "frozen from WP-4.11-a.GROUND" truth-door internal that the 2-door
//     `admit` (WP-4.11-b.GROUND) and `atlas-emit` (WP-4.11-a.TOOLS) both gate on.
//   - `validateTemplate` (GROUND-9, spec A-13) — the templated-write validator: a raw free-prose fact
//     is rejected — no free-prose fact persists.
// Goldens SCN-GROUND-6-1 / SCN-GROUND-9-1. Both pure + total (no clock, no IO, no throw).
//
// SCOPE (card exclusions): NOT the `admit` composition nor the harm door (owned by
// WP-4.11-b.GROUND); NOT the persistence sink / re-derivation (`emit`, owned by WP-4.11-a.TOOLS — the
// truth-door DECISION is modeled here, the write-side is delegated per §GROUND-6 / method-tags-grd).
//
// [RESIDUE — out of this facet] the CONCRETE required-field set `F` and per-slot cap `κ` of the A-13
// template (SCN-GROUND-9-2, DEFINE-parametric, [NEEDS RECONCILIATION]) are NOT enforced or fabricated
// here — `validateTemplate` enforces only the coarse "structured template shape vs raw free prose"
// distinction (SCN-GROUND-9-1); the field-set/cap guard is pending the A-13 reconciliation lift.

import type { Status } from "@atlas/contracts"
import type { Axes } from "@atlas/index"
import type { Grounding, GateApi } from "./types.js"

/**
 * The admission bar (GROUND-7, as amended by ADR-0012) + the templated-write validator (GROUND-9, spec
 * A-13). A fact is admitted iff it passes BOTH doors: (1) TRUTH — its grounding re-checks FRESH via
 * `gateHolds` (GROUND-4); and (2) NOT HARMFUL TO STORE — it is not a secret / PII, the one class where
 * storing IS the harm. Failing EITHER door blocks. `validateTemplate` (impl'd below) enforces the fixed
 * field set + cap. Pure + total. (atlas-grounding:132, 90-94; method-tags-grd:65-70, 79-84)
 *
 * [AMENDED — ADR-0012, owner-ratified 2026-08-02] A true-but-obvious fact is NO LONGER rejected. This
 * comment used to read "A true-but-obvious fact is noise and MUST be rejected." Obviousness is now computed
 * and STORED as an auditable score (`ObviousnessScore`), never a veto: a rejected candidate leaves no
 * record, so a gate destroys exactly the evidence needed to audit the gate, and a bad fact admitted is
 * recoverable at ranking while a good fact rejected is not.
 *
 * [NOT ENFORCED HERE — stated so this is not read as a control that exists] `AdmitApi` is a DECLARED
 * surface with no implementation in this module (only `truthDoorHolds` + `validateTemplate` ship from
 * here). The harm door's predicate is the credential-scrub family in `@atlas/persist`; whether that is the
 * COMPLETE definition of harm is not settled — ADR-0012 §"What this ADR does NOT close" says so. The
 * admission path is now WIRED (`packages/cli/src/mine-gate.ts` → `buildMineAdmission` → `makeAdmitGate`),
 * so this module's declared surface has a shipped consumer; what is still unwired is the harm predicate's
 * completeness, not the path.
 *
 * [Refuse-to-model] The "non-obvious" predicate has NO finite/mechanical oracle (method-tags-grd:119) —
 * only the admission WIRING (the conjunction) and the truth door are modeled. ADR-0012 decides what the
 * verdict is FOR, not that it became mechanical; the verdict is still a human/review judgment.
 */
export interface AdmitApi {
  /** Admission: `true` iff BOTH the truth door (`gateHolds(...) === 'HOLDS'`, i.e. grounded ∧ FRESH —
   *  GROUND-4) AND the harm door (¬harmfulToStore — not a secret / PII) pass; failing either blocks
   *  (GROUND-7). An ungrounded fact is blocked at the truth door (fail-closed write, GROUND-6/spec A-2).
   *  Obviousness is NOT an input here — it is scored and stored, never a veto (ADR-0012).
   *  Pure + total. (atlas-grounding:132)
   *
   *  [FLAG — `fact` arg, upward-owned] The reference names `admit(fact)`. The `Fact` (its grounding,
   *  source, template fields, harmful-to-store signals, stored obviousness score) is the knowledge-layer
   *  type — UPWARD-owned,
   *  this layer-3 module MUST NOT import it (would invert the DAG). Transcribed as `unknown` rather than
   *  invented; flagged for the knowledge layer to supply the concrete shape. */
  admit(fact: unknown): boolean

  /** Templated-write validator (GROUND-9, spec A-13): reject a fact missing a required template field,
   *  over cap, or carrying free prose — no free-prose fact persists. Pure + total. (method-tags-grd:82-84)
   *
   *  [FLAG — `fact` arg, upward-owned] Same upward-owned `Fact` as `admit` → `unknown`. The fixed field
   *  set + cap live with the knowledge-layer template; flagged for that layer to supply the shape. */
  validateTemplate(fact: unknown): boolean
}

/**
 * The emit truth door (GROUND-6): `true` iff the truth-gate serves `HOLDS` for the candidate against
 * `src` — i.e. its grounding is grounded ∧ FRESH (GROUND-4). Fail-closed: an ungrounded or drifted
 * candidate serves `NA`, the door returns `false`, and NOTHING enters at `emit`. Consumes the gate as a
 * seam (no second copy of the gate). Pure + total.
 */
export function truthDoorHolds(
  gate: Pick<GateApi, "gateHolds">,
  candidate: unknown,
  grounding: Grounding,
  src: Axes,
): boolean {
  const verdict: Status = gate.gateHolds(candidate, grounding, src)
  return verdict === "HOLDS"
}

/**
 * The templated-write validator (GROUND-9, spec A-13): reject a raw free-prose fact — no free-prose
 * fact persists. Fail-closed coarse gate — a fact MUST be the fixed TEMPLATE shape (a structured,
 * non-null, non-array record); a raw prose string (or any non-record scalar) is rejected. The concrete
 * required-field set / cap is the DEFINE-parametric residue (SCN-GROUND-9-2), out of this facet — see
 * the file header. Pure + total.
 *
 * [FLAG — `fact`, upward-owned] `AdmitApi` (co-located above) pins the arg as `unknown` (the knowledge-layer `Fact` is
 * UPWARD-owned; importing it inverts the DAG). The coarse structured-vs-prose check needs no upward type.
 */
export function validateTemplate(fact: unknown): boolean {
  return typeof fact === "object" && fact !== null && !Array.isArray(fact)
}
