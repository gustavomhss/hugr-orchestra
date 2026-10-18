// @atlas/tools — src/draft.ts   (WP-10.A2-a.TOOLS — AUTHOR-6/7, ADR-0004)
//
// `draft` — the read-only COMPOSITION planner that answers "give me a payload the door will accept"
// (§Composition). `draft({anchor, slot, claim})` composes a candidate `GroundedFact` (advisory family —
// the author supplies no `check`) whose IDENTITY is MINTED by the product's own `nodeKey` formula
// (`@atlas/knowledge` KNOW-15b — hash(primaryAnchorId ‖ predicateSlot), NEVER invented here), whose
// GROUNDING comes from the ONE injected `GroundingComputer` port (AUTHOR-1 — the SAME seam the emit
// truth-gate re-derives against), stamped with the `rev` that grounding was computed at (AUTHOR-7). It is
// a PLANNER: it reads and returns, persists NOTHING, and carries NO write authority (AUTHOR-2) — it is NOT
// a member of `GOVERNANCE_SURFACE` or `WRITE_PATHS`.
//
// THE THREE-FIELD DISCIPLINE (AUTHOR-6d). `GroundingCandidate` (anchors.ts) is the WHOLE input: `anchor`,
// `slot`, `claim`. Every other field of the returned `fact` is COMPUTED (`id` via `nodeKey`, `grounding`
// via the injected computer) or DEFAULTED (`tier`, `freshness`, `claims`, `authoring`, `scope`) — never
// demanded of the author (AUTHOR-6f).
//
// [WP-10.A2-b.TOOLS — AUTHOR-9/10/13, ADR-0004.] `operation`/`route` are no longer conservative defaults:
// this facet now closes over a SECOND injected port (`IncumbentPort`, declared below) that answers the two
// questions the file-header note above used to declare out of scope:
//   - `operation` (AUTHOR-10) — CREATE vs UPDATE, by an INCUMBENT LOOKUP keyed on the SAME `nodeKey` this
//     planner mints (`id`, below), NEVER on the CAS `contentHash` (SCN-AUTH-10c-1's teeth: a reworded claim
//     at the SAME `(anchor, slot)` keeps the SAME `nodeKey` and so must still read UPDATE, not a second
//     CREATE — a contentHash-keyed check would get this backwards, since a reworded claim changes the
//     content).
//   - `route` (AUTHOR-9) — this facet CALLS the existing `route` function (`@atlas/knowledge`
//     `ratify/fastpath.ts`), never re-derives the KNOW-18 fast-path policy. The `RatifyContext` `route`
//     needs (`lowRisk`/`contested`/`derivedTier`/`origin`) is STORE/THRESHOLD-derived and so is also
//     supplied by the injected port (`ratifyContextFor`) — built, on the production side, from the SAME
//     `ratifyCtxFor` the real governed emit door computes its own context from (`adapter-io`
//     `governed-emit-route.ts`), so a drafted route and the door's own route agree by construction on the
//     SAME incumbent state, never a second parallel policy.
//
// THE LAYER SPLIT (same shape `GroundingComputer`/`GateChainRunner` already use, ARCH-2): the incumbent
// lookup + ratify-context are STORE-derived, but `@atlas/tools` MUST NOT import `@atlas/adapter-io`. So
// `IncumbentPort` is a PORT declared here and IMPLEMENTED by `@atlas/adapter-io` (`draft-incumbent-source.ts`)
// over the REAL durable projection — this facet holds no store handle of any kind, exactly like `anchors`
// and `check` before it.
//
// AUTHOR-13 (retire/supersede is a DRAFT VARIANT, not a door): `draftSupersede` reuses the IDENTICAL
// composition `draft` runs — same grounding seam, same identity mint, same incumbent lookup, same route
// call — and differs in EXACTLY one field: the drafted fact's `authoring` is stamped `'SUPERSEDED'` instead
// of `'ADVISORY'`. No new write door is opened; a supersede is persisted through the SAME `atlas-emit` gate
// chain any other draft is (AUTHOR-13b/d) — this facet still PERSISTS NOTHING (AUTHOR-2).

