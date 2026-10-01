// @atlas/genesis — src/seeds.ts  (WP-8.27.GEN · GEN-11 / GEN-15c — identity correspondence + seed frontier)
//
// Split out of `rank.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers ONE
// question — how a dep-graph NODE IDENTITY, a CONTENT subtreeHash and a repo-relative PATH refer to the
// same node. `rank.ts` keeps the PPR law and the S0/S1 drivers; this file keeps the identity bridges and
// the GEN-15c structural frontier they feed.

import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { nodeHashOfPath, unescapeKeyComponent } from "@atlas/index"
import type { IndexNode } from "@atlas/index"
import type { Skeleton } from "./types.js"
import { cmp, filePartOf, isUnitSite, unitsOfAxis } from "./unit-order.js"
import type { SiteOrderKey, UnitPrior, UnitPriorSource } from "./unit-order.js"

/** The unit vocabulary and the order over it live in `unit-order.ts` (split at the LOC ceiling). They are
 *  RE-EXPORTED here because `cmp` and the `#182` order are part of this module's published surface and
 *  `rank.ts` already imports both from it — the split must move code, not the API. */
export { cmp, filePartOf, isUnitSite, compareSiteOrder } from "./unit-order.js"
export type { SiteOrderKey, UnitPrior, UnitPriorSource } from "./unit-order.js"

// ── node-identity ↔ subtreeHash correspondence (the F1/F2 bridge) ─────────────────────────────────────
// The dep-graph keys edge endpoints by NODE IDENTITY (`DepEdge.from/to: Hash` = `IndexNode.key`, the
// reconciliation pinned in @atlas/index src/fold.ts:116-122). A mined frontier site joins by its CONTENT
// `StructRef.subtreeHash: SubtreeHash` — a DELIBERATELY ORTHOGONAL identity space (contracts/hash.ts:5,
// 22-25; KNOW-15: conflating them is how an Atlas rots). The two legs CANNOT be compared as raw strings.
// But every `IndexNode` carries BOTH legs (`key` + `subtreeHash`), so the frozen `Skeleton.axes` already
// exposes the bridge: match a frontier site's subtreeHash to a node's subtreeHash (SAME brand — legit),
// then read that node's identity `key` (the edge-endpoint space). This resolver builds both directions
// deterministically (min-key tie-break, walk-order-independent) — no invented port, no fabricated map.
export function correspondence(graph: Skeleton): {
  readonly keyOfSubtree: ReadonlyMap<string, string> // subtreeHash → node-identity key (edge space)
  readonly subtreeOfKey: ReadonlyMap<string, string> // node-identity key → subtreeHash (StructRef leg)
} {
  const pairs: Array<readonly [string, string]> = [] // [subtreeHash, key]
  const collect = (n: IndexNode): void => {
    pairs.push([n.subtreeHash, n.key])
    n.children.forEach(collect)
  }
  collect(graph.axes.dependency)
  collect(graph.axes.spatial)
  collect(graph.axes.territory)
  const keyOfSubtree = new Map<string, string>()
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1])))
    if (!keyOfSubtree.has(st)) keyOfSubtree.set(st, key)
  const subtreeOfKey = new Map<string, string>()
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[1], b[1]) || cmp(a[0], b[0])))
    if (!subtreeOfKey.has(key)) subtreeOfKey.set(key, st)
  return { keyOfSubtree, subtreeOfKey }
}

