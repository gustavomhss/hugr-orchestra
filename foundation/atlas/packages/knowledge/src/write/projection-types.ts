// @atlas/knowledge — src/write/projection-types.ts  (the store-projection ROW shapes)
//
// EXTRACTED from `upsert.ts` at the 400-LOC godfile ceiling along a cohesive boundary (the projection
// ROW/REQUEST interfaces are their own concern), exactly as `negation-types.ts` was extracted from
// `types.ts` and `relation-key.ts` from `router.ts` at the same ceiling. RE-EXPORTED by `upsert.ts`
// (`export type { WriteRequest, CurrentNode }`) so the package surface — and every existing
// `../src/write/router.js` / `upsert.js` import — is byte-identical. `NodeFamily` stays owned by
// `router.ts` and is imported here (a type-only cycle, erased at runtime, exactly as negation-types'
// import of `RelationKind` is). Nothing here changed in the move EXCEPT the two ADDITIVE/OPTIONAL
// answer-provenance carrier (`answerRef`, #195 b) added to both shapes below.

import type { Tier } from "@atlas/contracts"
import type { ClaimProvenance, PredicateSlot, Seal } from "../types.js"
import type { NodeFamily } from "./router.js"

/** One write, its identity VALUES supplied by the upstream identity facet (5.13-b) + the emitter. */
export interface WriteRequest {
  readonly nodeKey: string // WHICH — opaque identity (value computed upstream)
  readonly contentHash: string // WHAT  — opaque CAS id (value computed upstream)
  readonly family: NodeFamily
  readonly claimNorm: string // the advisory claim body — the set-union element (KNOW-4c)
  // ── CLAIM-PROVENANCE carrier (ADDITIVE, OPTIONAL — KNOW-14) — receipt keyed by claimNorm. The map keeps
  //    CurrentNode.claims compatible with legacy string arrays while making each durable claim auditable.
  readonly provenanceByClaim?: Readonly<Record<string, ClaimProvenance>>
  // ── ADJACENCY carrier (ADDITIVE, OPTIONAL) — anchor+slot for WP-B's sibling-adjacency scan; NOT routed.
  readonly primaryAnchor?: string // the computed primaryAnchorId VALUE (qualifiedPath-prefix), string form
  readonly slot?: PredicateSlot //  the closed-vocabulary predicate slot the node lives at (R3-optional)
  // ── GOVERNANCE carrier (ADDITIVE, OPTIONAL — ADR-0007) — the `(scope, tier)` pair this write DECLARES,
  //    forwarded so `upsert` can stamp it onto the ROW. NOT ROUTED: neither field enters `RouteInputs`, and
  //    a governance value never changes which cell of the KNOW-4 table a write lands in. Supplied by a
  //    GOVERNED door only, and only AFTER that door has validated both halves (`isTier`/`isScope`) and
  //    refused any relocation or downgrade — so what is stamped here is already monotone.
  readonly scope?: string
  readonly tier?: Tier
  // ── RELATION carrier (ADDITIVE, OPTIONAL — ADR-0015 D2 / #99a) — the two endpoint unitKeys + the kind of a
  //    2-ended fact, forwarded so `upsert` stamps them on the ROW and the read-side `relationsOf` fold can
  //    index a relation by BOTH endpoints without an O(repo) scan. NOT ROUTED: none enters `RouteInputs`; a
  //    relation's identity is `relationKey` (router.ts), computed upstream into `nodeKey` here. Present only on
  //    a `family:'relation'` write; absent for advisory/predicate. Direction is preserved (A=subject, B=object).
  readonly endpointA?: string
  readonly endpointB?: string
  readonly relationKind?: string // the closed-vocabulary RelationKind VALUE (string form at this seam)
  // ── TRANSITION carrier (ADDITIVE, OPTIONAL — ADR-0015 D4 / #234) — the unit lineage + the rev-pair of a
  //    2-rev historical record, forwarded so `upsert` stamps them on the ROW and the read-side `transitionsOf`
  //    fold can index a transition by its `unitKey` LINEAGE (and chain shaBefore→shaAfter for the derive-on-read
  //    supersession verdict) without re-reading CAS. NOT ROUTED: none enters `RouteInputs`; a transition's
  //    identity is `transitionKey` (transition-key.ts), computed upstream into `nodeKey` here. Present only on a
  //    `family:'transition'` write; absent for the other families. Direction preserved (before→after).
  readonly unitKey?: string
  readonly shaBefore?: string
  readonly shaAfter?: string
  // ── TEST-VACUITY carrier (ADDITIVE, OPTIONAL — ADR-0015 D5 / #95) — the test name + proven shape of a
  //    single-anchor test-vacuity fact, forwarded so `upsert` stamps them on the ROW and a future read-side
  //    fold (Wave 1b) can index a vacuous test by its `unitKey` lineage (shared with the transition carrier
  //    above) WITHOUT a CAS re-read. NOT ROUTED: none enters `RouteInputs`; a test-vacuity fact's identity is
  //    `testVacuityKey` (test-vacuity-key.ts), computed upstream into `nodeKey` here. Present only on a
  //    `family:'test-vacuity'` write; absent for the other families.
  readonly testName?: string
  readonly shape?: string // the closed-vocabulary TestVacuityShape VALUE (string form at this seam)
  // ── SEAL carrier (ADDITIVE, OPTIONAL — ADR-0017 two-seal provenance) — the seal (`proven`) the admit path
  //    decided for this fact's TYPE, forwarded so `upsert` stamps it on the ROW and the durable store carries
  //    it. PROVENANCE ONLY: it records HOW the fact's type was decided, is NOT an authority/governance leg,
  //    never enters `nodeKey`/`RouteInputs`, and no gate reads it. Absent for advisory-prose facts. Mirrors
  //    `slot`'s carrier discipline exactly (ADDITIVE, OPTIONAL, exactOptionalPropertyTypes-honest).
  readonly seal?: Seal
  // ── ANSWER-PROVENANCE carrier (ADDITIVE, OPTIONAL — #195 b) — binds a MINED fact to the exact bytes the model
  //    returned. `answerRef` is the CAS id of the answer bytes actually stored (scrubbed before `put`, KNOW-11).
  //    In a content-addressed store the CAS id IS the digest of the stored content, so `answerRef` is its OWN
  //    tamper-evidence at rest — a reader re-runs `id(fetchedBytes)` and compares (store.ts `get()` does exactly
  //    this on read), so NO separate `answerDigest` field is kept (precedent: `promptDigest` — one digest, no
  //    companion ref). Supplied ONLY by the mine door (a model produced the claim); absent for human
  //    `atlas emit`/`atlas link`. Does NOT enter `nodeKey` (a provenance receipt is not an identity). NOT
  //    ROUTED. See docs/design/195-answer-provenance-contract.md.
  readonly answerRef?: string
}

