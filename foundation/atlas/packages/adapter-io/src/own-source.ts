// @atlas/adapter-io — src/own-source.ts  (the PRODUCTION feed for @atlas/retrieval's `own_<scope>` composer)
//
// `@atlas/retrieval` had no runtime edge into the product at all. Every import of it from another package's
// `src` was `import type`, and `createOwn` — the `own_<unit>` composer, RETR-12, ~350 lines with 15 tests —
// had exactly ONE caller in the monorepo: its own test file. It was types, not running code. This module is
// the edge: it materializes the `OwnSources` seam the composer consumes, over the SAME durable CAS store and
// the SAME built `Axes` `atlas query` reads, so the briefing `own` serves is THIS repository's knowledge and
// not a second, differently-derived view of it.
//
// ── WHAT THE COMPOSER OWNS AND WHAT THIS MODULE OWNS ─────────────────────────────────────────────────────
// `createOwn` owns rank → cap → dedup → project, and none of that is restated here: this module answers the
// eight `OwnSources` questions and hands them over. The bounds (OWN_CAP / EDGE_CAP / FINER_CAP /
// MANIFEST_CAP), the T0-first invariant order, the greedy budget fill, the `pullReachable` tail and the
// RETR-9 totality all stay in `packages/retrieval/src/own.ts`, which is frozen and is not edited by this WP.
//
// ── WHAT IS HONESTLY UNAVAILABLE, NAMED RATHER THAN FAKED ────────────────────────────────────────────────
// Four `OwnSources` inputs have NO producer in this product today. They are reported as their honest zero,
// never as a plausible-looking number, because a fabricated ranking signal is indistinguishable from a real
// one at the point where somebody trusts the order:
//
//   `hits`   — the RETR-8 frecency ledger (`@atlas/retrieval` ledger.ts) has no production writer: nothing
//              records a served pack anywhere durable. Every candidate is `hits: 0`, so the composer's
//              `(tier, hits, ppr, nodeKey)` rank degenerates to `(tier, nodeKey)` — deterministic, and
//              deterministic is the property that matters; it is simply not frecency-ranked yet.
//   `ppr`    — GEN-11's personalized-PageRank score is a field on a genesis `Candidate` (genesis/types.ts),
//              and a `Candidate` loses it on the way to a `GroundedFact`: no stored fact carries a `ppr`.
//              0 for every candidate.
//   `memory` — L6 `@atlas/memory` is a per-seat store with no production instance; `OwnPack.memory` is
//              typed `unknown` precisely so retrieval never names a memory type. `null`.
//   dependencies — `@atlas/index` exposes `reverseClosure` and NO forward closure (`DepgraphApi` has one
//              method). The `dependents` band is real; the `dependencies` band is EMPTY and says so, rather
//              than being back-filled from a second graph traversal written here. See {@link relationSetFor}.
//
// ── THE MEASURE ──────────────────────────────────────────────────────────────────────────────────────────
// `OWN_CAP` is documented as `~1.5K` in the pinned `cl100k_base` measure. There is no tokenizer in this
// repo; the one advisory size estimate that exists is `claim.length` (`mintPack`, pack-shape.ts). This feed
// sizes candidates the SAME way, so `OWN_CAP` is enforced here in CHARACTERS. That is strictly tighter than
// tokens (~4 chars/token), i.e. it under-serves rather than over-serves, which is the safe direction for a
// budget — and it is the same number the CLI already prints as `tokenEstimate` on a query pack.

