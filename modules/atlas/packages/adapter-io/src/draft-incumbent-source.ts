// @atlas/adapter-io — src/draft-incumbent-source.ts  (WP-10.A2-b.TOOLS/ADAPTER landing pair — the `IncumbentPort` IMPL)
//
// IMPLEMENTS the `@atlas/tools`-declared `IncumbentPort` port (`draft.ts`, AUTHOR-9/10) over the REAL
// durable projection (`store.loadProjection()?.current`, a READ-ONLY snapshot — never a write, never a
// live transaction) + the REAL `ratifyCtxFor` (`governed-emit-route.ts`, the SAME function the governed
// emit door builds its own `RatifyContext` from). This module does NOT re-derive the KNOW-18 fast-path
// policy and does NOT re-implement occupancy lookup: it is a thin adapter over TWO already-shipped seams.
//
// Per ARCH-2 the port lives in `@atlas/tools` (the innermost layer); this file is the adapter-io CONSUMER
// of that freeze, exactly the same split `check-source.ts` uses for `GateChainRunner`.

import type { NodeKey, Tier } from "@atlas/contracts"
import type { CurrentNode, RatifyContext } from "@atlas/knowledge"
import type { IncumbentPort } from "@atlas/tools"
import { ratifyCtxFor } from "./governed-emit-route.js"
import type { DiskStore } from "./store.js"

/**
 * Build the `@atlas/tools` `IncumbentPort` over `store` — the SAME store the durable governed emit door
 * (and the `check` dry-run leg) reads/writes. Occupancy is looked up by `nodeKey` against
 * `StoreProjection.current` (`ReadonlyMap<string, CurrentNode>`, keyed on `nodeKey` — @atlas/knowledge
 * `write/projection-types.ts`), NEVER by the CAS `contentHash` (SCN-AUTH-10c-1's teeth: a reworded claim at
 * the SAME `(anchor, slot)` keeps the SAME `nodeKey`, a DIFFERENT `contentHash`, and must still read
 * UPDATE). `ratifyContextFor` delegates to `ratifyCtxFor` verbatim — the door's own context builder, never
 * a second copy of its `{contested, lowRisk}` defaults.
 */
export function buildDraftIncumbentPort(store: DiskStore): IncumbentPort {
  return {
    incumbentAt(key: NodeKey): CurrentNode | undefined {
      return store.loadProjection()?.current.get(key as unknown as string)
    },
    ratifyContextFor(derivedTier: Tier | undefined): RatifyContext {
      // `origin` absent ⇒ authored (a draft is never a promotion out of staging). A DRAFT IS A PREVIEW: it
      // shows the road the write WOULD take; it has no truth-gate verdict and no commit loop yet, so its
      // fast-path verdicts are the preview's optimistic read — `lowRisk` for a grounded T2 advisory draft,
      // `contested:false` (a preview never contends). This is NOT the governed door: the door derives both
      // from real state (INV-AUTH-15); the port here is the drafting surface, which the INV does not bind.
      return ratifyCtxFor(derivedTier, { lowRisk: true, contested: false })
    },
  }
}
