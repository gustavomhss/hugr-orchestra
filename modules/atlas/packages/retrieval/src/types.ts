// @atlas/retrieval — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 5 retrieval-local model: bounded packs / OwnPack / poke / injection budget; relevance is the
// deterministic hashed structural index (no embeddings, no RAG — A-14). The injection vocabulary
// (Pack/PackInvariant/InjectionKind/Budget) is @atlas/contracts-owned — re-exported here, never redefined;
// retrieval never imports @atlas/memory (cycle broken memory→retrieval). `ppr` is a stored field, not a call.

import type { Hash, NodeKey, Tier, InjectionKind, Territory } from "@atlas/contracts"
import type { Pack, PackInvariant } from "@atlas/contracts"
import type { ToolSchema } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { IndexNode } from "@atlas/index"

// Re-export the contracts-owned injection vocabulary so consumers of the retrieval surface can pull the
// whole dialect from the bare package root. Owned by @atlas/contracts — re-exported, NOT redefined.
export type { Pack, PackInvariant, InjectionKind, Budget } from "@atlas/contracts"

/**
 * [FLAG — reference names `Path`; no contracts `Path` brand exists] atlas-retrieval:167-172 types
 * `scope` / `unit` as `Path`. @atlas/contracts exposes no `Path` type, so it is transcribed as the
 * underlying `string` (the same discipline contracts applied to `Territory.owner` / `Territory.globs`).
 * NOT invented as a new exported brand. Flagged for a `Path` type to be sourced if one is ratified.
 */
export type Path = string

/**
 * The scope-unit `level` vocabulary. Transcribed EXACTLY from atlas-retrieval:22 —
 *   `level ∈ crate|module|service|feature`. The list is closed here; an `epic` is deliberately NOT a
 * grounded `own` level (RETR-12: it is a project-memory goal, not a grounded node).
 */
export type OwnLevel = "crate" | "module" | "service" | "feature"

/**
 * The relation-kind partition (RETR-10). Transcribed from atlas-retrieval:33-41 / 120-126 — the closed
 * set of bands `relate()` partitions a closure into; `coChanged` is opt-in + labeled, never mixed into
 * the structural bands.
 */
export type RelationKind = "enclosing" | "dependents" | "dependencies" | "governing" | "coChanged"

/**
 * The handle behind an `own_<id>` tool (RETR-12). Transcribed EXACTLY from atlas-retrieval:22 —
 *   `OwnUnit = { level, id, grounding }`.
 *
 * [PINNED — `id` type] The reference gives `id` no concrete type (the unit identity behind the tool
 * name `own_<id>`). Pinned to `string` (oracle-pin map: `OwnUnit.id: string`), NOT a brand.
 *
 * [PINNED — `grounding` type] The reference names `grounding` with no concrete type; it is the
 * groundedness handle (tree for crate/module, declared manifest for service/feature — RETR-12).
 * @atlas/grounding is NOT a declared dependency of this package (deps: contracts/kernel/index/
 * knowledge only), so it is pinned to `unknown` — the honest opaque handle — rather than silently
 * adding a grounding dep. If the owning WP needs the grounded `Grounding` type, add the dep first.
 */
export interface OwnUnit {
  readonly level: OwnLevel
  readonly id: string // [PINNED] unit identity behind `own_<id>` — string (no brand sourced)
  readonly grounding: unknown // [PINNED unknown] groundedness handle — grounding not a dep, not imported
}

/**
 * A precomputed related node in a `RelationSet` band. Transcribed EXACTLY from atlas-retrieval:42 —
 *   `RelatedFact = { nodeId, relation, distance, tier, ppr, claim, stale }`.
 *   - `distance` — closure hops from the touched unit.
 *   - `ppr`      — [LEAD-RATIFIED] a STORED numeric importance field (GEN-11), read here for ranking
 *                   (RETR-11); NOT a call into genesis.
 */
export interface RelatedFact {
  readonly nodeId: NodeKey
  readonly relation: RelationKind
  readonly distance: number // closure hops from the touched unit
  readonly tier: Tier
  readonly ppr: number // [LEAD-RATIFIED] stored precomputed importance (GEN-11) — a field, not a call
  readonly claim: string
  readonly stale: boolean
}

/**
 * How a reverse closure was bounded — the honest total-vs-returned receipt (RETR-11). Transcribed
 * EXACTLY from atlas-retrieval:43 —
 *   `BoundMeta = { maxHops, rank: 'tier-desc,ppr-desc,distance-asc,nodeKey-asc', total, returned,
 *                  truncated }`.
 * `rank` is transcribed as the exact frozen literal (the deterministic total rank of RETR-11).
 */
export interface BoundMeta {
  readonly maxHops: number
  readonly rank: "tier-desc,ppr-desc,distance-asc,nodeKey-asc"
  readonly total: number // full pre-truncation count (honest)
  readonly returned: number
  readonly truncated: boolean
}

