// @atlas/tools — src/init.ts   (WP-8.27.TOOLS — TOOLS-5, spec A-5/A-6)
//
// `atlas-init` — the `$0`-LLM structural move-in + the frozen `InitApi`. Every territory ships at the
// `T2/advisory` default with ZERO invariants; a T0-keyword territory only FLAGS (auto-promotes nothing).
// The structural walk (raw territories + reverse-dep blast radius) is the @atlas/index port, CONSUMED here.

import type { NodeKey, Territory } from "@atlas/contracts"
import type { InitOut } from "./types.js"

export interface InitApi {
  /** `$0`-LLM structural move-in over a tree path (TOOLS-5). Returns the `T2/advisory` skeleton + blast
   *  radius + T0-candidate names; sets NO tier above `T2` and promotes NO `T0` (A-5, A-6). Pure + total.
   *  (method-tags-tls:51)
   *
   *  [PINNED — `path` arg] atlas-tools:124 names `atlas-init <path>`; no `Path`/tree brand is frozen at
   *  this seam (contracts exposes none — cf retrieval `Path = string`). Pinned to `string`, NOT a brand
   *  nor a lower-layer index tree type. */
  init(path: string): InitOut
}

/**
 * A structurally-walked territory BEFORE move-in assigns its tier — `{name, owner, globs}`. The move-in
 * default (`T2/advisory`) is applied HERE, never carried in from the walk, so the mover can never emit a
 * tier above `T2` (TOOLS-5c): the raw shape simply has no `tier` leg to inherit.
 */
export type RawTerritory = Omit<Territory, "tier">

/**
 * The `$0`-LLM structural move-in seam (the @atlas/index axis, injected / build-ahead). It walks the tree
 * at `path` STRUCTURALLY — NO LLM — and returns the raw territory list + the reverse-dep blast-radius node
 * set. The index OWNS the walk; this facet CONSUMES it and applies governance. Tools consumes this port;
 * @atlas/index owns the concrete implementation — it is NOT defined here.
 */
export interface MoveInIndex {
  /** The raw territories (name/owner/globs) structurally derived from the index at `path`. */
  territories(path: string): readonly RawTerritory[]
  /** The reverse-dep reachability set = blast radius, keyed by `NodeKey` (atlas-tools:19, oracle #3). */
  blastRadius(path: string): readonly NodeKey[]
}

/**
 * The T0-candidate heuristic (a structural keyword match). `isCandidate` returns `true` iff a territory
 * hits a T0 keyword. It MAY ONLY flag (A-6 / TOOLS-5e): it assigns NO tier and writes no other state — its
 * whole effect is the territory's NAME appearing in `t0Candidates`.
 */
export interface T0Heuristic {
  isCandidate(t: RawTerritory): boolean
}

/** The move-in tier default — EVERY territory ships at `T2/advisory` (TOOLS-5, atlas-tools:142). The mover
 *  sets no tier above this and reads none from the walk, so a tier > T2 is structurally unreachable. */
const MOVE_IN_TIER = "T2" as const

/**
 * Build `atlas-init` over an injected structural move-in index + the T0-keyword heuristic. The returned
 * `init` conforms EXACTLY to the frozen `InitApi.init(path)` signature. Pure + total and `$0`-LLM: no clock,
 * no IO, no throw, no write, and NO model call site — the output is a pure structural function of the seams.
 */
export function createInit(index: MoveInIndex, heuristic: T0Heuristic): { readonly init: InitApi["init"] } {
  const init = (path: string): InitOut => {
    const raw = index.territories(path)

    // Every territory ships at the T2/advisory default with ZERO invariants (TOOLS-5b/5c). The tier is
    // ASSIGNED here — never inherited — so the mover can never set a tier above T2.
    const territories: Territory[] = raw.map((t) => ({ ...t, tier: MOVE_IN_TIER }))

    // The heuristic MAY ONLY flag (A-6 / TOOLS-5d/5e): collect the NAMES of T0-keyword territories in walk
    // order. It promotes NOTHING, assigns no tier, and touches no other field — flag-only.
    const t0Candidates = raw.filter((t) => heuristic.isCandidate(t)).map((t) => t.name)

    // The blast radius = the reverse-dep reachability set from the structural index (consumed, not computed
    // here — no raw hashing; the node set is already keyed by NodeKey at the sealed seam).
    const blastRadius = index.blastRadius(path)

    return { territories, blastRadius, t0Candidates }
  }
  return { init }
}

// differential-vs-oracle (compile-time): the impl's `init` conforms to the co-located frozen `InitApi.init`
// signature. The GEN S0/S1 skeleton build + PPR ranking is a DISTINCT, out-of-facet req (WP-8.27.GEN).
const _initConforms: InitApi["init"] = createInit(
  { territories: () => [], blastRadius: () => [] },
  { isCandidate: () => false },
).init
void _initConforms