import { nodeKey, route } from "@atlas/knowledge"
import type { Candidate, ClaimProvenance, CurrentNode, GroundedFact, RatifyContext } from "@atlas/knowledge"
import type { NodeKey, Tier } from "@atlas/contracts"
import type { Grounding } from "@atlas/grounding"
import type { DraftOut } from "./types.js"
import type { GroundingCandidate, GroundingComputer } from "./anchors.js"

/**
 * The STORE-derived seam `draft`/`draftSupersede` need and `@atlas/tools` MUST NOT reach for directly
 * (ARCH-2) — declared here, IMPLEMENTED by `@atlas/adapter-io` (`draft-incumbent-source.ts`) over the real
 * durable projection + the real `ratifyCtxFor`. The SAME split `GroundingComputer` (anchors.ts) and
 * `GateChainRunner` (check.ts) use, for the identical reason.
 */
export interface IncumbentPort {
  /** Look up the CURRENT node at `key` — the SAME `nodeKey` this planner mints (AUTHOR-10). Occupancy is
   *  keyed on the `nodeKey`, NEVER on the CAS `contentHash` (SCN-AUTH-10c-1's teeth). `undefined` ⇒ no
   *  current node at that identity ⇒ CREATE; a defined result ⇒ UPDATE. Read-only — no write, no throw. */
  incumbentAt(key: NodeKey): CurrentNode | undefined
  /** Build the `RatifyContext` (`@atlas/knowledge` `ratify/fastpath.ts`) `route` needs for a write DERIVING
   *  `derivedTier` from the resolved incumbent (ARCH-9 — `undefined` on a CREATE) — the SAME store/threshold
   *  -derived defaults + door-derived class the real governed emit door computes its own context from,
   *  never re-invented here (AUTHOR-9's "never discover by refusal" clause depends on this NOT diverging). */
  ratifyContextFor(derivedTier: Tier | undefined): RatifyContext
}

export interface DraftApi {
  /** Compose a candidate `GroundedFact` from the author's `(anchor, slot, claim)` triple (AUTHOR-6), with
   *  `operation`/`route` resolved against the injected `IncumbentPort` (AUTHOR-9/10). Pure + total over the
   *  injected `GroundingComputer`/`IncumbentPort`; never throws on a candidate the computer can ground — an
   *  unresolvable anchor yields the computer's own empty `subtreeHash` (fail-closed at the emit gate, not
   *  here). */
  draft(candidate: GroundingCandidate): DraftOut
  /** AUTHOR-13 — express a retire/supersede as a DRAFT VARIANT, never a new write door. IDENTICAL
   *  composition to {@link DraftApi.draft}; the drafted fact's `authoring` is `'SUPERSEDED'` instead of
   *  `'ADVISORY'`. Persists NOTHING here — a supersede reaches the store only through the SAME `atlas-emit`
   *  gate chain any other draft does (AUTHOR-13b/d). */
  draftSupersede(candidate: GroundingCandidate): DraftOut
}

/** KNOW-6's move-in default — every territory ships `T2/advisory` "by construction" (`ratify/init.ts`).
 *  A hand-authored draft inherits the same honest default: nothing here has been reviewed, so it starts
 *  at the LEAST-privileged governance class, never a class the author merely typed. */
const DRAFT_TIER: Tier = "T2"

/** The claim's receipt (KNOW-14 — every claim MUST carry a provenance). `source` names THIS planner (not
 *  a person/commit — a draft is a session-internal value, never persisted by itself) and `trusted: false`
 *  because nothing here has been reviewed; an untrusted claim is excluded from the KNOW-17 confidence
 *  gate by construction (the fast-path's `lowRisk` conjunct), which is consistent with the conservative
 *  `route` this facet always reports (see file header). */
const DRAFT_PROVENANCE: ClaimProvenance = { source: "atlas-draft", trusted: false }

