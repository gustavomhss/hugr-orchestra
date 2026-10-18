// @atlas/knowledge — src/write/closed-slot.ts  (KNOW-10 / KNOW-15i — the closed-vocabulary write refusal)
//
// EXTRACTED FROM `upsert.ts` AT THE 400-LOC CEILING, on the seam this repo already uses for exactly this
// shape: `adapter-io/src/governed-emit-reasons.ts` holds that door's refusal constants for the same reason.
// What lives here is the REFUSAL — its user-visible text and the named class that carries it. The DECISION
// (one `if`, first thing in the reducer) stays in `upsert.ts`, where the reader looking for the gate order
// will find it; the vocabulary itself stays in `router.ts`, which computes the identity it protects.
//
// ── WHY THIS GATE EXISTS (#152) ──────────────────────────────────────────────────────────────────────────
// The 13-member `predicateSlot` vocabulary was stated in THREE places and enforced in NONE. Measured on the
// BUILT `dist` through the shipped `atlas emit` binary in a subprocess: a grounded, authorized, ratified
// fact declaring `predicateSlot: 'free-text-whatever'` was ACCEPTED — exit 0, `status: ok`, durable — and
// the SAME fact at slot `invariant`, and again with the slot ABSENT, each minted a DIFFERENT content id.
//
// THE DERIVATION, NOT THE DIGESTS. An earlier revision of this comment quoted three specific ids. Cold
// review rebuilt `origin/master` from scratch and drove the real binary over `s29`'s own fixture: the
// three-distinct-addresses result reproduces exactly, but the quoted digests do NOT — they came from a
// fixture nothing in the repo records, so no reader could ever re-derive them. A digest that cannot be
// re-derived is a claim, not evidence. To reproduce: check out any commit before this one, build, and run
// the `s29` fixture's three cases; the ids are a pure function of (file path, file bytes, claim, scope,
// tier) and all three differ. That difference IS the harm: `nodeKey = hash(primaryAnchorId ‖ predicateSlot)`, so an
// unrecognised slot does not fail — it silently mints a NEW ADDRESS. "Same topic" is decidable only because
// the vocabulary is finite (atlas-knowledge:150); a free-text slot never collides, so the store proliferates
// parallel nodes at one anchor and UPDATE/union never fires. Both membership guards that existed
// (`isKnownSlot`, `isClosedSlot`) had ZERO production callers.
//
// IT IS ENFORCED AT `upsert`, for the same reason ARCH-10 is (see that file's ARCH-10 block): the reducer is
// the one funnel every durable write passes through — `adapter-io/governed-emit.ts:361` (`atlas emit`,
// `atlas promote`) and `cli/mine.ts:52` (the staging write) both call it — and a gate at the reducer refuses
// for every present and future caller rather than being a property of one door's gate order. `upsert`'s own
// ARCH-10 block carries the full throw-not-`REJECT` argument and it applies unchanged here, and
// the throw is a NAMED class so the composed doors render a structured fail-closed verdict: `tools/fault.ts`
// `classifyThrown` files any non-engine `Error` as `refused`, and its message travels VERBATIM to the
// operator (CLI `reason:` line / MCP `rejected`), which is why the text below names the offending value, the
// closed vocabulary and the door.
//
// ── ABSENT IS NOT A VIOLATION, AND THAT IS A DECISION, NOT AN OVERSIGHT ───────────────────────────────────
// MEASURED 2026-08-04 across 300 model calls in two runs: ZERO stored facts carry a `predicateSlot` at all.
// The cause is upstream and mechanical, but NOT the one an earlier revision of this comment gave. There are
// THREE fact constructors in `genesis/src/admit-harness.ts`, not two: `buildSound` (:294) — which DOES set
// `predicateSlot`, at :305 — plus `buildPredicate` (:315) and `buildAdvisory` (:334), which do not. So the
// field is not unpopulated for want of a constructor.
//
// The real reason is one layer up: **no production path constructs a `PredicateProposal`.** The only
// production caller of the genesis admission gate is `makeAdmitGate` (`packages/cli/src/mine-gate.ts:72`),
// which builds an `AdvisoryProposal` exclusively — so `buildSound` and `buildPredicate` are unreachable
// from the CLI and `buildAdvisory`, which sets no slot, is the only constructor that runs. That is why the
// question "what does this gate do when the field is ABSENT?" is not a corner case; today it is EVERY
// mined fact.
//
// UNMEASURED, and recorded rather than glossed: this refusal's rendering on the MINE leg. `upsert` is
// reached there at `packages/cli/src/mine.ts:290`, inside `decide` under `store.commitStaging`, where there
// is NO `commitRefusalOf` re-file. `tools/src/fault.ts` `classifyThrown` should file it as `refused`, but
// nobody has driven it — and nobody can, until a producer emits a slot. The emit door's exit-2 contract IS
// proven (see D5); the mine door's is not.
//
// The decision: `slot` is OPTIONAL and an ABSENT slot STANDS ASIDE. Three reasons, in order of weight:
//   1. Fail-closed-on-absent is not a gate, it is an outage. It would refuse 100% of `atlas mine` writes and
//      100% of `atlas promote` on the shipped producer — every one of them, from the first day.
//   2. It would be a CONTRACT CHANGE. `WriteRequest.slot` and `GroundedFact.predicateSlot` are declared
//      R3-OPTIONAL (types.ts), deliberately, because ~17 merged fact literals omit them. Optional→required
//      bumps `cv`; that is a spec revision, not a gate wiring.
//   3. The two cases are not the same harm. An UNRECOGNISED slot escapes the vocabulary and mints an
//      unpredictable new address. An ABSENT slot is deterministic: every slot-less fact at one anchor hashes
//      to the SAME key, so they COLLIDE and force UPDATE/union — which is exactly the behaviour closedness
//      exists to produce.
// So this gate is a NARROWING and is written down as one. It does NOT make "every fact carries a slot" true;
// closing that leg requires the PRODUCER to populate the field first, and that work is upstream of here.
// Until it lands, this gate protects the door a human or agent authors through (`atlas emit`, MCP), where
// the slot IS supplied and where an unrecognised one was previously accepted in silence.

