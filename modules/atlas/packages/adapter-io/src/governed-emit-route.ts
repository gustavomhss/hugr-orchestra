// @atlas/adapter-io — src/governed-emit-route.ts  (WHICH ratification gate a write must clear — ARCH-9)
//
// EXTRACTED from `governed-emit.ts` at the 400-LOC ceiling, along the seam ADR-0010 drew: everything here
// answers "which gate does this write owe", while the door answers "does this write clear it". That is one
// question with a long enough answer to have pushed the door over the ceiling — the ARCH-9 rationale, the
// measurement showing what the derivation does and does NOT change at this door, and the statement of the
// CREATE leg that is deliberately left open.
//
// PURE: no store, no policy, no clock. It takes a class the CALLER derived and returns a `RatifyContext`.

import type { Tier } from "@atlas/contracts"
import type { RatifyContext, WriteOrigin } from "@atlas/knowledge"

export type { WriteOrigin }

/** The door-derived fast-path verdicts — the ARCH-9 replacement for the former `DOOR_RATIFY_CTX` constant.
 *  `lowRisk` (KNOW-18a/17b) is DERIVED from the candidate having cleared the door's own TRUTH gate (a
 *  real prior verdict) AND being on the advisory class; `contested` (KNOW-18b) is DERIVED from observed
 *  store contention during the write attempt. See `ratifyCtxFor` — ARCH-9 forbids a module-level constant
 *  that pins the gate open, so these MUST come from the caller, never defaulted here. */
export interface FastPathVerdicts {
  readonly lowRisk: boolean
  readonly contested: boolean
}

/**
 * ARCH-9 (ADR-0010) — the ratification context for ONE write, with the DERIVED governance class joined in.
 *
 * `route` selected the ratification gate from `candidate.tier`, an author-supplied payload field, while the
 * routing `nodeKey` carries no class at all: WHICH node a write lands on and WHICH gate it must clear were
 * decided by two different things, and the author controlled the second. `RatifyContext.derivedTier` is the
 * seam ADR-0010 opened for that, and until now NO CALLER FILLED IT — so end to end the gate was still
 * selected by the request. This function is that caller.
 *
 * THE JOIN IS ONE-WAY (`strictestTier` inside `route`): a payload may only ever make its own gate HARDER.
 *
 * MEASURED, NOT ASSERTED — and this is the part a reviewer should not take on trust. At THIS door, on an
 * UPDATE, supplying the derived class changes no outcome today: ARCH-10's incumbent guard above has already
 * refused any write declaring a class WEAKER than the incumbent's, so by the time `route` runs the declared
 * class is provably ⊒ the derived one and `strictestTier(derived, declared) === declared`. What this closes
 * is therefore not a live bypass but a DEPENDENCE: the safety of a ratified node stops being a property of
 * this file's gate ORDER and becomes a property of the routing decision itself. Delete the downgrade branch
 * in `governed-emit-incumbent.ts` and the T2-over-T0 takeover is STILL refused — by `unratified`, because
 * the derived `T0` sends the write to full ratification. That mutant is the test
 * (`test/arch9-door-derivation.test.ts`), because no non-mutant input can distinguish the two.
 *
 * ARCH-D3b — THE CREATE LEG — IS NOT CLOSED HERE, AND IS NOT GUESSED AT. On a write that MINTS a node there
 * is no incumbent, so there is nothing to derive a class FROM, and `derivedTier` is deliberately ABSENT: the
 * declared class stands, exactly as before. Two answers were available and both are refused as inventions:
 * a constant is what ARCH-9 explicitly names as NOT satisfying the clause, and pinning every CREATE to `T0`
 * would make every first write to a node require the billy token — a policy decision with product-wide
 * consequences that belongs to the owner, not to this door. It is recorded as OPEN in the architecture
 * decision table and in ADR-0010 §"What the owner still has to ratify" item 2, and it is pinned as an open
 * hole by a test so it cannot later be mistaken for coverage.
 *
 * ── THE FAST-PATH VERDICTS ARE DERIVED, NEVER A HARDCODED CONSTANT (ARCH-D3b / INV-AUTH-15) ────────────
 * The former `DOOR_RATIFY_CTX = { contested: false, lowRisk: true }` module constant is ARCH-9's exact
 * named violation: "a constant that pins the gate open does not satisfy this clause." It is REMOVED. The
 * caller now passes `FastPathVerdicts` — `lowRisk` derived from the cleared truth gate (the door evaluated
 * `evalTruthGate` before reaching `route`, so it KNOWS), `contested` derived from observed store contention.
 * Both are REQUIRED (no default): the common T2-advisory auto-accept is preserved as the OBSERVED outcome
 * of real verdicts, never a defaulted-on `true`. Absent ⇒ the caller has not wired the derivation, which is
 * itself a failure mode the type now rejects at compile time.
 *
 * ── THE SECOND DOOR-DERIVED FIELD: `origin` (KNOW-8, the promotion door) ──────────────────────────────
 *
 * `origin` is threaded here rather than fixed by forging `contested:true` or `lowRisk:false`. Both of those
 * would route correctly and both are lies about store state that the next reader has no way to detect —
 * `RatifyContext.origin`'s own doc block carries the full argument. What is threaded is a fact the DOOR
 * knows and the request cannot influence, which is the ARCH-9 shape this file already implements once.
 *
 * ABSENT ⇒ AUTHORED, so the emit leg `wire.ts` assembles is byte-for-byte unchanged: `assembleHandler`
 * passes no origin, `deps.origin` is `undefined`, and `route` sees the same context it saw before.
 */
export function ratifyCtxFor(
  derivedTier: Tier | undefined,
  verdicts: FastPathVerdicts,
  origin?: WriteOrigin,
): RatifyContext {
  return {
    lowRisk: verdicts.lowRisk,
    contested: verdicts.contested,
    ...(derivedTier !== undefined ? { derivedTier } : {}),
    ...(origin !== undefined ? { origin } : {}),
  }
}