/**
 * Resolve a frontier site's CONTENT subtreeHash to its NODE-IDENTITY key (the edge-endpoint space) via
 * the index correspondence. A site with NO node in the index stays a disconnected island under its own
 * synthetic identity — NEVER brand-laundered into the node space by a raw-string coincidence.
 *
 * A SUB-FILE SITE RESOLVES TO ITS FILE'S IDENTITY (#182), and the reason is structural rather than a
 * convenience: `deriveEdges` (index/src/build.ts) keys BOTH endpoints of every dependency edge by
 * `docHash(doc.relativePath)`, so the dependency graph's nodes are DOCUMENTS and a sub-file unit has no
 * vertex in it — and therefore no PPR of its own, ever, on this axis. Looking a unit up by its own content
 * subtreeHash returns the SPATIAL key, which is not in the graph, so the unit would score the isolated-node
 * floor: MEASURED on this repository, the first sub-file site then lands at rank 500 of 5803 and a
 * budget-200 run visits ZERO of them — the frontier would grow 11× and change nothing at all.
 *
 * Taking the FILE's identity is the join the contract already sanctions (struct.ts: "the FILE portion is
 * the prefix up to the first `::`"), so a unit inherits exactly its file's centrality and nothing else is
 * invented. It is a PREFIX join on a delimiter the index escapes (`escapeKeyComponent`), NOT a join by
 * spelling of a symbol NAME — the class #189/#153 punished and which this must not become.
 *
 * The consequence is deliberate and load-bearing: every unit of one file TIES with that file and with its
 * siblings, so the ordering below — never a hash — is what actually decides which units are mined.
 */
export const resolveSiteKey = (
  keyOfSubtree: ReadonlyMap<string, string>,
  site: StructRef,
  inGraph?: (key: string) => boolean,
): string => {
  const direct = keyOfSubtree.get(site.subtreeHash)
  // THE SITE'S OWN IDENTITY WINS WHENEVER IT IS REALLY IN THE GRAPH. The file-prefix fallback below is a
  // LAST resort for a site that has no vertex of its own, never a blanket rule for anything spelled with a
  // `::` — a caller whose sites carry a `::` address AND resolve into the dependency axis (the transcribed
  // goldens do exactly that) must keep the score it always had.
  if (direct !== undefined && (inGraph === undefined || inGraph(direct))) return direct
  if (isUnitSite(site.qualifiedPath)) {
    const file = String(nodeHashOfPath(filePartOf(site.qualifiedPath)))
    if (inGraph === undefined || inGraph(file)) return file
  }
  return direct ?? `unresolved:${site.subtreeHash}`
}

/** The repo-relative PATH a spatial node addresses. `build.ts` mints a spatial key by joining the ESCAPED
 *  `/`-components of `node.path` (`escapeKeyComponent`), so the raw path is recovered by the exact inverse
 *  — the identity function for any path containing neither `:` nor `%`. */
const pathOfNode = (n: IndexNode): string => n.key.split("/").map(unescapeKeyComponent).join("/")

/**
 * subtreeHash → repo-relative PATH, walking the SPATIAL AXIS **ONLY**.
 *
 * WHY SPATIAL-ONLY, and why NOT `correspondence.keyOfSubtree`: that map collects across all three axes and
 * keeps the MINIMUM key per subtreeHash, so for a node present on both axes it returns the dependency
 * HASH (hex sorts before most paths), not the path. The path leg has to come from the axis that HAS paths:
 * resolve.ts:9 — the spatial hierarchy "keys every node `key: node.path`" while the dependency axis is
 * hash-keyed. The path was always in the skeleton; it was simply never consulted.
 *
 * A spatial node is reachable under EITHER of the two identities it is addressable by, so both are keys of
 * the same map (one walk, one order, one first-wins rule):
 *   (1) `n.subtreeHash` — for a skeleton whose axes share ONE identity space (the transcribed goldens, and
 *       every hand-built fixture: resolve.ts:82 names the same case for the descent).
 *   (2) `nodeHashOfPath(path)` — the PRODUCTION bridge, and the load-bearing one. MEASURED on a real
 *       indexed repo: a spatial node's `subtreeHash` is a CONTENT fold (`foldNodeHash`), while a dependency
 *       leaf's is `asSubtreeHash(nodeHashOfPath(path))` — its own key, a constant of the PATH (build.ts
 *       `dependencyAxis`, "NOT A FRESHNESS ORACLE"). The two never collide, so leg (1) alone resolves
 *       NOTHING on a real repo and every seed would be dropped. `nodeHashOfPath` is @atlas/index's exported
 *       single source of truth for a file node's identity — REUSED here exactly as `git-history.ts fileRef`
 *       reuses it, never restated, so the two frontier producers cannot drift apart.
 */