import { PREDICATE_SLOTS } from "./router.js"

/** The refusal's DISCRIMINANT — the text before the first `:` of the reason, which is the one channel every
 *  transport reproduces byte-for-byte (CLI `reason:` line, MCP `rejected`, in-process `Verdict.rejected`).
 *  Exported so a door or a test compares a VALUE for equality instead of matching prose. */
export const CLOSED_SLOT_DISCRIMINANT = "closed-slot-violation"

/** The refusal text for an out-of-vocabulary `predicateSlot`. Names the OFFENDING VALUE, the closed
 *  vocabulary in full, and the door — the three things a caller needs and none of which it had. Carries the
 *  `closed-slot-violation` discriminant as its first `:`-delimited field, the channel every transport
 *  reproduces byte-for-byte, so a refusal is asserted on a VALUE and not on a substring of prose. */
export function closedSlotRefusalText(slot: unknown): string {
  // A non-string offender is described by KIND, never interpolated into quotes: `'[object Object]'` reads
  // as a slot NAME the author could go and look for, and `{toString:() => 'invariant'}` would print as the
  // very slot it is impersonating. The article agrees with the kind — `an array`, not `a array`, which is
  // what the first revision shipped and what the test caught.
  const kind = Array.isArray(slot) ? "array" : slot === null ? "null" : typeof slot
  const shown = typeof slot === "string" ? `'${slot}'` : `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} value`
  return (
    `${CLOSED_SLOT_DISCRIMINANT}: this write declares predicateSlot ${shown}, which is not one of the closed 13. ` +
    `The vocabulary is CLOSED (KNOW-10 / KNOW-15i): ${PREDICATE_SLOTS.map((s) => `'${s}'`).join(", ")}. ` +
    "It is closed because node identity is hash(primaryAnchorId + predicateSlot), so an unrecognised slot " +
    "does not collide with anything — it silently mints a NEW address at the same anchor and the store " +
    "proliferates parallel nodes that never merge. Re-state the claim under one of the 13; adding a " +
    "fourteenth is a contract-version (`cv`) bump, not a write. Refused by the governed write door " +
    "(atlas-emit / atlas-link) before anything was persisted"
  )
}

/** The refusal, as a THROWN value carrying the offending slot for a caller that wants to inspect it rather
 *  than read prose. A named `Error` subclass, so `tools/fault.ts` files it as a REFUSAL (a deliberate
 *  decline) and never as an internal fault — the same contract `DegenerateAnchorError` (router.ts) and
 *  `GovernanceAuthorityError` (upsert.ts) already rely on. */
export class ClosedSlotError extends Error {
  readonly reason: typeof CLOSED_SLOT_DISCRIMINANT = CLOSED_SLOT_DISCRIMINANT
  readonly slot: unknown
  constructor(slot: unknown) {
    super(closedSlotRefusalText(slot))
    this.name = "ClosedSlotError"
    this.slot = slot
  }
}

/**
 * Is `e` this refusal? STRUCTURAL, never `instanceof`, and that is not fastidiousness: two `dist` copies of
 * `@atlas/knowledge` in one process (a workspace hoist that did not dedupe, an embedder pinning its own)
 * give two distinct class objects, and `instanceof` would answer `false` for a refusal this product raised
 * — silently downgrading a governance decline into an unhandled throw at the door. `tools/src/fault.ts`
 * records the same hazard for its own tag and resolves it the same way. Keyed on the `reason`
 * DISCRIMINANT rather than on `name`, because the discriminant is the value every transport already
 * reproduces byte-for-byte and the one a caller is told to compare.
 */
export function isClosedSlotError(e: unknown): e is ClosedSlotError {
  return (e as { reason?: unknown } | null | undefined)?.reason === CLOSED_SLOT_DISCRIMINANT
}
