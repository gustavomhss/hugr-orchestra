// @atlas/adapter-io — src/governed-emit-test-vacuity.ts  (#95 · ADR-0015 D5 — THE TEST-VACUITY DOOR)
//
// A test-vacuity fact is a single-anchor PROVEN AST-shape record ("named test T in unit U has all its
// assertion-shaped calls inside catch clauses and no assertion-count guard"). Like a negation/transition it
// rides the SAME governed emit surface (`createGovernedEmit`) — the door's `emit` branches here on
// `kind:'test-vacuity'`, BEFORE gate 0 — but its gate ladder is the RELATION ladder, NOT transition's:
//
//   ── THE HEAD TRUTH GATE APPLIES (the whole reason this differs from the transition door) ──────────────────
//   A transition grounds on PAST revs (D-T2), so its door replaces the HEAD-freshness gate with a structural
//   `isGrounded` check. A test-vacuity fact grounds on the CURRENT test file at HEAD (its ONE grounding entry
//   anchors the unit, whose `subtreeHash` is re-derivable now), so the MAIN door's HEAD truth gate applies
//   normally: `deps.gate.gateHolds(node, at)` must return `HOLDS` or the write is refused `ungrounded`. This is
//   the relation proven-door's gate 1, restored here — a test-vacuity that no longer grounds at HEAD is refused.
//
//   ── PRODUCED-ONLY (the forge guard the relation door does NOT need) ───────────────────────────────────────
//   A proven relation's witness is a `depends-on` triple the read-side re-derives, so the main door can strip a
//   SHAPE-forged relation seal (`stripForgedRelationSeal`) and still catch a content forgery at reverify. A
//   test-vacuity witness (`{shape, testName}`) is NOT independently re-derivable AT THE DOOR — the door has no
//   tree-sitter — so, exactly as the transition door does, this door refuses an AUTHORED test-vacuity OUTRIGHT:
//   only the trusted `origin:'promoted'` producer (which ran `scanTestVacuity` over a real HEAD read) may write
//   one. That closes the authored-forge surface rather than persisting a seal it cannot verify.
//
// EVERYTHING ELSE IS THE MAIN/TRANSITION DOOR VERBATIM — gate 0 well-formedness, gate 0.1 identity, gate 2
// AUTHZ (`actorInScope` on the unit's own scope), gate 2.1 ANCHOR (`scopeOwnsAnchor` — the declared scope must
// OWN the unit), and the atomic 2.25→3 commit (incumbent guard → advisory-class ratify → upsert+put). A
// test-vacuity carries NO `check`, so it ratifies on the advisory path; its identity is `testVacuityKey`.

import type { Hash, NodeKey, Tier } from "@atlas/contracts"
import type { CasObject } from "@atlas/kernel"
import { upsert, route, stage, ratify, isTier, isScope, testVacuityKey, isGrounded } from "@atlas/knowledge"
import type { Candidate, CurrentNode, TestVacuityNode, RatifyToken, WriteRequest } from "@atlas/knowledge"
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
  REJECTED_UNGROUNDED,
  REJECTED_UNRATIFIED,
} from "./governed-emit-reasons.js"
import { REJECTED_UNTRUSTED_STORE } from "./read-provenance.js"
import type { CommitResult } from "./sidecar.js"

/** The commit's own visible refusals (door stage 5) — never a silent no-op. Mirrors the transition door's. */
function commitRefusalFor(refusal: "contended" | "unreadable" | "untrusted"): string {
  return refusal === "contended"
    ? REJECTED_CONTENDED
    : refusal === "untrusted"
      ? REJECTED_UNTRUSTED_STORE
      : REJECTED_UNREADABLE_STORE
}

/** A test-vacuity is a PRODUCED fact (the shipped producer, `origin:'promoted'`), never AUTHORED. The door does
 *  not re-parse the unit, so it cannot verify a hand-supplied `{shape,testName}` witness — an authored
 *  `atlas emit {kind:'test-vacuity'}` is therefore refused OUTRIGHT (the forge guard), closing the surface
 *  rather than persisting a seal it cannot re-derive. Mirrors `REJECTED_AUTHORED_TRANSITION`. */
export const REJECTED_AUTHORED_TEST_VACUITY =
  "a test-vacuity is a produced fact (the shipped test-vacuity producer), never authored — an authored test-vacuity emit carries a witness the door cannot re-derive and is refused"

/** Malformed-test-vacuity refusal (fail-closed verdict) — the door's own gate-0 shape check on the caller's OWN
 *  payload, disclosing nothing about any incumbent. A test-vacuity whose identity pair (unitKey, testName) is
 *  not well-formed has no address to write. Mirrors `REJECTED_MALFORMED_TRANSITION`. */
export const REJECTED_MALFORMED_TEST_VACUITY =
  "malformed test-vacuity: the identity is the pair (unitKey, testName). unitKey and testName must each be a " +
  "non-empty string, and shape a non-empty string. This reads the payload's OWN shape, refused before any gate"

/**
 * THE TEST-VACUITY DOOR. Returns the frozen `EmitOut`. Fail-closed at every gate; on ADMIT it routes through the
 * SAME KNOW-15 upsert + KNOW-8 ratify machinery the main/transition doors use — restoring the KNOW-11 authz +
 * ARCH-9 anchor gates a direct `commitProjection` persist would bypass (#87/ADR-0008). UNLIKE the transition
 * door, it RUNS the HEAD truth gate (`deps.gate.gateHolds(node, at)`): a test-vacuity grounds on the current
 * test file, so a stale grounding is refused `ungrounded`. Pure of clock/random given a pure store/policy/gate.
 */
