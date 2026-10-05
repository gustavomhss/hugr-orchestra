// Adapted from TechLead mcp/src/engine/scheduler-fold.ts @ a68e7af. Replay only.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
import type { WaveEvent } from "./scheduler.ts"
export type WpState = "PENDING" | "DISPATCHED" | "SEALED" | "FAILED" | "MERGED"
export function transition(current: WpState, event: WaveEvent["type"]): WpState | undefined {
  if ((current === "PENDING" || current === "FAILED") && event === "dispatched") return "DISPATCHED"
  if (current === "DISPATCHED" && event === "sealed") return "SEALED"
  if ((current === "DISPATCHED" || current === "SEALED") && event === "failed") return "FAILED"
  if ((current === "DISPATCHED" || current === "SEALED") && event === "merged") return "MERGED"
  return undefined
}
export function detectCycles(ids: string[], edges: (id: string) => string[], issues: Set<string>, members: Set<string>) {
  const visited = new Set<string>()
  const stack: string[] = []
  const active = new Set<string>()
  const reported = new Set<string>()
  const visit = (node: string) => {
    visited.add(node)
    stack.push(node)
    active.add(node)
    edges(node).forEach((next) => {
      if (active.has(next)) {
        const cycle = stack.slice(stack.indexOf(next)).sort()
        const key = cycle.join(",")
        if (reported.has(key)) return
        reported.add(key)
        cycle.forEach((member) => members.add(member))
        issues.add(`cycle: ${[...cycle, cycle[0]].join("→")}`)
        return
      }
      if (!visited.has(next)) visit(next)
    })
    active.delete(node)
    stack.pop()
  }
  ids.forEach((node) => { if (!visited.has(node)) visit(node) })
}
