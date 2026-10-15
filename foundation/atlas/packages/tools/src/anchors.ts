// @atlas/tools — src/anchors.ts   (WP-10.A1.TOOLS — AUTHOR-1/2/3/4, ADR-0004)
//
// `anchors` — the read-only DISCOVERY planner + the frozen `GroundingComputer` PORT. `anchors(path)` lists
// the groundable units the built index carries under `path`, each with its CURRENT `subtreeHash`, and
// DECLARES every language hole (AUTHOR-3/4). It is a PLANNER: it reads and returns, persists NOTHING, and
// carries NO write authority (AUTHOR-2) — it is NOT a member of `GOVERNANCE_SURFACE` or `WRITE_PATHS`.
//
// The `GroundingComputer` is the PORT this facet DECLARES and CONSUMES; @atlas/adapter-io IMPLEMENTS it
// (WP-10.A1.ADAPTER) over the SAME composition seam the `atlas-emit` truth-gate re-derives against — one
// grounding computer, no second derivation (AUTHOR-1). Per ARCH-2 the contract lives HERE (the innermost
// port layer); the adapter is the consumer of the freeze, not its owner. This facet declares the interface;
// it does NOT compute a grounding (that is WP-10.A1.ADAPTER — the leg receives the port by injection).

import type { StructRef } from "@atlas/contracts"
import type { PredicateSlot } from "@atlas/knowledge"
import type { AnchorsOut } from "./types.js"

export interface AnchorsApi {
  /** List the groundable anchor units under a tree `path` (AUTHOR-3/4) — each with its `qualifiedPath`,
   *  `kind`, and current `subtreeHash`, plus every declared language hole, reporting the `rev` the set was
   *  computed at. A path outside the tracked set / a non-git directory / an unreadable path yields the
   *  honest empty set WITH its reason — NEVER a throw (AUTHOR-3). Pure + total over the injected port. */
  anchors(path: string): AnchorsOut
}

/**
 * A candidate the author is preparing — the `(anchor, slot, claim)` triple AUTHOR-6 says the author
 * supplies; every other field of the drafted fact is computed or defaulted. This is the input to
 * `GroundingComputer.groundingFor`, exercised by `draft` (WP-10.A2-a.TOOLS); declared here so the port is
 * frozen WHOLE (both of its capabilities), not half-declared. `PredicateSlot` is the @atlas/knowledge-owned
 * closed vocabulary — imported, never redefined.
 */
export interface GroundingCandidate {
  readonly anchor: string // the `qualifiedPath` of the cited anchor unit to ground against (AUTHOR-6)
  readonly slot: PredicateSlot // the closed-vocabulary predicate slot the author chose
  readonly claim: string // the claim body the author supplies
}

/**
 * The ONE grounding computer (AUTHOR-1) — the PORT declared by @atlas/tools and IMPLEMENTED by
 * @atlas/adapter-io (WP-10.A1.ADAPTER). Every anchor set (b) and every grounding (a) this surface computes
 * MUST be derived through the SAME composition seam the `atlas-emit` truth-gate re-derives against — the
 * built `Axes` over `foldAstUnits(walkFileTree(repo))` plus the SCIP projection. There is NO second
 * derivation and NO cached digest table (AUTHOR-1). The impl OWNS its grammar warm-up: a caller MUST NOT
 * perform any set-up (an AST-grammar warm-up) for its fold to match the runtime's — AUTHOR-1's last clause,
 * grounded in the `author.ts:24-31` top-level `await initAst()` smell the seam retires. @atlas/tools
 * CONSUMES this port; the concrete derivation is the @atlas/adapter-io axis, injected here, NEVER computed
 * in this facet.
 */
export interface GroundingComputer {
  /** (b) List the groundable units the built index carries under `path`, with declared language holes and
   *  the `rev` (AUTHOR-3/4). Warm-up owned INSIDE this impl. NEVER throws — an untracked / non-git /
   *  unreadable path returns the honest empty listing (the `anchors` leg then guarantees a `reason`
   *  accompanies the empty set, AUTHOR-3). */
  anchorsUnder(path: string): AnchorsOut

  /** (a) Compute the grounding ANCHOR for a candidate at the current rev (AUTHOR-1/6) — its `subtreeHash`
   *  is the drift oracle the `atlas-emit` truth-gate re-derives against, so a draft grounded HERE matches
   *  the gate by construction. Declared now; exercised by `draft` / `check` (WP-10.A2-a / A3). `StructRef`
   *  is the @atlas/contracts grounding anchor (`{kind, qualifiedPath, subtreeHash}`) — imported, never
   *  redefined; the full multi-entry `Grounding` assembly is the draft leg's job, downstream of this value. */
  groundingFor(candidate: GroundingCandidate): StructRef
}

/** The honest-empty reason the leg supplies when the computer lists no units AND declares no reason itself
 *  (AUTHOR-3) — a FLOOR so `units:[]` never reaches a caller silent about why. A computer that already names
 *  a specific reason (untracked / non-git / unreadable) has it passed through verbatim. */
const EMPTY_NO_REASON =
  "no groundable units under path — outside the tracked set, a non-git directory, or unreadable (AUTHOR-3)"

/**
 * Build the `anchors` planner over an injected `GroundingComputer` (AUTHOR-1). The returned `anchors`
 * conforms EXACTLY to the frozen `AnchorsApi.anchors(path)` signature. Pure + total and READ-ONLY: it routes
 * to the injected computer and persists NOTHING (AUTHOR-2). It ENFORCES the honest-empty invariant
 * (AUTHOR-3): whenever the listing is empty it carries a `reason`, defaulting one only when the computer
 * left it absent — so an empty result is never silent about WHY, while a computer's own specific reason
 * survives unchanged.
 */
export function createAnchors(computer: GroundingComputer): { readonly anchors: AnchorsApi["anchors"] } {
  const anchors = (path: string): AnchorsOut => {
    const listing = computer.anchorsUnder(path)
    // Honest-empty invariant (AUTHOR-3): an empty unit set MUST carry a reason. A computer-supplied reason
    // travels verbatim; the floor reason is supplied ONLY when the empty listing carries none. A populated
    // listing is returned untouched (a reason on a non-empty set would be a lie about the result).
    if (listing.units.length === 0 && listing.reason === undefined) {
      return { ...listing, reason: EMPTY_NO_REASON }
    }
    return listing
  }
  return { anchors }
}

// differential-vs-oracle (compile-time): the impl's `anchors` conforms to the co-located frozen
// `AnchorsApi.anchors` signature. The concrete grounding derivation is a DISTINCT, out-of-facet port
// (WP-10.A1.ADAPTER) — the port stays UNIMPLEMENTED here, satisfied by injection, NEVER asserted.
const _anchorsConforms: AnchorsApi["anchors"] = createAnchors({
  anchorsUnder: () => ({ rev: "", units: [], holes: [] }),
  groundingFor: () => ({ kind: "file", qualifiedPath: "", subtreeHash: "" as StructRef["subtreeHash"] }),
}).anchors
void _anchorsConforms
