// @atlas/grounding — src/gate.ts   (WP-4.11-a.GROUND · GROUND-4, spec A-1)
//
// The truth-gate. `gateHolds(candidate, grounding, src)` serves `HOLDS` iff (grounded ∧ FRESH), else
// downgrades to `NA`. It is DOWNGRADE-ONLY + idempotent: a non-`HOLDS` verdict passes through UNCHANGED,
// and the only move the gate ever makes is `HOLDS→NA` — it never upgrades. Freshness is a STRUCTURAL
// verdict, never a truth claim (FRESH ≠ true). Transcribed against the frozen oracle `./types.ts`
// (`GateApi.gateHolds`); goldens SCN-GROUND-4-1 / SCN-GROUND-4-2.
//
// BUILD-AHEAD: the grounded/FRESH inputs are GROUND-2/3/5's `isGrounded` + `driftDetect` (owned by
// WP-4.10-a.GROUND, not yet shipping runtime). They are INJECTED as a `GateDeps` seam (types-only import
// of the FROZEN `GroundApi`/`DriftApi`) rather than statically imported — same discipline as
// `@atlas/knowledge` `bindFreshness`. No hashing here (the subtreeHash compute is 4.10's / the sealed
// kernel seam) — SEAM: consume-only.
//
// SCOPE (card exclusions): NOT the second admission door (owned by WP-4.11-b.GROUND — since ADR-0012
// that door is HARMFUL-TO-STORE, not usefulness; obviousness is scored, never a veto); NOT the
// atlas-emit re-derivation surface (owned by WP-4.11-a.TOOLS); NOT the A-1 `Θ_A1` HOLDS→NA downgrade
// THRESHOLD (SCN-GROUND-4-3, DEFINE-parametric residue, [NEEDS RECONCILIATION]) — the gate encodes the
// downgrade, the concrete threshold REQ is pending the A-1 lift and is NOT fabricated here.
//
// [FLAG — `candidate`, upward-owned] `GateApi` (in `./types.ts`) pins the arg as `unknown` (the knowledge-layer
// `Candidate`/`Fact` is UPWARD-owned; importing it inverts the DAG). The INV-GROUND-4 down-model
// automaton (method-tags-grd) is `gateHolds(status, grounded, freshness)` — so the gate reads the
// candidate's incoming `Status` VERDICT and nothing else. `coerceStatus` reads it TOTALLY and
// FAIL-CLOSED: a non-`Status` value can never fabricate a `HOLDS`. The GROUND-8 `untrusted`-source
// exclusion keys on the candidate's provenance and is applied at candidate-set construction (owned by
// WP-4.11-b.GROUND) — it is NOT re-implemented here.

import type { Status, Freshness } from "@atlas/contracts"
import type { Axes } from "@atlas/index"
import type { Grounding, GateApi, GroundApi, DriftApi } from "./types.js"

/**
 * The grounded ∧ FRESH inputs the truth-gate gates on (GROUND-2/3/5), injected build-ahead. Owned by
 * WP-4.10-a.GROUND; consumed here as the FROZEN `GroundApi`/`DriftApi` method shapes (never redefined).
 */
export interface GateDeps {
  /** GROUND-2 real-grounding predicate: ≥1 entry ∧ every entry carries a non-empty `subtreeHash`. */
  readonly isGrounded: GroundApi["isGrounded"]
  /** GROUND-11 freshness verdict against the built-index snapshot `src` (Owner-DEFINE pin: `Axes`). */
  readonly driftDetect: DriftApi["driftDetect"]
}

const STATUSES: readonly Status[] = ["HOLDS", "BROKEN", "NA", "advisory"]

/**
 * Read the candidate's incoming `Status` verdict, totally and fail-closed. A recognized `Status` string
 * passes through; ANYTHING else collapses to `NA` — a non-`Status` value can never earn a `HOLDS`.
 */
function coerceStatus(candidate: unknown): Status {
  return typeof candidate === "string" && (STATUSES as readonly string[]).includes(candidate)
    ? (candidate as Status)
    : "NA"
}

/**
 * Build the truth-gate over the injected grounded/FRESH seam. The returned `gateHolds` conforms EXACTLY
 * to the frozen `GateApi.gateHolds(candidate, grounding, src)` signature and is pure + total (no clock,
 * no IO, no global state, no throw) given a pure/total `deps`.
 *
 * Laws (INV-GROUND-4, PBT):
 *   (a) HOLDS-iff-grounded∧FRESH — a `HOLDS` candidate stays `HOLDS` only when `isGrounded(grounding)`
 *       AND `driftDetect(grounding, src) === 'FRESH'`; otherwise it is downgraded to `NA`.
 *   (b) downgrade-only monotonicity — the only transition is `HOLDS→NA`; the gate never upgrades.
 *   (c) idempotence — `gateHolds ∘ gateHolds ≡ gateHolds` (re-gating an `NA` never launders it to HOLDS).
 *   (d) non-HOLDS pass-through — a non-`HOLDS` verdict is returned UNCHANGED.
 */
export function bindGate(deps: GateDeps): GateApi {
  const gateHolds = (candidate: unknown, grounding: Grounding, src: Axes): Status => {
    const incoming = coerceStatus(candidate)
    // (d) pass-through + (c) idempotence: only a `HOLDS` is eligible for downgrade; all else is a no-op.
    if (incoming !== "HOLDS") return incoming
    // (a) HOLDS-iff-grounded∧FRESH; (b) the sole move is HOLDS→NA — fail-closed on anything but FRESH.
    const fresh: Freshness = deps.driftDetect(grounding, src)
    return deps.isGrounded(grounding) && fresh === "FRESH" ? "HOLDS" : "NA"
  }
  return { gateHolds }
}