function pathOfSubtree(graph: Skeleton): ReadonlyMap<string, string> {
  const pairs: Array<readonly [string, string]> = [] // [subtreeHash-or-node-identity, path]
  const collect = (n: IndexNode): void => {
    const path = pathOfNode(n)
    pairs.push([n.subtreeHash, path])
    pairs.push([String(nodeHashOfPath(path)), path])
    n.children.forEach(collect)
  }
  collect(graph.axes.spatial) // SPATIAL ONLY — the other two axes carry no path
  const out = new Map<string, string>()
  for (const [k, path] of [...pairs].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1])))
    if (!out.has(k)) out.set(k, path)
  return out
}

/**
 * The GEN-15c structural frontier plus the count of dep-graph nodes it had to DROP.
 *
 * A dependency node with no spatial counterpart has no path (INDEX-13 cross-language/FFI targets, and any
 * SCIP document that is not in the tracked tree). Such a seed is DROPPED: a site with no resolvable path
 * cannot be prompted at all — `createFileSourceReader` would return `null` and the prompt factory would
 * refuse — so keeping it only reproduces the failure one layer down. The count rides out BESIDE the seeds
 * because a bounded set that is silently truncated reads as "we covered everything" (#130).
 */
export interface StructuralFrontier {
  readonly seeds: readonly StructRef[]
  readonly droppedNoPath: number // dep-graph nodes with no spatial counterpart ⇒ no path ⇒ not promptable
}

/**
 * How wide the structural frontier is cut (#182).
 *
 * `subFile` DEFAULTS TO FALSE — the shipped, file-only frontier, byte-for-byte — and that default is a
 * claim about evidence, not timidity. The hypothesis this card exists to test (a symbol-granular frontier
 * yields more distinct, more narrowly-grounded facts at equal budget) is NOT established; the card's own
 * falsifiers may sink it, in which case the honest outcome is to revert. A behaviour that may be reverted
 * must not be the one every existing caller silently gets in the meantime, so the wider frontier is OPT-IN
 * at every layer: library, mine driver, and CLI (`ATLAS_FRONTIER=symbol`).
 */
export interface FrontierOptions {
  readonly subFile?: boolean //      default FALSE: file sites only, exactly as master ships
  readonly prior?: UnitPriorSource // absent ⇒ the within-file order degrades to `path asc` (honest, stated)
  /** [PROVABLE-FRONTIER] A PURE provability predicate: `true` iff a sound oracle can admit a fact at this
   *  site. When set, `createMine` STABLE-PARTITIONS the PPR-ranked frontier so provable sites come first
   *  (relative PPR order preserved within each group), so a budget-capped run spends its sites where the
   *  oracle can actually admit. ABSENT ⇒ the ranking is untouched, byte-identical to master. Genesis holds
   *  no SCIP: the CLI supplies this from the SAME `CandidateReader` that feeds the sound arm's proposer. */
  readonly provableFirst?: (site: StructRef) => boolean
}

/** The STRUCTURAL personalization vector (GEN-15c): the def→ref graph's structurally-central sites (highest
 *  degree = type/API-surface density), ordered deterministically. Used when history is thin OR absent — a
 *  non-uniform, non-random frontier, NEVER rank noise. */
