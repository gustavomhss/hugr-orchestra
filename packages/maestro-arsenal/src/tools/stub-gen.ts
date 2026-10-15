// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: stale-contract rejection, safe error literals, explicit scaffold proposal.
import { failure, requireContract, text } from "../contract"
import type { Contract, Tool } from "../contract"
import { descriptor } from "../registry"
const tool: Tool<{ contract: Contract }> = {
  ...descriptor("stub-gen"),
  handler(input) {
    const issue = requireContract(input.contract)
    if (issue) return failure("invalid_contract", issue)
    const stubs = input.contract.surfaces.map((surface) => surface.kind === "function" ? `export function ${surface.signature} {\n  throw new Error(${JSON.stringify(`stub: ${surface.name}`)});\n}` : `export ${surface.signature}${["const", "type"].includes(surface.kind) ? ";" : ""}`).join("\n\n")
    return text({ lang: "ts", count: input.contract.surfaces.length, stubs }, { next: "review scaffold text and compile against actual project before use", invariant: "scaffold text is not implementation or verification evidence; tool writes no files" })
  },
}
export default tool
