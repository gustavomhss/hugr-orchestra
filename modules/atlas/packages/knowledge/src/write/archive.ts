// @atlas/knowledge — src/archive.ts  (WP-5.14.KNOW · KNOW-12: nothing dies — git + CAS, no redundant copy)
//
// Implements the FROZEN `ArchiveApi` (co-located below): a predicate SUPERSEDE mints the superseding node and
// adds ONLY a `supersededBy` POINTER into CAS to the prior (a link, not a byte-copy); the prior is RETAINED
// and `resolve(oldId)` re-spawns it post-supersede; 0 delete paths (atlas-knowledge:62, 97-99, 206-207;
// method-tags-knw:95-100). Prior versions are their OWN content-addressed CAS objects — identical priors
// DEDUP to one address (never byte-copied).
//
// SEAM (sealed @atlas/kernel CAS — no raw hashing): the pointer is minted by `StoreApi.put` (content-
// address → dedup, idempotent) and re-resolved by `StoreApi.get`. This facet never hashes; it reuses the
// KERNEL CAS ref, per the card. The `supersededBy` pointer is the frozen RETURN-LEG (`Hash`) — R3 did NOT
// surface a `supersededBy` field on `PredicateNode`, so it is NOT mutated onto the node (no old bytes are
// inlined into the superseder), exactly as the archive.ts FLAG models it.

import type { Hash } from "@atlas/contracts"
import type { CasObject, StoreApi } from "@atlas/kernel"
import type { PredicateNode } from "../types.js"

/** The honest-empty content handle `StoreApi.put` answers for an object the CAS cannot address
 *  (`kernel/store.ts` `asHash('')` — the sole EMPTY sentinel). Matched by EQUALITY on that one value and
 *  nothing wider, exactly as `adapter-io/src/sidecar-commit.ts` matches it: an injected store is free to
 *  answer anything else it likes, and narrowing further would turn this guard into a shape check on a seam
 *  whose shape is the caller's business. A local constant rather than an import for the same reason that
 *  file gives — the sentinel is one character, and a cross-package edge to carry it is not worth its cost. */
const CAS_EMPTY = ""

/**
 * A prior the CAS REFUSED to address (task #136). A NAMED `Error` carrying the discriminant
 * `unaddressable-cas-object` — the SAME name `adapter-io/src/sidecar-commit.ts` gives this exact situation —
 * so `reasonOf`/`faultOf` decode one condition to one value at every door instead of three dialects.
 *
 * WHY A REFUSAL AND NOT A SILENT `if (h)`. `index/src/cas.ts` guards the same sentinel by simply NOT
 * REGISTERING the hash, and that is right THERE: its `put` must stay total (the frozen `CasIndexApi`
 * signature), the empty handle it returns is the kernel's own honest answer, and nothing durable references
 * it. Here the unresolvable handle IS the return value — `supersededBy` is the KNOW-12 pointer a caller
 * follows to re-spawn the prior — so swallowing it changes nothing and merely moves the failure to whoever
 * dereferences it. MEASURED before the guard: `supersede(<prior with a float>, next)` answered
 * `{ node: next, supersededBy: '' }` while `resolve('')` answered `undefined` and zero bytes reached disk.
 * "Nothing dies" reported as satisfied over a prior that had just died.
 */
export class UnaddressablePriorError extends Error {
  constructor() {
    super(
      "unaddressable-cas-object: refusing to supersede — the CAS could not address the PRIOR node (its " +
        "canonical form or its JSON serialization does not exist), so the `supersededBy` pointer would name " +
        "bytes that were never written. KNOW-12 retains every prior; a link to nothing is not retention. " +
        "Nothing was written and nothing was superseded.",
    )
    this.name = "UnaddressablePriorError"
  }
}

// ── frozen ArchiveApi surface, co-located here (was ref/archive.ts) ───────────────────────────────────

export interface ArchiveApi {
  /** SUPERSEDE a predicate node (KNOW-12, predicate-only): mint the new node, add a `supersededBy`
   *  POINTER into CAS to the old, and RETAIN the old (never remove). Returns the superseding node. Pure.
   *  The pointer is modeled as the `Hash` return-leg (the frozen `PredicateNode` has no `supersededBy`
   *  field — flagged for the data model to surface `supersededBy?: Hash`). */
  supersede(old: PredicateNode, next: PredicateNode): { readonly node: PredicateNode; readonly supersededBy: Hash }

  /** Re-spawnable resolve: `get(oldId)` MUST resolve post-supersede — the old bytes persist in CAS as a
   *  content-addressed object (dedup by content-address identity). 0 API deletes (method-tags-knw:99).
   *  The resolved shape reuses the kernel `CasObject`. */
  resolve(oldId: Hash): CasObject
}

/** Bind the CAS-retention archive over the sealed kernel store (`createStore()`). The store is the single
 *  content-addressed CAS — priors live there (the git/CAS archive), never in the hot working set. */
export function bindArchive(store: StoreApi): ArchiveApi {
  return {
    /** SUPERSEDE (predicate-only): content-address the prior into CAS (dedup, idempotent — identical priors
     *  collapse to one address), RETAIN it, and return the superseder + the `supersededBy` pointer. The
     *  superseder is `next` UNCHANGED — the prior's bytes are never inlined (only the pointer links them). */
    supersede(old: PredicateNode, next: PredicateNode): { readonly node: PredicateNode; readonly supersededBy: Hash } {
      const supersededBy = store.put(old) // sealed CAS: content-address → dedup, never byte-copy
      // The answer is CHECKED, not assumed. `put` is deliberately TOTAL over a value it cannot address — it
      // writes nothing and answers the EMPTY sentinel rather than throwing — so an unchecked read of it is
      // how a pointer to nothing gets minted and reported as a retained prior. See UnaddressablePriorError.
      if (supersededBy === CAS_EMPTY) throw new UnaddressablePriorError()
      return { node: next, supersededBy }
    },
    /** Re-spawnable resolve: the prior persists in CAS as a content-addressed object; `get(oldId)` resolves
     *  it post-supersede. 0 API deletes — nothing dies. */
    resolve(oldId: Hash): CasObject {
      return store.get(oldId)
    },
  }
}
