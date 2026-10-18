// @atlas/adapter-io — src/governed-emit-incumbent.ts  (the emit door's TARGET-derived gates)
//
// SPLIT OUT OF `governed-emit.ts` at the 400-LOC ceiling, along a real seam: everything here is decided by
// the node the write TARGETS, nothing by the write itself. That is stage 2.25 of the door, and it is the
// one stage whose inputs are the INCUMBENT rather than the payload — which is why it earns its own module,
// and why its rationale is long enough to have pushed the door over the ceiling twice.
//
// TOTAL + PURE given a pure store/policy: it returns the refusal STRING, or `undefined` for "no objection".
// It never writes, never throws, and never decides `emitted` — the door does that — so the gate ORDER, and
// with it the increasing-disclosure rule `governed-emit.ts` pins in its header, stays readable in one place.

import type { Hash, Tier } from "@atlas/contracts"
import { isScope, isWeakerTier, strictestTier } from "@atlas/knowledge"
import type { CurrentNode, GroundedFact } from "@atlas/knowledge"
import { actorInScope } from "./policy.js"
import type { AtlasPolicy } from "./policy.js"
import type { DiskStore } from "./store.js"
import {
  REJECTED_DOWNGRADE,
  REJECTED_RELOCATION,
  REJECTED_UNAUTHORIZED_TARGET,
  REJECTED_UNVERIFIABLE_TARGET,
} from "./governed-emit-reasons.js"

/** What the target-derived gates are composed over — the same channels the door itself holds. */
export interface IncumbentDeps {
  readonly store: DiskStore
  readonly policy: AtlasPolicy
  readonly actor: string
}

// 2.25 INCUMBENT GUARD — the write's TARGET decides which gate it must clear, never the write itself.
//
//   The routing identity is `nodeKey = hash(primaryAnchorId ‖ slot[‖ check])`. It contains NEITHER `tier`
//   NOR `scope`. So WHICH node a write lands on and WHICH gate that write must clear were, until this
//   block, decided by two different things — and the author controlled the second. Declaring `tier:'T2'`
//   + advisory made `route` fast-path (no token consulted) while the minted nodeKey still collided with a
//   billy-ratified `T0` node, and `upsert` set-unioned the claim straight into it. Declaring a `scope` the
//   actor happens to own passed authz while the node lived in someone else's scope. Both are the same
//   defect: a CONFUSED DEPUTY — capability gating ("which gate applies") is not authorization ("may THIS
//   write touch THAT node"). The remedy is the object-capability one: derive the required authority from
//   the RESOURCE, never from the request.
//
//   So: resolve the target node FIRST, read its governance class off its OWN stored fact (the CAS bytes
//   ARE the fact — the same read-back `governed-link.ts` already does for its authz gate), and refuse any
//   write that declares a WEAKER class than the node it targets. Strictness therefore only ever ratchets
//   UP: re-stating or RAISING a class is ordinary (and a raise still faces the KNOW-8 gate below), while
//   LOWERING one is a re-classification — a separate governed act, never a side effect of emitting a fact.
//   Refusing the downgrade outright (rather than merely gating it on the stricter class) is what keeps the
//   stored `tier` monotone, so no later reader has to distrust it: a ratified `T0` node can never be
//   quietly re-served as `T2` — which, since a pack bounds `T2` OUT (TOOLS-6), would erase it from every
//   read as effectively as deleting it. The node's SCOPE is monotone in the same way and for the same
//   reason (see the relocation gate below): the pair `(scope, tier)` is what a reader trusts, and neither
//   half moves as a side effect of a claim. ADR-0009 makes both conditional on a signed re-classification
//   — which is task #88 and IS NOT BUILT, so today the monotonicity here is unconditional.
//
//   The projection is rehydrated ONCE here and reused by the upsert below. (An earlier version of this
//   comment claimed it had been read TWICE before — it had not; `rehydrateProjection` appears exactly once
//   on every ancestor of this line. Parity presented as an improvement; corrected rather than deleted.)
/**
 * The full outcome of stage 2.25 — a REFUSAL, or the class this stage DERIVED from the incumbent.
 *
 * ARCH-9 (ADR-0010) needs the second half, and it was being computed and thrown away. `incumbentTier` — the
 * class read off the incumbent's own ROW joined with its own stored BYTES — is exactly "a value the author
 * cannot choose", which is the definition of a gate-selecting field that satisfies ARCH-9. Returning it lets
 * the door hand it to `route` instead of letting `route` gate on the class the REQUEST declared.
 *
 * Both fields absent means "no objection, and no class could be derived" (a carrier-less row whose bytes
 * carry no class either — see the join below).
 */
export interface IncumbentDecision {
  readonly refusal?: string
  /** ARCH-9 — the class DERIVED from the resource. Never the declared one, never a default. */
  readonly derivedTier?: Tier
}