/**
 * "What relates to what I'm touching" — deterministic, pre-partitioned by relation kind (RETR-10).
 * Transcribed EXACTLY from atlas-retrieval:33-41 —
 *   `RelationSet = { unit, enclosing, dependents, dependents_meta, dependencies, governing, coChanged? }`.
 *   - `unit`            — the touched unit (path / changed AST unit).
 *   - `enclosing`       — spatial roll-up: file → module → crate.
 *   - `dependents`      — REVERSE closure (blast radius), BOUNDED + ranked + truncated (RETR-11).
 *   - `dependents_meta` — how that reverse closure was bounded (honest total vs returned).
 *   - `dependencies`    — FORWARD closure ("built on these contracts").
 *   - `governing`       — territory rule(s): owner + tier over the unit.
 *   - `coChanged?`      — git-history co-change: deterministic but correlational; opt-in + labeled.
 */
export interface RelationSet {
  readonly unit: Path
  readonly enclosing: readonly PackInvariant[]
  readonly dependents: readonly RelatedFact[]
  readonly dependents_meta: BoundMeta
  readonly dependencies: readonly RelatedFact[]
  readonly governing: readonly PackInvariant[]
  readonly coChanged?: readonly RelatedFact[] // opt-in, labeled; never mixed into the structural bands
}

/**
 * A CURATED, zero-assembly briefing for the unit you own (RETR-12) — composed MECHANICALLY (index
 * reads), never by an LLM, never free prose. Transcribed EXACTLY from atlas-retrieval:23-31 —
 *   `OwnPack = { unit, invariants, shape, edges, gotchas, memory, drill }`.
 *
 * [FLAG — `unit` is a 1-line role, not an `OwnUnit`] atlas-retrieval:24 annotates `unit` as "1-line role
 * (from a `definition` fact / terrain)" — a rendered role line, transcribed as `string`. (Distinct from
 * `RelationSet.unit`, which is a touched-unit path.)
 *
 * [PINNED — `shape` / `edges`] The reference gives no concrete type: `shape` = terrain (contents +
 * owner + tier, atlas-retrieval:26) → pinned `{ contents: NodeKey[]; owner: string; tier: Tier }`;
 * `edges` = a bounded blast summary from `relate()` (a capped subset of key dependents / dependencies,
 * atlas-retrieval:27) → pinned `{ dependents: NodeKey[]; dependencies: NodeKey[] }`. Minimal, per the
 * oracle-pin map (X1/D1 pack-grain design → concrete records).
 *
 * [FLAG — `gotchas` typed to knowledge `GroundedFact`] atlas-retrieval:28 leaves `gotchas` untyped ("the
 * non-obvious slots (gotcha / rationale)"); those slots ARE knowledge facts (the `gotcha` / `rationale`
 * PredicateSlots). Transcribed as `readonly GroundedFact[]` — the pack-contents source per the declared
 * @atlas/knowledge seam. Flagged for the reference to freeze the field type.
 *
 * [FLAG — `memory` is upward, do NOT import] atlas-retrieval:29 = "project-Rules scoped here + recent
 * lesson POINTERS (consultable, not inlined)". Memory is a HIGHER layer and retrieval MUST NOT depend on
 * @atlas/memory ([LEAD-RATIFIED], cycle broken memory→retrieval). Transcribed as `unknown` — a pointer
 * bag — NEVER a memory type. Flagged.
 */
export interface OwnPack {
  readonly unit: string // [FLAG] a 1-line role line (atlas-retrieval:24), not an OwnUnit
  readonly invariants: readonly PackInvariant[] // top tier≥T1 of the unit, ranked, capped
  readonly shape: { readonly contents: readonly NodeKey[]; readonly owner: string; readonly tier: Tier } // [PINNED] terrain: contents + owner + tier (atlas-retrieval:26)
  readonly edges: { readonly dependents: readonly NodeKey[]; readonly dependencies: readonly NodeKey[] } // [PINNED] capped relate() blast summary (atlas-retrieval:27)
  readonly gotchas: readonly GroundedFact[] // [FLAG] gotcha/rationale slots — knowledge facts
  readonly memory: unknown // [FLAG] upward memory-owned pointers — NOT a memory type, never imported
  readonly drill: OwnDrill
}

/**
 * Progressive-disclosure affordances on an `OwnPack` (RETR-12) — more detail is PULL-reachable, never
 * inlined. Transcribed EXACTLY from atlas-retrieval:30 —
 *   `drill = { finer: OwnUnit[], refresh, complement }`.
 *
 * [PINNED — `refresh` / `complement`] The reference gives no concrete type: `refresh` = re-poke;
 * `complement` = a `relate()` affordance. Per D1 ("pointers + how-to-pull, never content"), each is a
 * content-free affordance pointer pinned to `{ pull: string }` — a how-to-pull name/label only.
 */
export interface OwnDrill {
  readonly finer: readonly OwnUnit[] // finer scope-units
  readonly refresh: { readonly pull: string } // [PINNED] re-poke affordance — how-to-pull pointer (D1)
  readonly complement: { readonly pull: string } // [PINNED] relate() affordance — how-to-pull pointer (D1)
}

