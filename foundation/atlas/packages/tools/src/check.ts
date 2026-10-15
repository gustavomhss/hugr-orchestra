// @atlas/tools — src/check.ts   (WP-10.A3.TOOLS — AUTHOR-11/12, ADR-0004)
//
// `check` — the read-only DRY-RUN planner that answers "would the governed emit door accept this candidate,
// and if not, at which gate, why, and what would fix it" (AUTHOR-11). It is a PLANNER: it reads and returns,
// persists NOTHING, and carries NO write authority (AUTHOR-2) — it is NOT a member of `GOVERNANCE_SURFACE`
// or `WRITE_PATHS`. It holds NO store handle of any kind — not even a read-only one.
//
// ── THE PORT (`GateChainRunner`) — DECLARED HERE, IMPLEMENTED BY @atlas/adapter-io ─────────────────────────
// WP-10.A3.ADAPTER already extracted + shipped the governed emit door's WHOLE gate chain as a PURE,
// store-less fold (`runGateChain`, `governed-emit-gates.ts`) — it resolves the incumbent from a READ-ONLY
// `store.loadProjection()` SNAPSHOT (never a live transaction, never a write) and folds the identical four
// gate predicates the door itself calls, in the identical order. `@atlas/tools` is the innermost port layer
// and MUST NOT import `@atlas/adapter-io` (ARCH-2 — layer-guard enforces it), so this facet DECLARES the
// seam as a port — `GateChainRunner` — and @atlas/adapter-io IMPLEMENTS it (`check-source.ts`, WP-10.A3.ADAPTER)
// by calling the ALREADY-SHIPPED `runGateChain`, never re-implementing a second gate ladder here. This is the
// SAME split `GroundingComputer` (anchors.ts) uses for the identical reason.
//
// ── PARITY BY CONSTRUCTION (AUTHOR-11, PROP-AUTH-11) ────────────────────────────────────────────────────
// Because the port's real implementation is a thin wrapper over the SAME `runGateChain` fold the door's own
// gate predicates flow through, a `check` verdict and the door's verdict cannot diverge on WHICH gate refuses
// first, or on `wouldEmit` — by CONSTRUCTION, never by a second parallel gate re-implementation living in
// this facet (AUTHOR-11's "no gate re-implementation" clause). The ONE thing a dry run cannot and does not
// claim to rule out is a store mutation BETWEEN the read-only snapshot read and a later real `emit` — the
// door's own header states the identical caveat for `runGateChain`.

import type { Hash } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { CheckOut } from "./types.js"

/**
 * The ONE gate-chain runner (AUTHOR-11) — the PORT declared by @atlas/tools and IMPLEMENTED by
 * @atlas/adapter-io over the ALREADY-SHIPPED `runGateChain` (`governed-emit-gates.ts`, WP-10.A3.ADAPTER).
 * `@atlas/tools` CONSUMES this port; the concrete fold — including the read-only store snapshot the
 * incumbent-derived `authz`/`ratify` buckets need — is the @atlas/adapter-io axis, injected here, NEVER
 * computed or re-implemented in this facet.
 */
export interface GateChainRunner {
  /** Fold the WHOLE gate chain — shape → truth → authz → ratify — over `candidate` at `at`, WITHOUT any
   *  write, and report it in the exact `CheckOut` shape (`wouldEmit` + the per-gate `gates` row set, in door
   *  order, each failing row carrying a non-empty `remedy` — AUTHOR-12b). */
  runChain(candidate: GroundedFact, at: Hash): CheckOut
}

export interface CheckApi {
  /** Dry-run the governed emit door's WHOLE gate chain over a candidate — WITHOUT any write (AUTHOR-11).
   *  Pure + total over the injected `GateChainRunner`; the verdict AND the first-refusing gate agree with
   *  the real door's by construction (PROP-AUTH-11), never by a second gate implementation. */
  check(candidate: GroundedFact, at: Hash): CheckOut
}

/**
 * Build the `check` planner over an injected `GateChainRunner` (AUTHOR-11). The returned `check` conforms
 * EXACTLY to the frozen `CheckOut` shape (`types.ts`). Pure + total and READ-ONLY: it routes to the injected
 * runner and persists NOTHING (AUTHOR-2) — this facet holds no store handle, reads no snapshot itself, and
 * folds no gate itself; every one of those is the injected port's job.
 */
export function createCheck(runner: GateChainRunner): CheckApi {
  const check = (candidate: GroundedFact, at: Hash): CheckOut => runner.runChain(candidate, at)
  return { check }
}

// differential-vs-oracle (compile-time): the impl's `check` conforms to the co-located frozen `CheckApi.check`
// signature. `GateChainRunner` is the SAME seam the governed door's `runGateChain` fold answers — the port
// stays UNIMPLEMENTED here, satisfied by injection.
const _checkConforms: CheckApi["check"] = createCheck({
  runChain: () => ({ wouldEmit: true, gates: [] }),
}).check
void _checkConforms
