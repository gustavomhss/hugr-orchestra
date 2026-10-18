// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: scoped permission proposals, no permission grants or shell regex enforcement claims.
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import type { Plan } from "../plan"
import { descriptor } from "../registry"
export interface PlanToPolicyInput { plan: Plan; scopeDir: string; barrelFile: string }
const tool: Tool<PlanToPolicyInput> = {
  ...descriptor("plan-to-policy"),
  handler(input) {
    if (!input.plan.ok) return failure("invalid_plan", "fix Plan issues before scope proposals")
    const owned = input.plan.modules.map((m) => m.ownerFiles?.length ? m.ownerFiles : [`${input.scopeDir}/${m.id}.ts`])
    const policies = input.plan.modules.map((m, i) => ({ moduleId: m.id, file: owned[i][0], proposedScopes: {
      write: [...new Set(owned[i])].sort(),
      excludeWrite: [...new Set([input.barrelFile, ...owned.filter((_, j) => i !== j).flat()])].sort(),
      remoteMutation: "not-requested",
    } }))
    return text({ authority: "proposal", policies }, { next: "host reviews resource scopes and applies native permissions before any side effect", invariant: "scope proposals grant no edit/process/remote authority and cannot weaken host permissions" })
  },
}
export default tool
