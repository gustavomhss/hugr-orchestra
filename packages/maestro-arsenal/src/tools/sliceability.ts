// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: constrained numeric/tuple input, report ignored graph evidence, advice provenance.
import { text } from "../contract"
import type { Tool } from "../contract"
import { descriptor } from "../registry"
export interface SliceabilityInput { symbols: string[]; edges: [string, string][]; k: number; maxHubs?: number }
export interface CurvePoint { lifted: number; hub: string | null; largestCompRatio: number }
function largestComponentRatio(nodes: string[], adjacency: Map<string, Set<string>>, removed: Set<string>): number {
  const live = nodes.filter((name) => !removed.has(name))
  if (!live.length) return 0
  const visited = new Set<string>()
  const sizes = live.map((name) => {
    if (visited.has(name)) return 0
    const stack = [name]
    visited.add(name)
    let size = 0
    while (stack.length) {
      const next = stack.pop()!
      size++
      adjacency.get(next)!.forEach((neighbor) => {
        if (removed.has(neighbor) || visited.has(neighbor)) return
        visited.add(neighbor)
        stack.push(neighbor)
      })
    }
    return size
  })
  return Math.max(...sizes) / live.length
}
const tool: Tool<SliceabilityInput> = {
  ...descriptor("sliceability"),
  handler(input) {
    const symbols = [...new Set(input.symbols)].sort()
    const known = new Set(symbols)
    const adjacency = new Map(symbols.map((name) => [name, new Set<string>()]))
    const ignoredEdges = input.edges.filter(([a, b]) => a === b || !known.has(a) || !known.has(b))
    input.edges.forEach(([a, b]) => {
      if (a === b || !known.has(a) || !known.has(b)) return
      adjacency.get(a)!.add(b)
      adjacency.get(b)!.add(a)
    })
    const order = [...symbols].sort((a, b) => adjacency.get(b)!.size - adjacency.get(a)!.size || a.localeCompare(b))
    const cap = Math.min(input.maxHubs ?? Math.max(input.k, 8), Math.max(0, symbols.length - 1))
    const removed = new Set<string>()
    const curve: CurvePoint[] = []
    for (let lifted = 0; lifted <= cap; lifted++) {
      if (lifted) removed.add(order[lifted - 1])
      curve.push({ lifted, hub: lifted ? order[lifted - 1] : null, largestCompRatio: largestComponentRatio(symbols, adjacency, removed) })
    }
    const score = curve.find((point) => point.largestCompRatio <= 1 / input.k)?.lifted ?? null
    const sliceable = score !== null && score <= input.k
    const hubs = order.slice(0, score ?? 0)
    return text({ verdict: sliceable ? "SLICEABLE" : "BLOB", sliceable, score, hubs, threshold: 1 / input.k, curve, ignoredEdges, reason: sliceable ? `largest component reaches ≤ 1/${input.k} after lifting ${score} hub(s)` : `coupling requires too many hubs or remains above 1/${input.k}` }, { next: "inspect mutable/shared state, then compile proposed partition with plan-compiler", invariant: "graph heuristic cannot prove write isolation or compiler soundness; acquire those independently" })
  },
}
export default tool
