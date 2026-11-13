import { posix } from "node:path"
import { id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { StoreApi } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA, isOwnershipEvaluationContext, isEvaluationOwnershipArtifact, isEvaluationOwnershipContract, isEvaluationOwnershipManifest, isEvaluationOwnershipReceipt, planOwnershipUpdate, readOwnership, ownershipEvaluationLabel, sameOwnershipEvaluation } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext, OwnershipInputObservation, OwnershipRefusal, OwnershipResult } from "@atlas/knowledge"
import type { EvaluationCandidate, PreparedEvaluation } from "./genesis-evaluation.js"
import type { OwnershipRecipe, OwnershipRecipeInput } from "./ownership-rebuild.js"
import { effectiveInputs, inputsChanged, sameObservation } from "./ownership-rebuild.js"
import { validateEvaluationBinding } from "./genesis-evaluation-binding.js"
import type { NativeReference } from "./genesis-native-format.js"
import { nativeSha256 } from "./genesis-native-io.js"
import { evaluationRuntimeIdentity } from "./evaluation-runtime-identity.js"

export interface EvaluationRebuildRequest {
  readonly store: StoreApi
  readonly baseline: PreparedEvaluation
  readonly manifest: Hash
  readonly context: OwnershipEvaluationContext
  readonly targetGeneration: Hash
  /** New isolated materialization root for host admission. Omit only for a private same-root target. */
  readonly targetRepoRoot?: string
  readonly recipes: ReadonlyMap<string, OwnershipRecipe>
  readonly observe: (key: string) => OwnershipInputObservation
  readonly readCapturedBytes: (key: string) => Uint8Array | undefined
  readonly listMembers: (dir: string) => readonly string[]
  /** New, independently supplied semantic evidence for changed results. Missing evidence is HOLD. */
  readonly semanticEvidence: (key: string, result: Hash) => readonly Hash[] | undefined
}

export type PreparedEvaluationUpdate = {
  readonly kind: "prepared-evaluation-update"
  readonly prepared: PreparedEvaluation
  readonly targetGeneration: Hash
  readonly affected: readonly string[]
  readonly calls: readonly string[]
}
export type EvaluationRebuildPreparation = OwnershipRefusal | PreparedEvaluationUpdate | {
  readonly kind: "evaluation-reuse"
  readonly prepared: PreparedEvaluation
  readonly manifest: Hash
  readonly affected: readonly string[]
  readonly calls: readonly string[]
}

type BaselineEntry = { artifact: EvaluationOwnershipArtifact; receipt: EvaluationOwnershipReceipt; result: Pick<OwnershipResult, "authority" | "validity" | "gaps" | "evidence"> }
const captureObservation = (value: OwnershipInputObservation): OwnershipInputObservation =>
  value.kind === "present" ? { kind: "present", version: value.version } : { kind: value.kind }

/** Stage 1: capture/produce a complete private target. Never generates reviews, policy or projection. */
export function prepareEvaluationUpdate(request: EvaluationRebuildRequest): EvaluationRebuildPreparation {
  if (!isOwnershipEvaluationContext(request.context)) return { kind: "hold", reason: "ownership-phase", evidence: ["evaluation-rebuild-context"] }
  try { return prepareCapturedEvaluationUpdate(request) }
  catch (error) {
    return { kind: "hold", reason: "ownership-review", evidence: [error instanceof Error ? error.message : "evaluation-rebuild-invalid-evidence"],
      evaluation: ownershipEvaluationLabel(request.context, request.manifest) }
  }
}