/** AUTHOR-9's "name the channel" clause — the REAL env channel `composeRuntime` (`adapter-io/src/
 *  compose.ts`) sources a KNOW-8 ratify token from (`ATLAS_RATIFY_TOKEN`), transcribed here so a draft
 *  names the SAME channel the door will actually consult, never an invented one. */
const RATIFY_CHANNEL = "ATLAS_RATIFY_TOKEN"

/**
 * Build the `draft`/`draftSupersede` planners over an injected `GroundingComputer` (AUTHOR-1) — the SAME
 * port `anchors` consumes, so a fact drafted here re-derives against the identical seam the emit truth-gate
 * re-derives against (AUTHOR-8's round-trip precondition) — and an injected `IncumbentPort` (AUTHOR-9/10)
 * for the occupancy lookup + `route` call. Pure + total and READ-ONLY: it persists NOTHING (AUTHOR-2).
 */
export function createDraft(computer: GroundingComputer, incumbent: IncumbentPort): DraftApi {
  const build = (input: GroundingCandidate, authoring: "ADVISORY" | "SUPERSEDED"): DraftOut => {
    // (a) GROUNDING — the ONE computer, never a second derivation (AUTHOR-1/6c).
    const anchor = computer.groundingFor(input)
    const grounding: Grounding = { entries: [{ anchor, path: anchor.qualifiedPath }] }
    // (b) REV — the same seam's `rev` leg (AUTHOR-7). `anchorsUnder` reports the SAME `rev` for every
    //     path (it is a constant of the built axes, not a per-path value); querying it AT the drafted
    //     anchor — rather than an arbitrary root path — keeps this a read OF the cited unit, not a second,
    //     unrelated call. Only `.rev` is read; `.units`/`.holes` are discarded (this is not a listing).
    const { rev } = computer.anchorsUnder(input.anchor)

    // THE CANDIDATE VIEW — the minimal `Candidate` `nodeKey`/`primaryAnchorId` read (`.grounding`, `.slot`,
    // absent `.check` ⇒ advisory). `claimText`/`provenance`/`tier` are NOT read by the identity formula but
    // are required by the `Candidate` shape; filled from the SAME defaults the drafted fact carries, never
    // invented ad hoc for identity alone.
    const candidateView: Candidate = {
      claimText: input.claim,
      claimNorm: input.claim,
      slot: input.slot,
      grounding,
      provenance: DRAFT_PROVENANCE,
      tier: DRAFT_TIER,
    }
    // IDENTITY IS MINTED, NEVER INVENTED (AUTHOR-6b) — the SAME `nodeKey` formula the governed emit door
    // recomputes from content at write time (`governed-emit.ts`: "the author-supplied payload `node.id` is
    // NEVER used for routing"). A draft that invented its own `id` would still emit correctly (the door
    // ignores it) — which is exactly why SCN-AUTH-6b-1 compares against the FORMULA, not against a
    // round-trip through emit. This SAME `id` is the occupancy key AUTHOR-10 reads below — NEVER the CAS
    // `contentHash`, so a reworded claim at the same `(anchor, slot)` — same `id`, different `claimNorm` —
    // still resolves an incumbent and reports UPDATE (SCN-AUTH-10c-1).
    const id = nodeKey(candidateView)

    // AUTHOR-10 — CREATE vs UPDATE by an INCUMBENT LOOKUP keyed on `id` (the minted `nodeKey`), through the
    // injected port — never a store handle held here, never a lookup keyed on content.
    const currentNode = incumbent.incumbentAt(id)
    const operation: "CREATE" | "UPDATE" = currentNode === undefined ? "CREATE" : "UPDATE"

    // AUTHOR-9 — CALL the existing `route` function (`@atlas/knowledge` `ratify/fastpath.ts`), never
    // re-derive its policy here. `ctx` is built by the injected port from the SAME incumbent just resolved
    // (ARCH-9's `derivedTier`, `undefined` on a CREATE) — the identical shape the real governed emit door
    // computes its own context from, so a drafted route cannot diverge from the door's on the SAME state.
    const ctx = incumbent.ratifyContextFor(currentNode?.tier)
    const routeVerdict = route(candidateView, ctx)

    // THE DRAFTED FACT — every field the emit door destructures (`governed-emit.ts` gate 0 / familyOf /
    // claimNormOf / candidateView) is present and well-formed: `tier` (a real `Tier`), `scope` (a
    // non-empty string — AUTHOR-6d defaults it; no anchor→scope authority oracle is available to this
    // planner, so this is a STRUCTURAL placeholder an author may override before `atlas emit`, never a
    // claim about which admin-declared scope owns the anchor), no `check` (⇒ advisory family), `claimNorm`,
    // `predicateSlot`. `freshness`/`claims` complete the `AdvisoryNode` shape the type demands (the door
    // does not gate on them, but a `GroundedFact` is not well-formed without them). `authoring` is the
    // AUTHOR-13 variant selector: `'ADVISORY'` for `draft`, `'SUPERSEDED'` for `draftSupersede` — the ONE
    // field that differs between the two legs.
    const fact: GroundedFact = {
      kind: "advisory",
      id,
      tier: DRAFT_TIER,
      claimNorm: input.claim,
      grounding,
      freshness: "FRESH",
      claims: [],
      authoring,
      scope: scopeOf(input.anchor),
      predicateSlot: input.slot,
    }

    return {
      fact,
      rev,
      operation,
      route: routeVerdict,
      // AUTHOR-9b — the authorizing channel is named ONLY when it is actually owed (`exactOptionalPropertyTypes`:
      // absent on `auto-accept`, present on `full-ratify`), so a caller reading `requires` on the fast path
      // does not see a channel nothing will ask it for.
      ...(routeVerdict === "full-ratify" ? { requires: RATIFY_CHANNEL } : {}),
    }
  }
  return {
    draft: (input) => build(input, "ADVISORY"),
    draftSupersede: (input) => build(input, "SUPERSEDED"),
  }
}

