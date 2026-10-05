// Native host completion binding. No dispatch engine, transcript store or model-supplied check authority.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import type { ArsenalContext } from "../contract.ts"
import { type CompletionContract, type CheckResult, requireValue, validateCapture, gitRevision, isSourceRevision } from "./contracts.ts"
import { readState, sourceRoot } from "./state.ts"
import { validateCompletion, evaluateCompletion } from "./completion-evaluation"
export { validateCompletion, evaluateCompletion } from "./completion-evaluation"
export type { CompletionContract } from "./contracts.ts"
export { completionSchema } from "./contracts.ts"
export async function readCompletionContract(context: ArsenalContext, token: string) {
  await sourceRoot(context)
  const state = await readState(context, "completion", token) as { schema?: number; projectID?: string; contract?: CompletionContract }
  requireValue(state && state.schema === 1 && state.projectID === context.projectID && state.contract, "COMPLETION_STATE_INVALID")
  return validateCompletion(state.contract)
}
export type HostCheck = (input: {
  readonly context: ArsenalContext
  readonly sessionID: string
  readonly gateID: string
  readonly check: CompletionContract["chain"][number]["checks"][number]
}) => Promise<CheckResult>
export type HostCheckRegistry = Readonly<Record<string, HostCheck>>
/** Invoke at F's real lifecycle boundary, with actual Session identity and compiled host callbacks. */
export async function runCompletion(context: ArsenalContext, token: string, sessionID: string, registry: HostCheckRegistry = {}, expectedGitRevision?: string) {
  requireValue(expectedGitRevision === undefined || isSourceRevision(expectedGitRevision), "COMPLETION_EXPECTED_REVISION_INVALID")
  const contract = await readCompletionContract(context, token)
  requireValue(contract.sessionID === sessionID, "COMPLETION_SESSION_BINDING_MISMATCH")
  const records: CheckResult[] = []
  const invoked = { count: 0 }
  const failure = (currentGate: string, reason: string) => ({ status: "FAIL", failures: [reason], currentGate, authoritative: true, authority: "compiled-host-check-registry", checksExecuted: invoked.count, observations: { complete: false, results: Object.freeze([...records]) } })
  for (const gate of contract.chain) {
    for (const check of gate.checks) {
      if (!Object.hasOwn(registry, check.hostCheck) || typeof registry[check.hostCheck] !== "function") return failure(gate.id, `HOST_CHECK_UNBOUND: ${check.hostCheck}`)
      invoked.count++
      const acquired = await registry[check.hostCheck]({ context, sessionID, gateID: gate.id, check }).then((result) => ({ result }), () => ({ result: undefined }))
      if (!acquired.result) return failure(gate.id, `HOST_CHECK_ACQUISITION_FAILED: ${check.id}`)
      const result = acquired.result
      validateCapture({ complete: true, results: [result] }, context.projectID)
      requireValue(result.name === check.id && result.provenance.sessionID === sessionID, `HOST_CHECK_BINDING_MISMATCH: ${check.id}`)
      records.push(Object.freeze({ ...result, provenance: Object.freeze({ ...result.provenance }) }))
      if (expectedGitRevision !== undefined && gitRevision(result.provenance) !== expectedGitRevision) return failure(gate.id, `COMPLETION_REVISION_MISMATCH: ${check.id}`)
      if (result.status !== "pass") return failure(gate.id, `COMPLETION_${result.status.toUpperCase()}: ${check.id}`)
    }
  }
  return { ...evaluateCompletion(context.projectID, contract, { complete: true, results: records }, Object.keys(registry)), authoritative: true,
    authority: "compiled-host-check-registry", checksExecuted: invoked.count, observations: Object.freeze({ complete: true, results: Object.freeze(records) }),
  }
}