function prepareCapturedEvaluationUpdate(request: EvaluationRebuildRequest): EvaluationRebuildPreparation {
  const refusal = (reason: OwnershipRefusal["reason"], evidence: readonly string[]): OwnershipRefusal => ({
    kind: "hold", reason, evidence, evaluation: ownershipEvaluationLabel(request.context, request.manifest),
  })
  const { store, baseline } = request
  const targetRepoRoot = request.targetRepoRoot ?? baseline.candidate.repo_root
  if (!posix.isAbsolute(targetRepoRoot) || posix.normalize(targetRepoRoot) !== targetRepoRoot)
    return refusal("ownership-phase", ["evaluation-target-root"] )
  if (baseline.schema !== "genesis-native-prepared/v2" || baseline.candidate_id !== id(baseline.candidate) ||
    request.context.evaluationCandidate !== baseline.candidate_id || !sameOwnershipEvaluation(request.context.evaluation, baseline.candidate.evaluation))
    return refusal("ownership-phase", ["evaluation-rebuild-baseline"])
  if (!/^[0-9a-f]{64}$/.test(request.targetGeneration) || request.targetGeneration === request.context.generation)
    return refusal("ownership-phase", ["evaluation-rebuild-target-generation"])
  if (JSON.stringify(baseline.candidate.runtime_identity) !== JSON.stringify(evaluationRuntimeIdentity()))
    return refusal("ownership-phase", ["evaluation-rebuild-runtime-drift"])
  const keys = baseline.candidate.entries.map((entry) => entry.key)
  if (new Set(keys).size !== keys.length || baseline.candidate.required_artifact_keys.length !== keys.length ||
    new Set(baseline.candidate.required_artifact_keys).size !== keys.length || !keys.every((key) => baseline.candidate.required_artifact_keys.includes(key)))
    return refusal("ownership-selection", ["evaluation-baseline-required-coverage"])
  const manifest = store.get(request.manifest)
  if (!isEvaluationOwnershipManifest(manifest) || id(manifest) !== request.manifest || manifest.entries.length !== baseline.candidate.entries.length ||
    JSON.stringify(manifest.roots) !== JSON.stringify(baseline.candidate.roots)) return refusal("ownership-integrity", [request.manifest])
  const captured = new Map<string, OwnershipInputObservation>()
  const observe = (key: string) => {
    const previous = captured.get(key)
    if (previous !== undefined) return previous
    const value = captureObservation(request.observe(key))
    captured.set(key, value)
    return value
  }
  const plan = planOwnershipUpdate(store, request.manifest, baseline.candidate.scope, observe, request.context)
  if (plan.kind === "hold") return plan
  const originals = new Map<string, BaselineEntry>()
  const recipeSpecs: { key: string; input: string; version: string; declared: readonly string[]; mandatory: readonly string[]; required: readonly string[] }[] = []
  for (const entry of baseline.candidate.entries) {
    const selected = manifest.entries.find((item) => item.key === entry.key)
    const artifact = selected === undefined ? undefined : store.get(selected.artifact)
    if (!isEvaluationOwnershipArtifact(artifact) || selected?.artifact !== id(artifact)) return refusal("ownership-integrity", [entry.key])
    for (const key of ["key", "scope", "title", "layer", "need", "result", "navigation"] as const)
      if (JSON.stringify(artifact[key]) !== JSON.stringify(entry.artifact[key])) return refusal("ownership-integrity", [entry.key, key])
    const receipt = store.get(artifact.receipt)
    if (!isEvaluationOwnershipReceipt(receipt) || id(receipt) !== artifact.receipt || receipt.contract !== entry.contract ||
      JSON.stringify(receipt.inputs) !== JSON.stringify(entry.inputs) || JSON.stringify(receipt.dependencies) !== JSON.stringify(entry.dependencies))
      return refusal("ownership-integrity", [entry.key])
    // Reuse the strict reader's result validation instead of asserting an unknown CAS object type.
    const validated = readOwnership(store, request.manifest, { scope: baseline.candidate.scope, key: entry.key, historical: true, maxBytes: Number.MAX_SAFE_INTEGER }, () => undefined, request.context)
    if (validated.kind === "hold") return validated
    if (entry.inputs_id !== id({ inputs: receipt.inputs, dependencies: receipt.dependencies }) ||
      receipt.inputs.some((input) => baseline.candidate.observations.filter((observation) => observation.key === input.key && observation.version === input.version).length !== 1))
      return refusal("ownership-integrity", [entry.key, "input-observation-mapping"])
    originals.set(entry.key, { artifact, receipt, result: validated.knowledge })
    const recipe = request.recipes.get(entry.key)
    if (recipe === undefined || recipe.key !== entry.key) return refusal("ownership-missing", [entry.key, "recipe"])
    if (new Set(recipe.required).size !== recipe.required.length || recipe.required.length !== receipt.dependencies.length ||
      receipt.dependencies.some((dependency) => !recipe.required.includes(dependency.key))) return refusal("ownership-dependency-changed", [entry.key])
    const mandatory = recipe.mandatoryInputs ?? recipe.declaredInputs
    if (new Set(mandatory).size !== mandatory.length || new Set(recipe.declaredInputs).size !== recipe.declaredInputs.length ||
      !mandatory.every((key) => recipe.declaredInputs.includes(key) && receipt.inputs.some((input) => input.key === key)) ||
      !mandatory.includes(recipe.recipeInputKey))
      return refusal("ownership-input-unavailable", [entry.key, "declared-recipe-inputs"])
    for (const input of receipt.inputs) {
      const member = input.key.startsWith("file:") && receipt.inputs.some((item) => item.key.startsWith("members:") && input.key.slice(5).startsWith(`${item.key.slice(8)}/`))
      if (!recipe.declaredInputs.includes(input.key) && !member) return refusal("ownership-input-unavailable", [entry.key, input.key, "undeclared-input"])
    }
    const version = observe(recipe.recipeInputKey)
    if (version.kind !== "present" || version.version !== recipe.recipeVersion) return refusal("ownership-input-changed", [entry.key, "recipe"])
    recipeSpecs.push({ key: entry.key, input: recipe.recipeInputKey, version: recipe.recipeVersion, declared: [...recipe.declaredInputs], mandatory: [...mandatory], required: [...recipe.required] })
  }
  if (request.recipes.size !== originals.size) return refusal("ownership-selection", ["recipe-coverage"])
  const declared = new Set(baseline.candidate.entries.flatMap((entry) => entry.inputs.map((input) => input.key)))
  for (const observation of baseline.candidate.observations) {
    const current = observe(observation.key)
    if (!declared.has(observation.key) && (current.kind !== "present" || current.version !== observation.version))
      return refusal("ownership-input-changed", [observation.key, "outside-rebuild-input-scope"])
  }
  const membership = new Map<string, readonly string[]>()
  for (const { receipt } of originals.values()) for (const input of receipt.inputs) {
    if (!input.key.startsWith("members:")) continue
    const dir = input.key.slice(8)
    if (!membership.has(dir)) membership.set(dir, [...request.listMembers(dir)].sort())
  }
  for (const members of membership.values()) for (const path of members) observe(`file:${path}`)
  for (const { receipt } of originals.values()) for (const input of receipt.inputs) {
    if (!input.key.startsWith("members:")) continue
    const observed = captured.get(input.key)
    if (observed?.kind !== "present" || observed.version !== input.version) continue
    for (const path of membership.get(input.key.slice(8)) ?? []) {
      const key = `file:${path}`
      if (captured.get(key)?.kind !== "absent" && !receipt.inputs.some((entry) => entry.key === key))
        return refusal("ownership-input-changed", [key, "membership-version-did-not-change"])
    }
  }
  const bytes = new Map<string, Uint8Array>()
  for (const [key, value] of captured) if (value.kind === "present" && key.startsWith("file:")) {
    const content = request.readCapturedBytes(key)
    if (content === undefined) return refusal("ownership-input-unavailable", [key, "captured-bytes"])
    bytes.set(key, new Uint8Array(content))
  }
  const stable = () => [...captured].every(([key, value]) => sameObservation(value, request.observe(key))) &&
    [...membership].every(([dir, members]) => JSON.stringify(members) === JSON.stringify([...request.listMembers(dir)].sort()))
  if (!stable()) return refusal("ownership-input-changed", ["evaluation-capture-drift"])
  const results = new Map(baseline.candidate.entries.map((entry) => [entry.key, entry.artifact.result]))
  const outputs = new Map(baseline.candidate.entries.map((entry) => [entry.key, entry]))
  const calls: string[] = []
  for (const key of plan.affected) {
    const original = originals.get(key)!, recipe = request.recipes.get(key)!
    const inputs = effectiveInputs(key, original.receipt, recipe, captured, membership)
    if ("kind" in inputs) return { ...inputs, evaluation: ownershipEvaluationLabel(request.context, request.manifest) }
    for (const input of inputs) if (captured.get(input.key)?.kind !== "present") return refusal("ownership-input-unavailable", [key, input.key])
    const dependencies = recipe.required.map((dependency) => ({ key: dependency, result: results.get(dependency)! }))
    const changed = inputsChanged(original.receipt.inputs, inputs, captured) ||
      dependencies.some((dependency) => original.receipt.dependencies.find((item) => item.key === dependency.key)?.result !== dependency.result)
    if (!changed) continue
    if (!stable()) return refusal("ownership-input-changed", ["evaluation-pre-recipe-drift"])
    const snapshot: OwnershipRecipeInput = { captured: new Map([...captured].map(([input, value]) => [input, captureObservation(value)])),
      bytes: new Map([...bytes].map(([input, value]) => [input, new Uint8Array(value)])),
      lists: new Map([...membership].map(([dir, members]) => [dir, [...members]])), dependencies: new Map(dependencies.map((dependency) => [dependency.key, dependency.result])) }
    const produced = recipe.run(snapshot)
    calls.push(key)
    if (typeof produced.body !== "string" || produced.body.length === 0) return refusal("malformed-ownership", [key, "empty-recipe-body"])
    if (produced.validity === "blocked") return refusal("ownership-blocked", [key, ...(produced.gaps ?? [])])
    if (!stable()) return refusal("ownership-input-changed", ["evaluation-post-recipe-drift"])
    const result: OwnershipResult = { kind: "ownership-result", version: 1,
      body: store.put({ kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(produced.body)) }),
      authority: { scope: original.artifact.scope, basis: produced.authorityBasis ?? original.result.authority.basis }, validity: "supported",
      gaps: [...(produced.gaps ?? original.result.gaps)], evidence: [...(produced.evidence ?? original.result.evidence)] }
    const resultHash = store.put(result), previous = outputs.get(key)!
    const semanticEvidence = resultHash === original.artifact.result ? previous.semanticEvidence : request.semanticEvidence(key, resultHash)
    if (semanticEvidence === undefined || semanticEvidence.length < 2 || new Set(semanticEvidence).size !== semanticEvidence.length ||
      (resultHash !== original.artifact.result && semanticEvidence.filter((hash) => !previous.semanticEvidence.includes(hash)).length < 2) ||
      semanticEvidence.some((hash) => { const value = store.get(hash); return value === undefined || id(value) !== hash }))
      return refusal("ownership-review", [key, "new-semantic-evidence-required"])
    results.set(key, resultHash)
    outputs.set(key, { ...previous, artifact: { ...previous.artifact, result: resultHash }, inputs: [...inputs], dependencies,
      inputs_id: id({ inputs, dependencies }), semanticEvidence: [...semanticEvidence] })
  }
  if (!stable()) return refusal("ownership-input-changed", ["evaluation-final-capture-drift"])
  if (plan.affected.length === 0 && targetRepoRoot === baseline.candidate.repo_root) return { kind: "evaluation-reuse", prepared: baseline, manifest: request.manifest, affected: [], calls: [] }
  const originalPlan = store.get(baseline.candidate.evaluation.evaluationPlan)
  if (!isRecord(originalPlan) || id(originalPlan) !== baseline.candidate.evaluation.evaluationPlan ||
    !["genesis-evaluation-plan/v1", "genesis-evaluation-rebuild-plan/v1"].includes(String(originalPlan.schema)) ||
    !Array.isArray(originalPlan.consumer_ids) || !originalPlan.consumer_ids.every((value) => typeof value === "string" && value.length > 0) ||
    !isRecord(originalPlan.consumer_modes) || !isRecord(originalPlan.read_limits) || !isRecord(originalPlan.maintenance) || !isRecord(originalPlan.isolation) ||
    typeof originalPlan.isolation.original_root !== "string" || originalPlan.isolation.root !== baseline.candidate.repo_root)
    return refusal("ownership-integrity", ["baseline-plan"])
  const originalRoot = originalPlan.isolation.original_root
  if (targetRepoRoot === originalRoot || targetRepoRoot.startsWith(`${originalRoot}/`) || originalRoot.startsWith(`${targetRepoRoot}/`) ||
    (targetRepoRoot !== baseline.candidate.repo_root && (targetRepoRoot.startsWith(`${baseline.candidate.repo_root}/`) || baseline.candidate.repo_root.startsWith(`${targetRepoRoot}/`))))
    return refusal("ownership-phase", ["evaluation-target-root-alias"])
  const targetPlan = { consumer_ids: originalPlan.consumer_ids, consumer_modes: originalPlan.consumer_modes,
    read_limits: originalPlan.read_limits, maintenance: originalPlan.maintenance, isolation: { ...originalPlan.isolation, root: targetRepoRoot }, schema: "genesis-evaluation-rebuild-plan/v1", original_plan: baseline.candidate.evaluation.evaluationPlan,
    baseline_candidate: baseline.candidate_id, baseline_manifest: request.manifest, target_generation: request.targetGeneration,
    recipes: recipeSpecs, affected: plan.affected, calls, observations: [...captured].map(([key, value]) => ({ key, ...value })) }
  const evaluation = { ...baseline.candidate.evaluation, evaluationPlan: store.put(targetPlan) }
  const entries = baseline.candidate.entries.map((previous) => {
    const entry = outputs.get(previous.key)!, contract = store.get(previous.contract)
    if (!isEvaluationOwnershipContract(contract)) throw new Error("evaluation-rebuild-contract")
    const targetContract: EvaluationOwnershipContract = { ...contract, evaluation }
    return { ...entry, contract: store.put(targetContract) }
  })
  const used = new Set(entries.flatMap((entry) => entry.inputs.map((input) => input.key)))
  const observations = [...captured].flatMap(([key, value]) => {
    if (value.kind === "present") return [{ key, version: value.version }]
    if (used.has(key) || value.kind === "unavailable") throw new Error(`evaluation-rebuild-unavailable: ${key}`)
    return []
  }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  const candidate: EvaluationCandidate = { ...baseline.candidate, repo_root: targetRepoRoot, evaluation, entries, observations, runtime_identity: evaluationRuntimeIdentity() }
  const prepared: PreparedEvaluation = { schema: "genesis-native-prepared/v2", candidate_id: store.put(candidate), candidate }
  return { kind: "prepared-evaluation-update", prepared, targetGeneration: request.targetGeneration, affected: plan.affected, calls }
}

