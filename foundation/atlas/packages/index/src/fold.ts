// @atlas/index — src/fold.ts  (WP-2.7-a.INDEX · structural-fold arm: Delta + bounded eager re-hash)
//
// The bounded incremental re-check (INDEX-12), "never O(blast-radius)": `delta` diffs two built `Axes`
// into a `Delta` distinguishing structure (`idChanged`) from state (`stateChanged`) and naming exactly the
// changed buckets. `eagerRehashState` bounds the eager `rState` re-hash to `MAX_HOPS` of the closure.
// SCOPE: the STRUCTURAL fold only — the drift-state arm (propagateDirty/lazy rState) is WP-2.7-b, not here.

import { id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { Axes, Axis, Delta, DepEdge, IndexNode } from "./types.js"

/** The eager-re-hash cap: on an edit the `rState` re-hash is bounded to nodes within this many hops
 *  of the reverse closure; deeper nodes are `state-suspect`, resolved only on query (INDEX-12).
 *  Reference pins this literal (atlas-index:123, 183-184). */
export type MaxHops = 2

/** The bounded incremental re-check surface (INDEX-12) — `delta` (which buckets changed, structure vs
 *  state), `propagateDirty` (eager O(1)/node drift bit), `rehashState` (lazy `rState`, eager ≤`MaxHops`). */
export interface FoldApi {
  /** Which axis buckets changed, structure (`idChanged`) vs state (`stateChanged`); bounds a re-check
   *  to the named `changedBuckets`, never `N` (INDEX-12). The two compared snapshots are whole built
   *  index states — the frozen `Axes` (the return of `build`, ./types.ts) — so a rebuild/edit diffs
   *  `before`→`after` into the changed buckets. (atlas-index:212) */
  delta(before: Axes, after: Axes): Delta

  /** Eager drift dirty-bit across the whole reverse closure — a bit per node, O(1)/node, never a hash
   *  (INDEX-12). The edited node is the frozen `IndexNode`; the traversal reads the dependency edge set
   *  (`Axes.edges`) and is bounded structurally by `MaxHops` — neither is a further method arg, the
   *  reference names none. (method-tags-idx:101; atlas-index:121-122) */
  propagateDirty(node: IndexNode): void

  /** Lazy / on-read `rState` recompute over the edited `IndexNode`'s subtree (leaf→root), eager re-hash
   *  capped at `maxHops=2` (`MaxHops`); deeper nodes stay `state-suspect` until queried (INDEX-12). The
   *  `maxHops` cap is the module constant `MaxHops`, not a param. (method-tags-idx:101; atlas-index:122-123) */
  rehashState(node: IndexNode): void
}

/** The eager-re-hash cap (`MaxHops`): deeper nodes are not eagerly re-hashed here. */
export const MAX_HOPS: MaxHops = 2

const AXES: readonly Axis[] = ["spatial", "territory", "dependency"]

/** Flatten an axis tree into a key→node map (structure diff lookup). */
function flatten(root: IndexNode, into: Map<string, IndexNode>): void {
  into.set(root.key, root)
  for (const c of root.children) flatten(c, into)
}
/** The state fingerprint of a node — its anchored CAS `objects` payload (status/freshness proxy).
 *  Minted through the sealed `id` seam, NOT by joining on a separator: a separator-joined fingerprint is
 *  not injective, so `["a b"]` and `["a","b"]` compared EQUAL and `delta` reported `stateChanged: false`
 *  through a real state change. The structured preimage escapes any separator inside a value. */
const objFingerprint = (n: IndexNode): string => String(id({ objects: [...n.objects].map(String) }))

/** Which axis buckets changed, structure (`idChanged`) vs state (`stateChanged`); `changedBuckets` names
 *  exactly the affected buckets (never `N`) in root→leaf pre-order over the AFTER trees (INDEX-12b/c/d). */
export function delta(before: Axes, after: Axes): Delta {
  let idChanged = false
  let stateChanged = false
  const buckets: string[] = []
  const seen = new Set<string>()
  const mark = (key: string): void => {
    if (!seen.has(key)) {
      seen.add(key)
      buckets.push(key)
    }
  }
  for (const axis of AXES) {
    const b = new Map<string, IndexNode>()
    const a = new Map<string, IndexNode>()
    flatten(before[axis], b)
    flatten(after[axis], a)
    const walk = (n: IndexNode): void => {
      const bn = b.get(n.key)
      const structDiff = bn === undefined || bn.subtreeHash !== n.subtreeHash
      const stateDiff = bn === undefined || objFingerprint(bn) !== objFingerprint(n)
      if (structDiff) idChanged = true
      if (stateDiff) stateChanged = true
      if (structDiff || stateDiff) mark(n.key)
      n.children.forEach(walk)
    }
    walk(after[axis])
    for (const key of b.keys()) {
      if (!a.has(key)) {
        idChanged = true // a removed bucket is a structural change
        mark(key)
      }
    }
  }
  return { idChanged, stateChanged, changedBuckets: buckets }
}

/** The bounded eager `rState` re-hash on the dependency axis: from the edited node, walk the reverse
 *  closure (dependents, `edge.to === edited`) up to `maxHops` levels and return the nodes eagerly
 *  re-hashed. Deeper nodes are NOT eagerly re-hashed — the eager count ≤ |nodes-within-maxHops|,
 *  independent of blast-radius (INDEX-12f). (Deeper `state-suspect` marking is WP-2.7-b's arm.) */
export function eagerRehashState(edited: Hash, edges: readonly DepEdge[], maxHops: number = MAX_HOPS): readonly Hash[] {
  const dependents = new Map<string, Hash[]>()
  for (const e of edges) {
    if (e.to === null) continue
    const arr = dependents.get(e.to) ?? []
    arr.push(e.from)
    dependents.set(e.to, arr)
  }
  const touched: Hash[] = []
  const seen = new Set<string>([edited])
  let frontier: readonly Hash[] = [edited]
  for (let hop = 1; hop <= maxHops; hop++) {
    const next: Hash[] = []
    for (const cur of frontier) {
      for (const dep of dependents.get(cur) ?? []) {
        if (!seen.has(dep)) {
          seen.add(dep)
          touched.push(dep)
          next.push(dep)
        }
      }
    }
    frontier = next
  }
  return touched
}

// ============================================================================
// WP-2.7-b.INDEX · DRIFT-STATE ARM (additive — does NOT touch 2.7-a above)
//
// The drift-state facet of the dual rollup (INDEX-5 / INDEX-12): on an edit a drift dirty-bit
// propagates EAGERLY across the WHOLE reverse closure (a bit, O(1)/node — never a hash, `propagateDirty`,
// 12g); the `rState` hash resolves LAZILY / on-read (12h); the eager re-hash is capped at `maxHops=2`
// (`MAX_HOPS`, 12i); any node deeper is marked `state-suspect` (12j), resolved only when queried (12k).
// A stale entry (anchor `subtreeHash` ≠ current) is visible + flagged/excluded INLINE at query time, with
// NO re-embedding and NO separate sweep (INDEX-5a/5b/5c).
//
// DRIFT-CARRIER NOTE: the frozen `IndexNode`/`Rollup` (./types.ts) carry no `rState`/status field, and
// `propagateDirty`/`rehashState` return `void`. So the dirty-bit set, the state-suspect set and the
// resolved `rState` side-index are held as fold-internal state keyed by NODE IDENTITY (`node.key`, the
// same identity `Axes.edges`' Hash endpoints are keyed by) — created per `createDriftFold(edges,nodes)`
// session, never as a new field on the frozen types. rState is hashed ONLY through the sealed kernel seam
// (`id`); the drift arm does no raw hashing.

/** A node's identity on the drift graph — its `key`, the identity `Axes.edges` endpoints are keyed by. */
const nid = (n: IndexNode): string => n.key

/** A query-time drift verdict over a surfaced fact (INDEX-5): visible (`value` returned) yet marked
 *  `stale` when its anchor `subtreeHash` ≠ current — decided INLINE by a comparison, not a sweep. */
export interface StaleView<F> {
  readonly value: F
  readonly stale: boolean
  readonly anchor: string
  readonly current: string
}

/** The drift-state fold session (INDEX-5 / INDEX-12 drift arm). Holds the fold-internal drift carrier
 *  (dirty-bit / state-suspect / resolved-rState side-indexes) keyed by node identity. */
export interface DriftFold {
  /** Eager drift dirty-bit across the WHOLE reverse closure of `node` (a bit per node, O(1)/node, never a
   *  hash) — reads the dependency edge set, bounded by nothing (the full closure) (12g). */
  propagateDirty(node: IndexNode): void
  /** Lazy/on-read `rState` recompute over `node`'s reverse closure: eager re-hash capped at `MAX_HOPS`
   *  (=2); deeper nodes stay `state-suspect` until queried (12h/12i/12j). */
  rehashState(node: IndexNode): void
  /** Whether `node` carries a set drift dirty-bit (in the propagated closure). */
  isDirty(node: IndexNode): boolean
  /** Whether `node` is `state-suspect` (dirty but beyond `MAX_HOPS`, rState unresolved). */
  isStateSuspect(node: IndexNode): boolean
  /** Whether `node`'s `rState` hash is currently resolved (eagerly re-hashed or read-resolved). */
  rStateResolved(node: IndexNode): boolean
  /** The resolved `rState` hash of `node`, or `undefined` if not yet resolved. */
  rStateOf(node: IndexNode): string | undefined
  /** LAZY on-read resolve: resolves `node`'s `rState` NOW (only if not already), clearing state-suspect —
   *  the sole path that resolves a suspect node (12k). Returns the resolved `rState` hash. */
  queryState(node: IndexNode): string
  /** Query-time drift verdict for a surfaced fact (INDEX-5): visible + `stale` iff anchor ≠ current,
   *  decided inline by a `subtreeHash` comparison — 0 re-embedding, 0 sweep. */
  queryStale<F>(value: F, anchor: string, current: string): StaleView<F>
  /** The node identities eagerly re-hashed by `rehashState` (the ≤ within-`MAX_HOPS` set) — 12i witness. */
  readonly eagerRehashed: readonly string[]
  /** Count of query-time `subtreeHash` drift comparisons (INDEX-5c: >0 while sweeps == 0). */
  readonly comparisons: number
  /** Count of lazy on-read `rState` resolves (12h/12k witness). */
  readonly onReadResolves: number
  /** Re-embeddings performed — invariantly 0 (INDEX-5c: drift needs NO re-embedding). */
  readonly reembedCount: number
  /** Separate staleness sweeps performed — invariantly 0 (INDEX-5c: drift needs NO separate sweep). */
  readonly sweepCount: number
}

/** The reverse-dependents adjacency (dependent-of): `deps.get(X)` = identities that depend on `X`
 *  (`e.from` where `e.to === X`). `null` targets (unresolved/dynamic edges) carry no closure. */
function reverseDependents(edges: readonly DepEdge[]): Map<string, string[]> {
  const deps = new Map<string, string[]>()
  for (const e of edges) {
    if (e.to === null) continue
    const arr = deps.get(e.to) ?? []
    arr.push(e.from)
    deps.set(e.to, arr)
  }
  return deps
}

/** Open a drift-state fold session over the built `edges` (and optional node registry for richer rState
 *  preimages). The returned fold matches the frozen `FoldApi.propagateDirty`/`rehashState` shapes and
 *  owns the drift carrier as session-internal state (never a field on the frozen `IndexNode`). */
export function createDriftFold(edges: readonly DepEdge[], nodes: readonly IndexNode[] = []): DriftFold {
  const deps = reverseDependents(edges)
  const registry = new Map<string, IndexNode>(nodes.map((n) => [nid(n), n]))
  const dirty = new Set<string>()
  const suspect = new Set<string>()
  const resolved = new Map<string, string>()
  const eager: string[] = []
  let comparisons = 0
  let onReadResolves = 0

  /** `rState` for an identity, through the sealed kernel seam only — hash over (identity ‖ status ‖
   *  freshness), the status/freshness taken from the registered node's anchored `objects`/`subtreeHash`
   *  when known (else identity-only). Never a raw hash. */
  const stateHash = (identity: string, node?: IndexNode): string =>
    String(
      id({
        rState: identity,
        objects: node ? [...node.objects] : [],
        subtreeHash: node ? node.subtreeHash : null,
      }),
    )

  const resolve = (identity: string, node?: IndexNode): string => {
    const cur = resolved.get(identity)
    if (cur !== undefined) return cur
    const h = stateHash(identity, node ?? registry.get(identity))
    resolved.set(identity, h)
    suspect.delete(identity)
    return h
  }

  return {
    propagateDirty(node: IndexNode): void {
      // eager dirty-bit across the WHOLE reverse closure — a bit per node, never a hash (12g).
      const seen = new Set<string>([nid(node)])
      let frontier: string[] = [nid(node)]
      while (frontier.length > 0) {
        const next: string[] = []
        for (const cur of frontier) {
          for (const dep of deps.get(cur) ?? []) {
            if (seen.has(dep)) continue
            seen.add(dep)
            dirty.add(dep) // O(1)/node bit — the full closure, no hop bound
            next.push(dep)
          }
        }
        frontier = next
      }
    },
    rehashState(node: IndexNode): void {
      // eager rState re-hash capped at MAX_HOPS; deeper closure nodes stay state-suspect (12h/12i/12j).
      const seen = new Set<string>([nid(node)])
      let frontier: string[] = [nid(node)]
      let hop = 1
      while (frontier.length > 0) {
        const next: string[] = []
        for (const cur of frontier) {
          for (const dep of deps.get(cur) ?? []) {
            if (seen.has(dep)) continue
            seen.add(dep)
            next.push(dep)
            if (hop <= MAX_HOPS) {
              if (!resolved.has(dep)) {
                resolved.set(dep, stateHash(dep, registry.get(dep)))
                eager.push(dep)
              }
              suspect.delete(dep)
            } else if (!resolved.has(dep)) {
              suspect.add(dep) // beyond the cap — resolved only when queried (12k)
            }
          }
        }
        frontier = next
        hop += 1
      }
    },
    isDirty: (node) => dirty.has(nid(node)),
    isStateSuspect: (node) => suspect.has(nid(node)),
    rStateResolved: (node) => resolved.has(nid(node)),
    rStateOf: (node) => resolved.get(nid(node)),
    queryState(node: IndexNode): string {
      const identity = nid(node)
      if (resolved.has(identity)) return resolved.get(identity)!
      onReadResolves += 1 // lazy: only a read resolves a suspect/unresolved node (12h/12k)
      return resolve(identity, node)
    },
    queryStale<F>(value: F, anchor: string, current: string): StaleView<F> {
      comparisons += 1 // inline subtreeHash comparison — no re-embedding, no sweep (INDEX-5c)
      return { value, stale: String(anchor) !== String(current), anchor, current }
    },
    get eagerRehashed(): readonly string[] {
      return eager
    },
    get comparisons(): number {
      return comparisons
    },
    get onReadResolves(): number {
      return onReadResolves
    },
    reembedCount: 0, // drift is decided by hash comparison — nothing is ever re-embedded (INDEX-5c)
    sweepCount: 0, // drift is decided inline at query time — no separate staleness pass (INDEX-5c)
  }
}
