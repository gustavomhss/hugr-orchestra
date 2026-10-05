// @atlas/tools — src/query.ts   (WP-7.26-b.TOOLS — TOOLS-6, INV-TOOLS-6; guidance INV-TOOLS-4)
//
// `atlas-query` — the read-only discovery entry point + the frozen `QueryApi`. Resolves any scope through an
// injected index port to the MERGED covering bounded `Pack` — TWO bands (governing `tier≥T1` + advisory
// `T2` under its own cap, ADR-0013), stale-flagged (a stale pack is a re-ground SIGNAL, not served truth)
// AND per-fact freshness-flagged. Pure + total; the concrete index resolution is @atlas/index.

import type { Hash, Pack, PackInvariant } from "@atlas/contracts"
import { packTokens, splitBands } from "./bands.js"
import type { QueryOut } from "./types.js"

export interface QueryApi {
  /** Resolve any scope (file/folder/module/crate) → the merged covering bounded `Pack`: the GOVERNING band
   *  of `tier≥T1` invariants (`≤ ~2K`) plus the separately capped ADVISORY band of `T2` rows (ADR-0013,
   *  owner-ratified 2026-08-03); `stale:true` MUST mean re-ground before trusting (TOOLS-6, §6.1), and
   *  every row carries its OWN `freshness` verdict beside it. Pure + total. (method-tags-tls:58)
   *
   *  [PINNED — `scope` arg] atlas-tools:125 names `atlas-query <scope>`; no `Scope`/`Path` brand is
   *  frozen at this seam (cf retrieval `Path = string`). Pinned to `string`, NOT a brand.
   *  ([NOTE] the `≤ ~2K` token bound is an ADVISORY size bound verified by a size test, not a type
   *  constraint — method-tags-tls:59.) */
  query(scope: string): QueryOut
}

/**
 * The covering skeleton the index axis resolves a scope to (the raw, pre-governance read). `invariants` is
 * the covering territory's raw invariant set; `stale` is `true` iff any backing grounding drifted. Tools
 * CONSUMES this port — @atlas/index owns the concrete resolution; it is NOT defined here.
 */
export interface QueryIndex {
  /** Resolve a scope to its covering territory skeleton. MAY throw on a malformed (non-string) scope — the
   *  handler wrapper converts that throw to a rejected `Verdict` (TOOLS-2 totality boundary). */
  cover(scope: string): {
    readonly territory: string
    readonly axisHash: Hash
    readonly invariants: readonly PackInvariant[]
    readonly stale: boolean
  }
}

/**
 * Build `atlas-query` over an injected structural index port. The returned `query` conforms EXACTLY to the
 * frozen `QueryApi.query(scope)` signature. Pure + total and READ-ONLY: it resolves the scope through the
 * index, SPLITS the covering invariants into the two bands (`./bands.ts` — governing `tier≥T1`, advisory
 * `T2` under its own cap, off-lattice in neither), and assembles the merged `Pack` carrying the `stale`
 * flag and the token estimate. It never mutates a store and never opens a write path.
 *
 * THE GOVERNING BAND IS RESERVED, NOT MERELY PRESERVED: `splitBands` caps only the advisory side, so for a
 * covering set with no `T2` row this function returns exactly the invariants it returned before ADR-0013,
 * in the same order. `stale` is passed through untouched — the per-fact `PackInvariant.freshness` rides
 * BESIDE the pack-level watermark and is never folded into it (ADR-0002 amended, not reversed).
 */
export function createQuery(index: QueryIndex): QueryApi {
  const query = (scope: string): QueryOut => {
    const cover = index.cover(scope) // resolve the scope → its covering territory (may throw on malformed)
    const { governing, advisory, advisoryDropped } = splitBands(cover.invariants)
    const pack: Pack = {
      territory: cover.territory,
      axisHash: cover.axisHash,
      invariants: governing,
      advisory,
      advisoryDropped,
      // ADR-0013 clause 4 — the size of what was actually RETURNED, i.e. BOTH bands. The dropped advisory
      // tail is not counted: it was not returned, and counting it would make the estimate describe a pack
      // the caller did not receive.
      tokenEstimate: packTokens(governing) + packTokens(advisory),
      stale: cover.stale, // a stale pack is surfaced, NOT served as fresh truth (TOOLS-6c)
    }
    return pack
  }
  return { query }
}

// differential-vs-oracle (compile-time): the impl's `query` conforms to the frozen `QueryApi.query(scope)`
// signature (co-located `QueryApi`). The concrete index axis-resolution is a DISTINCT, out-of-facet port.
const _queryConforms: QueryApi = createQuery({
  cover: () => ({ territory: "", axisHash: "" as Hash, invariants: [], stale: false }),
})
void _queryConforms