import { createOwn, ownToolName } from "@atlas/retrieval"
import type {
  ManifestCandidate,
  OwnFacet,
  OwnPackPlus,
  OwnSources,
  OwnUnit,
  RelatedFact,
  RelationSet,
  SizedGotcha,
  SizedInvariant,
} from "@atlas/retrieval"
import { createResolve } from "@atlas/index"
// The GROUND-1 per-fact drift oracle — the SAME function the write door's truth-gate and the query readback
// run, over the SAME composition-root `axes` this feed already receives. Never a second freshness notion.
import { driftDetect } from "@atlas/grounding"
import type { Axes, AxisForest, IndexNode } from "@atlas/index"
import { currentNodes, tierRank } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { Freshness, Hash, NodeKey, Tier } from "@atlas/contracts"
import { underScope } from "./anchor-scope.js"
// The two bands + their row shaping — `own-bands.ts`, which owns WHICH stored facts a briefing may show.
import { advisoryBand, governingGotchas, governingInvariants } from "./own-bands.js"
import type { Row } from "./own-bands.js"
import { resolveFreshness } from "./pack-shape.js"
import type { AtlasPolicy } from "./policy.js"
import { buildRetrievalModel } from "./retrieval-model.js"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"

/** The `own_<leaf>` tool name + the briefing behind it — `OwnFacet.dispatch`'s return, re-stated as a name
 *  the CLI can import without depending on a structural type. */
export interface OwnDispatch {
  readonly tool: string
  readonly pack: OwnPackPlus
}

/** The composition-root leg: a scope path → its `own_<leaf>` briefing. TOTAL (RETR-9 — a scope that names
 *  no index unit yields an empty briefing, never a throw). */
export type OwnLeg = (scope: string) => OwnDispatch

