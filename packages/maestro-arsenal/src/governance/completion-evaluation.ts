// Pure D completion evaluation, shared with the native public seam without loading state handlers.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { type CompletionContract, type Capture, id, requireValue } from "./contracts.ts"
import { acceptance } from "./acceptance.ts"

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
export function evaluateCompletion(projectID: string, contract: CompletionContract, observations: Capture, bindings: readonly string[]) {
  validateCompletion(contract)
  const required = contract.chain.flatMap((gate) => gate.checks.map((check) => ({ name: check.id, mode: "preserve-source-green" as const })))
  const unbound = contract.chain.flatMap((gate) => gate.checks.filter((check) => !bindings.includes(check.hostCheck)).map((check) => `HOST_CHECK_UNBOUND: ${check.hostCheck}`))
  const evaluation = acceptance(projectID, observations, observations, required)
  const wrongSession = observations.results.filter((result) => result.provenance.sessionID !== contract.sessionID).map((result) => `COMPLETION_SESSION_MISMATCH: ${result.name}`)
  const failures = [...new Set([...unbound, ...evaluation.failures, ...wrongSession])].sort()
  const currentGate = contract.chain.find((gate) => gate.checks.some((check) => failures.some((failure) => failure.endsWith(`: ${check.id}`) || failure.endsWith(`: ${check.hostCheck}`))))?.id ?? null
  return { status: failures.length ? "FAIL" : "PASS", failures, currentGate, enforcedBy: "native-host", hookInstalled: false, authoritative: false }
}
