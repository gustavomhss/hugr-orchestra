// @atlas/adapter-io — src/governed-emit-gates.ts  (WP-10.A3.ADAPTER — the extracted, PURE gate chain)
//
// EXTRACTED from `governed-emit.ts`'s inline gate ladder (ADR-0004 CAMPAIGN-10.1). `governed-emit.ts` still
// OWNS the gate ORDER and the disclosure invariant its header states; this module answers, for each of the
// FOUR closed `GateName`s (`shape`|`truth`|`authz`|`ratify` — frozen at `@atlas/tools` `types.ts`), "does
// THIS bucket of the ladder pass, and if not, which structured `GateResult` does it return". Every function
// here is PURE and side-effect-free GIVEN its inputs: no clock, no random, no mutation, no throw on a
// malformed payload (that is the whole point of the shape gate, §below). A `DiskStore.get`/`loadProjection`
// read is treated as pure for this purpose — content-addressed and projection-snapshot reads are
// referentially transparent given the same store state, exactly as `governed-emit-incumbent.ts`'s own header
// already claims for `incumbentDecision`.
//
// ── THE SEAM (GateChain contract — OWNED BY THIS WP, consumed by A3.TOOLS and this door) ────────────────
// `evalShapeGate` / `evalTruthGate` / `evalAuthzGate` / `evalRatifyGate` are the four ladder buckets, folded
// by `runGateChain` below into ONE ordered `GateResult[]`. The governed door (`governed-emit.ts`) calls the
// SAME four functions, in the SAME order, but split across its atomic-commit boundary: `shape` and `truth`
// depend only on the payload/`at` and are evaluated ONCE before the transaction opens; `authz` and `ratify`
// depend on the INCUMBENT and are evaluated PER ATTEMPT inside `store.commitProjection`'s retry closure (so
// a retry never applies a decision taken against a stale snapshot — see that file's header). `runGateChain`
// is the store-LESS convenience fold a later `check` leg (A3.TOOLS) can call directly: it resolves the
// incumbent from a READ-ONLY `store.loadProjection()` snapshot instead of a live transaction, and folds all
// four buckets in one pass. Both callers share the identical four predicates, so a `check` verdict and the
// door's verdict cannot diverge on WHICH gate refused first — only on whether the store moved between the
// dry-run read and a concurrent write, which `check` is a DRY RUN and never claims to rule out.
//
// ── THE NEW GATE (AUTHOR-12 / #author-12) — `grounding` shape, folded into `shape` ────────────────────────
// Gate 0's own header (in `governed-emit.ts`) already validates `tier`/`scope`/`kind↔check` because nothing
// upstream does — `atlas emit` is `JSON.parse` + a cast, the MCP `node` schema is a bare `object`. It did
// NOT validate `grounding`: `isGrounded`/`driftDetect` (`@atlas/grounding`) read `grounding.entries.length`
// and each `entry.anchor.subtreeHash` assuming the shape is already there, so a payload that skipped either
// (`grounding` absent, `entries` missing/non-array, a `null` entry, an entry with no `anchor`) reached the
// TRUTH gate and THREW `Cannot read properties of undefined (reading 'length')` straight out of the write
// door — the exact 2026-07-25 dogfood failure (`docs/design/authoring-surface-study.md`). `groundingWellFormed`
// closes exactly that gap: it accepts anything `isGrounded`/`driftDetect` can read WITHOUT throwing (an
// empty `entries: []`, an entry with an empty-string `subtreeHash`, a non-string `qualifiedPath` — every one
// of those already reached a real HOLDS/NA verdict, never a throw) and refuses only the shapes that used to
// crash. It therefore refuses EXACTLY the malformed-payload space this door already implicitly refused (as
// an escaping throw) and nothing the door previously accepted (a computed HOLDS or a computed `ungrounded`).

