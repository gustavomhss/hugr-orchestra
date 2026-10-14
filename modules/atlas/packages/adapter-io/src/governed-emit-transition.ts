// @atlas/adapter-io — src/governed-emit-transition.ts  (#234 · ADR-0015 D4 — THE TRANSITION DOOR)
//
// A transition is a 2-rev IMMUTABLE ADVISORY HISTORICAL record ("unit returned A at shaBefore, returns B at
// shaAfter"). Like a negation it rides the SAME governed emit surface (`createGovernedEmit`) — the door's
// `emit` branches here on `kind:'transition'`, BEFORE gate 0 — but its gate ladder is RE-ROUTED, for one
// structural reason the negation door does not share:
//
//   ── NO HEAD TRUTH GATE (D-T2, the whole reason this is a separate door) ──────────────────────────────────
//   The main door's gate 1 (`deps.gate.gateHolds`) re-derives freshness of the node's grounding against the
//   CURRENT index (`driftDetect(grounding, axes)` at HEAD, compose.ts `buildGate`). A transition grounds on the
//   rev-PAIR `{unit@shaBefore, unit@shaAfter}` — content hashes from PAST revs — so at any future HEAD it AND-
//   folds to DRIFTED by construction, and the main gate would REJECT every legit transition. That is exactly
//   D-T2: a historical record is NEVER re-checked at HEAD. So this door replaces the HEAD-freshness gate with a
//   STRUCTURAL grounding check (`isGrounded` — the two rev entries carry non-empty subtreeHashes), which is the
//   honest "this fact is grounded (cites two real rev contents)" test, minus the freshness that does not apply.
//
// EVERYTHING ELSE IS THE MAIN/NEGATION DOOR VERBATIM — and that is the point of routing through it rather than
// a bespoke `commitProjection` (which silently dropped KNOW-11 authz + ARCH-9 anchor, the #87/ADR-0008 gate-less
// write class this door closes): gate 0 well-formedness, the SEAL-PROMOTE-CARRY origin strip, gate 0.5
// addressability, gate 2 AUTHZ (`actorInScope` on the unit's own scope), gate 2.1 ANCHOR (`scopeOwnsAnchor` —
// the declared scope must OWN the unit), and the atomic 2.25→3 commit (incumbent guard → advisory-class ratify →
// upsert+put). A transition carries NO `check`, so it ratifies on the advisory path; its identity is
// `transitionKey`, not a nodeKey-of-the-view.

import type { NodeKey, Tier } from "@atlas/contracts"
import type { CasObject } from "@atlas/kernel"
import { upsert, route, stage, ratify, isTier, isScope, transitionKey, isGrounded } from "@atlas/knowledge"
import type { Candidate, CurrentNode, TransitionNode, RatifyToken, WriteRequest } from "@atlas/knowledge"
import type { EmitOut } from "@atlas/tools"
import type { GovernedEmitDeps } from "./governed-emit.js"
import { addressOf, commitRefusalOf } from "./governed-emit-address.js"
import { actorInScope, scopeOwnsAnchor } from "./policy.js"
import { incumbentDecision } from "./governed-emit-incumbent.js"
import { ratifyCtxFor } from "./governed-emit-route.js"
import { deriveFastPathVerdicts } from "./governed-emit-gates.js"
import {
  REJECTED_CONTENDED,
  REJECTED_UNREADABLE_STORE,
  REJECTED_UNAUTHORIZED,
  REJECTED_UNAUTHORIZED_ANCHOR,
  REJECTED_UNRATIFIED,
} from "./governed-emit-reasons.js"
import { REJECTED_UNTRUSTED_STORE } from "./read-provenance.js"
import type { CommitResult } from "./sidecar.js"

/** The commit's own visible refusals (door stage 5) — never a silent no-op. Mirrors the negation door's. */
function commitRefusalFor(refusal: "contended" | "unreadable" | "untrusted"): string {
  return refusal === "contended"
    ? REJECTED_CONTENDED
    : refusal === "untrusted"
      ? REJECTED_UNTRUSTED_STORE
      : REJECTED_UNREADABLE_STORE
}

/** Malformed-transition refusal (fail-closed verdict) — the door's own gate-0 shape check on the caller's OWN
 *  payload, disclosing nothing about any incumbent. A transition whose identity triple (unitKey, shaBefore,
 *  shaAfter) is not well-formed, or whose grounding is not the two real rev entries, has no address to write. */
