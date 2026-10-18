// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: exact declared parity and explicit generated-source proposal.
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import type { Plan } from "../plan"
import { descriptor } from "../registry"
const tool: Tool<{ plan: Plan }> = {
  ...descriptor("plan-to-barrel"),
  handler(input) {
    if (!input.plan.ok) return failure("invalid_plan", "fix Plan issues before source generation")
    const exported = input.plan.modules.flatMap((m) => m.exports)
    const union = new Set(exported)
    const missing = input.plan.frozenSurface.filter((name) => !union.has(name)).sort()
    const extra = [...union].filter((name) => !input.plan.frozenSurface.includes(name)).sort()
    const duplicates = [...new Set(exported.filter((name, i) => exported.indexOf(name) !== i))].sort()
    // Plan carries names, not declaration kinds. Star re-exports preserve both type and value exports.
    const barrel = ["// Generated source proposal; host must review, write and verify.", ...[...input.plan.modules].sort((a, b) => a.id.localeCompare(b.id)).map((m) => `export * from ${JSON.stringify(`./${m.id}.js`)};`), ""].join("\n")
    return text({ barrel, reExportsSurface: !missing.length && !extra.length && !duplicates.length, missing, extra, duplicates }, { next: "verify actual compiler export parity before writing or integrating proposed barrel", invariant: "parity result covers declared Plan names only; source generation never writes, merges or certifies actual API parity" })
  },
}
export default tool
