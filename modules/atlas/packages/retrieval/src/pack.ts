// @atlas/retrieval — src/pack.ts  (the bounded pack — RETR-1 / RETR-2 / RETR-7 / RETR-9)
//
// Bounded, deterministic pack assembler over the hashed structural index (RETR-2): every T0 invariant in
// full, then T1 by `(hits-desc, ppr-desc, nodeKey-asc)` until the `~2K` cap; when the cap bites the CAP
// WINS — a truncation marker + `pull-reachable` tail (0 silent drops). A merged pack over K territories
// shares ONE `~2K` budget. Total (RETR-9): a malformed/uncovered scope ⇒ empty pack, never a throw. Seam
// consumer: candidates arrive with index-supplied `tokenEstimate`/`axisHash` — NEVER tokenizes/hashes.
// [FLAG] the truncation marker + tail have no frozen `Pack` field — carried on facet-local `BoundedPack`.

import type { Hash, InjectionKind, NodeKey, Pack, PackInvariant, Territory, Tier } from "@atlas/contracts"
import { asHash } from "@atlas/kernel"
import type { CapsApi } from "./types.js"

/**
 * Bounded deterministic pack composition (RETR-2): a `≤ ~2K` pack carrying every T0 invariant in full,
 * then T1 by `(hits-desc, ppr-desc, nodeKey-asc)` until the cap; the CAP WINS. Total: a malformed
 * territory yields an empty pack, never a throw (RETR-9). (atlas-retrieval:170 / method-tags-ret:28-33)
 */
export interface PackApi {
  /** Territory → its pack: `≤ ~2K` tier≥T1 invariants (T0 in full, then T1 by `(hits-desc, ppr-desc,
   *  nodeKey-asc)` until the cap), stale-flagged (§3.4). Pure + total (miss ⇒ empty pack, no throw —
   *  RETR-9). (atlas-retrieval:170) */
  pack(territory: Territory): Pack
}

/**
 * The minimal ranked item — carries EXACTLY the three sort keys the shared comparator reads: `hits`
 * (RETR-8 ledger), `ppr` (stored field, GEN-11), `nodeKey` (identity). The minimal join over the ranked
 * pack item / `RelatedFact` inputs. (atlas-retrieval:70; method-tags-ret:32-33)
 */
export interface RankItem {
  readonly nodeKey: NodeKey
  readonly ppr: number
  readonly hits: number
}

/**
 * THE shared within-tier comparator reused by the packer (RETR-2) and the bounder (RETR-11): the total,
 * deterministic order `(hits-desc, ppr-desc, nodeKey-asc)`. (atlas-retrieval:70; method-tags-ret:32-33)
 */
export interface RankApi {
  /** The shared within-tier comparator — a total order `(hits-desc, ppr-desc, nodeKey-asc)`. Returns a
   *  negative / zero / positive number (a standard comparator), deterministic + antisymmetric.
   *
   *  [PINNED — ranked-item type] `RankItem` — the minimal join carrying the three sort keys.
   *  (atlas-retrieval:70; method-tags-ret:32-33) */
  compare(a: RankItem, b: RankItem): number
}

/** The pinned pack sweet-spot cap `~2K` (RETR-2 / RETR-7), a concrete count under the pinned cap measure. */
export const PACK_CAP = 2000
/** The hard injection ceiling `~5K` (RETR-6); no single kind's cap may equal or exceed it (RETR-7b). */
export const CAP_CEILING = 5000

/** The ratified per-kind sweet-spot cap-table (RETR-7; atlas-retrieval:107-112), under the pinned measure. */
const CAP_TABLE: Readonly<Record<InjectionKind, number>> = {
  awareness: 400,
  orientation: 250,
  projectMem: 500,
  own: 1500,
  pack: PACK_CAP,
  "protocols.safetyCritical": 500,
  "protocols.advisory": 500,
  poke: 150,
}

// No tier ORDINAL is needed here, and none is built: the packer never SORTS by criticality. It PARTITIONS
// (`assemble` below) — the `T0` band in full first, then the `T1` band — and each band is ordered by the
// shared within-tier comparator `(hits-desc, ppr-desc, nodeKey-asc)`. `T2` is below the `tier≥T1` floor and
// is never pack-eligible. The comparators that DO rank across classes (`own.ts`, `relate.ts`) use the one
// lattice, `tierRank` from `@atlas/knowledge`.

