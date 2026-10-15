// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: provider/model are metadata, budgets explicit, no brand defaults, typo rejection.
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import { requirePlan } from "../plan"
import type { ModuleDispatch, Plan, WaveDispatch } from "../plan"
import { descriptor } from "../registry"
export interface DispatchEnrichment { wave?: WaveDispatch; perModule?: Record<string, ModuleDispatch> }
export function enrich(plan: Plan, dispatch: DispatchEnrichment): Plan {
  return { ...structuredClone(plan), ...structuredClone(dispatch.wave ?? {}), modules: plan.modules.map((m) => ({ ...structuredClone(m), ...structuredClone(dispatch.perModule?.[m.id] ?? {}) })) }
}
const tool: Tool<{ plan: Plan; dispatch: DispatchEnrichment }> = {
  ...descriptor("enrich-plan"),
  handler(input) {
    const unknown = Object.keys(input.dispatch.perModule ?? {}).filter((id) => !input.plan.modules.some((m) => m.id === id))
    if (unknown.length) return failure("unknown_modules", `dispatch metadata names unknown modules: ${unknown.join(", ")}`)
    const plan = enrich(input.plan, input.dispatch)
    const issue = requirePlan(plan)
    if (issue) return failure("invalid_dispatch", issue)
    return text(plan, { next: "project enriched Plan through plan-to-briefs/gates/policy", invariant: "dispatch metadata leaves frozen structure/hash unchanged; provider/model fields grant no routing authority" })
  },
}
export default tool