import type { Hash, Tier } from "@atlas/contracts"
import { isTier, isScope, route, stage, ratify } from "@atlas/knowledge"
import type { Candidate, CurrentNode, GroundedFact, NodeFamily, RatifyToken, WriteOrigin } from "@atlas/knowledge"
import type { GateName, GateResult } from "@atlas/tools"
import type { TruthGate } from "@atlas/tools"
import {
  advisoryForUntrustedIntrinsic,
  familyOf,
  relationWellFormed,
  resolveWriteIdentity,
  stripForgedRelationSeal,
} from "./governed-emit-identity.js"
import { addressOf } from "./governed-emit-address.js"
import { actorInScope, scopeOwnsAnchor } from "./policy.js"
import type { AtlasPolicy } from "./policy.js"
import { incumbentDecision } from "./governed-emit-incumbent.js"
import { ratifyCtxFor } from "./governed-emit-route.js"
import type { FastPathVerdicts } from "./governed-emit-route.js"
import type { DiskStore } from "./store.js"
import {
  REJECTED_MALFORMED_TIER,
  REJECTED_MALFORMED_SCOPE,
  REJECTED_MALFORMED_FAMILY,
  REJECTED_MALFORMED_RELATION,
  REJECTED_MALFORMED_GROUNDING,
  REJECTED_UNGROUNDED,
  REJECTED_UNAUTHORIZED,
  REJECTED_UNAUTHORIZED_ANCHOR,
  REJECTED_UNRATIFIED,
} from "./governed-emit-reasons.js"

// ── the ordered contract (metadata — the four buckets, in the door's own precedence order) ───────────────
export const GATE_CHAIN: readonly GateName[] = ["shape", "truth", "authz", "ratify"]

// ── remedies (AUTHOR-12b — every refusal carries "what would fix it") ──────────────────────────────────
const REMEDY_TIER = "declare `tier` as one of `T0` | `T1` | `T2`"
const REMEDY_SCOPE = "declare `scope` as a non-empty string"
const REMEDY_FAMILY =
  "a `predicate` must carry a well-formed `check` (`index-query`|`assertion` with a string body); an `advisory` must carry none"
const REMEDY_RELATION =
  "state the relation with two distinct non-empty endpoint keys and a `relationKind` in the closed vocabulary (`depends-on`|`calls`)"
const REMEDY_GROUNDING =
  "supply `grounding: { entries: [...] }` — an array, each entry carrying an `anchor` object (an empty `entries: []` is well-formed; it will fail the TRUTH gate instead, which is expected for an ungrounded claim)"
const REMEDY_ADDRESS =
  "remove the unsupported value (a float / non-integer number, or another canonical-form violation) from the payload"
const REMEDY_TRUTH =
  "re-derive the citation against the CURRENT source tree, or re-anchor the claim to a unit that still exists"
const REMEDY_AUTHZ = "declare a `scope` the acting identity is granted in `.atlas/policy.json` (`authz.scopes`)"
const REMEDY_AUTHZ_ANCHOR =
  "declare the scope the admin policy's `authz.anchors` says owns this anchor, or ask an admin to rebind the prefix"
const REMEDY_AUTHZ_TARGET =
  "ask an admin to grant the acting identity authority in the scope the target node already lives in, or re-classification (task #88) if the target itself needs to move"
const REMEDY_RATIFY =
  "set `ATLAS_RATIFY_TOKEN` to a valid ratifier (a T0 write additionally requires the `billy` token)"

// ── SHAPE (gate 0 / 0.1 / 0.5, plus the NEW grounding check — payload-only, discloses nothing) ────────────

/** `grounding` must be an object carrying an `entries` ARRAY, each entry carrying an `anchor` OBJECT. This
 *  is exactly the boundary `isGrounded`/`driftDetect` (`@atlas/grounding`) need to read `entries.length` and
 *  `entry.anchor.subtreeHash`/`entry.anchor.qualifiedPath` WITHOUT throwing — nothing narrower, nothing
 *  wider. A malformed `subtreeHash`/`qualifiedPath` TYPE is left alone here (both are read via a `typeof`
 *  guard downstream and correctly resolve to `ungrounded`, never a throw). */
