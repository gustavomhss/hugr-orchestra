// The pure half of the Atlas graph (specs/atlas-ui/mock/graph.js:22-29): folding edges into weighted links, and the
// closure of what depends on a node.
export type GraphEdge = { source: string; target: string; w?: number }
export type GraphLink = { source: string; target: string; w: number }

// Repeated source → target pairs fold into one link whose weight is the sum; self links and links to a node that
// is not drawn are dropped. A missing weight counts 1.
export function foldLinks(ids: ReadonlySet<string>, edges: readonly GraphEdge[]): GraphLink[] {
  const pairs = new Map<string, GraphLink>()
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) return
    const key = `${edge.source}\u0000${edge.target}`
    const pair = pairs.get(key)
    if (pair) {
      pair.w += edge.w ?? 1
      return
    }
    pairs.set(key, { source: edge.source, target: edge.target, w: edge.w ?? 1 })
  })
  return [...pairs.values()]
}

// Every node that reaches `id` along the links (an edge points from the user to what it depends on), `id` included:
// what a change to `id` reaches.
export function closureOf(links: readonly GraphLink[], id: string) {
  const seen = new Set([id])
  const queue = [id]
  while (queue.length) {
    const at = queue.shift()
    links
      .filter((link) => link.target === at && !seen.has(link.source))
      .forEach((link) => {
        seen.add(link.source)
        queue.push(link.source)
      })
  }
  return seen
}
