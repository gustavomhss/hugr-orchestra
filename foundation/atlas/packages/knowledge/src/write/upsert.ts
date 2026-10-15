// @atlas/knowledge — src/write/upsert.ts  (WP-5.13-a.KNOW · EPIC-13-a — the store-projection REDUCER)
//
// SPLIT OUT OF `router.ts` (which was at the 400-LOC godfile ceiling) along the section boundary that file
// already drew for itself — the banner below is verbatim where it stood. The seam is real, not a line-count
// convenience: everything here is a REDUCER over a store projection (a data structure and the fold that
// advances it), while `router.ts` keeps the pure DECISION (`routeWrite`) and the IDENTITY legs. The identity
// legs deliberately did NOT move — the RouterApi header records a LEAD-RATIFIED decision that they live in
// `router.ts` ("no separate anchor.ts"), and a LOC ceiling is not a licence to reverse a ratified placement.
//
// NOTHING here changed in the move: `upsert`, `routeWrite`'s consumers, the projection types and their
// carry-forward semantics are byte-identical to their pre-split form. `router.ts` re-exports this module, so
// the package surface (and every `../src/write/router.js` import in the existing tests) is unchanged.

import type { Tier } from "@atlas/contracts"
import type { ClaimProvenance, PredicateSlot } from "../types.js"
// ADR-0015 D3 / #99b — the honest-abstention record (NOT a GroundedFact; it asserts nothing). Type-only,
// same package. Carried on the projection as a sibling to `current` (see StoreProjection.abstained below).
import type { AbstainedRecord } from "../negation-types.js"
import type { NodeFamily, RouteInputs, WriteDecision } from "./router.js"
import { isKnownSlot, routeWrite } from "./router.js"
// The KNOW-10/KNOW-15i closed-slot REFUSAL (#152) — extracted at the LOC ceiling. Read that file's header
// before changing the gate below: it carries the measurement, the harm, and the ABSENT-slot decision.
import { ClosedSlotError } from "./closed-slot.js"
import { isTier, isWeakerTier } from "../ratify/tier.js"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The upsert reducer — applies a routed write to a store PROJECTION, so "every write is an upsert"
// (one current node per key) is a STRUCTURAL consequence, not merely asserted. The projection is a
// minimal current-node carrier (nodeKey → the ONE current node) + the append-only CAS retention
// set; it is session-internal state (cf. index/src/fold.ts), NOT the OWNER-DEFINE composed store.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// The projection ROW shapes — `WriteRequest` and `CurrentNode` — were EXTRACTED to `projection-types.ts` at
// the 400-LOC godfile ceiling (#195 b added the `answerRef` carrier to both).
// Re-exported here so the package surface and every existing `../write/upsert.js` / `router.js` import is
// byte-identical. `StoreProjection`/`UpsertResult` and the reducer itself stay in this file. Imported (not
// just re-exported) so the reducer body below can still name them.
import type { WriteRequest, CurrentNode } from "./projection-types.js"
export type { WriteRequest, CurrentNode }

/** The territory store projection: the one-current-node map + the append-only CAS retention set. */
export interface StoreProjection {
  readonly current: ReadonlyMap<string, CurrentNode> // nodeKey → the ONE current node
  readonly cas: ReadonlySet<string> // retained contentHashes — prior versions stay addressable
  // ── ABSTENTION ledger (ADDITIVE, OPTIONAL — ADR-0015 D3 / #99b) — the N2↔N3 SEAM (frozen commit 1be6ea6).
  //    An `AbstainedRecord` is NOT a fact (asserts nothing) so it must NOT enter `current`; it lives here,
  //    keyed by `negationKey` (the address the negation would take, §2). Writer (N2 door) writes via
  //    `commitProjection` NOT `upsert`, deletes the key on a later admitted negation (§2 supersede), and
  //    round-trips it in adapter-io store.ts (else #202's observability fails). Reader (N3) folds
  //    `abstained.values()`. Additive/optional (the `builtAt` discipline); absent ⇒ none; never a nodeKey.
  readonly abstained?: ReadonlyMap<string, AbstainedRecord>
  // ── freshness watermark (ADDITIVE, OPTIONAL — N11) — the git HEAD sha this projection's stored per-fact
  //    freshness was last computed against (stamped at persist). A query cheaply compares it to current HEAD:
  //    if they differ, the read is BEHIND HEAD ⇒ its freshness is unverified ⇒ honestly `stale` (never a
  //    silent "fresh"). Absent (old projections / never-persisted) ⇒ "unknown", treated conservatively by the
  //    reader (it only asserts behind-HEAD when it can PROVE it: both this AND live HEAD are known and differ).
  readonly builtAt?: string
}

