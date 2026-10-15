// @atlas/knowledge — src/router.ts  (WP-5.13-a.KNOW · EPIC-13-a)
//
// THE write-decision routing rules — "every write is an upsert" (KNOW-4). The route is
// COMPUTED, never judged (no LLM / clock / seq in the path): a pure, total, deterministic,
// mutually-exclusive function over the enumerated routing product the interface_contract pins
// (method-tags-knw INV-KNOW-4 down-model):
//     {contentHash∈(hit,miss) × family∈(advisory,predicate) × nodeKey∈(hit,miss) × check∈(same,diff)}
// The drift leg (`subtreeHash`, WHERE-current) NEVER enters the create/update decision
// (atlas-knowledge:153), so it is absent from the inputs by construction.
//
// FACET BOUNDARY (BIND — resolved vs the frozen RouterApi, co-located below):
//  • This WP owns the routing OVER the resolved inputs. The nodeKey/contentHash VALUES (the
//    identity hashes) are computed UPSTREAM — the `nodeKey` identity formula is WP-5.13-b.KNOW's
//    excluded facet, and the CAS/store lookup that resolves hit/miss is the OWNER-DEFINE composed
//    store (StoreApi in types.ts: "NO concrete signature frozen"). Per INV-KNOW-5's note the matcher/store
//    "fixes the VALUE of the inputs, not the routing over them — feasible now". So this module
//    takes RESOLVED opaque identity strings as inputs and does ZERO hashing (the sealed
//    @atlas/kernel identity seam is not entered here — no raw hashing).
//  • The `RouterApi.writeDecision` FRONT DOOR is now WIRED here (owner-RATIFIED un-park, reversing the
//    s05 PARK — govern writes now). It is COMPOSED, not reimplemented: it consumes a `Candidate`, mints
//    the contentHash through the SEALED kernel seam (`id` = `defaultEncoder.hash(canonicalForm(·))`,
//    atlas-knowledge:110), reuses `nodeKey` (5.13-b) for the WHICH leg, and routes through the existing
//    pure `routeWrite`. The ADJACENCY-B door-2 always-merge is REMOVED (WP-DEDUP-1) — adjacency is now a
//    derived-on-read `subsumes` relation (WP-DEDUP-2), never a write-time merge. The store is passed as DATA
//    (widened signature `writeDecision(candidate, store, cfg)`): the `StoreProjection` is held
//    caller-side / session-internal (cf. index/src/fold.ts `createDriftFold`, and the `upsert(store, req)`
//    idiom), never an invented frozen `StoreApi` field — so no OWNER-DEFINE composed store is invented.
//  • REJECT (the admission bar — grounding by KNOW-2, harm by GROUND-7) is emit.ts's facet — the upsert route never
//    returns REJECT.

import { asNodeKey, canonicalForm, defaultEncoder, id } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import type { Candidate, Check, PredicateSlot } from "../types.js"
// The projection type the frozen `RouterApi.writeDecision` / `writeDecision` read — defined in the reducer
// module this file re-exports below (type-only import; the runtime cycle is the re-export, see there).
import type { StoreProjection } from "./upsert.js"

// ── frozen RouterApi surface, co-located here (was ref/router.ts) ─────────────────────────────────────

