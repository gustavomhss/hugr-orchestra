// @atlas/adapter-io — src/check-source.ts  (WP-10.A3.TOOLS/ADAPTER landing pair — the `GateChainRunner` IMPL)
//
// IMPLEMENTS the `@atlas/tools`-declared `GateChainRunner` port over the ALREADY-SHIPPED, store-less
// `runGateChain` fold (`governed-emit-gates.ts`, WP-10.A3.ADAPTER) — the SAME four gate predicates
// (`evalShapeGate` / `evalTruthGate` / `evalAuthzGate` / `evalRatifyGate`) the governed emit door itself
// calls, in the same order. This module does NOT re-implement a single gate: it is a thin adapter that
// resolves the incumbent from a READ-ONLY `store.loadProjection()` snapshot (never a write, never a live
// transaction — `runGateChain`'s own contract) and maps the fold's `GateChainOut` onto the frozen `CheckOut`
// shape (`gates`/`wouldEmit`; `firstFailure` is not part of `CheckOut` — a caller derives "the first
// refusing gate" from the last row of `gates` whenever `wouldEmit` is `false`, since the fold always stops at
// the first failure, mirroring the door's own short-circuit).
//
// Per ARCH-2 the port lives in `@atlas/tools` (the innermost layer); this file is the adapter-io CONSUMER of
// that freeze, exactly the same split `grounding-computer.ts` uses for `GroundingComputer`.

import type { GroundedFact } from "@atlas/knowledge"
import type { GateChainRunner } from "@atlas/tools"
import type { CheckOut } from "@atlas/tools"
import { runGateChain } from "./governed-emit-gates.js"
import type { GateChainDeps } from "./governed-emit-gates.js"

/**
 * Build the `@atlas/tools` `GateChainRunner` port over `runGateChain` (WP-10.A3.ADAPTER). `deps` is the
 * IDENTICAL dependency bag the real governed door is composed over (`store`/`gate`/`policy`/`actor`, plus
 * the optional `origin`/`ratifyToken`) — the SAME store, SAME truth-gate, SAME policy, SAME actor identity a
 * caller would pass to `createGovernedEmit`, so a dry run and a real emit for the SAME fact at the SAME rev
 * under the SAME actor and token can only diverge on a store mutation between the two calls (PROP-AUTH-11's
 * own caveat, never a difference in which predicates run).
 */
export function buildCheckPort(deps: GateChainDeps): GateChainRunner {
  return {
    runChain(candidate: GroundedFact, at): CheckOut {
      const folded = runGateChain(candidate, at, deps)
      return { wouldEmit: folded.wouldEmit, gates: folded.gates }
    },
  }
}