export function groundingWellFormed(node: GroundedFact): boolean {
  const g = (node as { grounding?: unknown }).grounding
  if (typeof g !== "object" || g === null) return false
  const entries = (g as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return false
  return entries.every((e: unknown) => {
    if (typeof e !== "object" || e === null) return false
    const anchor = (e as { anchor?: unknown }).anchor
    return typeof anchor === "object" && anchor !== null
  })
}

/** The SHAPE stage's outcome: `pass:false` carries the structured refusal; `pass:true` carries the ONE
 *  snapshot every later gate reads (`node`/`tier`/`scope`/`family`/`contentHash`) — read ONCE here (the
 *  TOCTOU note in `governed-emit.ts`'s header) and threaded through unchanged. */
export type ShapeVerdict =
  | {
      readonly pass: true
      readonly node: GroundedFact
      readonly tier: Tier
      readonly scope: string
      readonly family: NodeFamily
      readonly contentHash: Hash
    }
  | { readonly pass: false; readonly result: GateResult }

/**
 * Evaluate the SHAPE bucket — `tier` → `scope` → the operator-seal strip → the forged-relation-seal strip →
 * `kind↔check` family → relation well-formedness → addressability → the NEW grounding well-formedness, in
 * EXACTLY that order. Every check up through addressability is unchanged from the door's prior inline
 * sequence; the grounding check is appended LAST, after ALL of them, immediately before where the TRUTH
 * gate used to throw. LAST is load-bearing, not just "sits late": a payload malformed BOTH in `grounding`
 * AND in a way `addressOf` already refuses (e.g. a float alongside an absent `grounding.entries`) must keep
 * getting addressability's `canonical-form violation` — the reason the door gave it before this gate
 * existed — not `malformed grounding`. `addressOf` itself never throws on a malformed grounding regardless
 * of order (KERNEL-8 excludes `grounding` from the canonical preimage), so nothing FORCES this order for
 * addressability's own sake; it is forced by "no gate decision may change" — an earlier position here would
 * silently swap which reason such a doubly-malformed payload gets, which is a decision change even though
 * `emitted` stays `false` on both sides.
 */
export function evalShapeGate(raw: GroundedFact, origin: WriteOrigin | undefined): ShapeVerdict {
  const tier = raw.tier
  if (!isTier(tier)) {
    return { pass: false, result: { gate: "shape", pass: false, reason: REJECTED_MALFORMED_TIER, remedy: REMEDY_TIER } }
  }
  const scope = raw.scope
  if (!isScope(scope)) {
    return {
      pass: false,
      result: { gate: "shape", pass: false, reason: REJECTED_MALFORMED_SCOPE, remedy: REMEDY_SCOPE },
    }
  }
  // SEAL IS TRUSTED IFF THE WRITE IS PROMOTE-ORIGIN — see `governed-emit.ts`'s header for the full rationale;
  // unchanged verbatim from the door's prior inline strip.
  const { seal: _rejectedOperatorSeal, ...rawNoSeal } = raw
  const nodeWithSeal: GroundedFact = origin === "promoted" ? { ...raw, tier, scope } : { ...rawNoSeal, tier, scope }
  // 0.05 FORGED RELATION SEAL (#99 ADR-0018, decision D-d) — unchanged verbatim.
  const node: GroundedFact = advisoryForUntrustedIntrinsic(stripForgedRelationSeal(nodeWithSeal))

  const family = familyOf(node)
  if (family === undefined) {
    return {
      pass: false,
      result: { gate: "shape", pass: false, reason: REJECTED_MALFORMED_FAMILY, remedy: REMEDY_FAMILY },
    }
  }
  // 0.1 WELL-FORMED RELATION (ADR-0015 D2) — unchanged verbatim.
  if (!relationWellFormed(node)) {
    return {
      pass: false,
      result: { gate: "shape", pass: false, reason: REJECTED_MALFORMED_RELATION, remedy: REMEDY_RELATION },
    }
  }
  // 0.5 ADDRESSABLE — unchanged verbatim, and it MUST run BEFORE the new grounding check below: `addressOf`
  //     excludes `grounding` from canonicalization (KERNEL-8), so it never throws on a malformed grounding
  //     regardless of order — but a payload malformed in BOTH ways (an unaddressable float AND a malformed
  //     `grounding`) has to keep getting the SAME reason the OLD door gave it (`canonical-form violation`),
  //     because that is the door that ran first before this WP existed. Running the grounding check first
  //     would answer such a payload with `malformed grounding` instead — same `emitted:false`, a DIFFERENT
  //     `rejected` string, which is exactly the "no gate decision may change" law this WP is bound by.
  const addressed = addressOf(node)
  if (addressed.rejected !== undefined) {
    return { pass: false, result: { gate: "shape", pass: false, reason: addressed.rejected, remedy: REMEDY_ADDRESS } }
  }
  // NEW — WELL-FORMED GROUNDING (AUTHOR-12 / #author-12), LAST in the shape bucket — immediately before the
  //     TRUTH gate, where the raw TypeError used to escape. Sitting after EVERY prior shape check (including
  //     addressability) means an input a prior check already refused for a DIFFERENT reason keeps getting
  //     THAT reason, byte-identical to before — see the ordering note above.
  if (!groundingWellFormed(node)) {
    return {
      pass: false,
      result: { gate: "shape", pass: false, reason: REJECTED_MALFORMED_GROUNDING, remedy: REMEDY_GROUNDING },
    }
  }
  return { pass: true, node, tier, scope, family, contentHash: addressed.hash }
}

// ── TRUTH (gate 1) ──────────────────────────────────────────────────────────────────────────────────────

/** Evaluate the TRUTH bucket — re-derive the citation; a non-`HOLDS` verdict fails closed. Unchanged. */
export function evalTruthGate(node: GroundedFact, at: Hash, gate: TruthGate): GateResult {
  if (gate.gateHolds(node, at) !== "HOLDS") {
    return { gate: "truth", pass: false, reason: REJECTED_UNGROUNDED, remedy: REMEDY_TRUTH }
  }
  return { gate: "truth", pass: true }
}

// ── AUTHZ (gate 2 / 2.1 / 2.25) ─────────────────────────────────────────────────────────────────────────

/** The AUTHZ stage's outcome: `pass:false` carries the structured refusal; `pass:true` carries the ARCH-9
 *  class DERIVED from the incumbent (`undefined` on a CREATE, or a carrier-less legacy row — see
 *  `governed-emit-incumbent.ts`), which the RATIFY stage needs. */
export type AuthzVerdict =
  | { readonly pass: true; readonly derivedTier?: Tier }
  | { readonly pass: false; readonly result: GateResult }

export interface AuthzInput {
  readonly policy: AtlasPolicy
  readonly actor: string
  readonly scope: string
  readonly tier: Tier
  readonly node: GroundedFact
  readonly candidateView: Candidate
  readonly primaryAnchor: string
  readonly incumbent: CurrentNode | undefined
  readonly store: DiskStore
}

/**
 * Evaluate the AUTHZ bucket — actor-in-declared-scope (2) → declared-scope-owns-anchor (2.1) →
 * incumbent-derived guard, FOUR sub-refusals (2.25), in EXACTLY that order. `incumbent` is a PARAMETER,
 * never resolved here: the door resolves it live, per commit attempt, inside its retry closure; a store-less
 * `check` resolves it once from a read-only snapshot. Both feed the SAME function.
 */
export function evalAuthzGate(input: AuthzInput): AuthzVerdict {
  if (!actorInScope(input.policy, input.actor, input.scope)) {
    return { pass: false, result: { gate: "authz", pass: false, reason: REJECTED_UNAUTHORIZED, remedy: REMEDY_AUTHZ } }
  }
  if (!scopeOwnsAnchor(input.policy, input.scope, input.primaryAnchor)) {
    return {
      pass: false,
      result: { gate: "authz", pass: false, reason: REJECTED_UNAUTHORIZED_ANCHOR, remedy: REMEDY_AUTHZ_ANCHOR },
    }
  }
  if (input.incumbent !== undefined) {
    const decision = incumbentDecision(
      { store: input.store, policy: input.policy, actor: input.actor },
      input.incumbent,
      input.node,
      input.tier,
    )
    if (decision.refusal !== undefined) {
      return {
        pass: false,
        result: { gate: "authz", pass: false, reason: decision.refusal, remedy: REMEDY_AUTHZ_TARGET },
      }
    }
    return { pass: true, ...(decision.derivedTier !== undefined ? { derivedTier: decision.derivedTier } : {}) }
  }
  return { pass: true }
}

// ── RATIFY (gate 2.5) ───────────────────────────────────────────────────────────────────────────────────

export interface RatifyInput {
  readonly candidateView: Candidate
  readonly derivedTier: Tier | undefined
  readonly origin: WriteOrigin | undefined
  readonly ratifyToken: string | undefined
  /** ARCH-D3b (INV-AUTH-15) — the door-derived fast-path verdicts. `lowRisk` = the candidate cleared the
   *  TRUTH gate (derived from `truth.pass` above); `contested` = a CONFLICTING NODE exists (KNOW-18b) —
   *  the incumbent at the target `(anchor, slot)` carries DIFFERENT bytes than this write (read off the
   *  projection snapshot, the same seam `runGateChain` and the door both use, so check≡emit parity holds).
   *  REQUIRED — never defaulted; ARCH-9 forbids a constant that pins the gate open. */
  readonly verdicts: FastPathVerdicts
}

/** Derive `FastPathVerdicts` (declared in `governed-emit-route.ts`) from state the door ALREADY observes.
 *  `truthCleared` is the result of `evalTruthGate` (`truth.pass`) on the doors that have one, else
 *  groundedness; `contestedFlag` is supplied by the caller from its own observation of a conflicting
 *  incumbent / observed collision. Shared by the governed door and the store-less `check`, so the two
 *  cannot diverge on these verdicts. */
export function deriveFastPathVerdicts(truthCleared: boolean, contestedFlag: boolean): FastPathVerdicts {
  return { lowRisk: truthCleared, contested: contestedFlag }
}

/** Evaluate the RATIFY bucket — the KNOW-8/KNOW-18 tier-ratification gate. The fast-path verdicts are
 *  DERIVED (INV-AUTH-15), never a module constant. */
export function evalRatifyGate(input: RatifyInput): GateResult {
  if (route(input.candidateView, ratifyCtxFor(input.derivedTier, input.verdicts, input.origin)) === "full-ratify") {
    const token: RatifyToken = { by: input.ratifyToken ?? "" }
    if (!ratify(stage(input.candidateView), token).committed) {
      return { gate: "ratify", pass: false, reason: REJECTED_UNRATIFIED, remedy: REMEDY_RATIFY }
    }
  }
  return { gate: "ratify", pass: true }
}

// ── the store-less fold (the future `check` leg's entry point — A3.TOOLS) ─────────────────────────────────

export interface GateChainDeps {
  readonly store: DiskStore
  readonly gate: TruthGate
  readonly policy: AtlasPolicy
  readonly actor: string
  readonly origin?: WriteOrigin
  readonly ratifyToken?: string
}

export interface GateChainOut {
  /** Every gate EVALUATED, in door order, stopping at the first failure (mirrors `CheckOut.gates`). */
  readonly gates: readonly GateResult[]
  readonly firstFailure?: GateResult
  readonly wouldEmit: boolean
}

/**
 * Fold the WHOLE gate chain — shape → truth → authz → ratify — over a READ-ONLY store snapshot. This is the
 * store-LESS entry point AUTHOR-11 / REQ-AUTH-11a asks the `check` leg to run: it resolves the incumbent
 * from `store.loadProjection()` (a snapshot read, no transaction) rather than a live commit attempt, so it
 * NEVER writes. It calls the identical four predicates the governed door calls, in the identical order, so
 * a `check` verdict cannot diverge from the door's on WHICH gate refuses first — only a store mutation
 * BETWEEN the dry-run read and a subsequent real `emit` could move the incumbent, which a dry run cannot
 * and does not claim to rule out (AUTHOR-11's "same rev" precondition).
 */
export function runGateChain(raw: GroundedFact, at: Hash, deps: GateChainDeps): GateChainOut {
  const gates: GateResult[] = []

  const shape = evalShapeGate(raw, deps.origin)
  if (!shape.pass) {
    gates.push(shape.result)
    return { gates, firstFailure: shape.result, wouldEmit: false }
  }
  gates.push({ gate: "shape", pass: true })

  const truth = evalTruthGate(shape.node, at, deps.gate)
  gates.push(truth)
  if (!truth.pass) return { gates, firstFailure: truth, wouldEmit: false }

  const candidateView = {
    ...shape.node,
    slot: shape.node.kind === "advisory" || shape.node.kind === "predicate" ? shape.node.predicateSlot : undefined,
  } as unknown as Candidate
  const { primaryAnchor, targetKey } = resolveWriteIdentity(shape.node, candidateView)
  const incumbent = deps.store.loadProjection()?.current.get(targetKey)

  const authz = evalAuthzGate({
    policy: deps.policy,
    actor: deps.actor,
    scope: shape.scope,
    tier: shape.tier,
    node: shape.node,
    candidateView,
    primaryAnchor,
    incumbent,
    store: deps.store,
  })
  if (!authz.pass) {
    gates.push(authz.result)
    return { gates, firstFailure: authz.result, wouldEmit: false }
  }
  gates.push({ gate: "authz", pass: true })

  const ratifyResult = evalRatifyGate({
    candidateView,
    derivedTier: authz.derivedTier,
    origin: deps.origin,
    ratifyToken: deps.ratifyToken,
    // ARCH-D3b (INV-AUTH-15): DEVIVED verdicts — lowRisk from the cleared truth gate; the store-less
    // `check` never observes a commit collision, so `contested` is `false` here (dry-run: nothing committed
    // to conflict with). The governed door derives it from the real incumbent bytes.
    verdicts: deriveFastPathVerdicts(truth.pass, false),
  })
  gates.push(ratifyResult)
  return ratifyResult.pass ? { gates, wouldEmit: true } : { gates, firstFailure: ratifyResult, wouldEmit: false }
}
