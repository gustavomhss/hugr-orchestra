// @atlas/knowledge — src/status.ts  (WP-4.11-a.KNOW · KNOW-1, spec A-1 · truth is never self-declared)
//
// The truth-gate side-index recomputer. A fact NEVER self-declares true: the served `Status` is a
// RECOMPUTED side-index (out of identity — atlas-knowledge:16,28), never a value the fact asserts about
// itself. `recompute(node)` DROPS any node-declared `status` and derives the served verdict from the
// recomputed side-index (KNOW-16 evaluator) DEFERRED through GROUND's truth-gate (KNOW-3 drift, GROUND-4).
// Transcribed against the FROZEN oracle `StatusApi.recompute` (co-located below); golden SCN-KNOW-1-1.
//
// SEAM (card guardrails — "no second copy of the gate; consume-only; no raw hashing"): the served
// verdict is GROUND's `gateHolds` (GROUND-4: `HOLDS` only if grounded ∧ FRESH, else downgraded to `NA`,
// downgrade-only). The gate + the KNOW-16 evaluator verdict + the built-index `src` snapshot are INJECTED
// build-ahead (types-only import of the FROZEN interfaces) — same discipline as `bindFreshness`/
// `bindGate`. The node's OWN `status` field is never read: that is the whole point of KNOW-1.
//
// [PINNED — StatusApi §Transcribable] the signature is pinned to `recompute(node: GroundedFact):
// Status`. The frozen ref FLAGS that the recompute inputs {drift, evaluator-verdict} are "ADDITIONAL
// inputs NOT present in the pinned 1-arg signature; flagged for the WP to reconcile whether they thread
// as parameters — NOT invented as parameters here." Reconciled WITHOUT touching the frozen 1-arg
// signature: they thread as INJECTED DEPS (the `bindStatus` closure), NOT as new call-args — the exact
// seam the SEALED sibling `@atlas/grounding` `bindGate(deps): GateApi` uses. No frozen field is invented.
//
// SCOPE (card exclusions): NOT defining `gateHolds` (owned by WP-4.11-a.GROUND, consumed here); NOT the
// KNOW-16 evaluator itself (owned by the evaluator seat, `./evaluator.ts`, its verdict consumed here);
// NOT the fail-closed grounded write (KNOW-2, `./emit.ts`); NOT the write-decision routing (CAMPAIGN-5).
//
// [FLAG — simulated seal] the card `content_hash: <filled-at-freeze>` was never filled; this binding is
// written against the VISIBLE frozen `StatusApi` text + SCN-KNOW-1-1, flagged simulated.

import type { Status } from "@atlas/contracts"
import type { Axes } from "@atlas/index"
import type { GateApi } from "@atlas/grounding"
import type { GroundedFact } from "../types.js"

// ── frozen StatusApi surface, co-located here (was ref/status.ts) ─────────────────────────────────────

export interface StatusApi {
  /** Recompute the served `Status` for a node (KNOW-1), IGNORING any `status` the node carries — a
   *  candidate-declared `HOLDS` is dropped; the served status is the recomputed one (method-tags-knw:22).
   *  Pure + total; `Status` is out of identity (never in the `nodeKey`). Signature pinned to
   *  `recompute(node: GroundedFact): Status`; the {drift, evaluator-verdict} inputs thread as INJECTED
   *  DEPS (the `bindStatus` closure), NOT as new call-args. */
  recompute(node: GroundedFact): Status
}

/**
 * The recompute seam (KNOW-1), injected build-ahead. `gate` is GROUND's frozen truth-gate (GROUND-4,
 * owned by WP-4.11-a.GROUND); `evaluate` is the KNOW-16 evaluator verdict (owned by the evaluator seat);
 * `src` is the built-index snapshot the drift/gate re-check against (Owner-DEFINE pin: `Axes`). All
 * consumed as FROZEN shapes — never re-defined here.
 */
export interface StatusDeps {
  /** GROUND-4 truth-gate: `HOLDS` only if grounded ∧ FRESH, else `NA`; downgrade-only, idempotent. The
   *  single gate the recompute defers to (no second copy). */
  readonly gate: GateApi
  /** KNOW-16 evaluator verdict for a node's check against index state — the RECOMPUTED side-index leg,
   *  NEVER the node's self-declared `status`. Consumed as a pure function (consume-only). */
  readonly evaluate: (node: GroundedFact) => Status
  /** The built-index snapshot the gate re-checks drift/grounding against (Owner-DEFINE pin: `Axes`). */
  readonly src: Axes
}

/**
 * Bind the served-`Status` recomputer over the injected gate/evaluator/src seam. The returned
 * `recompute` conforms EXACTLY to the frozen `StatusApi.recompute(node): Status` (1-arg signature
 * preserved) and is pure + total (no clock, no IO, no global state, no throw) given pure/total `deps`.
 *
 * Law (KNOW-1, SCN-KNOW-1-1):
 *   served = gate.gateHolds( evaluate(node), node.grounding, src )
 * The node's declared `status` is DROPPED — it enters no part of the computation. The served verdict is
 * the recomputed side-index (evaluator) DEFERRED through the truth-gate: a candidate-declared `HOLDS`
 * whose recomputed side-index resolves to `NA` (drift ⇒ gate downgrade, or an evaluator `NA`) is served
 * `NA`. A fact is truth ONLY if grounded ∧ FRESH (fail-closed) — never on its own say-so.
 */
export function bindStatus(deps: StatusDeps): StatusApi {
  const recompute: StatusApi["recompute"] = (node: GroundedFact) =>
    deps.gate.gateHolds(deps.evaluate(node), node.grounding, deps.src)
  return { recompute }
}