/**
 * The write-decision routes. Transcribed EXACTLY from the KNOW-15 routing table (atlas-knowledge:135-142):
 * total + deterministic + mutually-exclusive (method-tags-knw:119).
 *   - `DEDUP`     — `contentHash` already in CAS; identical bytes ⇒ no-op (bump hits/freshness only).
 *   - `CREATE`    — `nodeKey` miss (new `(anchor, slot[, check])`), OR a DIFFERENT predicate `check`.
 *   - `UPDATE`    — `nodeKey` hit, advisory family; claim SET-UNION in place (git keeps prior, KNOW-4/12).
 *   - `SUPERSEDE` — `nodeKey` hit, predicate, SAME `check` re-evidenced; mint new + `supersededBy` pointer.
 *   - `REJECT`    — fails the admission bar: **ungrounded** (KNOW-2), or **harmful to store** (a secret /
 *                   PII — GROUND-7). MISATTRIBUTION CORRECTED (ADR-0012): this line used to read "ungrounded,
 *                   or obvious/useless — KNOW-2". INV-KNOW-2's up-property is grounding ONLY ("a fact with no
 *                   resolvable grounding — 0 entries, or any empty `subtreeHash` — is rejected"); it carries no
 *                   usefulness clause at all, so the comment was handing KNOW-2 an authority it never had.
 *                   KNOW-2 is NOT amended — it is a grounding invariant and always was. Separately: nothing is
 *                   rejected for being obvious; obviousness is a stored score (ADR-0012).
 */
export type WriteDecision = "DEDUP" | "CREATE" | "UPDATE" | "SUPERSEDE" | "REJECT"

/** The frozen write-decision API (KNOW-4/15) — its impl is the pure functions below (no separate
 *  anchor.ts: the identity legs live HERE per the LEAD-RATIFIED decision). */
export interface RouterApi {
  /** The pure write-decision (KNOW-4/15). Routes a candidate to exactly one `WriteDecision` from its
   *  three orthogonal hashes; the drift leg (`subtreeHash`) NEVER changes the create/update leg
   *  (atlas-knowledge:153). No LLM call enters the decision (method-tags-knw:121). Pure + total.
   *
   *  [UN-MERGED — WP-DEDUP-1] the ADJACENCY-B door-2 always-merge is REMOVED: a routed CREATE at an
   *  adjacent anchor stays a CREATE (its own node, own grounding — A2). Adjacency is now a derived-on-read
   *  `subsumes` relation (WP-DEDUP-2), never a write-time merge.
   *
   *  [#242 — DELETED, not wired] a `NearDupConfig`/`cfg` PARAMETER used to ride here for a claimNorm-
   *  similarity matcher this router never implemented — `routeWrite` below routes on the four
   *  ALREADY-RESOLVED `RouteInputs` booleans alone; no near-dup threshold has ever entered this decision.
   *  MEASURED: `cfg` was accepted, threaded from `packages/adapter-io/src/policy.ts` through
   *  `nearDupConfig()`, and read by NOTHING (`nearDupConfig` itself had zero callers). Deleted rather than
   *  wired — see the #242 PR body for the full reasoning (the sound arm's `claimNorm` is now
   *  harness-generated/deterministic post-#197, so a text-similarity τ over it would answer a different,
   *  probably useless question from the one this knob was invented for).
   *
   *  [WIDENED — owner-RATIFIED un-park] the composed store is passed as DATA (`StoreProjection`), matching
   *  the `upsert(store, req)` idiom + the caller-side/session-internal projection documented in the facet
   *  header — NOT an invented frozen `StoreApi` field. See the `writeDecision` impl below. */
  writeDecision(candidate: Candidate, store: StoreProjection): WriteDecision

  /** The node identity leg. `nodeKey(advisory) = hash(primaryAnchorId ‖ predicateSlot)`;
   *  `nodeKey(predicate) = hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` — so a distinct
   *  `check` is a distinct node, never a sibling-supersede (atlas-knowledge:123-124, 144-146). Pure +
   *  total, no LLM. Routed on `Candidate` (identity needs its `slot`/`check`). */
  nodeKey(node: Candidate): NodeKey

  /** The COMPUTED primary anchor — the tightest structural unit (smallest AST subtree) containing every
   *  symbol the claim references (atlas-knowledge:114-119). NEVER an LLM-chosen anchor. ONLY the primary
   *  anchor enters identity — secondary citations live in `grounding.entries` and feed DRIFT only, never
   *  the `nodeKey`. Move-aware (name-stripped subtree match ⇒ rename is a MOVE). Pure + total, no LLM.
   *
   *  [FLAG — return leg] the reference frames `primaryAnchorId` as an ANCHOR id fed into `nodeKey`
   *  (atlas-knowledge:123-124), not itself a `nodeKey`; transcribed to the `NodeKey` return, flagged. */
  primaryAnchorId(node: Candidate): NodeKey
}

