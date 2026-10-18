// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: declarative proposals replace Claude/Relay shell hooks and grep-based contract claims.
import { join } from "node:path"
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import type { Plan } from "../plan"
import { descriptor } from "../registry"
export interface PlanToGatesInput { plan: Plan; scopeDir: string; workdir: string; worktreeRoot?: string; typecheckCmd?: string; testCmd?: string }
export type ProposedCheck =
  | { kind: "scope"; baseline: string; paths: string[]; includeUntracked: true }
  | { kind: "contract"; exports: string[]; paths: string[]; acquisition: "compiler-required" }
  | { kind: "command"; command: string; bindings: { file: string }; evidence: "exit-status-and-output-required" }
const tool: Tool<PlanToGatesInput> = {
  ...descriptor("plan-to-gates"),
  handler(input) {
    if (!input.plan.ok) return failure("invalid_plan", "fix Plan issues before check proposals")
    const proposals = input.plan.modules.map((module) => {
      const paths = module.ownerFiles?.length ? module.ownerFiles : [`${input.scopeDir}/${module.id}.ts`]
      const checks: ProposedCheck[] = [{ kind: "scope", baseline: input.plan.baselineSha, paths, includeUntracked: true }]
      if (module.exports.length) checks.push({ kind: "contract", exports: module.exports, paths, acquisition: "compiler-required" })
      const commands = module.dod?.length ? module.dod : [input.typecheckCmd, input.testCmd].filter((command): command is string => command !== undefined)
      commands.forEach((command) => checks.push({ kind: "command", command, bindings: { file: paths[0] }, evidence: "exit-status-and-output-required" }))
      return { moduleId: module.id, workdir: input.worktreeRoot ? join(input.worktreeRoot, module.id) : input.workdir, checks, completionChecksDeclared: commands.length > 0 }
    })
    return text({ authority: "proposal", proposals }, { next: "host binds proposals to actual dispatch lifecycle, authorizes acquisition/commands and stores measured evidence", invariant: "proposed checks neither run nor enforce completion; missing build/test checks remain undeclared" })
  },
}
export default tool