export function emitTestVacuity(deps: GovernedEmitDeps, raw: TestVacuityNode, at: Hash): EmitOut {
  // gate 0 — the payload fields the later gates route on (mirrors the main/transition doors' gate 0).
  const tier = raw.tier
  if (!isTier(tier)) return { emitted: false, rejected: REJECTED_MALFORMED_TEST_VACUITY }
  const scope = raw.scope
  if (!isScope(scope)) return { emitted: false, rejected: REJECTED_MALFORMED_TEST_VACUITY }
  const { unitKey, testName, shape } = raw
  // gate 0.1 WELL-FORMED IDENTITY — the same conditions `testVacuityKey` throws on, checked so the mint below
  // cannot throw out of this total door (a malformed pair has no address).
  if (
    typeof unitKey !== "string" ||
    unitKey.length === 0 ||
    typeof testName !== "string" ||
    testName.length === 0 ||
    typeof shape !== "string" ||
    shape.length === 0
  ) {
    return { emitted: false, rejected: REJECTED_MALFORMED_TEST_VACUITY }
  }
  // gate 1 — THE HEAD TRUTH GATE (the relation ladder, NOT transition's skip). A test-vacuity grounds on the
  // CURRENT test file, so `gateHolds` re-derives its unit-anchor citation at HEAD; a non-HOLDS verdict is refused.
  if (deps.gate.gateHolds(raw, at) !== "HOLDS") return { emitted: false, rejected: REJECTED_UNGROUNDED }
  // gate 1.1 PRODUCED-ONLY (the forge guard) — a test-vacuity is minted ONLY by the trusted producer
  // (`origin:'promoted'`), which ran `scanTestVacuity` over a real HEAD read. This door does not re-parse the
  // unit, so an AUTHORED test-vacuity would carry a witness it cannot re-derive; refuse it outright.
  if (deps.origin !== "promoted") return { emitted: false, rejected: REJECTED_AUTHORED_TEST_VACUITY }

  // The address — minted off the identity pair (never trusted from the payload). Cannot throw: gate 0.1 already
  // cleared `testVacuityKey`'s own total-over-unknown guard.
  const key: NodeKey = testVacuityKey(unitKey, testName)

  // Only a `promoted` test-vacuity reaches here (gate 1.1 refused every other origin), so the trusted producer's
  // `seal:'proven'` survives onto `node` — SEAL-PROMOTE-CARRY, the SAME law as the main/transition doors.
  const node: TestVacuityNode = { ...raw, id: key, tier, scope }

  // 0.5 ADDRESSABLE — mint the content address off the node, refusing (not throwing) a canonical-form violation.
  const addressed = addressOf(node)
  if (addressed.rejected !== undefined) return { emitted: false, rejected: addressed.rejected }
  const contentHash = addressed.hash

  // 2. AUTHZ — the actor must be in the test-vacuity's OWN scope (the unit's scope, stamped by the producer).
  if (!actorInScope(deps.policy, deps.actor, scope)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED }
  // 2.1 ANCHOR — the declared scope must OWN the unit (ARCH-9): authority cannot be borrowed from an unrelated dir.
  if (!scopeOwnsAnchor(deps.policy, scope, unitKey)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED_ANCHOR }

  // The advisory-CLASS candidate view (no `check`) the ratify gate reads. A test-vacuity ratifies on the advisory
  // path — its IDENTITY is `testVacuityKey`, NOT the nodeKey of this view.
  const candidateView = { ...node, slot: undefined } as unknown as Candidate

  // ── THE ATOMIC COMMIT (2.25 → 3) — ONE decision over ONE snapshot, re-run from scratch on a lost race, so it
  //    MUST carry the gates (the confused-deputy-by-retry rule, store.ts).
  let committed: CommitResult<EmitOut>
  try {
    committed = deps.store.commitProjection<EmitOut>((projection) => {
      // 2.25 INCUMBENT — keyed on `testVacuityKey`. Re-admitting the SAME (unit,test) lands on the same address
      //      (an in-place UPDATE); a DIFFERENT test on the same unit is a DIFFERENT key (its own CREATE).
      const incumbent: CurrentNode | undefined = projection.current.get(String(key))
      let derivedTier: Tier | undefined
      if (incumbent !== undefined) {
        const decision = incumbentDecision(deps, incumbent, node, tier)
        if (decision.refusal !== undefined) return { out: { emitted: false, rejected: decision.refusal } }
        derivedTier = decision.derivedTier
      }
      // 2.5 RATIFY — advisory-class routing (no `check`). A promoted test-vacuity faces the ratifier (the KNOW-18
      //     fast path is removed for `promoted`), so the producer's authorized `ratifyToken` authorizes the commit.
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
      // 3. UPSERT + PUT — family 'test-vacuity'; the row carries the (unitKey, testName, shape) identity carriers
      //    + (scope, tier) + the seal (present because the promoted origin above KEPT it).
      const req: WriteRequest = {
        nodeKey: String(key),
        contentHash: contentHash as unknown as string,
        family: "test-vacuity",
        claimNorm: `${shape} test '${testName}' @ ${unitKey}`,
        primaryAnchor: unitKey, // the unit the test-vacuity is anchored at (bound at gate 2.1)
        unitKey,
        testName,
        shape,
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
