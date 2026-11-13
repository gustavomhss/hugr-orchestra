/** Thin finite evaluation host. No provider, publication, policy or retry orchestration. */
import { posix } from "node:path"
import { id } from "@atlas/kernel"
import { prepareEvaluationUpdate, finalizeEvaluationUpdate } from "./evaluation-rebuild.js"
import type { EvaluationRebuildRequest } from "./evaluation-rebuild.js"
import { admitEvaluationRebuildTarget } from "./genesis-evaluation.js"
import type { OwnershipRecipe } from "./ownership-rebuild.js"

export interface MaintenanceHostEnvelope {
  readonly stage: "prepare" | "finalize" | "admit-target"
  readonly candidate: string
  readonly targetRoot: string
  readonly targetGeneration: string
  readonly maxEntries: number
  readonly maxRecipeCalls: number
  readonly maxCapturedBytes: number
  readonly maxOutputBytes: number
  /** External coordinator release reference, not a credential or semantic vote. */
  readonly releaseReference: string
}
const digest = (x: string) => /^[0-9a-f]{64}$/.test(x)
function guard(e: MaintenanceHostEnvelope, stage: MaintenanceHostEnvelope["stage"], candidate: string) {
  if (e.stage !== stage || !digest(candidate) || e.candidate !== candidate || !digest(e.targetGeneration) ||
    !posix.isAbsolute(e.targetRoot) || posix.normalize(e.targetRoot) !== e.targetRoot || !e.releaseReference.trim()) throw Error("maintenance-host-envelope")
  for (const [n, max] of [[e.maxEntries, 256], [e.maxRecipeCalls, 256], [e.maxCapturedBytes, 16777216], [e.maxOutputBytes, 16777216]])
    if (!Number.isSafeInteger(n) || n! < 1 || n! > max!) throw Error("maintenance-host-cap")
}
/** One invocation; caller owns durable one-attempt admission and bounded process lifecycle. */
export function prepareMaintenanceHost(e: MaintenanceHostEnvelope, request: EvaluationRebuildRequest) {
  guard(e, "prepare", request.baseline.candidate_id)
  if (request.baseline.candidate.entries.length > e.maxEntries || request.targetRepoRoot !== e.targetRoot ||
    request.targetGeneration !== e.targetGeneration || request.targetRepoRoot === request.baseline.candidate.repo_root) throw Error("maintenance-host-isolation")
  let capturedBytes = 0, outputBytes = 0
  const captured = new Map<string, Uint8Array>(), calls: string[] = []
  const recipes = new Map<string, OwnershipRecipe>()
  for (const [key, recipe] of request.recipes) recipes.set(key, { ...recipe, run(input) {
    if (calls.length >= e.maxRecipeCalls) throw Error("maintenance-host-call-cap")
    calls.push(key)
    const value = recipe.run(input), size = new TextEncoder().encode(value.body).byteLength
    outputBytes += size
    if (outputBytes > e.maxOutputBytes) throw Error("maintenance-host-output-cap")
    return value
  } })
  const result = prepareEvaluationUpdate({ ...request, recipes, readCapturedBytes(key) {
    const bytes = request.readCapturedBytes(key)
    if (bytes === undefined) return undefined
    const prior = captured.get(key)
    if (prior !== undefined && (prior.length !== bytes.length || prior.some((b, i) => b !== bytes[i]))) throw Error("maintenance-host-capture-drift")
    if (prior === undefined) {
      capturedBytes += bytes.byteLength
      if (capturedBytes > e.maxCapturedBytes) throw Error("maintenance-host-capture-cap")
      captured.set(key, new Uint8Array(bytes))
    }
    return new Uint8Array(bytes)
  } })
  return { result, accounting: { recipeCalls: calls, capturedBytes, outputBytes,
    externalProductionUsage: "UNKNOWN", physicalModelAttempts: "UNKNOWN", currency: "UNKNOWN" }, releaseReference: e.releaseReference }
}
export function finalizeMaintenanceHost(e: MaintenanceHostEnvelope, request: Parameters<typeof finalizeEvaluationUpdate>[0]) {
  guard(e, "finalize", request.target.prepared.candidate_id)
  if (request.target.prepared.candidate.entries.length > e.maxEntries || request.target.targetGeneration !== e.targetGeneration ||
    request.target.prepared.candidate.repo_root !== e.targetRoot) throw Error("maintenance-host-target")
  return finalizeEvaluationUpdate(request)
}
export async function admitMaintenanceHost(e: MaintenanceHostEnvelope, prepared: Parameters<typeof admitEvaluationRebuildTarget>[1], approvalPath: string, targetPlan: Record<string, unknown>) {
  const record = prepared as { candidate_id?: string; candidate?: { entries?: unknown[]; repo_root?: string; evaluation?: { evaluationPlan?: string } } }
  guard(e, "admit-target", record.candidate_id ?? "")
  if (!record.candidate || id(record.candidate) !== record.candidate_id || record.candidate.repo_root !== e.targetRoot ||
    !Array.isArray(record.candidate.entries) || record.candidate.entries.length > e.maxEntries) throw Error("maintenance-host-target")
  if (targetPlan.target_generation !== e.targetGeneration || targetPlan.schema !== "genesis-evaluation-rebuild-plan/v1" ||
    id(targetPlan) !== record.candidate.evaluation?.evaluationPlan) throw Error("maintenance-host-generation")
  // Native port enforces actual store, generation, lineage, approval and policy. Never initializes or grants them here.
  return admitEvaluationRebuildTarget(e.targetRoot, prepared, approvalPath)
}
