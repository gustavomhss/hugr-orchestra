// Source: TechLead mcp/src/tools/relay-arm.ts. Stores completion contract; host binds named checks, no hook claim.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { createHash } from "node:crypto"
import { type GovernanceContext, type CompletionContract, id, requireValue, text } from "../governance/contracts.ts"
import { sourceRoot, updateState } from "../governance/state.ts"
import { validateCompletion, readCompletionContract } from "../governance/completion.ts"
import type { ToolDef } from "../contract.ts"
import { relayArmToolDescriptor } from "../governance/descriptors.ts"
export { relayArmToolDescriptor } from "../governance/descriptors.ts"
export type { CompletionContract } from "../governance/contracts.ts"
export { completionSchema } from "../governance/contracts.ts"
export { validateCompletion, readCompletionContract } from "../governance/completion.ts"
export interface RelayArmInput {
  sourceRoot?: string
  action: "arm" | "read" | "release"
  token?: string
  contract?: CompletionContract
  reason?: string
}
const tool: ToolDef<RelayArmInput> = {
  ...relayArmToolDescriptor,
  async handler(input: RelayArmInput, context?: GovernanceContext) {
    requireValue(context, "NATIVE_CONTEXT_REQUIRED")
    await sourceRoot(context, input.sourceRoot)
    if (input.action === "read") {
      requireValue(input.token, "COMPLETION_TOKEN_MISSING")
      return text({ schema: 1, projectID: context.projectID, contract: await readCompletionContract(context, input.token) })
    }
    // A request only: the native host asks the owner and releases the parked arm on approval, never this package.
    if (input.action === "release") {
      requireValue(input.token && input.reason, "COMPLETION_RELEASE_INPUT_REQUIRED")
      id(input.token)
      return text({ token: input.token, release: "owner-approval-required", reason: input.reason, enforced: false, permissionOwner: "native-host" })
    }
    requireValue(input.action === "arm" && input.contract, "COMPLETION_CONTRACT_MISSING")
    const contract = validateCompletion({ ...input.contract, retryBudget: input.contract.retryBudget ?? 3 })
    const token = `arm-${createHash("sha256").update(JSON.stringify({ projectID: context.projectID, contract })).digest("hex").slice(0, 32)}`
    await updateState(context, "completion", token, () => ({ schema: 1, projectID: context.projectID, contract }))
    return text({ token, contract, bindingRequired: contract.chain.flatMap((gate) => gate.checks.map((check) => check.hostCheck)), enforced: false, permissionOwner: "native-host" })
  },
}
export default tool
