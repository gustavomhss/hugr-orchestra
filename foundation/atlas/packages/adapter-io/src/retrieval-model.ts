// @atlas/adapter-io — src/retrieval-model.ts  (N2: the composition-root feed for the CLOSED three-mode retrieval)
//
// The designed three-mode `RetrievalApi` (@atlas/index retrieval.ts, `createRetrieval(model)`) resolves
// relevance by EXACTLY `byScope`/`byDependency`/`byTrigger` (INDEX-6) but had ZERO production callers. This
// module is its feed: it materializes the `RetrievalModel` the surface serves (over the SAME durable CAS +
// built axes the rest of the runtime rides) and shapes a mode's `readonly Fact[]` into the user-facing
// `{ pack, subsumes }` envelope the CLI renderer already understands. Pure + total, no clock/random.
//
// FRESHNESS (bobby N-fix): the model is rebuilt PER QUERY from the LIVE projection (the same discipline the
// scope path uses via `rehydrateProjection`), so on a long-lived MCP session an in-session `atlas-emit` is
// reflected by `--by dependency|trigger` EXACTLY as it is by `--by scope` — never a frozen startup snapshot.
// Only the STRUCTURAL axes (`forest`/`edges`, the process's fixed code-tree snapshot — the SAME snapshot the
// scope path's `queryIndex` is built over) are static; the fact-dependent parts are re-read each call.

import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash, Pack } from "@atlas/contracts"
import { createDepgraph, createRetrieval, nodeHashOfPath } from "@atlas/index"
import type { Axes, AxisForest, Fact, RetrievalModel } from "@atlas/index"
import { currentNodes } from "@atlas/knowledge"
import type { CurrentNode, GroundedFact } from "@atlas/knowledge"
import { mintPack } from "./pack-shape.js"
import type { FreshnessOracle } from "./pack-shape.js"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"

/** The two NON-scope modes this feed serves through the designed surface. `scope` stays the pre-existing
 *  byte-identical projection path in wire.ts and never routes here. */
export type RetrievalMode = "dependency" | "trigger"

/**
 * Materialize the `RetrievalModel` the CLOSED three-mode surface serves, over the built `axes` + the durable
 * projection read back from `store` at CALL TIME (fresh):
 *   - `forest`      — the already-built axis hierarchies (the process's structural snapshot; NOT rebuilt).
 *   - `store`       — `contentHash → Fact`: every current node's whole fact read back from CAS (the CAS bytes
 *                     ARE the fact).
 *   - `blastRadius` — `anchor path → dependency-reachable fact CAS hashes`: the EXISTING depgraph reverse
 *                     closure (blast radius) over `axes.edges`, keyed by each current node's `primaryAnchor`.
 *                     The closure returns index NodeKeys (`id({file: path})`); each is bridged to fact CAS
 *                     hashes through the current-anchor MULTIMAP (`id({file: anchor}) → contentHash[]`) — one
 *                     file-granular closure key legitimately maps to N facts (same file, different slots), so
 *                     ALL are unioned in (`dereferenceSorted` dedups+sorts downstream), never just the last.
 *   - `triggers`    — EMPTY (`new Map()`). DOCUMENTED NON-BEHAVIOR: no trigger-axis producer exists anywhere
 *                     in the monorepo, so `byTrigger` is a declared-but-unpopulated mode that returns `[]` for
 *                     every tag. Populating it (fact-level trigger tags) is a SEPARATE future feature — NOT
 *                     this wiring (see docs/design/adr-retrieval-node-doors.md).
 */
