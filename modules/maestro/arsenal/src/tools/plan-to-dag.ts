// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: dedup edges, compute real cycle witness instead of null, scheduling advice only.
import { text } from "../contract"
import type { Tool } from "../contract"
import { EXTERNAL, LEAD } from "../plan"
import type { Plan } from "../plan"
import { descriptor } from "../registry"
export interface PlanToDagOutput { layers: string[][]; cyclic: boolean; cycle: string[] | null }
export function dependencyLayers(plan: Plan): PlanToDagOutput {
  const ids = plan.modules.map((m) => m.id).filter((id) => id !== EXTERNAL && id !== LEAD).sort()
  const remaining = new Set(ids)
  const providers = new Map(ids.map((id) => [id, new Set(plan.edges.filter((e) => e.to === id && ids.includes(e.from)).map((e) => e.from))]))
  const layers: string[][] = []
  while (remaining.size) {
    const layer = [...remaining].filter((id) => [...providers.get(id)!].every((provider) => !remaining.has(provider))).sort()
    if (!layer.length) {
      const visited = new Set<string>()
      const stack: string[] = []
      const cycle = (id: string): string[] | undefined => {
        const start = stack.indexOf(id)
        if (start >= 0) return stack.slice(start)
        if (visited.has(id)) return
        visited.add(id)
        stack.push(id)
        for (const provider of providers.get(id) ?? []) {
          if (!remaining.has(provider)) continue
          const found = cycle(provider)
          if (found) return found
        }
        stack.pop()
      }
      for (const id of remaining) {
        const found = cycle(id)
        if (found) return { layers, cyclic: true, cycle: found }
      }
      throw new Error("dependency graph blocked without cycle witness")
    }
    layers.push(layer)
    layer.forEach((id) => remaining.delete(id))
  }
  return { layers, cyclic: false, cycle: null }
}
const tool: Tool<{ plan: Plan }> = {
  ...descriptor("plan-to-dag"),
  handler(input) {
    const output = dependencyLayers(input.plan)
    return text(output, { next: output.cyclic ? "break the reported dependency cycle before scheduling" : "use layers as provider-first integration advice with wave-scheduler", invariant: "layers do not authorize dispatch/merge; real providers must satisfy host completion checks" })
  },
}
export default tool