/** Stage 2: new exact decisions → private v2 graph. No policy, projection, admission or publication. */
export function finalizeEvaluationUpdate(request: {
  readonly store: StoreApi
  readonly target: PreparedEvaluationUpdate
  readonly binding: unknown
  readonly current: (key: string) => string | undefined
  readonly readReference: (reference: NativeReference) => Uint8Array
}): OwnershipRefusal | { readonly kind: "private-evaluation-candidate"; readonly prepared: PreparedEvaluation; readonly manifest: Hash; readonly context: OwnershipEvaluationContext } {
  const { store, target } = request, prepared = target.prepared
  // Detach the graph from caller-owned aliases before invoking any external callback.
  // The snapshot is the only candidate used to build and return the finalized graph.
  const candidate = deepFreeze(structuredClone(prepared.candidate))
  const finalizedPrepared: PreparedEvaluation = { ...prepared, candidate }
  const context: OwnershipEvaluationContext = { evaluation: candidate.evaluation, evaluationCandidate: prepared.candidate_id, generation: target.targetGeneration }
  // No target manifest exists yet. Label intended context without inventing a manifest identity.
  const refuse = (message: string): OwnershipRefusal & { phase: "evaluation"; evaluationCandidate: Hash; generation: Hash } => ({
    kind: "hold", reason: "ownership-review", evidence: [message], phase: "evaluation", evaluationCandidate: prepared.candidate_id, generation: target.targetGeneration })
  try {
  if (prepared.candidate_id !== id(candidate) || id(store.get(prepared.candidate_id)) !== prepared.candidate_id ||
    JSON.stringify(candidate.runtime_identity) !== JSON.stringify(evaluationRuntimeIdentity())) return refuse("evaluation-target-integrity")
  const plan = store.get(candidate.evaluation.evaluationPlan)
  if (!isRecord(plan) || id(plan) !== candidate.evaluation.evaluationPlan || plan.schema !== "genesis-evaluation-rebuild-plan/v1" || plan.target_generation !== target.targetGeneration)
    return refuse("evaluation-target-plan")
  if (candidate.observations.some((input) => request.current(input.key) !== input.version)) return refuse("evaluation-target-input-drift")
  const binding = validateEvaluationBinding(request.binding, finalizedPrepared)
  const evidence = binding.decisions.map((decision) => [decision.request_ref, decision.response_ref].map((reference) => {
    const bytes = request.readReference(reference)
    if (nativeSha256(bytes) !== reference.sha256) throw new Error("evaluation-rebuild-reference-drift")
    return store.put({ kind: "ownership-body", version: 1, bytes: Array.from(bytes) })
  }))
  // A callback may also reach the CAS object through an external alias. Detect that drift;
  // do not pretend that writes already made to the store were rolled back.
  if (id(store.get(prepared.candidate_id)) !== prepared.candidate_id) return refuse("evaluation-target-integrity-after-callback")
  const entries = candidate.entries.map((entry) => {
    const reviews = binding.decisions.map((decision, index) => {
      const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation: context.evaluation, evaluationCandidate: prepared.candidate_id,
        reviewer: decision.reviewer, contract: entry.contract, inputs: entry.inputs_id, result: entry.artifact.result, criteria: [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass",
        provenance: `New private evaluation-rebuild binding only: ${decision.decision_id}; request/response ${evidence[index]!.join(" ")}` }
      return store.put(review)
    })
    const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation: context.evaluation, evaluationCandidate: prepared.candidate_id,
      contract: entry.contract, inputs: entry.inputs, dependencies: entry.dependencies, reviews }
    const artifact: EvaluationOwnershipArtifact = { ...entry.artifact, version: 2, evaluation: context.evaluation, evaluationCandidate: prepared.candidate_id, receipt: store.put(receipt) }
    return { key: entry.key, artifact: store.put(artifact) }
  })
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2, evaluation: context.evaluation, evaluationCandidate: prepared.candidate_id,
    generation: context.generation, scope: candidate.scope, entries, roots: candidate.roots }
  const manifestHash = store.put(manifest)
  for (const entry of entries) {
    const read = readOwnership(store, manifestHash, { scope: manifest.scope, key: entry.key, maxBytes: Number.MAX_SAFE_INTEGER }, request.current, context)
    if (read.kind === "hold") return read
  }
  if (candidate.observations.some((input) => request.current(input.key) !== input.version)) return refuse("evaluation-final-input-drift")
  if (id(store.get(prepared.candidate_id)) !== prepared.candidate_id) return refuse("evaluation-target-integrity-after-callback")
  return { kind: "private-evaluation-candidate", prepared: finalizedPrepared, manifest: manifestHash, context }
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "evaluation-finalize-invalid-evidence")
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