/** The content kinds of the Atlas (atlas-knowledge:19): advisory ⇒ UPDATE/union · predicate ⇒ SUPERSEDE.
 *  WIDENED by ADR-0015 D2 (#99a) with `relation` — a 2-ended fact that, having NO `check`, routes like an
 *  advisory (UPDATE/union on a nodeKey hit), never SUPERSEDE. WIDENED again by ADR-0015 D3 (#99b) with
 *  `negation` — a scoped negative that likewise carries NO `check`, so it joins advisory/relation on the
 *  UPDATE branch below (never SUPERSEDE by routing). WIDENED AGAIN by ADR-0015 D4 (#234) with `transition` —
 *  a 2-rev historical record that ALSO carries NO `check`, so it joins advisory/relation/negation on the
 *  UPDATE branch (re-admitting the SAME sha-pair is an in-place UPDATE, never a dup). Its LINEAGE supersession
 *  (a later transition on the same unitKey, a DIFFERENT sha-pair ⇒ a DISTINCT transitionKey ⇒ its own CREATE)
 *  is a DERIVE-ON-READ verdict over the lineage (read/transitions.ts), never a write-time route (D-T3).
 *  WIDENED AGAIN by ADR-0015 D5 (#95) with `test-vacuity` — a single-anchor PROVEN AST-shape fact that ALSO
 *  carries NO `check` (its oracle is tree-sitter, not SCIP), so it joins advisory/relation/negation/transition
 *  on the `family !== 'predicate'` UPDATE branch: re-evidencing the SAME `testVacuityKey` is an in-place UPDATE
 *  (append claim/provenance), NEVER a SUPERSEDE-by-routing. */
export type NodeFamily = "advisory" | "predicate" | "relation" | "negation" | "transition" | "test-vacuity"

/**
 * The enumerated routing product — the four orthogonal, already-RESOLVED oracle inputs the
 * write-decision routes over (INV-KNOW-4 down-model). `contentHashHit`/`nodeKeyHit` are resolved
 * upstream (the hash VALUES + the store lookup); `checkSame` matters only for the predicate family
 * (a predicate `nodeKey` encodes `normalize(check)`, so a hit ⟺ the same check re-evidenced).
 */
export interface RouteInputs {
  readonly contentHashHit: boolean // WHAT  — dedup leg (contentHash already in CAS)
  readonly nodeKeyHit: boolean // WHICH — create/update leg (nodeKey present in the territory)
  readonly family: NodeFamily // advisory ⇒ set-union · predicate ⇒ supersede-with-lineage
  readonly checkSame: boolean // predicate: same `check` re-evidenced (else it is a different nodeKey)
}

/**
 * The pure write-decision (KNOW-4). Total + deterministic + mutually-exclusive over the finite
 * routing product; no LLM/clock/seq enters. Precedence: identical bytes (DEDUP) short-circuit
 * regardless of nodeKey (idempotent no-op, 4b); a nodeKey miss is a CREATE (4f — a different check
 * is a different nodeKey); a nodeKey hit routes by family — advisory edits in place / set-union
 * (UPDATE, 4c/4d), predicate same-check re-evidence supersedes with lineage (SUPERSEDE, 4e).
 */