/**
 * A poke: pushed on scope-entry (RETR-4). Transcribed EXACTLY from atlas-retrieval:19 —
 *   `Poke = { scope, pack, notice }`  — `notice` ≤ ~150 tokens (the compact push notice).
 *
 * [FLAG — `notice` type] The reference gives no concrete type; it is the compact ≤~150-token push
 * notice (under the pinned cap measure). Transcribed as `string`.
 */
export interface Poke {
  readonly scope: Path
  readonly pack: Pack
  readonly notice: string // [FLAG] compact push notice ≤ ~150 tokens (pinned cap measure)
}

/**
 * One MCP tool per covering node, dynamic (RETR-5). Transcribed EXACTLY from atlas-retrieval:20 —
 *   `NodeTool = { nodeId, scope, schema }`.
 *
 * [PINNED — `schema` type] The MCP tool schema for a covering node → `ToolSchema` from @atlas/contracts
 * (oracle-pin theme #2: the ONE shared MCP tool-schema record, byte-identical with @atlas/tools).
 */
export interface NodeTool {
  readonly nodeId: NodeKey
  readonly scope: Path
  readonly schema: ToolSchema // [PINNED] shared MCP tool-schema record (@atlas/contracts)
}

/**
 * The MISS-oracle per-territory coverage ledger (RETR-13). Transcribed EXACTLY from atlas-retrieval:47 —
 *   `OffAtlas = { territory, served, offAtlasReads, offAtlasRate }`.
 *   - `served`        — served turns for this territory.
 *   - `offAtlasReads` — turns with a Read/Grep OUTSIDE the surfaced scope-set.
 *   - `offAtlasRate`  — `offAtlasReads / served`; a territory with no served history yields `0` (never
 *                        a throw). Measures COVERAGE (the silent failure the drift-oracle cannot see).
 *
 * [FLAG — `territory` type] transcribed as `string` (the territory NAME / governance key), matching the
 * `Pack.territory` key discipline in @atlas/contracts.
 */
export interface OffAtlas {
  readonly territory: string // [FLAG] territory name / governance key
  readonly served: number
  readonly offAtlasReads: number
  readonly offAtlasRate: number
}

// ── frozen API surface, co-located here (was ref/caps.ts · ref/bound.ts · ref/resolve.ts) ────────────
// These interfaces carry zero runtime; they live with the shared data model because CapsApi is consumed
// by BOTH ledger.ts and pack.ts, and BoundApi / ResolveApi are public surface not consumed by any src
// file (they belong to the package's public type surface).

/**
 * Per-kind cap enforcement under the pinned measure (RETR-7). Each injection kind stays within its
 * ratified sweet-spot cap; enforcement is a DETERMINISTIC function of the input under the pinned
 * `cl100k_base` measure. The cap-table is a pure map `kind → pinnedCap`, shared by the packer (RETR-2),
 * drop-policy (RETR-6), and `own` composer (RETR-12). (atlas-retrieval:107-112 / method-tags-ret:63-68)
 */
export interface CapsApi {
  /** Injection kind → its pinned sweet-spot cap in the pinned cap-measure unit (RETR-7). A pure lookup
   *  over the cap-table; deterministic. (method-tags-ret:67) */
  capFor(kind: InjectionKind): number
}

/**
 * Bounded, ranked, deterministic truncation of the reverse closure (RETR-11): cut at `maxHops`, order by
 * the total rank `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)`, cap at `K`, truncate AFTER ranking
 * with honest `BoundMeta`. Reuses RETR-10's closure. (atlas-retrieval:44 / 127-138 / method-tags-ret:91-96)
 */
export interface BoundApi {
  /** Reverse closure of `node`, bounded: `closure(maxHops) → stable-sort-by-rank → take(K)` with honest
   *  meta (RETR-11). Defaults per the reference: `maxHops = 2`, `K = 8`. Pure + deterministic +
   *  truncate-after-rank (the returned set is a rank-prefix). (atlas-retrieval:44; method-tags-ret:95)
   *
   *  [FLAG — `node` type] The reference names `node` with no concrete type — the unit's node in the
   *  index dependency axis. Transcribed as the index-provided `IndexNode` (@atlas/index), the honest
   *  input the closure walks; NOT invented. Flagged for the reference to freeze the parameter. */
  boundedClosure(
    node: IndexNode,
    maxHops: number,
    K: number,
  ): { readonly closure: readonly RelatedFact[]; readonly meta: BoundMeta }
}

/**
 * Scope → covering territory/-ies via the hashed structural index (RETR-1, §3.5). Axes-only: relevance is
 * a PURE function of (scope, dependency, trigger) over the index — 0 embedding/vector/RAG (A-14). Total:
 * a malformed scope yields an empty result, never a throw (RETR-9). (atlas-retrieval:167 / method-tags-ret:21-26)
 */
export interface ResolveApi {
  /** Scope (path) → the covering territory/-ies, resolved by the index (§3.5). Pure + total (miss ⇒
   *  empty, no throw — RETR-9); byte-identical for equal input (RETR-1). (atlas-retrieval:167) */
  resolve(scope: Path): readonly Territory[]
}
