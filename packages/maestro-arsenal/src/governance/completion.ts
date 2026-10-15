// Completion contracts: validation and the bounded state read. The native host evaluates an armed contract on its
// Relay arm, the one evaluator; this package neither evaluates nor certifies completion.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import type { ArsenalContext } from "../contract.ts"
import { type CompletionContract, id, requireValue } from "./contracts.ts"
import { readState, sourceRoot } from "./state.ts"
export type { CompletionContract } from "./contracts.ts"
export { completionSchema } from "./contracts.ts"
export function validateCompletion(contract: CompletionContract) {
  id(contract.sessionID)
  requireValue(typeof contract.label === "string" && contract.label.length > 0 && contract.label.length <= 4096, "COMPLETION_LABEL_INVALID")
  requireValue(Array.isArray(contract.chain) && contract.chain.length > 0 && contract.chain.length <= 32, "COMPLETION_CHAIN_EMPTY_OR_OVERFLOW")
  const retryBudget = contract.retryBudget ?? 3
  requireValue(Number.isInteger(retryBudget) && retryBudget >= 0 && retryBudget <= 32, "COMPLETION_RETRY_BUDGET_INVALID")
  requireValue(new Set(contract.chain.map((gate) => gate.id)).size === contract.chain.length, "COMPLETION_GATE_DUPLICATE")
  const checks = contract.chain.flatMap((gate) => {
    id(gate.id)
    requireValue(Array.isArray(gate.checks) && gate.checks.length > 0 && gate.checks.length <= 64, `COMPLETION_CHECKS_EMPTY: ${gate.id}`)
    gate.checks.forEach((check: CompletionContract["chain"][number]["checks"][number]) => { id(check.id); id(check.hostCheck) })
    return gate.checks
  })
  requireValue(new Set(checks.map((check) => check.id)).size === checks.length, "COMPLETION_CHECK_DUPLICATE")
  return { ...contract, retryBudget }
}
export async function readCompletionContract(context: ArsenalContext, token: string) {
  await sourceRoot(context)
  const state = await readState(context, "completion", token) as { schema?: number; projectID?: string; contract?: CompletionContract }
  requireValue(state && state.schema === 1 && state.projectID === context.projectID && state.contract, "COMPLETION_STATE_INVALID")
  return validateCompletion(state.contract)
}