/**
 * A pack candidate — one territory node the index resolved, carrying the three sort keys `(hits, ppr,
 * nodeKey)`, its criticality `tier`, its 1-line `claim`, its index-supplied pinned `tokenEstimate`, and its
 * drift `stale` flag. A structural superset of `RankItem`, so the shared comparator applies.
 */
export interface PackCandidate {
  readonly nodeKey: NodeKey
  readonly tier: Tier
  readonly ppr: number
  readonly hits: number
  readonly claim: string
  readonly tokenEstimate: number // [FLAG] index-supplied pinned cl100k_base count — never tokenized here
  readonly stale: boolean
}

/** The per-territory axis snapshot the index supplies (the seam this facet consumes). */
export interface PackAxis {
  readonly territory: string
  readonly axisHash: Hash // index-supplied content identity of the axis snapshot (no hashing here)
  readonly candidates: readonly PackCandidate[]
  readonly stale: boolean // any backing grounding of this axis drifted (index drift-oracle)
}

/** The index seam: a (resolved) territory → its axis snapshot, or `null` when nothing covers it. */
export interface PackIndex {
  axis(territory: Territory): PackAxis | null
}

/**
 * A `Pack` plus the honest cap-wins receipt (RETR-2c). `truncated` is the truncation MARKER; `tail` is the
 * `pull-reachable` list of nodeKeys the cap excluded (0 silent drops). Assignable to `Pack`. See file FLAG.
 */
export interface BoundedPack extends Pack {
  readonly truncated: boolean
  readonly tail: readonly NodeKey[]
}

/** The bounded-pack facet surface (satisfies the frozen `PackApi` / `RankApi` / `CapsApi`). */
export interface Packer {
  pack(territory: Territory): BoundedPack
  mergedPack(territories: readonly Territory[]): BoundedPack
  compare(a: RankItem, b: RankItem): number
  capFor(kind: InjectionKind): number
}

// ── the shared within-tier comparator (RETR-2b; RankApi) ─────────────────────────────────────────────
/**
 * The total, deterministic, antisymmetric within-tier order `(hits-desc, ppr-desc, nodeKey-asc)`: the scarce
 * budget goes first to observed-useful facts (the `hits` ledger, RETR-8), ties broken by precomputed PPR
 * importance (GEN-11), then by `nodeKey` (identity, the final total-order key). Pure; no LLM.
 */
export function compare(a: RankItem, b: RankItem): number {
  if (a.hits !== b.hits) return b.hits - a.hits // hits-desc
  if (a.ppr !== b.ppr) return b.ppr - a.ppr // ppr-desc
  return a.nodeKey < b.nodeKey ? -1 : a.nodeKey > b.nodeKey ? 1 : 0 // nodeKey-asc (code-point, byte-stable)
}

// ── per-type caps (RETR-7; CapsApi) ──────────────────────────────────────────────────────────────────
/** Injection kind → its ratified pinned sweet-spot cap (RETR-7). A pure lookup over the cap-table. */
export function capFor(kind: InjectionKind): number {
  return CAP_TABLE[kind]
}

// ── the bounded fill (RETR-2a/2b/2c) ─────────────────────────────────────────────────────────────────────
/**
 * [ADR-0013 — REFERENCE MODEL, NOT AMENDED] `PackCandidate` carries the index's per-candidate drift as a
 * BOOLEAN (`stale`), so the row's `Freshness` is projected from it: `true → 'DRIFTED'`, `false → 'FRESH'`.
 *
 * The projection is lossless with respect to what the boolean actually holds, and it is a NARROWING with
 * respect to the 3-state vocabulary: a candidate feed cannot express `STALE` (GROUND-13 advisory drift)
 * through one bit, and this seam invents nothing to cover that. Widening `PackCandidate` to carry the real
 * verdict belongs to whoever wires this facet — measured through the built binary, `fill()` below is
 * unreachable from `atlas query` / `atlas own` (only the module-load `_packBind` line runs), so a change
 * here would move no shipped byte. The SHIPPED two-band split lives at `@atlas/tools` src/bands.ts.
 */
const toInvariant = (c: PackCandidate): PackInvariant => ({
  nodeId: c.nodeKey,
  tier: c.tier,
  claim: c.claim,
  freshness: c.stale ? "DRIFTED" : "FRESH",
})

