// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: bounded packet, no generated baseline shell, checks remain proposed commands.
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import { descriptor } from "../registry"
export interface PackTarget { path: string; loc?: number }
export interface ContextPackerInput { wpId: string; baselineSha: string; targets: PackTarget[]; rules: string[]; gates: string[]; returnShape: string; patternSnippet?: string; maxChars?: number }
export interface ContextPackerOutput { packet: string }
const tool: Tool<ContextPackerInput> = {
  ...descriptor("context-packer"),
  handler(input) {
    const packet = [
      `# ${input.wpId}`, "", "## Step 0 — verify baseline", `Expected baseline: ${input.baselineSha}. Verify HEAD and caller-provided worktree before editing.`, "",
      "## Target (the X)", "| path | loc |", "| --- | --- |", ...input.targets.map((t) => `| ${t.path} | ${t.loc ?? ""} |`), "",
      ...(input.patternSnippet !== undefined ? ["## Pattern", "```", input.patternSnippet, "```", ""] : []),
      "## Hard rules", ...input.rules.map((rule) => `- ${rule}`), "",
      "## Gates (proposed; host authorization required)", ...input.gates.map((gate) => `- ${JSON.stringify(gate)}`), "",
      "## Return", input.returnShape,
    ].join("\n")
    if (packet.length > (input.maxChars ?? 65536)) return failure("packet_limit", `packet ${packet.length} characters exceeds limit ${input.maxChars ?? 65536}; narrow supplied context`)
    return text({ packet }, { next: "use this focused packet with explicit target ownership", invariant: "packet contains supplied context only; check proposals grant no execution authority" })
  },
}
export default tool