/** The FIRST path segment of an anchor's `qualifiedPath` (e.g. `packages/tools/src/foo.ts::bar` →
 *  `packages`) — a deterministic, purely STRUCTURAL default for `scope` (AUTHOR-6d: "computed or
 *  defaulted, never demanded"). It asserts NOTHING about which admin-declared governance scope actually
 *  owns this anchor (that binding — `scopeOwnsAnchor`, ARCH-9 — lives in the admin policy, `adapter-io/
 *  src/policy.ts`, a port not injected here); it exists only so the drafted fact is a well-formed non-empty
 *  string the emit door's gate-0 `isScope` check does not refuse outright. An author whose repository's
 *  policy names a different owning scope for this anchor MUST override the field before `atlas emit`.
 *  Never throws: an anchor with no `/` yields itself, whole. */
function scopeOf(anchor: string): string {
  const i = anchor.indexOf("/")
  const first = i < 0 ? anchor : anchor.slice(0, i)
  return first.length > 0 ? first : "root"
}

// differential-vs-oracle (compile-time): the impl's `draft`/`draftSupersede` conform to the co-located
// frozen `DraftApi` signatures. `GroundingComputer` is the SAME port `anchors` declares; `IncumbentPort` is
// declared above — BOTH stay UNIMPLEMENTED here, satisfied by injection.
const _draftApi: DraftApi = createDraft(
  {
    anchorsUnder: () => ({ rev: "", units: [], holes: [] }),
    groundingFor: () => ({ kind: "file", qualifiedPath: "", subtreeHash: "" as never }),
  },
  {
    incumbentAt: () => undefined,
    ratifyContextFor: () => ({ contested: false, lowRisk: true }),
  },
)
const _draftConforms: DraftApi["draft"] = _draftApi.draft
const _draftSupersedeConforms: DraftApi["draftSupersede"] = _draftApi.draftSupersede
void _draftConforms
void _draftSupersedeConforms