/** A transition is a PRODUCED fact (the 2-rev producer, `origin:'promoted'`), never AUTHORED. The door does
 *  not re-read the two revs, so it cannot verify a hand-supplied grounding — an authored `atlas emit
 *  {kind:'transition'}` is therefore refused OUTRIGHT (billy #234 re-review, defense-in-depth), closing the
 *  authored-forge surface rather than merely stripping the seal off it. */
export const REJECTED_AUTHORED_TRANSITION =
  "a transition is a produced fact (atlas transition), never authored — an authored transition emit carries a grounding the door cannot verify and is refused"

export const REJECTED_MALFORMED_TRANSITION =
  "malformed transition: a transition identity is the directed triple (unitKey, shaBefore, shaAfter) grounded " +
  "on the two rev-pair entries. unitKey/shaBefore/shaAfter must each be a non-empty string, shaBefore and " +
  "shaAfter must DIFFER (a zero interval is not a transition), and the grounding must carry the two rev anchors " +
  "(each with a non-empty subtreeHash). This reads the payload's OWN shape, refused before any gate"

/**
 * THE TRANSITION DOOR. Returns the frozen `EmitOut`. Fail-closed at every gate; on ADMIT it routes through the
 * SAME KNOW-15 upsert + KNOW-8 ratify machinery the main/negation doors use — restoring the KNOW-11 authz +
 * ARCH-9 anchor gates a direct `commitProjection` persist bypassed (#87/ADR-0008). It does NOT construct the
 * grounding (unlike the negation door): a transition's grounding IS the rev-pair `buildTransition` already put
 * on the node, and it is NOT re-checked at HEAD (D-T2). Pure of clock/random given a pure store/policy.
 */