/**
 * Greedy fill under one shared `cap`: all T0 IN FULL, then T1 by the shared rank until the next candidate
 * would exceed the cap — at which point the cap WINS (stop) and every not-emitted candidate (in rank order)
 * becomes the `pull-reachable` tail. Deterministic; T2 (below the tier≥T1 floor) is never pack-eligible.
 */
function fill(
  candidates: readonly PackCandidate[],
  cap: number,
): { readonly emitted: readonly PackCandidate[]; readonly tail: readonly NodeKey[] } {
  const eligible = candidates.filter((c) => c.tier === "T0" || c.tier === "T1")
  const t0 = eligible.filter((c) => c.tier === "T0").sort(compare)
  const t1 = eligible.filter((c) => c.tier === "T1").sort(compare)
  const emitted: PackCandidate[] = []
  const tail: NodeKey[] = []
  let used = 0
  let capped = false
  for (const c of [...t0, ...t1]) {
    if (!capped && used + c.tokenEstimate <= cap) {
      emitted.push(c)
      used += c.tokenEstimate
    } else {
      capped = true // the cap has bitten — the rest is the honest pull-reachable tail (no silent drop)
      tail.push(c.nodeKey)
    }
  }
  return { emitted, tail }
}

/** Assemble one `BoundedPack` from a set of axes budgeted under a single `cap` (single- or merged-territory). */
function assemble(name: string, axisHash: Hash, axes: readonly PackAxis[], cap: number): BoundedPack {
  const candidates = axes.flatMap((a) => a.candidates)
  const { emitted, tail } = fill(candidates, cap)
  return {
    territory: name,
    axisHash,
    invariants: emitted.map(toInvariant),
    // [ADR-0013 — REFERENCE MODEL, NOT AMENDED] `fill()` above still drops `T2` outright, so this facet has
    // no advisory rows TO band and reports an empty band with an honest zero ledger — an under-implementation
    // of the amendment, never a claim that the advisory band is always empty. Stated rather than left for a
    // reader to infer from a literal.
    advisory: [],
    advisoryDropped: 0,
    tokenEstimate: emitted.reduce((s, c) => s + c.tokenEstimate, 0),
    stale: axes.some((a) => a.stale) || emitted.some((c) => c.stale), // true iff any backing drifted (RETR-3)
    truncated: tail.length > 0,
    tail,
  }
}

const EMPTY_HASH: Hash = asHash("") // the sealed-seam zero identity for an uncovered/malformed scope
function emptyPack(name: string): BoundedPack {
  return {
    territory: name,
    axisHash: EMPTY_HASH,
    invariants: [],
    advisory: [],
    advisoryDropped: 0,
    tokenEstimate: 0,
    stale: false,
    truncated: false,
    tail: [],
  }
}
const nameOf = (t: Territory): string => (t && typeof t.name === "string" ? t.name : "")

// ── the facet, over the index seam ───────────────────────────────────────────────────────────────────────
/**
 * Build the bounded-pack facet over the index seam. Every entry point is TOTAL (RETR-9): a malformed /
 * uncovered scope yields an empty pack, never a throw.
 */
export function createPacker(index: PackIndex): Packer {
  const axisOf = (t: Territory): PackAxis | null => {
    try {
      return index.axis(t)
    } catch {
      return null
    }
  }

  const pack = (territory: Territory): BoundedPack => {
    try {
      const axis = axisOf(territory)
      if (axis === null) return emptyPack(nameOf(territory))
      return assemble(axis.territory, axis.axisHash, [axis], PACK_CAP)
    } catch {
      return emptyPack(nameOf(territory)) // RETR-9: total — never propagate a throw
    }
  }

  const mergedPack = (territories: readonly Territory[]): BoundedPack => {
    try {
      const axes = (Array.isArray(territories) ? territories : []).map(axisOf).filter((a): a is PackAxis => a !== null)
      if (axes.length === 0) return emptyPack("")
      const name = axes.map((a) => a.territory).join(",")
      return assemble(name, axes[0]!.axisHash, axes, PACK_CAP) // ONE shared ~2K budget across all K axes
    } catch {
      return emptyPack("")
    }
  }

  return { pack, mergedPack, compare, capFor }
}

// ── frozen-interface BIND (compile-time only) ────────────────────────────────────────────────────────────
const _rankBind = { compare } satisfies RankApi
const _capsBind = { capFor } satisfies CapsApi
const _packBind: PackApi = createPacker({ axis: () => null }) // BoundedPack ⊑ Pack ⇒ satisfies PackApi
void _rankBind
void _capsBind
void _packBind