export function buildRetrievalModel(axes: Axes, store: DiskStore): RetrievalModel {
  const nodes = currentNodes(rehydrateProjection(store))

  // store: contentHash → the whole fact read back from CAS.
  const factStore = new Map<Hash, Fact>()
  // bridge MULTIMAP: the index-node key of an anchor (`id({file: anchor})`) → the fact CAS hashes anchored there.
  const anchorKeyToContentHashes = new Map<string, Hash[]>()
  for (const n of nodes) {
    const contentHash = n.contentHash as Hash
    const fact = store.get(contentHash)
    if (fact !== undefined) factStore.set(contentHash, fact)
    if (n.primaryAnchor !== undefined) {
      const key = String(nodeHashOfPath(n.primaryAnchor))
      const bucket = anchorKeyToContentHashes.get(key) ?? []
      bucket.push(contentHash) // APPEND — one anchor can carry N facts (different slots); keep every one.
      anchorKeyToContentHashes.set(key, bucket)
    }
  }

  // blastRadius: anchor path → reachable fact CAS hashes (reverse closure of the anchor's index node).
  const depgraph = createDepgraph(axes.edges)
  const blastRadius = new Map<string, readonly Hash[]>()
  for (const n of nodes) {
    if (n.primaryAnchor === undefined) continue
    const closure = depgraph.reverseClosure(nodeHashOfPath(n.primaryAnchor)).closure
    const hashes: Hash[] = []
    for (const closureKey of closure) {
      hashes.push(...(anchorKeyToContentHashes.get(String(closureKey)) ?? [])) // ALL facts at each closure node
    }
    blastRadius.set(n.primaryAnchor, hashes)
  }

  const forest: AxisForest = { spatial: axes.spatial, territory: axes.territory, dependency: axes.dependency }
  // triggers EMPTY — documented dormant mode (no producer exists; byTrigger returns [] for every tag).
  return { forest, store: factStore, triggers: new Map<string, readonly Hash[]>(), blastRadius }
}

/** The envelope both non-scope modes return — the shape the CLI renderer already understands. */
export type RetrievalEnvelope = {
  readonly pack: Pack
  readonly subsumes: readonly never[]
  readonly sameAs: readonly never[]
}

/**
 * Drive a NON-scope mode through the designed `createRetrieval(model)` surface and shape the returned
 * `readonly Fact[]` into the `{ pack, subsumes }` envelope the CLI renderer understands. The model is built
 * FRESH from the live `store` on every call (freshness parity with the scope path).
 */
export function retrievalPack(
  axes: Axes,
  mode: RetrievalMode,
  target: string,
  store: DiskStore,
  freshness: FreshnessOracle,
): RetrievalEnvelope {
  return packFromModel(buildRetrievalModel(axes, store), mode, target, store, freshness) // FRESH per query
}

/**
 * The mode→pack half of `retrievalPack`, over an ALREADY-BUILT read model. Split out from the model build
 * for one reason beyond symmetry: `buildRetrievalModel` hardcodes `triggers: new Map()` (no trigger-axis
 * producer exists anywhere in the monorepo), so the `trigger` leg is unreachable through `retrievalPack` and
 * a mode nobody can exercise is a mode whose governance nobody can test. Taking the model as a parameter
 * lets the trigger leg be driven with a populated `triggers` map through the REAL code path.
 *
 * Each returned fact is shaped + BOUNDED + minted by the shared `mintPack` (pack-shape.ts): the projection
 * `CurrentNode` is recovered for a fact by its CAS contentHash (`id(fact)`), so the trusted (recomputed)
 * nodeKey + claim set are used, not the untrusted author payload; `mintPack` then applies the deterministic
 * `nodeId` sort and the ADR-0013 two-band split (a `T2` lands in the separately capped ADVISORY band; an
 * off-lattice `T3` from a committed projection lands in NEITHER band and is still served on no mode).
 * `subsumes`/`sameAs` are `[]` (scope-only derived relations); `stale: false` (the non-scope modes carry no
 * pack-level drift flag — but every row still carries its OWN `freshness`, resolved through the injected
 * oracle, which is what makes that `false` survivable). Pure + total.
 */
export function packFromModel(
  model: RetrievalModel,
  mode: RetrievalMode,
  target: string,
  store: DiskStore,
  freshness: FreshnessOracle,
): RetrievalEnvelope {
  const api = createRetrieval(model)
  const facts = (mode === "dependency" ? api.byDependency(target) : api.byTrigger(target)) as readonly GroundedFact[]

  const nodeByContentHash = new Map(currentNodes(rehydrateProjection(store)).map((n) => [n.contentHash, n] as const))
  const pairs: (readonly [CurrentNode, GroundedFact])[] = []
  for (const fact of facts) {
    const node = nodeByContentHash.get(String(id(fact as unknown as CasObject)))
    if (node === undefined) continue // a fact with no current-node projection is not locatable — skip (total)
    pairs.push([node, fact] as const)
  }

  // the model's axis hash — the spatial axis root identity of the snapshot the pack was built from.
  const axisHash = model.forest.spatial.subtreeHash as unknown as Hash
  const pack = mintPack({ territory: target, axisHash, stale: false }, pairs, freshness)
  // `subsumes`/`sameAs` are `[]` here — both are scope-only derived relations; the non-scope dependency/
  // trigger modes carry neither (WP-SAMEAS: parity with the pre-existing empty `subsumes`).
  return { pack, subsumes: [], sameAs: [] }
}
