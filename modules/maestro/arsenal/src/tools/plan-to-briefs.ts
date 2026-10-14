// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: require external source mapping, bounded packets, file-XOR-inline return, native guidance.
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import { EXTERNAL, LEAD } from "../plan"
import type { Plan } from "../plan"
import { descriptor } from "../registry"
export interface PlanToBriefsInput { plan: Plan; gates: string[]; returnShape: string; externalImports?: Record<string, string>; maxChars?: number }
export interface Brief { moduleId: string; packet: string }
const tool: Tool<PlanToBriefsInput> = {
  ...descriptor("plan-to-briefs"),
  handler(input) {
    if (!input.plan.ok) return failure("invalid_plan", "fix Plan issues before dispatch packets")
    const missing = input.plan.modules.flatMap((m) => m.imports.filter((i) => i.from === EXTERNAL).flatMap((i) => i.names.filter((name) => !input.externalImports?.[name])))
    if (missing.length) return failure("missing_external_imports", `external source mapping required for: ${[...new Set(missing)].join(", ")}`)
    const briefs: Brief[] = input.plan.modules.map((m) => {
      const imports = m.imports.flatMap((imp) => {
        if (imp.from !== EXTERNAL) return [`import { ${imp.names.join(", ")} } from ${JSON.stringify(imp.from === LEAD ? "./_shared.js" : `./${imp.from}.js`)};`]
        const sources = [...new Set(imp.names.map((name) => input.externalImports![name]))]
        return sources.map((source) => `import { ${imp.names.filter((name) => input.externalImports![name] === source).join(", ")} } from ${JSON.stringify(source)};`)
      })
      return { moduleId: m.id, packet: [
        `# WP: ${m.id}`, "", "## Step 0 — verify baseline", `Expected baseline: ${input.plan.baselineSha}. Verify actual worktree before editing.`, "",
        "## Create (exports this module owns)", `exports: ${m.exports.join(", ") || "(none)"}`, `helpers (non-exported): ${m.helpers.join(", ") || "(none)"}`,
        ...(m.ownerFiles?.length ? [`owned files: ${m.ownerFiles.join(", ")}`] : []), "",
        "## Imports to add", "```ts", ...imports, "```", "",
        "## Relocations IN", ...input.plan.relocations.filter((r) => r.to === m.id).map((r) => `- ${r.symbol} (from ${r.from}): ${r.reason}`), "",
        "## Hard rules", "- Implement only this slice; preserve declared exports and supplied contracts.", "- Proposed paths and checks require host permission and actual verification.", "",
        "## Gates (proposed)", ...(m.dod?.length ? m.dod : input.gates).map((gate) => `- ${JSON.stringify(gate)}`), "",
        ...(m.outputMode === "file" ? [`## Return → write output to ${m.outputPath}`, "Host must authorize this output path."] : ["## Return", m.returnShape ?? input.returnShape]),
      ].join("\n") }
    })
    const oversized = briefs.filter((brief) => brief.packet.length > (input.maxChars ?? 65536))
    if (oversized.length) return failure("packet_limit", `narrow context for: ${oversized.map((b) => b.moduleId).join(", ")}`)
    return text({ briefs }, { next: "review ownership and dispatch only under actual host permissions", invariant: "briefs are projections of supplied Plan, not execution, approval or verification receipts" })
  },
}
export default tool