/** A current node in the territory projection. Exactly one lives per `nodeKey` (KNOW-4g). */
export interface CurrentNode {
  readonly nodeKey: string
  readonly family: NodeFamily
  readonly contentHash: string
  readonly claims: readonly string[] // claimNorms — the advisory set-union set (dedup by claimNorm)
  // ── CLAIM-PROVENANCE carrier (ADDITIVE, OPTIONAL — KNOW-14) — keyed by claimNorm; absent on legacy rows.
  readonly provenanceByClaim?: Readonly<Record<string, ClaimProvenance>>
  readonly supersededBy?: string // predicate lineage pointer into CAS (KNOW-4e); absent for advisory
  // ── ADJACENCY carrier (ADDITIVE, OPTIONAL) — carried from the req for WP-B; store.ts WireProjection round-trips them free. NOT read here.
  readonly primaryAnchor?: string // the primaryAnchorId VALUE (qualifiedPath-prefix), string form
  readonly slot?: PredicateSlot //  the closed-vocabulary predicate slot the node lives at (R3-optional)
  // ── sameAs carrier (ADDITIVE, OPTIONAL — WP-SAMEAS) — the SORTED, de-duped nodeKeys a HUMAN asserted name
  //    the SAME fact at an unrelated code site (H1). Stored SYMMETRICALLY on both endpoints, so the read-side
  //    union-find fold (`deriveSameAs`) is local from either end; absent ⇒ no asserted equivalence. It round-
  //    trips inside the CurrentNode entry (store.ts WireProjection serializes the whole node — no change there).
  //    ADDITIVE/OPTIONAL, back-compat: a node minted before this WP simply has no `sameAs` and is a singleton.
  readonly sameAs?: readonly string[]
  // ── sameAs RETRACTION carrier (ADDITIVE, OPTIONAL — A-D3, task #83) — the SORTED, de-duped peers whose
  //    asserted equivalence with this node has since been RETRACTED through `atlas-link --retract`, the
  //    retraction MODE of the existing governed link door (no sixth tool, no new medium: INV-TOOLS-1's
  //    `WRITE_PATHS` stays `{emit, link}` and INV-TOOLS-15's store-row medium is untouched).
  //
  //    A RETRACTION IS AN APPEND, NEVER A DELETE, and that is the whole representation decision. The peer
  //    STAYS in `sameAs`; it additionally appears here. So both halves of the history survive on the row —
  //    that the equivalence was once asserted, AND that it was later retracted — and a reader can tell the
  //    difference between "these were never linked" (peer in neither list) and "these were linked and the
  //    link was withdrawn" (peer in both). Dropping the peer from `sameAs` would have made those two states
  //    byte-identical, i.e. the store would lie about its own history, which is precisely the failure A-D3
  //    was opened about one direction over.
  //
  //    Stored SYMMETRICALLY on both endpoints, exactly as `sameAs` is; the read fold (`deriveSameAs`) skips
  //    an edge whose retraction is recorded on EITHER endpoint, so a half-written retraction still splits
  //    (splitting is the safe direction — see that fold's header). ADDITIVE/OPTIONAL, back-compat: a row
  //    minted before this field simply has none, which reads as "nothing retracted".
  readonly sameAsRetracted?: readonly string[]
  // ── GOVERNANCE carrier (ADDITIVE, OPTIONAL — ADR-0007) — the `(scope, tier)` the node ITSELF lives under.
  //
  //    THIS IS THE HALF ADR-0007 SHIPPED WITHOUT. That ADR decided authority is derived from the RESOURCE,
  //    never asserted by the request — but the resource's governance class was reachable only by reading the
  //    incumbent's CAS bytes, because the row did not carry it. A read that can FAIL made the refusal depend
  //    on storage health, so a caller with no authority over the node could tell a healthy node from a pruned
  //    one at an identity anyone can pre-compute. Merging both into one refusal closed the oracle but sent the
  //    node's OWN author an authorization error for a storage fault. Carried HERE, target authority is decided
  //    off the projection — the same answer in both byte-states — and the honest storage answer is reserved
  //    for the caller who has already been shown to hold authority.
  //
  //    ADDITIVE/OPTIONAL, back-compat, exactly the `builtAt`/`sameAs` discipline: a row minted before this WP
  //    simply has neither field, old sidecars round-trip unrewritten, and ABSENT means authority is
  //    UNCONFIRMABLE ⇒ the door fails closed. Absent is never "authority granted" and never a crash — the
  //    consuming door applies `isScope`/the tier lattice, both of which are TOTAL over `unknown`.
  //
  //    NEITHER FIELD ENTERS `nodeKey`. Identity stays `hash(primaryAnchorId ‖ slot[‖ check])`; folding a
  //    governance value into it would silently re-address every stored fact and split a node from its own
  //    history the first time its class was raised.
  readonly scope?: string
  readonly tier?: Tier
  // ── FRESHNESS WATERMARK carrier (ADDITIVE, OPTIONAL — N11, per-ROW) — the git HEAD sha at which THIS row's
  //    stored per-fact freshness was last produced.
  //
  //    IT IS THE HALF N11 SHIPPED WITHOUT, and the failure is the same shape ADR-0007's was: the property is
  //    per-ROW and it was recorded per-PROJECTION. `StoreProjection.builtAt` is stamped with live HEAD by
  //    every publication, but a publication rewrites the WHOLE projection and carries almost every row
  //    forward untouched — so one unrelated `atlas emit` re-dated every other fact in the store and a read
  //    that had honestly said `stale: true` went back to `stale: false` while `atlas doctor why` still
  //    printed the drift. Measured end to end through the built CLI (e2e story S26).
  //
  //    WHO SETS IT: nobody in this package. It is stamped at PUBLICATION, by the one place a sidecar's bytes
  //    are ever produced (`adapter-io/src/freshness-watermark.ts`, called from `sidecar-commit.ts`), keyed on
  //    whether the row's `contentHash` changed in that generation — because a row's stored freshness lives in
  //    its CAS bytes, so unchanged bytes carry an unchanged, older verification date. `upsert` neither reads
  //    nor writes it, and carries it forward with the rest of the row.
  //
  //    ADDITIVE/OPTIONAL, back-compat, exactly the `builtAt`/`sameAs`/`scope` discipline: a row minted before
  //    this WP simply has none, old sidecars round-trip UNREWRITTEN (the wire serializes the whole
  //    `CurrentNode`, so no format edit), and ABSENT falls back to the projection-level `builtAt` — absent
  //    BOTH means the watermark is UNKNOWN, which the reader treats conservatively and never as a flag.
  //
  //    IT DOES NOT ENTER `nodeKey`, for the same reason `scope`/`tier` do not: a date is not an identity, and
  //    folding one in would re-address a fact every time it was re-verified.
  readonly derivedAt?: string
  // ── RELATION carrier (ADDITIVE, OPTIONAL — ADR-0015 D2 / #99a) — the two endpoint unitKeys + kind of a
  //    2-ended fact, stamped on the row so the read-side `relationsOf` fold indexes a relation by BOTH
  //    endpoints (direction preserved: A=subject, B=object) without an O(repo) scan. Present only on a
  //    `family:'relation'` row; absent for advisory/predicate. NONE enters `nodeKey` (identity is `relationKey`,
  //    already the row's `nodeKey`). ADDITIVE/OPTIONAL, back-compat, the `sameAs`/`scope` discipline: a row
  //    minted before this WP simply has none, old sidecars round-trip unrewritten (the wire serializes the
  //    whole CurrentNode). Carried forward by `upsert` with the rest of the row.
  readonly endpointA?: string
  readonly endpointB?: string
  readonly relationKind?: string
  // ── TRANSITION carrier (ADDITIVE, OPTIONAL — ADR-0015 D4 / #234) — the unit lineage + rev-pair of a 2-rev
  //    historical record, stamped on the row so the read-side `transitionsOf` fold indexes a transition by its
  //    `unitKey` lineage and chains shaBefore→shaAfter for the derive-on-read supersession verdict (D-T3),
  //    without an O(repo) scan or a CAS re-read. Present only on a `family:'transition'` row; absent otherwise.
  //    NONE enters `nodeKey` (identity is `transitionKey`, already the row's `nodeKey`). ADDITIVE/OPTIONAL,
  //    back-compat, the `endpointA`/`scope` discipline: a row minted before this WP has none, old sidecars
  //    round-trip unrewritten (the wire serializes the whole CurrentNode). Carried forward by `upsert`.
  readonly unitKey?: string
  readonly shaBefore?: string
  readonly shaAfter?: string
  // ── TEST-VACUITY carrier (ADDITIVE, OPTIONAL — ADR-0015 D5 / #95) — the test name + proven shape of a
  //    single-anchor test-vacuity fact, stamped on the row so a future read-side fold (Wave 1b) indexes a
  //    vacuous test by its `unitKey` lineage (shared with the transition carrier above) without a CAS re-read.
  //    Present only on a `family:'test-vacuity'` row; absent otherwise. NONE enters `nodeKey` (identity is
  //    `testVacuityKey`, already the row's `nodeKey`). ADDITIVE/OPTIONAL, back-compat, the `endpointA`/`scope`
  //    discipline: a row minted before this WP has none, old sidecars round-trip unrewritten. Carried forward
  //    by `upsert`.
  readonly testName?: string
  readonly shape?: string
  // ── SEAL carrier (ADDITIVE, OPTIONAL — ADR-0017 two-seal provenance) — the seal (`proven`) stamped on the
  //    ROW so the durable store carries HOW this fact's type was decided. PROVENANCE ONLY: NOT an
  //    authority/governance leg, never enters `nodeKey`, no gate reads it; absent for advisory-prose facts.
  //    ADDITIVE/OPTIONAL, back-compat, the `slot`/`answerRef` discipline: a row minted before this WP simply
  //    has none (reads as "seal UNKNOWN", never "proven"), old sidecars round-trip unrewritten (the wire
  //    serializes the whole CurrentNode — no format edit). Carried forward by `upsert` with the rest of the row.
  readonly seal?: Seal
  // ── ANSWER-PROVENANCE carrier (ADDITIVE, OPTIONAL — #195 b) — the mined fact's receipt for the exact bytes the
  //    model returned: `answerRef` = CAS id of the stored (scrubbed) answer. The CAS id is its own tamper-evidence
  //    (store.ts `get()` re-hashes on read), so no separate digest is kept. Present only on a MINED row (a model
  //    produced the claim); absent for human writes. Does NOT enter `nodeKey` (a provenance receipt is not an
  //    identity). Round-trips inside the CurrentNode entry (store.ts WireProjection serializes the whole node — no
  //    format edit). ADDITIVE/OPTIONAL, back-compat: a row minted before this WP simply has none, reading as
  //    "answer provenance UNKNOWN" (never "verified"). #209 consumes it: the run report digests the admitted rows'
  //    `answerRef`s so the issued-vs-stored CARDINALITY is visible in the artifact, plus per-answer traceability.
  //    See docs/design/195-answer-provenance-contract.md.
  readonly answerRef?: string
}