export function routeWrite(inputs: RouteInputs): WriteDecision {
  if (inputs.contentHashHit) return "DEDUP" // 4b — byte-identical fact, idempotent no-op
  if (!inputs.nodeKeyHit) return "CREATE" // 4f — new (anchor, slot[, check]) OR a different check
  // 4c/4d — claim set-union, edited in place. A `relation` (ADR-0015 D2), a `negation` (ADR-0015 D3) AND a
  // `transition` (ADR-0015 D4) each have NO `check`, so re-evidencing an existing relationKey/negationKey/
  // transitionKey is an UPDATE (append the claim/provenance), never a SUPERSEDE — all three join advisory on
  // this `family !== 'predicate'` branch. An `AbstainedRecord`→negation transition is an EXPLICIT supersede on
  // the shared negationKey address, handled at the door (N2), NOT by this routing function. A transition's
  // LINEAGE supersession (D-T3) is likewise NOT a route here: a later transition on the same unitKey has a
  // DIFFERENT sha-pair ⇒ a DIFFERENT transitionKey ⇒ its own CREATE, and which one is the lineage HEAD is a
  // DERIVE-ON-READ verdict (read/transitions.ts), never a write-time mutation of the incumbent. A
  // `test-vacuity` (ADR-0015 D5) likewise carries NO `check`, so re-evidencing an existing testVacuityKey is
  // an UPDATE on this same `family !== 'predicate'` branch, never a SUPERSEDE-by-routing.
  if (inputs.family !== "predicate") return "UPDATE"
  return inputs.checkSame ? "SUPERSEDE" : "CREATE" // 4e — same-check re-evidence supersedes
}