/** An empty store projection. */
export function emptyStore(): StoreProjection {
  return { current: new Map(), cas: new Set() }
}

/** The outcome of one upsert: the route taken + the next store projection (pure — inputs untouched). */
export interface UpsertResult {
  readonly decision: WriteDecision
  readonly store: StoreProjection
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARCH-10 — THE INCUMBENT'S AUTHORITY, ENFORCED WHERE THE DISPLACEMENT PHYSICALLY HAPPENS (ADR-0010)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ADR-0007 established the rule — authority is derived from the RESOURCE, never asserted by the request —
// and implemented it in ONE caller: `adapter-io/governed-emit.ts` §2.25, which resolves the incumbent and
// refuses a downgrade or a relocation BEFORE calling this reducer. That is a correct door. It is not a
// correct invariant, because nothing in `upsert` knew the rule existed: the UPDATE branch replaced
// `contentHash` in place, with no `supersededBy`, for any caller at all. So the safety of a billy-ratified
// `T0` node was a property of one caller's GATE ORDER — of a check happening to run before this line —
// rather than a property of the write. Reproduced against the built packages at `572d391`: a `T2` advisory
// at the (anchor, slot) of a ratified `T0` fact routed UPDATE and the node came back pointing at the `T2`
// bytes with `supersededBy: undefined`. Since `atlas-query` bounds `T2` OUT of reads (TOOLS-6), that node
// then stops appearing for its scope with no refusal on any transport — silent disappearance, which for a
// knowledge product is the worst failure mode there is.
//
// The rule therefore lives HERE TOO, and the duplication is deliberate: the door refuses EARLIER and with
// more context (it can read the CAS bytes, so it also covers a row that carries no class), while this gate
// refuses UNCONDITIONALLY, for every present and future caller of the reducer. Neither is redundant — one is
// a policy check, the other is an invariant of the data structure. `mine` and `genesis` reach knowledge by
// other paths today; the next caller that reaches THIS one inherits the rule for free instead of having to
// rediscover ADR-0007.
//
// WHY A THROW AND NOT A `REJECT` ROUTE. `WriteDecision` already enumerates `REJECT`, and returning it with an
// unchanged projection was the tidier-looking option. It is unsafe here: `governed-emit.ts` calls
// `upsert(projection, req).store` and DISCARDS the decision, so a returned refusal would have persisted
// nothing while the door reported `emitted: true` — a caller told its write succeeded when it did not, which
// is the same silent-failure class this guard exists to prevent, moved one layer up. A throw cannot be
// ignored by an existing caller. It also follows the precedent this package already set for a write-door
// refusal: `DegenerateAnchorError` (router.ts), a NAMED class the composed doors convert into a structured
// fail-closed verdict, never a bare `Error` and never a raw `TypeError`.

/** The two ways a write can try to take authority it does not hold. A DISCRIMINANT — the refusal is asserted
 *  on this value, never on a substring of the message. That is not stylistic: the refusal prose in this repo
 *  quotes other refusal constants BY NAME, so a `toContain('governance-downgrade')` assertion is also
 *  satisfied by a message that merely mentions the downgrade rule, and cannot say WHICH gate refused. */
export type GovernanceAuthorityReason = "governance-downgrade" | "governance-relocation"

const AUTHORITY_REASON_TEXT: Readonly<Record<GovernanceAuthorityReason, string>> = {
  "governance-downgrade":
    "governance-downgrade: this write declares a WEAKER governance class than the node it lands on. The " +
    "routing identity (hash of primary anchor and slot) carries no class, so the node this write displaces " +
    "may have been admitted under a stricter gate than the one this write would face. Lowering a class is a " +
    "re-classification (ADR-0009) — an explicit, separately authorized act — never a side effect of emitting " +
    "a fact. Re-state the class the node already carries, or raise it",
  "governance-relocation":
    "governance-relocation: this write declares a scope other than the one the node it lands on already " +
    "lives in. A node moving between scopes evicts every co-owner who is not in the destination, and the " +
    "routing identity carries no scope, so nothing else would have caught it. Relocation is the same class " +
    "of act as lowering a class and is settled the same way (ADR-0009): explicit and separately authorized",
}

/** The refusal, as a THROWN value carrying a machine-readable {@link GovernanceAuthorityReason}. */
export class GovernanceAuthorityError extends Error {
  readonly reason: GovernanceAuthorityReason
  constructor(reason: GovernanceAuthorityReason) {
    super(AUTHORITY_REASON_TEXT[reason])
    this.name = "GovernanceAuthorityError"
    this.reason = reason
  }
}

/**
 * Does `req` try to take authority the incumbent does not grant it? Returns the reason, or `undefined`.
 *
 * AUTHORITY COMES FROM THE INCUMBENT, AND ONLY AS FAR AS THE INCUMBENT DECLARES IT. Each half gates only
 * when the ROW carries that half: a row minted before the ADR-0007 carrier existed declares nothing, so
 * there is nothing here to derive authority from and this gate stands aside rather than bricking every
 * pre-carrier node (the door's CAS-bytes fallback is what covers that shape, and `SCN-AUTH-5` pins the
 * limit as a stated property instead of leaving it to be mistaken for coverage).
 *
 * Where the row DOES declare a half, the write must match it: `isWeakerTier` is total over `unknown` and
 * treats an off-lattice or ABSENT declared class as weaker, so a write cannot dodge the class comparison by
 * omitting the field or by sending `'T3'`. Scope is EQUALITY against the stored value for the same reason
 * the door uses equality there — the question is not "is this scope legitimate" but "is it the one this
 * node already lives in".
 */
function authorityRefusal(incumbent: CurrentNode, req: WriteRequest): GovernanceAuthorityReason | undefined {
  if (incumbent.scope !== undefined && req.scope !== incumbent.scope) return "governance-relocation"
  if (incumbent.tier !== undefined && isWeakerTier(req.tier, incumbent.tier)) return "governance-downgrade"
  return undefined
}

/** The ADDITIVE governance carrier a write contributes to the row it lands on (ADR-0007). A conditional
 *  spread, so an omitted half stays ABSENT rather than becoming an explicit `undefined` — the same shape
 *  `primaryAnchor`/`slot` use, and what keeps `exactOptionalPropertyTypes` and the JSON round-trip honest. */
function governanceOf(req: WriteRequest): { scope?: string; tier?: Tier } {
  return {
    ...(req.scope !== undefined ? { scope: req.scope } : {}),
    ...(req.tier !== undefined ? { tier: req.tier } : {}),
  }
}

/** The ADDITIVE relation carrier a write contributes to the row (ADR-0015 D2). Conditional spread, same
 *  discipline as {@link governanceOf}: an omitted leg stays ABSENT, never an explicit `undefined`, keeping
 *  `exactOptionalPropertyTypes` and the JSON round-trip honest. Present only on a `family:'relation'` write. */
function relationOf(req: WriteRequest): { endpointA?: string; endpointB?: string; relationKind?: string } {
  return {
    ...(req.endpointA !== undefined ? { endpointA: req.endpointA } : {}),
    ...(req.endpointB !== undefined ? { endpointB: req.endpointB } : {}),
    ...(req.relationKind !== undefined ? { relationKind: req.relationKind } : {}),
  }
}

/** The ADDITIVE transition carrier a write contributes to the row (ADR-0015 D4 / #234). Conditional spread,
 *  same discipline as {@link relationOf}: an omitted leg stays ABSENT, never an explicit `undefined`, keeping
 *  `exactOptionalPropertyTypes` and the JSON round-trip honest. Present only on a `family:'transition'` write. */
function transitionOf(req: WriteRequest): { unitKey?: string; shaBefore?: string; shaAfter?: string } {
  return {
    ...(req.unitKey !== undefined ? { unitKey: req.unitKey } : {}),
    ...(req.shaBefore !== undefined ? { shaBefore: req.shaBefore } : {}),
    ...(req.shaAfter !== undefined ? { shaAfter: req.shaAfter } : {}),
  }
}

/** The ADDITIVE test-vacuity carrier a write contributes to the row (ADR-0015 D5 / #95). Conditional spread,
 *  same discipline as {@link transitionOf}: an omitted leg stays ABSENT, never an explicit `undefined`, keeping
 *  `exactOptionalPropertyTypes` and the JSON round-trip honest. Present only on a `family:'test-vacuity'` write.
 *  `unitKey` is the shared lineage leg (also carried by {@link transitionOf}); `testName`/`shape` are this
 *  family's own identity/proven-shape legs. */
function testVacuityOf(req: WriteRequest): { unitKey?: string; testName?: string; shape?: string } {
  return {
    ...(req.unitKey !== undefined ? { unitKey: req.unitKey } : {}),
    ...(req.testName !== undefined ? { testName: req.testName } : {}),
    ...(req.shape !== undefined ? { shape: req.shape } : {}),
  }
}

/** The ADDITIVE answer-provenance carrier a MINED write contributes to the row (#195 b). Conditional spread,
 *  same discipline as {@link governanceOf}/{@link relationOf}: an omitted `answerRef` stays ABSENT (never an
 *  explicit `undefined`), keeping `exactOptionalPropertyTypes` and the JSON round-trip honest. Present ONLY on
 *  the mine emit path — a human `atlas emit`/`atlas link` supplies none.
 *
 *  WITHOUT THIS the field lived on the row TYPE (projection-types.ts) but a freshly CREATEd mined node never
 *  carried it: the CREATE/UPDATE branches re-mint only the fields named INLINE (ADR-0009 carry-forward spreads
 *  `...prior`, but a first mine has NO prior), so `answerRef` was dropped and the shape claimed a receipt the
 *  reducer discarded. Named here, it is carried exactly as governance/relation are. */
function answerProvenanceOf(req: WriteRequest): { answerRef?: string } {
  return { ...(req.answerRef !== undefined ? { answerRef: req.answerRef } : {}) }
}

/** Keep receipts aligned with the surviving claim set. Omitted maps stay omitted for legacy writes. */
function claimProvenanceOf(
  claims: readonly string[],
  ...sources: readonly (Readonly<Record<string, ClaimProvenance>> | undefined)[]
): { provenanceByClaim?: Readonly<Record<string, ClaimProvenance>> } {
  const out: Record<string, ClaimProvenance> = {}
  for (const claim of claims) {
    for (const source of sources) {
      const receipt = source?.[claim]
      if (receipt !== undefined) {
        out[claim] = receipt
        break
      }
    }
  }
  return Object.keys(out).length > 0 ? { provenanceByClaim: out } : {}
}

/**
 * Apply one write as an upsert: resolve the routing inputs against the current projection, route
 * with {@link routeWrite}, then reduce the projection per the route. DEDUP is a no-op; CREATE mints
 * a node; UPDATE set-unions the advisory claim in place (same node, no lineage pointer — git holds
 * the prior); SUPERSEDE mints a new predicate node at the SAME key with a `supersededBy` pointer
 * while the prior bytes remain in CAS.
 *
 * ADJACENCY (WP-DEDUP-1 un-merge): the ADJACENCY-B door-2 always-merge is REMOVED. A routed CREATE at an
 * adjacent anchor now mints its OWN node (each keeps its own grounding — A2), never folding into a neighbor.
 * Adjacency is no longer a merge; it is a derived-on-read `subsumes` relation (WP-DEDUP-2, `deriveSubsumes`),
 * so the destructive fold is gone. The `primaryAnchor`/`slot` carriers on `CurrentNode` STAY — DP-2 reads
 * them off the projection.
 *
 * [#242] this signature used to also take a `cfg: NearDupConfig = { claimNormThreshold: 1 }` "for the
 * forthcoming DP-2 use" — DELETED, not kept: DP-2 (`deriveSubsumes`) never materialized a claimNorm-
 * similarity matcher, `routeWrite` below has never read a threshold, and the config it would have carried
 * was validated end-to-end (`.atlas/policy.json` → `nearDupConfig()`) and consumed by NOTHING. A future
 * near-dup matcher gets its own explicit parameter when it is actually built, not a placeholder threaded
 * through every caller on the strength of a comment.
 *
 * CARRY-FORWARD IS THE DEFAULT (ADR-0009): UPDATE and SUPERSEDE both SPREAD the prior node and re-mint only the
 * fields named inline, so a field added to `CurrentNode` later is carried with no edit here and DROPPING one has
 * to be spelled out (only `claims`, at SUPERSEDE). `sameAs` is why — a SIGNED act established it (`atlas-link`'s
 * authz + ratifier over the whole class), and a class that SHRINKS under-charges every gate `sameAsClassOf` prices. *
 * GOVERNANCE (ADR-0007 carrier): the req's `(scope, tier)` is stamped onto the row and, on UPDATE/SUPERSEDE,
 * WINS over the prior's — safe in exactly one direction and only because the governed door already decided it.
 * That door refuses a relocation, so a surviving write's `scope` RE-STATES the incumbent's; and it refuses a
 * downgrade, so its `tier` re-states or RAISES. A write that OMITS the pair leaves the prior row's intact
 * (`...prior`) rather than erasing it: this reducer is also reachable from ungoverned callers, and a carrier
 * that could be CLEARED by omission would be a way to demote a node to "unconfirmable" and brick it.
 */
export function upsert(store: StoreProjection, req: WriteRequest): UpsertResult {
  // KNOW-10 / KNOW-15i — THE CLOSED-SLOT GATE (#152). FIRST, before the route is even computed: the slot is
  // an ingredient of the identity this reducer routes on, so a value outside the closed 13 has already
  // corrupted the question by the time `routeWrite` answers it. ABSENT stands aside — a deliberate
  // NARROWING, measured and argued in `./closed-slot.ts`; PRESENT-and-unrecognised fails closed. Until this
  // line existed, the shipped `atlas emit` ACCEPTED an out-of-vocabulary slot and minted a new address for
  // it, and BOTH membership guards in this package (`isKnownSlot`, `isClosedSlot`) had zero callers.
  if (req.slot !== undefined && !isKnownSlot(req.slot)) throw new ClosedSlotError(req.slot)

  const nodeKeyHit = store.current.has(req.nodeKey)
  const inputs: RouteInputs = {
    contentHashHit: store.cas.has(req.contentHash),
    nodeKeyHit,
    family: req.family,
    checkSame: req.family === "predicate" && nodeKeyHit, // predicate nodeKey encodes check ⇒ hit ⟺ same check
  }
  const decision = routeWrite(inputs)

  // ARCH-10 (ADR-0010) — a write that DISPLACES a current node must first clear the gate that node's own
  // stored governance requires. Checked BEFORE any projection is copied, so a refusal cannot leave a
  // half-applied store behind; DEDUP and CREATE never reach it (nothing is displaced).
  if (decision === "UPDATE" || decision === "SUPERSEDE") {
    const refusal = authorityRefusal(store.current.get(req.nodeKey)!, req)
    if (refusal !== undefined) throw new GovernanceAuthorityError(refusal)
  }

  const cas = new Set(store.cas)
  const current = new Map(store.current)

  switch (decision) {
    case "DEDUP":
      break // idempotent no-op — no node minted, no new CAS object (KNOW-4b)
    case "CREATE":
      cas.add(req.contentHash)
      current.set(req.nodeKey, {
        nodeKey: req.nodeKey,
        family: req.family,
        contentHash: req.contentHash,
        claims: [req.claimNorm],
        ...claimProvenanceOf([req.claimNorm], req.provenanceByClaim),
        // ADJACENCY carrier (additive) — spread keeps the field ABSENT when omitted (never explicit undefined).
        ...(req.primaryAnchor !== undefined ? { primaryAnchor: req.primaryAnchor } : {}),
        ...(req.slot !== undefined ? { slot: req.slot } : {}),
        ...(req.seal !== undefined ? { seal: req.seal } : {}), // SEAL carrier (ADR-0017) — provenance only, never a gate/identity leg; absent for advisory-prose
        ...governanceOf(req), // GOVERNANCE carrier (ADR-0007) — absent when the caller declares neither half
        ...relationOf(req), // RELATION carrier (ADR-0015 D2) — the endpoint pair + kind on a family:'relation' write
        ...transitionOf(req), // TRANSITION carrier (ADR-0015 D4) — the unit lineage + rev-pair on a family:'transition' write
        ...testVacuityOf(req), // TEST-VACUITY carrier (ADR-0015 D5) — the test name + proven shape on a family:'test-vacuity' write
        ...answerProvenanceOf(req), // ANSWER-PROVENANCE carrier (#195 b) — the mined answer receipt, mine path only
      })
      break
    case "UPDATE": {
      const prior = current.get(req.nodeKey)! // nodeKeyHit ⇒ present
      // ANTI-LAUNDERING (ARCH-D3b security fix): a write that RAISES the node to a GOVERNING class (T0/T1)
      // REPLACES the claim set instead of unioning it. The node carries ONE governance tier over a SET of
      // claims, so a blind union let a legitimate tier-raise relabel every pre-existing weaker-tier claim —
      // including one a DIFFERENT, un-ratified author had seeded at the same (anchor, slot) — as ratified at
      // the new tier, serving it in the tier≥T1 governing band (TOOLS-6). The raiser vouches for what THEY
      // (re-)assert, not for whatever advisories predate them; a raise is a supersession point for the
      // place, mirroring the SUPERSEDE branch's own `claims: [req.claimNorm]`. Same-tier accretion is
      // preserved (unioned) — those claims share the incumbent's already-cleared authority. `req.tier` is
      // absent ⇒ no class change ⇒ union. Downgrades never reach here (refused `governance-downgrade`
      // upstream). `isTier` guards the governing test the SAME way the read band does (`bands.ts`:
      // `isTier(t) && t !== 'T2'`, NEVER the bare `t !== 'T2'`): an OFF-LATTICE `req.tier` — reachable from a
      // COMMITTED `.atlas/` projection that never passed a door — is not a governing class and not a raise, so
      // it falls through to the union default (master behaviour preserved), never a spurious claim-drop.
      const raises =
        req.tier !== undefined &&
        isTier(req.tier) &&
        req.tier !== "T2" &&
        (prior.tier === undefined || isWeakerTier(prior.tier, req.tier))
      const claims = raises
        ? [req.claimNorm] // the raiser's own assertion only — prior weaker claims do not inherit the new tier
        : prior.claims.includes(req.claimNorm)
          ? prior.claims // set-union: dedup by claimNorm (idempotent)
          : [...prior.claims, req.claimNorm]
      cas.add(req.contentHash)
      // SEAL IS NEVER CARRIED FORWARD (SEAL-PROMOTE-CARRY, billy T0). `seal` (`proven`) is a TRUST SIGNAL, and
      // trust attaches to the WRITE that carried it (proven only iff the governed door derived `origin:'promoted'`
      // and let the seal survive), NOT to the (anchor, slot) place. So it must come SOLELY from `req.seal`: drop
      // `prior.seal` off the spread and re-add only when THIS write carries one. Otherwise an authored operator
      // UPDATE over an existing `proven` node (its own seal already stripped at the door ⇒ `req.seal` absent) would
      // INHERIT the proven seal through `...prior` — a forgery by omission. `priorNoSeal` is `prior` with `seal`
      // removed; every other field still carries forward (ADR-0009). A promote UPDATE re-stamps its own trusted seal.
      const { seal: _priorSeal, provenanceByClaim: _priorProvenance, ...priorNoSeal } = prior
      const claimProvenance = raises
        ? claimProvenanceOf(claims, req.provenanceByClaim)
        : claimProvenanceOf(claims, req.provenanceByClaim, prior.provenanceByClaim)
      current.set(req.nodeKey, {
        ...priorNoSeal, // ADJACENCY: carries prior anchor/slot; the req's WIN below when present. SEAL dropped — see above.
        contentHash: req.contentHash,
        claims, // in place, no supersededBy
        ...claimProvenance,
        ...(req.primaryAnchor !== undefined ? { primaryAnchor: req.primaryAnchor } : {}),
        ...(req.slot !== undefined ? { slot: req.slot } : {}),
        ...(req.seal !== undefined ? { seal: req.seal } : {}), // SEAL carrier — from THIS write ONLY; omitted ⇒ seal DROPS (never inherited from prior)
        ...governanceOf(req), // re-states scope / re-states-or-RAISES tier; omitted ⇒ `...prior` stands
        ...relationOf(req), // RELATION carrier (ADR-0015 D2) — re-evidencing a relation re-states its endpoints
        ...transitionOf(req), // TRANSITION carrier (ADR-0015 D4) — re-evidencing the SAME sha-pair re-states its lineage
        ...testVacuityOf(req), // TEST-VACUITY carrier (ADR-0015 D5) — re-evidencing the SAME (unit,test) re-states its shape
        ...answerProvenanceOf(req), // ANSWER-PROVENANCE carrier (#195 b) — re-mining re-states the receipt; else `...prior`
        // CARRY-FORWARD ON A RAISE IS DELIBERATE for `answerRef` and `sameAs` — the anti-laundering severance
        // above is scoped to `claims` ON PURPOSE, and dropping either here would be WRONG, not safer:
        //   · `answerRef` is opaque mine provenance (its CAS id is its own tamper-evidence) and is served by
        //     NO read path as governing-band content, so it carries no claim a raise could launder;
        //   · `sameAs` is not set on this door at all — it is a SIGNED act of the SEPARATE `atlas-link` door
        //     (its own authz + ratifier over the whole merged class, `sameAsClassOf`), and `deriveSameAs`
        //     surfaces it as an EDGE (nodeKey pair), never folding a peer's claim/tier across it. Severing it
        //     on an unrelated emit-tier raise would silently SHRINK a governed equivalence class and
        //     under-charge every gate that priced it (see the SUPERSEDE-branch note below). Both ride
        //     `...prior` by design; pinned in `test/upsert-raise-carry-forward.test.ts`.
      })
      break
    }
    case "SUPERSEDE": {
      const prior = current.get(req.nodeKey)! // nodeKeyHit ⇒ present
      cas.add(req.contentHash) // prior.contentHash stays in `cas` (append-only) — old bytes addressable
      // SEAL IS NEVER CARRIED FORWARD (SEAL-PROMOTE-CARRY, billy T0) — the same law as UPDATE above: a `proven`
      // seal is trust in the WRITE that carried it, not in the (anchor, slot) place, so a new version's seal
      // must come SOLELY from `req.seal` and never ride `...prior`. Drop `prior.seal`; re-add only when THIS
      // write carries one. A promote SUPERSEDE re-stamps its own trusted seal; an authored one (seal stripped at
      // the door) drops to seal-absent, so a version cannot silently inherit a proven seal it did not earn.
      const { seal: _priorSeal, provenanceByClaim: _priorProvenance, ...priorNoSeal } = prior
      current.set(req.nodeKey, {
        ...priorNoSeal, // CARRY-FORWARD (ADR-0009, see above): `sameAs` + every future field survive; only ↓ (incl. SEAL) is re-minted
        nodeKey: req.nodeKey,
        family: req.family,
        contentHash: req.contentHash,
        claims: [req.claimNorm], // the ONE deliberate drop: a predicate version REPLACES its body (prior in CAS)
        ...claimProvenanceOf([req.claimNorm], req.provenanceByClaim),
        supersededBy: prior.contentHash,
        ...(req.primaryAnchor !== undefined ? { primaryAnchor: req.primaryAnchor } : {}), // req wins, else `...prior`
        ...(req.slot !== undefined ? { slot: req.slot } : {}),
        ...(req.seal !== undefined ? { seal: req.seal } : {}), // SEAL carrier — from THIS write ONLY; omitted ⇒ seal DROPS (never inherited from prior)
        ...governanceOf(req), // a new VERSION of a node keeps the node's governance — never a re-classification
        // DELIBERATE OMISSION (#195, contract §5 scopes the stamp to CREATE/UPDATE): `answerProvenanceOf`
        // and `relationOf` are NOT re-stamped here, so a superseded version keeps `...prior`'s `answerRef` —
        // a receipt for the bytes that produced the PRIOR body, now stale for the re-minted one. Accepted as
        // a known-latent inconsistency, not a silent drop; closing it means binding a fresh receipt to the
        // supersede event, a bigger change than this wave's leg (b).
      })
      break
    }
    // REJECT is unreachable — admission (KNOW-2) is emit.ts, not the upsert route.
  }
  return { decision, store: { current, cas } }
}

/** A territory query: the current nodes — exactly one per `nodeKey` by construction (KNOW-4g). */
export function currentNodes(store: StoreProjection): readonly CurrentNode[] {
  return [...store.current.values()]
}