export function emitTransition(deps: GovernedEmitDeps, raw: TransitionNode): EmitOut {
  // gate 0 — the payload fields the later gates route on (mirrors the main/negation doors' gate 0).
  const tier = raw.tier
  if (!isTier(tier)) return { emitted: false, rejected: REJECTED_MALFORMED_TRANSITION }
  const scope = raw.scope
  if (!isScope(scope)) return { emitted: false, rejected: REJECTED_MALFORMED_TRANSITION }
  const { unitKey, shaBefore, shaAfter } = raw
  // gate 0.1 WELL-FORMED IDENTITY — the same conditions `transitionKey` throws on, checked so the mint below
  // cannot throw out of this total door (a malformed triple has no address).
  if (
    typeof unitKey !== "string" ||
    unitKey.length === 0 ||
    typeof shaBefore !== "string" ||
    shaBefore.length === 0 ||
    typeof shaAfter !== "string" ||
    shaAfter.length === 0 ||
    shaBefore === shaAfter
  ) {
    return { emitted: false, rejected: REJECTED_MALFORMED_TRANSITION }
  }
  // gate 1 — GROUNDED BY CONSTRUCTION (D-T2), NOT FRESH-AT-HEAD. The two rev entries must carry non-empty
  // subtreeHashes (`isGrounded`), the structural validity a transition's rev-pair grounding has by construction.
  // The main door's HEAD-freshness gate is deliberately NOT run here — see the module header.
  if (!isGrounded(raw.grounding)) return { emitted: false, rejected: REJECTED_MALFORMED_TRANSITION }
  // gate 1.1 PRODUCED-ONLY (billy #234 re-review, defense-in-depth) — a transition is minted ONLY by the
  // trusted 2-rev producer (`origin:'promoted'`), which grounds it on a REAL git read. This door does not
  // re-read the revs, so an AUTHORED transition would carry a grounding it cannot verify; refuse it outright
  // (closing the authored-forge surface) rather than merely stripping its seal below.
  if (deps.origin !== "promoted") return { emitted: false, rejected: REJECTED_AUTHORED_TRANSITION }

  // The transition's address — minted off the identity triple (never trusted from the payload). Cannot throw:
  // gate 0.1 already cleared `transitionKey`'s own total-over-unknown guard.
  const key: NodeKey = transitionKey(unitKey, shaBefore, shaAfter)

  // Only a `promoted` transition reaches here (gate 1.1 refused every other origin), so the trusted producer's
  // `seal:'justified'` survives onto `node` (and the CAS bytes) — SEAL-PROMOTE-CARRY, the SAME law as the
  // main/negation doors, now enforced by refusal rather than by a strip.
  const node: TransitionNode = {
    ...raw,
    id: key, // MINTED, never trusted from the payload
    tier,
    scope,
  }

  // 0.5 ADDRESSABLE — mint the content address off the node, refusing (not throwing) a canonical-form violation.
  const addressed = addressOf(node)
  if (addressed.rejected !== undefined) return { emitted: false, rejected: addressed.rejected }
  const contentHash = addressed.hash

  // 2. AUTHZ — the actor must be in the transition's OWN scope (the unit's scope, stamped by the producer). This
  //    is the KNOW-11 gate the direct-persist path silently dropped: an actor not in the unit's scope is REFUSED.
  if (!actorInScope(deps.policy, deps.actor, scope)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED }
  // 2.1 ANCHOR — the declared scope must OWN the unit (ARCH-9): `scopeOwnsAnchor` refuses a scope the actor
  //     happens to own but that does not contain the unit, so authority cannot be borrowed from an unrelated dir.
  if (!scopeOwnsAnchor(deps.policy, scope, unitKey)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED_ANCHOR }

  // The advisory-CLASS candidate view (no `check`) the ratify gate reads. A transition ratifies on the advisory
  // path — its IDENTITY is `transitionKey`, NOT the nodeKey of this view.
  const candidateView = { ...node, slot: undefined } as unknown as Candidate

  // ── THE ATOMIC COMMIT (2.25 → 3) — ONE decision over ONE snapshot, re-run from scratch on a lost race, so it
  //    MUST carry the gates (the confused-deputy-by-retry rule, store.ts).
  let committed: CommitResult<EmitOut>
  try {
    committed = deps.store.commitProjection<EmitOut>((projection) => {
      // 2.25 INCUMBENT — keyed on `transitionKey`. Re-admitting the SAME sha-pair lands on the same address (an
      //      in-place UPDATE); a DIFFERENT sha-pair on the same unit is a DIFFERENT key (its own CREATE — the
      //      lineage supersession is derive-on-read, D-T3, never a write-time displacement here).
      const incumbent: CurrentNode | undefined = projection.current.get(String(key))
      let derivedTier: Tier | undefined
      if (incumbent !== undefined) {
        const decision = incumbentDecision(deps, incumbent, node, tier)
        if (decision.refusal !== undefined) return { out: { emitted: false, rejected: decision.refusal } }
        derivedTier = decision.derivedTier
      }
      // 2.5 RATIFY — advisory-class routing. A promoted transition faces the ratifier (the KNOW-18 fast path is
      //     removed for `promoted`, so the producer's authorized `ratifyToken` authorizes the commit — the SAME
      //     discipline the sound-relation derive leg rides). An authored one auto-accepts at T2 grounded.
      //     ARCH-D3b (INV-AUTH-15): DEVIVED verdicts — `lowRisk` from groundedness, `contested` from a
      //     conflicting incumbent (KNOW-18b).
      if (
        route(
          candidateView,
          ratifyCtxFor(derivedTier, deriveFastPathVerdicts(isGrounded(node.grounding), false), deps.origin),
        ) === "full-ratify"
      ) {
        const token: RatifyToken = { by: deps.ratifyToken ?? "" }
        if (!ratify(stage(candidateView), token).committed)
          return { out: { emitted: false, rejected: REJECTED_UNRATIFIED } }
      }
      // 3. UPSERT + PUT — family 'transition'; the row carries the rev-pair identity carriers + (scope, tier) +
      //    the seal (present only when the origin strip above KEPT it — a promoted write).
      const req: WriteRequest = {
        nodeKey: String(key),
        contentHash: contentHash as unknown as string,
        family: "transition",
        claimNorm: node.derivation ?? `transition on ${unitKey}`,
        primaryAnchor: unitKey, // the unit the transition is anchored at (bound at gate 2.1)
        unitKey,
        shaBefore,
        shaAfter,
        scope,
        tier,
        ...(node.seal !== undefined ? { seal: node.seal } : {}),
      }
      const next = upsert(projection, req).store
      return { out: { emitted: true, id: contentHash }, next, put: [node as unknown as CasObject] }
    })
  } catch (e) {
    return { emitted: false, rejected: commitRefusalOf(e) }
  }
  if (committed.settled) return committed.out
  return { emitted: false, rejected: commitRefusalFor(committed.refusal) }
}