export function structuralFrontier(graph: Skeleton, opts: FrontierOptions = {}): StructuralFrontier {
  // `h` iterates over dep-graph NODE-IDENTITY keys (edge endpoints), and BOTH legs of the emitted
  // `StructRef` are resolved back out of that space, never re-branded from it (KNOW-15):
  //   • `subtreeHash` — the CONTENT leg (F2): the node's real subtreeHash via the index correspondence,
  //     rather than a node-identity Hash wearing a SubtreeHash brand.
  //   • `qualifiedPath` — a repo-relative PATH, THE SAME KIND OF VALUE `adapter-io/src/git-history.ts:74`
  //     `fileRef` puts there. That agreement is the point: `qualifiedPath` used to carry a node-identity
  //     key here and a path there, so every consumer — `createFileSourceReader`, `filePathOf`, `bucketOf` —
  //     read a hash as a path and `build()` threw `source-unreadable` at EVERY site of a thin-history repo.
  //     There is no union to teach consumers about; the producer conforms.
  const { subtreeOfKey } = correspondence(graph)
  const pathOf = pathOfSubtree(graph)
  const degree = new Map<string, number>()
  const bump = (h: string): void => {
    degree.set(h, (degree.get(h) ?? 0) + 1)
  }
  for (const e of graph.axes.edges) {
    bump(e.from)
    if (e.to !== null) bump(e.to)
  }
  const ids = [...degree.entries()].filter(([, d]) => d > 0).map(([h]) => h)
  const ranked = (ids.length > 0 ? ids : [...degree.keys()]).sort(
    (a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || cmp(a, b),
  )
  // The SUB-FILE seeds are cut from the SPATIAL axis (the only axis that carries `::` nodes), and only for
  // files that already reach the frontier — a file with dep-degree 0 has nothing to inherit.
  const units = opts.subFile === true ? unitsOfAxis(graph.axes.spatial, opts.prior).byFile : undefined
  const seeds: StructRef[] = []
  let droppedNoPath = 0
  for (const h of ranked) {
    const st = subtreeOfKey.get(h) ?? h
    const path = pathOf.get(st)
    if (path === undefined) {
      droppedNoPath += 1 //  no spatial counterpart ⇒ no path ⇒ nothing to show a model
      continue
    }
    seeds.push({ kind: "file", qualifiedPath: path, subtreeHash: asSubtreeHash(st) })
    // …then that file's units, in the PRIOR order (`byUnitPrior`), never a hash. The file seed stays: it
    // is the coarse anchor, and dropping it would make the two arms differ in more than granularity.
    for (const u of units?.get(path) ?? [])
      seeds.push({ kind: u.kind, qualifiedPath: u.qualifiedPath, subtreeHash: asSubtreeHash(u.subtreeHash) })
  }
  return { seeds, droppedNoPath }
}

/** The seeds alone — the shape every existing caller and oracle uses. */
export function structuralSeeds(graph: Skeleton, opts: FrontierOptions = {}): readonly StructRef[] {
  return structuralFrontier(graph, opts).seeds
}

/**
 * The tie-break key for each site of a personalization vector, computed from the SKELETON — never from the
 * caller's array order, and never from a side-channel the producer had to remember to fill.
 *
 * A unit's `group` is recovered the same way `structuralFrontier` minted it: `nodeHashOfPath(file)` is the
 * dependency node identity `h`, and `subtreeOfKey.get(h) ?? h` is the `st` the file seed carries. So a
 * unit sorts into exactly its own file's slot. A site the spatial axis does not know (a mined history site,
 * a hand-built fixture) falls back to its own `subtreeHash` on both legs — i.e. the shipped behaviour.
 */
export function siteOrderKeys(
  graph: Skeleton,
  sites: readonly StructRef[],
  prior?: UnitPriorSource,
): readonly SiteOrderKey[] {
  const { subtreeOfKey } = correspondence(graph)
  const { byPath } = unitsOfAxis(graph.axes.spatial, prior)
  const groupCache = new Map<string, string>()
  const groupOf = (file: string): string => {
    const hit = groupCache.get(file)
    if (hit !== undefined) return hit
    const h = String(nodeHashOfPath(file))
    const g = subtreeOfKey.get(h) ?? h
    groupCache.set(file, g)
    return g
  }
  return sites.map((s): SiteOrderKey => {
    const path = s.qualifiedPath
    const hash = String(s.subtreeHash)
    const u = byPath.get(path)
    // A UNIT IS A SITE THE FOLDED TREE KNOWS ABOUT — not a site whose address happens to contain `::`.
    // The two are different and the difference is load-bearing: the transcribed goldens address their
    // sites as `pkg/<id>.ts::<id>` while their skeletons carry no sub-file node at all, so a
    // string-shaped test would have re-grouped them under a file hash that indexes nothing and silently
    // reordered a frozen ranking. It also gives I1 for free — a site the reader could not resolve is
    // never treated as a unit here either.
    if (u === undefined) return { group: hash, sub: false, exported: false, bytes: 0, path, hash }
    return { group: groupOf(filePartOf(path)), sub: true, exported: u.exported, bytes: u.bytes, path, hash }
  })
}