// ── the upsert REDUCER (projection types + `upsert`/`currentNodes`) now lives in `upsert.ts` ──────────
// Split out at the 400-LOC godfile ceiling along the section boundary this file already drew (see that
// module's header). RE-EXPORTED here so the package surface — and every existing `write/router.js` import —
// is byte-identical to the pre-split form; the identity legs below did NOT move (LEAD-RATIFIED placement).
export * from "./upsert.js"

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-5.13-b.KNOW · EPIC-13-b — THE ANCHOR-IDENTITY FACET (additive; 5.13-a's routeWrite/upsert above
// are untouched). Implements the FROZEN `RouterApi.nodeKey` / `RouterApi.primaryAnchorId` (co-located
// above, which RATIFIES these live HERE — "no separate anchor.ts") + the near-dup probe and the closed slot
// vocabulary. The write-decision's identity leg is COMPUTED, never judged: pure hash+symbol functions,
// ZERO LLM/clock/seq (KNOW-15j). All digests are minted through the SEALED @atlas/kernel encoder seam
// (`defaultEncoder` + `canonicalForm`) and branded via `asNodeKey` — NO raw hashing (SEAM).
//
// BIND (vs the frozen RouterApi + types.ts): `predicateSlot` is the required `Candidate.slot`
// (closed 13-member `PredicateSlot`, R3-surfaced on `GroundedFact` too); `check` presence discriminates
// predicate vs advisory. The move-aware RE-ANCHORING matcher (rename/move ⇒ same nodeKey) and the
// near-synonym similarity threshold are UPSTREAM + OPEN-DEFINE parametric (SCN-KNOW-15f-2 θ / 15h-2 τ,
// `residue`): they fix the VALUE of the nodeKey oracle-input the router routes over — NOT re-modeled
// here, and NO verification is invented for an unpinned threshold (method-tags-knw §Refuse-to-model).
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The closed `predicateSlot` vocabulary (NORMATIVE — all 13 members, `PredicateSlot` in types.ts). CLOSED:
 *  adding a slot is a `cv` bump. Finiteness is what lets a `nodeKey` collide + force UPDATE/union
 *  instead of proliferating parallel nodes (atlas-knowledge:150 / SCN-KNOW-15i-1).
 *
 *  THE ONE RUNTIME COPY (#152). The members were transcribed in THREE places and enforced in none:
 *  the `PredicateSlot` union (types.ts — a TYPE, erased at runtime, so it enforces nothing at a value
 *  boundary), a second `CLOSED_SLOTS` literal in `template.ts` (KNOW-10), and this list. `template.ts`'s
 *  `isClosedSlot` now DELEGATES to {@link isKnownSlot} rather than restating the members, so a `cv` bump
 *  edits exactly one runtime list. This one is where it belongs: `nodeKey` — the identity the closedness
 *  exists to protect — is computed in THIS file. */
export const PREDICATE_SLOTS: readonly PredicateSlot[] = [
  "invariant",
  "contract",
  "precondition",
  "postcondition",
  "sideeffect",
  "ownership",
  "perf-bound",
  "security-property",
  "gotcha",
  "rationale",
  "dependency",
  "count",
  "definition",
]
const SLOT_SET: ReadonlySet<string> = new Set(PREDICATE_SLOTS)

/** Closed-vocabulary membership guard (KNOW-15i / KNOW-10). A slot outside the 13 enumerated members is
 *  rejected — a free-text slot never collides, so `nodeKey` never forces UPDATE and the store would
 *  proliferate. TOTAL over `unknown`: `Set.has` never throws and never coerces, so an array, an object with
 *  a `toString`, a `Symbol` or an absent value all answer `false` at the value boundary where the erased
 *  `PredicateSlot` type stops helping. ENFORCED at `upsert` (upsert.ts) — until #152 this guard had zero
 *  production callers and an out-of-vocabulary slot was ACCEPTED by the shipped `atlas emit`. */
export function isKnownSlot(slot: unknown): boolean {
  return typeof slot === "string" && SLOT_SET.has(slot)
}

/** Canonical `normalize(check)` — the predicate identity ingredient (KNOW-15c). Deterministic + total:
 *  the tagged-union kind + the NFC-normalized, trimmed body. Folded into the predicate `nodeKey` so a
 *  DISTINCT check is a DISTINCT node (never a sibling-supersede). No LLM/clock. */
export function normalizeCheck(check: Check): string {
  const body = check.kind === "index-query" ? check.query : check.expr
  return `${check.kind}${body.normalize("NFC").trim()}`
}

/** Split a `qualifiedPath` on its structural-unit boundary (`::`) into ancestor segments. */
function segments(qualifiedPath: string): readonly string[] {
  return qualifiedPath.split("::")
}

/** The deepest common structural ancestor of a set of anchor paths — the smallest AST subtree that
 *  contains every one of them (segment-wise longest common prefix). This is the mechanical
 *  "tightest structural unit containing every referenced symbol" (KNOW-15d). Total + deterministic. */
function deepestCommonUnit(paths: readonly string[]): string {
  if (paths.length === 0) return ""
  let common: readonly string[] = segments(paths[0]!)
  for (const p of paths.slice(1)) {
    const segs = segments(p)
    let i = 0
    while (i < common.length && i < segs.length && common[i] === segs[i]) i++
    common = common.slice(0, i)
  }
  return common.join("::")
}

/**
 * THE REFUSAL an un-namable grounding earns (KNOW-15d). Stated in the write-door's voice — long, specific,
 * and it explains the MECHANISM — because it is the caller's only signal and the caller can act on it.
 *
 * WHY A GROUNDING CAN FAIL TO NAME A FACT. `primaryAnchorId` is a segment-wise longest common prefix over
 * the `::` structural chain. The FIRST segment of a symbol path is its FILE (`src/billing.ts::7:fn:charge`),
 * so two symbols in two different files share NO prefix and the common unit is the EMPTY STRING. That empty
 * string used to be minted as the anchor, and `nodeKey = hash(primaryAnchorId ‖ predicateSlot [‖ check])`
 * then collapsed EVERY such fact in the repository onto ONE address per slot. Reproduced through the front
 * door with no hash weakness whatsoever: a fact grounded at `[src/billing.ts::charge, src/ledger.ts::post]`
 * and a fact grounded at `[vendor/evil.ts::pwn, docs/readme.ts::x]` minted the SAME nodeKey, the second
 * `atlas emit` routed to UPDATE, and the advisory set-union appended the second claim to the first fact's
 * node — the confused-deputy objective reached with a DEGENERATE ANCHOR instead of a broken digest.
 *
 * An empty anchor is not an identity, it is a WILDCARD, and a wildcard in an identity function is a
 * collision generator: it matches everything, so it OWNS everything. The remedy is not a better hash — the
 * hash was never the weak part — it is to refuse to mint an address that does not name what it addresses.
 *
 * WHAT THE AUTHOR DOES ABOUT IT, because a refusal that leaves no way forward is a brick: re-ground the
 * claim at the single unit that really does contain every cited site (the file, the module, the directory
 * node the spatial axis already carries), or emit ONE fact per site and let the read-side `subsumes`
 * relation put them back together. Both are ordinary writes. Nothing is made permanently un-writable: this
 * gate reads the GROUNDING the author sends and nothing else — no stored state, no incumbent, no policy —
 * so a refusal is a statement about this payload, reversible by re-sending a better-grounded one.
 *
 * WHY NOT MINT A COVERING ANCHOR INSTEAD (the alternative was measured, not assumed): the common DIRECTORY
 * re-creates the same defect one level down — a diffuse grounding under `src/` would mint the anchor `src`,
 * which is exactly the anchor an honest fact grounded at the `src` directory node mints, so an attacker
 * needing only two symbols in two files under `src/` lands on it. A composite over the sorted site list IS
 * collision-free, but it is not a structural unit: `deriveSubsumes` reads `::`-prefix containment, so such a
 * node can never be broader or narrower than anything, and two authors of the SAME cross-cutting invariant
 * citing slightly different site sets get two un-unionable nodes — the proliferation the closed slot
 * vocabulary exists to prevent (atlas-knowledge:150). Refusal keeps identity meaning what it says.
 */
export const DEGENERATE_ANCHOR_REASON =
  "degenerate anchor: this grounding does not name ONE structural unit, so there is no address to write it " +
  "to. The primary anchor is the deepest unit CONTAINING every cited site, computed as the common prefix of " +
  "the `::` structural chain; when the cited sites live in different files that common prefix is EMPTY, and " +
  "an empty anchor is not an identity but a WILDCARD — `nodeKey` would collapse every such fact in the " +
  "repository onto ONE address per predicate slot, where the advisory set-union would merge unrelated " +
  "claims into whichever fact got there first. The same refusal covers a cited anchor whose `qualifiedPath` " +
  "is absent or not a non-empty string, which computes the identical empty prefix by a different route. " +
  "Re-ground the claim at the single unit that genuinely contains every site it cites, or emit one fact per " +
  "site and let the derived `subsumes` relation relate them"

/** The refusal, as a THROWN value the composed doors already convert into a structured rejection (the tools
 *  handler turns a leg throw into a fail-closed `Verdict`, persisting nothing). A named class — never a bare
 *  `Error` and never the raw `TypeError` an unguarded `.split` on a non-string would have produced — so a
 *  caller can discriminate this refusal from an internal fault. */
export class DegenerateAnchorError extends Error {
  constructor() {
    super(DEGENERATE_ANCHOR_REASON)
    this.name = "DegenerateAnchorError"
  }
}

/** `true` iff `v` is a string that could name a unit. Anchors arrive over `JSON.parse` + a cast (the CLI) or
 *  a bare `object` schema (MCP), so `qualifiedPath` is TYPE-ONLY at this seam exactly as `Tier`/`Scope` are:
 *  refused here or nowhere. Total over `unknown`, fail-CLOSED. */
function isAnchorPath(v: unknown): v is string {
  return typeof v === "string" && v.length > 0
}

/**
 * The cited anchor paths that ENTER IDENTITY, read totally over `unknown`. The selection is unchanged from
 * the pre-guard form — symbol anchors if any are cited, else the FIRST entry (broader citations are
 * SECONDARY: they feed drift, never the key, KNOW-15g) — but every hop is now defensive, because a
 * `Candidate` reaches this seam through an `as unknown as Candidate` cast on both write paths and its
 * declared types are erased. A malformed shape yields the EMPTY list, which the caller refuses; it never
 * throws a raw `TypeError` out of a door and it never silently contributes a coerced path to the prefix.
 */
function identityAnchorPaths(node: Candidate): readonly string[] {
  const entries: unknown = (node as { grounding?: { entries?: unknown } } | null | undefined)?.grounding?.entries
  if (!Array.isArray(entries)) return []
  const anchorOf = (e: unknown): { kind?: unknown; qualifiedPath?: unknown } | undefined =>
    (e as { anchor?: { kind?: unknown; qualifiedPath?: unknown } } | null | undefined)?.anchor
  const symbolAnchors = entries.filter((e) => anchorOf(e)?.kind === "symbol")
  const source = symbolAnchors.length > 0 ? symbolAnchors : entries.slice(0, 1)
  const paths = source.map((e) => anchorOf(e)?.qualifiedPath)
  return paths.every(isAnchorPath) ? paths : [] // one bad path poisons the prefix ⇒ refuse the whole set
}

/**
 * The COMPUTED primary anchor (KNOW-15d) — the tightest structural unit containing every SYMBOL the
 * claim references, resolved MECHANICALLY from the grounding (never an LLM-chosen anchor, KNOW-15e).
 * ONLY the primary symbol anchors enter identity: broader (block/file/repo/project) citations are
 * SECONDARY — they live in `grounding.entries` and feed DRIFT only, never the `nodeKey` (KNOW-15g).
 * No LLM. (The move-aware re-anchoring across rename/move is the UPSTREAM matcher — OPEN-DEFINE
 * parametric, not computed here; see the facet header.)
 *
 * TOTALITY, HONESTLY STATED — this facet's header used to call this function "total", and it was, in the
 * sense that it returned a value for every input; it returned the WILDCARD for a whole class of them, which
 * is worse than being undefined there. It is now total in the sense that matters: it is defined over every
 * `unknown` shape (see `identityAnchorPaths`) and it either returns an anchor that REALLY CONTAINS every
 * site it was computed from, or it refuses. There is no third outcome and no input that reaches a raw throw
 * from inside. Determinism, purity and freedom from clock/LLM are untouched.
 *
 * THE GUARD LIVES HERE, ONCE, ON PURPOSE. `nodeKey` is defined in terms of this function, so the identity
 * key and the stored `primaryAnchor` carrier are validated by the SAME check and cannot disagree — the
 * shape of the recent regression in this area was a pair where one half was validated and the other was
 * not, which left an anchor that passed one gate and failed the other forever.
 */
export function primaryAnchorId(node: Candidate): NodeKey {
  const paths = identityAnchorPaths(node)
  const common = paths.length > 0 ? deepestCommonUnit(paths) : ""
  // The whole defect in one line: an empty common unit is a wildcard, so it is REFUSED, never minted.
  if (common === "") throw new DegenerateAnchorError()
  return asNodeKey(common)
}

/**
 * The node identity leg (KNOW-15b/15c) via the SEALED kernel digest seam:
 *   advisory  → `hash(primaryAnchorId ‖ predicateSlot)`                    — body-wording independent
 *   predicate → `hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` — a distinct check ⇒ distinct node
 * `check` presence discriminates the family. Pure + total, no LLM. The `‖` concatenation is the injective
 * canonical preimage (`canonicalForm`, sorted keys / NFC / floats-forbidden), hashed through
 * `defaultEncoder` and branded `asNodeKey` — the sole sanctioned nodeKey mint (no raw hashing).
 */
export function nodeKey(node: Candidate): NodeKey {
  const anchor = primaryAnchorId(node) as string
  const preimage = node.check
    ? { a: anchor, c: normalizeCheck(node.check), s: node.slot } // predicate: folds in normalize(check)
    : { a: anchor, s: node.slot } // advisory: anchor ‖ slot only
  return asNodeKey(defaultEncoder.hash(canonicalForm(preimage)))
}

// RELATION IDENTITY (ADR-0015 D2 · #99a) — the 2-ended fact's identity leg lives in its own module at the
// 400-LOC ceiling, cohesively (mirrors `closed-slot.ts`). Re-exported below so the package surface is unchanged.
export * from "./relation-key.js"

// NEGATION IDENTITY (ADR-0015 D3 · #99b) — the scoped-negative's identity leg, the 3-legged sibling of
// `relation-key.js` (reuses its closed `RelationKind` vocabulary). Re-exported here beside it, same pattern.
export * from "./negation-key.js"

// TRANSITION IDENTITY (ADR-0015 D4 · #234) — the 2-rev historical record's identity leg, the directed 3-legged
// sibling of `negation-key.js`/`relation-key.js` (the (unitKey, shaBefore, shaAfter) triple). Re-exported here
// beside them, same pattern — so the package surface is unchanged.
export * from "./transition-key.js"

// TEST-VACUITY IDENTITY (ADR-0015 D5 · #95) — the single-anchor PROVEN AST-shape fact's identity leg, the
// 2-legged sibling of `negation-key.js`/`transition-key.js` (the (unitKey, testName) pair). Re-exported here
// beside them, same pattern — so the package surface is unchanged.
export * from "./test-vacuity-key.js"

/**
 * THE composed write-decision FRONT DOOR (KNOW-4/15) — owner-RATIFIED un-park of the s05 PARK. COMPOSED
 * end-to-end from the pure functions above; it invents NO routing. The three orthogonal legs resolve as:
 *   1. contentHash (WHAT, atlas-knowledge:110) — `id(candidate) = defaultEncoder.hash(canonicalForm(·))`,
 *      the SEALED kernel identity seam (no raw hashing); a CAS hit DEDUPs and SHORT-CIRCUITS everything.
 *   2. nodeKey (WHICH) — the existing `nodeKey(candidate)` identity leg; its presence in the projection's
 *      current map is the create/update oracle-input.
 *   3. family/checkSame — `candidate.check ? 'predicate' : 'advisory'`, and (mirroring `upsert` at the
 *      derivation above) `checkSame = family==='predicate' && nodeKeyHit` (a predicate nodeKey folds in
 *      normalize(check), so a hit ⟺ the same check re-evidenced).
 * These feed the existing pure `routeWrite`. PRECEDENCE: DEDUP short-circuits; else `routeWrite`'s cell
 * stands and is returned directly. Pure + total + deterministic — no LLM/clock/seq enters.
 *
 * [UN-MERGED — WP-DEDUP-1] the ADJACENCY-B door-2 always-merge is REMOVED. `writeDecision` no longer runs an
 * adjacency probe over the route: a routed CREATE at an adjacent anchor stays a CREATE and mints its own node
 * (each keeps its own grounding — A2). Adjacency is now a DERIVED-ON-READ `subsumes` relation (WP-DEDUP-2,
 * `deriveSubsumes`), never a write-time merge.
 *
 * [#242] the `cfg: NearDupConfig` parameter this signature used to carry is DELETED, not "retained for a
 * DP-2 successor" — that successor never arrived, `cfg` was never read here, and the type it validated a
 * value into was threaded from `.atlas/policy.json` through `nearDupConfig()` to exactly zero callers
 * outside this file's own former signature. See the interface doc above and the #242 PR body.
 */
export function writeDecision(candidate: Candidate, store: StoreProjection): WriteDecision {
  const contentHashHit = store.cas.has(id(candidate) as string) // leg 1 — WHAT (sealed seam)
  if (contentHashHit) return "DEDUP" // dedup precedence: identical bytes short-circuit (KNOW-4b)

  const nodeKeyHit = store.current.has(nodeKey(candidate) as string) // leg 2 — WHICH
  const family: NodeFamily = candidate.check ? "predicate" : "advisory"
  const checkSame = family === "predicate" && nodeKeyHit // mirror upsert: predicate hit ⟺ same check
  return routeWrite({ contentHashHit: false, nodeKeyHit, family, checkSame })
}