/** Run the target-derived gates against the resolved incumbent. `node`/`tier` are the GATE-0 SNAPSHOT
 *  values the door validated, never raw payload fields. Returns the refusal reason, or `undefined` when
 *  the write may proceed to ratification.
 *
 *  THE NAME IS KEPT because ADR-0007/ADR-0010 and the architecture reference both cite it by name as the
 *  gate that runs before `upsert`; it is now a thin projection of {@link incumbentDecision}, which also
 *  carries the derived class the door needs (ARCH-9). One resolution of the incumbent, two answers. */
export function incumbentRefusal(
  deps: IncumbentDeps,
  incumbent: CurrentNode,
  node: GroundedFact,
  tier: unknown,
): string | undefined {
  return incumbentDecision(deps, incumbent, node, tier).refusal
}

/** {@link incumbentRefusal} plus the ARCH-9 derived class. The projection is read ONCE for both. */
export function incumbentDecision(
  deps: IncumbentDeps,
  incumbent: CurrentNode,
  node: GroundedFact,
  tier: unknown,
): IncumbentDecision {
  // AUTHORITY OVER THE TARGET, not equality of names. Gate 2 above asked "is the actor in the scope this
  // write DECLARES" — the attacker picks that. The question that actually protects the node is "is the
  // actor in the scope the NODE ALREADY LIVES IN", so it is asked here, against the incumbent's own
  // stored fact, with the identical KNOW-11 seam.
  //
  // This SUPERSEDED — did not simply delete — a `node.scope !== stored.scope` equality test that was
  // wrong in both directions AS THE ONLY SCOPE GATE. (The equality itself is still here, below, doing
  // the one job it is right for; what changed is that it no longer stands in for an authority check.)
  // Too loose: it carved out `stored.scope === undefined`, and `mine` writes this projection without
  // passing this door, so every mined row was unowned — ANY actor in ANY scope could adopt one with no
  // ratify token and then promote it to `T1`, which is INSIDE the pack bound. Too tight: an admin
  // RENAMING a scope in `policy.json` made every existing node permanently unwritable by anyone, billy
  // included — the same unrecoverable shape this branch elsewhere treats as critical, reachable by a
  // routine admin edit; and a second, legitimately-authorized owner of the same symbol was refused
  // because `nodeKey` carries no scope. Both reproduced by a cold review.
  //
  // Membership answers all of it: bob is refused unless the admin actually granted him the incumbent's
  // scope; a rename degrades to an ordinary `unauthorized` that the admin fixes by declaring the scope,
  // not to a brick; and an unowned node stays fail-closed, because `actorInScope` denies an absent scope
  // (KNOW-11a) — while an admin who deliberately grants `atlas:mined` can appoint a curator to adopt
  // mined candidates. No special cases — but, as the gate directly below records, membership is only
  // HALF the rule, and the first version of this fix shipped it as the whole one.
  //
  // AUTHORITY IS RESOLVED FROM THE ROW — the carrier half ADR-0007 decided and did not ship (the file
  // header has the full narrative). The row answers "who has authority here" identically whether or not
  // the bytes survive, so a stranger's refusal is BYTE-IDENTICAL in both states, and the honest storage
  // answer below is reserved for a caller already shown to hold authority.
  //
  // `isScope` is the same guard gate 0 applies to the write, now applied to what was STORED — without it
  // `actorInScope` would coerce a malformed row scope into a legitimate-looking property key exactly as
  // it would have on the way in.
  //
  // A CARRIER-LESS ROW FALLS BACK TO THE BYTES (LEAD-REVERSED — ADR-0007 §Consequences has the record).
  // Treating ABSENT like MALFORMED is fail-closed and still a BRICK: every row written before the carrier
  // became permanently unwritable, with no migration door (task #88). This codebase has twice ruled that
  // outcome unacceptable (the scope-rename brick, the relocation brick).
  //
  // The "an attacker bypasses the carrier by DELETING the field" objection does not survive this file's
  // own threat model: the sidecar is unauthenticated, so whoever can delete a field can rewrite the file
  // — it was never a trust boundary. The fallback therefore degrades to the MORE authenticated source
  // (CAS bytes are content-addressed and re-hashed on read) and lands where the product already stood.
  //
  // NARROW, AND THE NARROWNESS IS THE POINT: only a row with NO `scope` PROPERTY AT ALL takes this path.
  // A row that HAS one is judged on it — malformed ⇒ `isScope` fails ⇒ refused, never re-routed to the
  // bytes. Collapsing malformed into absent would make the bypass reachable by writing junk rather than
  // by deleting, which is strictly easier.
  //
  // THE ORACLE STAYS SHUT HERE BY THE SAME ARGUMENT: on this path authority can ONLY come from the bytes,
  // so unreadable ⇒ authority unestablished ⇒ `unauthorized for target` — the same string an out-of-scope
  // caller gets when the bytes ARE readable. One string in both byte-states, and `unverifiable target`
  // stays unreachable until authority is established, exactly as for a carried row.
  const rowScope = incumbent.scope
  const stored = deps.store.get(incumbent.contentHash as unknown as Hash) as GroundedFact | undefined
  const legacyRow = rowScope === undefined // the carrier-less shape — NOT "malformed", NOT "empty"
  const authorityScope = legacyRow ? stored?.scope : rowScope
  if (!isScope(authorityScope) || !actorInScope(deps.policy, deps.actor, authorityScope)) {
    return { refusal: REJECTED_UNAUTHORIZED_TARGET }
  }

  // CORROBORATION, not mere presence — for a CARRIED row. The row may decide WHO IS HEARD (that is what
  // closes the oracle) but not what the node IS: the bytes must AGREE with the governance it advertises,
  // else whoever edits the sidecar names themselves the node's scope. Reached only AFTER the authority
  // gate, so a forged row buys its author only this refusal. On the legacy path there is nothing to
  // corroborate — authority came FROM the bytes — and `stored` is necessarily defined here, because
  // `isScope(authorityScope)` above could not have passed otherwise.
  if (stored === undefined || (!legacyRow && stored.scope !== rowScope)) {
    return { refusal: REJECTED_UNVERIFIABLE_TARGET }
  }

  // The class to clear is the STRICTEST of the two carriers WHERE BOTH EXIST, same reason: a row
  // disagreeing with its own bytes may only make this gate HARDER. Where the row carries no class (the
  // legacy shape) the authenticated bytes stand alone — joining `undefined` through `strictestTier` would
  // fail closed to `T0` and re-brick precisely the rows this fallback exists to keep writable.
  const incumbentTier = incumbent.tier === undefined ? stored.tier : strictestTier(incumbent.tier, stored.tier)
  const weakerTier = isWeakerTier(tier, incumbentTier)

  // SCOPE MONOTONICITY — authority over the target is NOT the whole rule, and the membership fix above
  // silently dropped the other half. Both gates now ask "is the actor in SOME scope"; NEITHER asks
  // whether the scope this write DECLARES is a legitimate destination for this node. So an actor who
  // belongs to TWO scopes clears gate 2 on the scope it declares, clears the gate above on the scope
  // the node lives in, and the node MOVES — permanently evicting every co-owner who is not also in the
  // destination. Reproduced: policy `{shared:[alice,bob], bob-priv:[bob]}`, alice creates a T1 in
  // `shared`, bob re-emits the same anchor declaring `bob-priv`, and alice's next write to her own
  // served invariant comes back `unauthorized for target`. No token beyond a non-empty ratifier was
  // needed, and T1 is INSIDE the pack bound — a served invariant, captured by its co-owner.
  //
  // The judgement, and it is not a new one: RELOCATING A NODE BETWEEN SCOPES IS THE SAME CLASS OF ACT
  // AS LOWERING ITS TIER. Both re-classify the node — they change which governance boundary holds it,
  // not what it claims — and ADR-0009 settles that re-classification is an EXPLICIT, out-of-band,
  // SIGNED act (authority in BOTH the old and the new scope), never a side effect of emitting a claim.
  // So the declared scope must RE-STATE the incumbent's; anything else is refused, and the two gates
  // are a conjunction: authority over the target AND no silent relocation.
  //
  // MIGRATION CURRENTLY HAS NO DOOR. ADR-0009 is Accepted but its implementation is task #88 and is not
  // built, so today a node's scope cannot be changed by ANY path through this door — that is a stated
  // gap, not an oversight. It is not, however, the brick the old `node.scope !== stored.scope` EQUALITY
  // test was: that test ran INSTEAD of an authority check, so an admin renaming a scope in policy.json
  // made every existing node unwritable by everyone including billy. Here the equality runs AFTER
  // membership, so a rename degrades to an ordinary recoverable failure the admin fixes by declaring
  // both names, and the node keeps taking writes at its stored scope meanwhile.
  if (node.scope !== stored.scope) {
    return { refusal: REJECTED_RELOCATION }
  }

  if (weakerTier) {
    return { refusal: REJECTED_DOWNGRADE }
  }
  // No target-derived objection — the door continues to ratify + upsert, and it now does so under the class
  // DERIVED here rather than the one the request declared (ARCH-9). `incumbentTier` is `Tier | undefined`:
  // undefined is the carrier-less row whose BYTES also carry no class, and it is passed through as absent
  // rather than defaulted, because a default would be exactly the "constant that pins the gate" ARCH-9
  // forbids. (That shape cannot actually reach here — `isWeakerTier(tier, undefined)` is `true`, so it was
  // already refused `governance-downgrade` above — but the type is honest about it rather than asserting.)
  return incumbentTier === undefined ? {} : { derivedTier: incumbentTier }
}
