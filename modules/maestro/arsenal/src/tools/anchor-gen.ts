// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: reject stale contract and unknown subsets.
import { failure, requireContract, text } from "../contract"
import type { Contract, Surface, Tool } from "../contract"
import { descriptor } from "../registry"
export interface AnchorOutput { wp: string; surfaces: Surface[]; markdown: string }
const tool: Tool<{ contract: Contract; wp: string; only?: string[] }> = {
  ...descriptor("anchor-gen"),
  handler(input) {
    const issue = requireContract(input.contract)
    if (issue) return failure("invalid_contract", issue)
    if (input.only?.some((name) => !input.contract.surfaces.some((s) => s.name === name))) return failure("unknown_surfaces", "subset names unknown surfaces")
    const surfaces = input.contract.surfaces.filter((s) => !input.only || input.only.includes(s.name))
    const output: AnchorOutput = { wp: input.wp, surfaces, markdown: `## Código-âncora — ${input.wp}\nContract \`${input.contract.id}\` @ \`${input.contract.hash}\`. Conform exactly to these ${surfaces.length} declared surfaces:\n\n${surfaces.map((s) => `- \`${s.signature}\` _(${s.kind})_`).join("\n")}\n` }
    return text(output, { next: "include this anchor in the dependent brief", invariant: "dependent code imports the frozen interface; signature changes require owner judgment" })
  },
}
export default tool
