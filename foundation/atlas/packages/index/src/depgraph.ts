// @atlas/index — src/depgraph.ts  (INDEX-13: the `dependency` axis — reverse closure = blast radius)
//
// `reverseClosure(node)` is the transpose closure over the depends-on DAG = every unit that (transitively)
// depends on `node`. Honest under-approximation: an `unresolved`/`dynamic` edge in scope flags
// `underApprox: true` and ONLY then unions the correlational `coChanged` band (labeled, never a static
// edge). The closure is a sorted `Hash[]` so a rebuild is byte-identical.

import type { Hash } from "@atlas/contracts"
import type { DepEdge } from "./types.js"

/** An edge's resolution class — defined in `./types.ts`, re-exported here for depgraph consumers.
 *  (atlas-index:185-188; method-tags-idx:108) */
export type { EdgeKind } from "./types.js"

/**
 * The result of a reverse (transpose) closure = blast radius. Transcribed from the reference model
 * (method-tags-idx:108): `reverseClosure(node) = { closure, underApprox, coChanged }`.
 *   - `closure`    — the reachable reverse-closure node set (referenced by hash).
 *   - `underApprox` — `true` iff any `unresolved`/`dynamic` edge is in scope (honest incompleteness).
 *   - `coChanged`  — the correlational `coChanged` git-history band, unioned in ONLY when `underApprox`
 *     (labeled correlational, never a static edge). Empty otherwise.
 */
export interface ReverseClosure {
  readonly closure: readonly Hash[]
  readonly underApprox: boolean
  readonly coChanged: readonly Hash[]
}

export interface DepgraphApi {
  /** Reverse / transpose closure (blast radius) over the `depends-on` DAG; reports `underApprox` and
   *  unions the correlational `coChanged` band when an `unresolved` edge is in scope (INDEX-13).
   *  (method-tags-idx:108)
   *
   *  The reference names `reverseClosure(node)` with no concrete type for `node`; CONFIRMED as the
   *  node's CAS `Hash` — the dependency axis keys structural units by hash (atlas-index:105) and the
   *  closure node set is referenced by hash (method-tags-idx:108). Finalized `Hash`, not `IndexNode`. */
  reverseClosure(node: Hash): ReverseClosure
}

/**
 * Build a `DepgraphApi` over a fixed edge ledger + an optional correlational `coChanged` band map. The graph
 * is captured once; `reverseClosure` is a pure query over it (deterministic, no I/O, no clock).
 *   - reverse adjacency: `to → [from…]` over the `resolved` edges (who depends on the target).
 *   - unresolved sources: the set of nodes with an outgoing `unresolved`/`dynamic` edge (honest holes).
 */
export function createDepgraph(
  edges: readonly DepEdge[],
  coChanged: ReadonlyMap<Hash, readonly Hash[]> = new Map(),
): DepgraphApi {
  const reverse = new Map<string, Hash[]>()
  const unresolvedSources = new Set<string>()
  for (const e of edges) {
    if (e.kind === "resolved" && e.to !== null) {
      const k = String(e.to)
      const bucket = reverse.get(k) ?? []
      bucket.push(e.from)
      reverse.set(k, bucket)
    } else {
      unresolvedSources.add(String(e.from)) // `unresolved` / `dynamic` — a statically-incomplete hole
    }
  }

  return {
    reverseClosure(node: Hash): ReverseClosure {
      // BFS over reverse edges; the origin is never part of its own blast radius.
      const seen = new Set<string>()
      const queue: string[] = [String(node)]
      while (queue.length > 0) {
        const cur = queue.shift()!
        for (const dep of reverse.get(cur) ?? []) {
          const k = String(dep)
          if (!seen.has(k)) {
            seen.add(k)
            queue.push(k)
          }
        }
      }
      seen.delete(String(node)) // a node is never part of its own blast radius (even under a cycle)
      // scope = the origin + everything in its closure; an unresolved edge sourcing from ANY of these makes
      // the closure honestly under-approximate.
      const scope = new Set<string>([String(node), ...seen])
      let underApprox = false
      const band = new Set<string>()
      for (const s of scope) {
        if (!unresolvedSources.has(s)) continue
        underApprox = true
        for (const h of coChanged.get(s as Hash) ?? []) band.add(String(h))
      }
      const closure = [...seen].sort() as unknown as Hash[]
      // coChanged rides in ONLY when underApprox (labeled correlational via its own field), else empty.
      const coChangedOut = (underApprox ? [...band].sort() : []) as unknown as Hash[]
      return { closure, underApprox, coChanged: coChangedOut }
    },
  }
}