/** Atlas availability for post-Genesis Own materialization. Every listed ID is structural, canonical, and exact. */
export function availableOwnUnits(axes: Axes): readonly OwnUnit[] {
  const units: OwnUnit[] = []
  const walk = (node: IndexNode): void => {
    units.push({ level: "module", id: node.key, grounding: node.subtreeHash })
    for (const child of node.children) walk(child)
  }
  walk(axes.spatial)
  return units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** `Hash` and `NodeKey` are same-string DISTINCT brands (contracts/hash.ts). One cast helper, as
 *  index-adapter.ts does at the same kind of seam — a structural key crossing into the fact vocabulary. */
const asNodeKey = (s: string): NodeKey => s as unknown as NodeKey

/**
 * Every current node in the LIVE projection paired with the whole fact read back from CAS ("the CAS bytes
 * ARE the fact"). A CAS miss is skipped, never thrown on. Re-read per call — an in-session `atlas emit` must
 * be visible to the very next `own`.
 */
function allRows(store: DiskStore): readonly Row[] {
  const rows: Row[] = []
  for (const node of currentNodes(rehydrateProjection(store))) {
    const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
    if (fact !== undefined) rows.push({ node, fact })
  }
  return rows
}

/**
 * The rows whose grounding anchor lies under `scope`. Scoped by `underScope` — the ONE shared "is this
 * anchor under that scope" predicate (anchor-scope.ts), the same one the scope read and the write door's
 * authz are bound to — so `own <scope>` and `atlas query <scope>` cannot select different rows for the same
 * path. An anchorless node is not locatable under any scope and is dropped.
 */
function underScopeRows(rows: readonly Row[], scope: string): readonly Row[] {
  return rows.filter((r) => r.node.primaryAnchor !== undefined && underScope(r.node.primaryAnchor, scope))
}

/**
 * The DFS for the axis node whose `key` is exactly `path`. Used for the scope's own spatial node (its
 * `contents` and its `finer` children). Returns `undefined` for a path that is not an index unit.
 */
function findByKey(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const child of node.children) {
    const hit = findByKey(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * The strictest governance class any `tier≥T1` fact under the scope carries, or `'T2'` when the scope serves
 * none. DERIVED, and it has to be: no per-territory tier is stored anywhere in production — `atlas init`
 * assigns one into a move-in shape that is never persisted. The derivation is stated rather than a constant
 * so a reader knows the number's provenance: it is the floor of what is actually filed here, not a policy.
 */
function terrainTier(rows: readonly Row[]): Tier {
  let best: Tier = "T2"
  for (const r of rows) {
    if (tierRank(r.fact.tier) < tierRank(best)) best = r.fact.tier
  }
  return best
}

/**
 * The policy-declared owner of the scope: the actors the admin put in the MOST SPECIFIC `authz.scopes` key
 * that covers it (ties broken by sort — the pick is total and deterministic). This is a read of the same
 * `.atlas/policy.json` the write door gates on, so "who owns this" and "who may write this" are one answer.
 * Empty when no declared scope covers the unit — the fail-closed default, where nobody may write anything.
 */
function terrainOwner(policy: AtlasPolicy, scope: string): string {
  const covering = Object.keys(policy.authz.scopes)
    .filter((key) => underScope(scope, key))
    .sort((a, b) => (b.length - a.length !== 0 ? b.length - a.length : a < b ? -1 : 1))
  const key = covering[0]
  return key === undefined ? "" : [...(policy.authz.scopes[key] ?? [])].sort().join(", ")
}

/**
 * The bounded blast summary the composer's `edges` is a capped subset of.
 *
 * `dependents` is REAL and is not computed here: it rides `buildRetrievalModel`'s `blastRadius`, the
 * production feed the CLOSED three-mode surface already serves `--by dependency` from (retrieval-model.ts),
 * which maps an anchor path to the fact CAS hashes reachable by `@atlas/index`'s reverse closure. Reusing
 * that map rather than re-deriving reachability is the whole point: a second implementation of "what depends
 * on this" would agree with the first until the day it did not, and a briefing that disagrees with
 * `atlas query --by dependency` about the blast radius is worse than one that omits it.
 *
 * `dependencies` is EMPTY, and that is a product fact rather than an omission: `DepgraphApi` has exactly one
 * method, `reverseClosure`. Nothing in this product can answer "what does this scope depend on" — the SCIP
 * edge ledger is there, but no traversal over it in the forward direction exists, and writing one here would
 * put a graph algorithm in the adapter ring where the index layer is supposed to own it.
 *
 * The unread fields of `RelatedFact`/`BoundMeta` carry OUT-OF-BAND sentinels, never plausible values.
 * `createOwn`'s `edgesOf` reads `nodeId` and nothing else; `distance: 0` and `maxHops: -1` are impossible as
 * real measurements (a hop distance is ≥1; a hop bound is ≥0) so neither can be mistaken for one. The
 * reverse closure is transitive and flat — it reports no per-node hop count and applies no hop bound — and
 * this module will not invent either.
 */
function relationSetFor(
  scope: string,
  rows: readonly Row[],
  blastRadius: ReadonlyMap<string, readonly Hash[]>,
  byContentHash: ReadonlyMap<string, Row>,
): RelationSet {
  const seen = new Set<string>()
  const dependents: RelatedFact[] = []
  for (const row of rows) {
    for (const h of blastRadius.get(row.node.primaryAnchor ?? "") ?? []) {
      const dep = byContentHash.get(String(h))
      if (dep === undefined) continue
      // A fact anchored INSIDE the scope is the unit's own content, not something that depends on it.
      if (dep.node.primaryAnchor !== undefined && underScope(dep.node.primaryAnchor, scope)) continue
      if (seen.has(dep.node.nodeKey)) continue
      seen.add(dep.node.nodeKey)
      dependents.push({
        nodeId: asNodeKey(dep.node.nodeKey),
        relation: "dependents",
        distance: 0, // SENTINEL — see the doc block; the closure reports no hop count and none is invented.
        tier: dep.fact.tier,
        ppr: 0, //     no stored ppr exists on a GroundedFact (GEN-11 lives on a genesis Candidate).
        claim: dep.node.claims.join("; "),
        stale: dep.fact.freshness === "DRIFTED",
      })
    }
  }
  return {
    unit: scope,
    enclosing: [], // the spatial roll-up band; `createOwn` reads neither this nor `governing`.
    dependents,
    dependents_meta: {
      maxHops: -1, // SENTINEL — the reverse closure is unbounded in hops; no bound was applied.
      rank: "tier-desc,ppr-desc,distance-asc,nodeKey-asc",
      total: dependents.length,
      returned: dependents.length,
      truncated: false, // the cap that DOES apply is the composer's EDGE_CAP, downstream of this record.
    },
    dependencies: [], // no forward closure exists in this product — see the doc block.
    governing: [],
  }
}

/** The deps this feed reads. All three are the composition root's own — never freshly derived here. */
export interface OwnSourceDeps {
  readonly axes: Axes
  readonly store: DiskStore
  readonly policy: AtlasPolicy
}

/**
 * Materialize the eight-axis `OwnSources` seam over the durable store + built axes. Every axis is re-read
 * from the LIVE projection at CALL time (the discipline `retrieval-model.ts` adopted for the same reason):
 * on a long-lived MCP session an in-session `atlas emit` must be visible to the very next `own`, never a
 * frozen startup snapshot.
 *
 * [AMENDED — REQ-RETR-12m, 2026-08-03] THE FACT SECTIONS ARE TWO BANDS, and the predicates that decide them
 * live in `own-bands.ts` beside the measurement that moved them. What this docstring said before was:
 *
 *   "THE TOOLS-6 BOUND IS APPLIED TO BOTH FACT SECTIONS … the alternative is a read door that serves a `T2`
 *    … that `atlas query` is correctly declining to show. A second read door with a laxer bound is a route
 *    around the first one."
 *
 * The justification had expired. ADR-0013 (owner-ratified 2026-08-03) made `atlas query` serve `T2` in a
 * separately capped ADVISORY band, so it declines nothing of the sort; the sentence defended a behaviour
 * that had been deleted, and the live consequence was that `own` served 0 of this repository's 199 mined
 * facts while `query` served them. The GOVERNING band (`invariants` + `gotchas`, `tier≥T1`) is unchanged;
 * the ADVISORY band is added beside it. A laxer bound would still be a route around the first door — this
 * is the SAME bound as the first door, reached through the same `@atlas/tools` predicates.
 */
export function buildOwnSources(deps: OwnSourceDeps): OwnSources {
  const { axes, store, policy } = deps
  const forest: AxisForest = { spatial: axes.spatial, territory: axes.territory, dependency: axes.dependency }
  // This feed's per-fact freshness oracle (ADR-0013). Bound HERE rather than injected because `axes` is
  // already a declared dep — the briefing is composed over the same snapshot the pack is.
  // TOTAL, via the one shared entry point: a fact whose CAS bytes carry no `grounding` at all (reachable —
  // `.atlas/` is committed) makes `driftDetect` raise, and a briefing door must degrade, never throw.
  const freshnessOf = (fact: GroundedFact): Freshness => resolveFreshness((f) => driftDetect(f.grounding, axes), fact)

  /** The rows under one unit's scope, off ONE live read of the projection. */
  const scopeRows = (unit: OwnUnit): readonly Row[] => underScopeRows(allRows(store), unit.id)

  return {
    role: (unit) => {
      // The reference sources the 1-line role from "a `definition` fact / terrain". Both legs, in that
      // order, with a third that is not a leg at all: the lowest-keyed `definition` fact under the scope
      // (lowest-keyed so equal input is byte-identical output), else the covering TERRITORY node's key,
      // else the scope string the caller typed. All three are DATA — a fact body, an index key, or the
      // caller's own input. None is a sentence this module composed, and the last one exists because a
      // scope outside every territory resolves to nothing and an empty role line names nothing at all.
      const defs = scopeRows(unit)
        .filter(
          (r) =>
            (r.node.slot ??
              (r.fact.kind === "advisory" || r.fact.kind === "predicate" ? r.fact.predicateSlot : undefined)) ===
            "definition",
        )
        .sort((a, b) => (a.node.nodeKey < b.node.nodeKey ? -1 : 1))
      const def = defs[0]
      if (def !== undefined) return def.node.claims.join("; ")
      return createResolve(forest).resolve("territory", unit.id)?.key ?? unit.id
    },

    invariants: (unit): readonly SizedInvariant[] => governingInvariants(scopeRows(unit), freshnessOf),

    // The ADVISORY band (REQ-RETR-12m) — every `T2` row under the scope, uncapped HERE and bounded by the
    // composer's `OWN_ADVISORY_CAP` inside the unchanged `OWN_CAP`. Same live read, same oracle, same
    // shaping as the governing band; the only difference is which membership predicate admits the row.
    advisory: (unit): readonly SizedInvariant[] => advisoryBand(scopeRows(unit), freshnessOf),

    terrain: (unit) => {
      const rows = scopeRows(unit)
      const node = findByKey(axes.spatial, unit.id)
      return {
        // The scope's IMMEDIATE structural children out of the spatial axis — the terrain's contents, sorted
        // for byte-stability. A scope that is not an index unit contributes none.
        contents: (node?.children ?? []).map((c) => asNodeKey(c.key)).sort(),
        owner: terrainOwner(policy, unit.id),
        // The `atLeastT1` pre-filter that used to sit here is GONE, and its removal moves no output byte.
        // Measured rather than assumed: `terrainTier` starts at `'T2'` and only ever LOWERS, and `tierRank`
        // (@atlas/knowledge) is total with an unrecognized class ranking LAST — so a `T2` row leaves the
        // answer at `T2`, an off-lattice row can never beat it, and an empty scope answers `T2` either way.
        // The filter was a third statement of a bound that has now moved; a no-op restatement of a governing
        // predicate is exactly what a reader mistakes for the predicate itself.
        tier: terrainTier(rows),
      }
    },

    relate: (unit): RelationSet => {
      const rows = allRows(store) // ONE live read: the scoped half and the whole-store index off the same pass
      const byContentHash = new Map<string, Row>(rows.map((r) => [r.node.contentHash, r] as const))
      const model = buildRetrievalModel(axes, store) // the SAME feed `atlas query --by dependency` serves from
      return relationSetFor(unit.id, underScopeRows(rows, unit.id), model.blastRadius, byContentHash)
    },

    gotchas: (unit): readonly SizedGotcha[] => governingGotchas(scopeRows(unit)),

    // L6 memory has no production instance; `OwnPack.memory` is `unknown` so retrieval never names a memory
    // type. `null` is the honest pointer bag, not a placeholder for one that exists elsewhere.
    memory: () => null,

    finer: (unit): readonly OwnUnit[] => {
      const node = findByKey(axes.spatial, unit.id)
      return (node?.children ?? [])
        .map((c) => ({ level: "module" as const, id: c.key, grounding: String(c.subtreeHash) }))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
    },

    manifest: (unit): readonly ManifestCandidate[] => {
      // D1: pointers + how-to-pull, NEVER content. Each finer scope-unit becomes one `own_<leaf>` pointer
      // whose `digest` is the INDEX-SUPPLIED `subtreeHash` of that unit — a real content identity, so no
      // `sim:` flag is needed (own.ts reserves that prefix for a locally synthesized one).
      const node = findByKey(axes.spatial, unit.id)
      return (node?.children ?? [])
        .map((c) => {
          const name = ownToolName({ level: "module", id: c.key, grounding: undefined })
          return {
            pointer: {
              kind: "pack" as const,
              name,
              digest: String(c.subtreeHash),
              pull: `atlas own ${c.key}`,
              hits: 0, // no frecency ledger has a production writer — see the header.
            },
            cost: name.length,
          }
        })
        .sort((a, b) => (a.pointer.name < b.pointer.name ? -1 : 1))
    },
  }
}

/**
 * The composition-root leg: `own(scope)` → the `own_<leaf>` tool name + its composed briefing.
 *
 * The `OwnUnit` a path scope maps to is `level: 'module'`, which is not a default — it is the honest answer
 * to the one question `level` decides. `groundingSource(level)` (own.ts) maps `crate|module` to `'tree'` and
 * `service|feature` to `'manifest'`, and a path scope IS grounded by the tree: it names a real node in the
 * spatial axis, and there is no service/feature manifest anywhere in this product to ground it against. Its
 * `grounding` handle (typed `unknown` in the frozen model, deliberately) is that node's `subtreeHash`.
 */
export function createOwnLeg(deps: OwnSourceDeps): OwnLeg {
  const facet: OwnFacet = createOwn(buildOwnSources(deps))
  return (scope: string): OwnDispatch => {
    const node = findByKey(deps.axes.spatial, scope)
    return facet.dispatch({ level: "module", id: scope, grounding: node?.subtreeHash })
  }
}
