import { id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { isEvaluationOwnershipManifest, isEvaluationOwnershipArtifact, isEvaluationOwnershipReceipt } from "@atlas/knowledge"
import type { StoreApi } from "@atlas/kernel"
import type { EvaluationAccess } from "./ownership-evaluation-policy.js"
import { nativeRecord } from "./genesis-native-format.js"
import { evaluationRuntimeIdentity } from "./evaluation-runtime-identity.js"

/** Content-addressed candidate mapping is checked at attach AND current selection, not just import. */
export function evaluationManifestRefusal(store: StoreApi, manifestHash: Hash, access: EvaluationAccess, current: (key: string) => string | undefined): string | undefined {
  try {
    const manifest = store.get(manifestHash)
    if (!isEvaluationOwnershipManifest(manifest) || id(manifest) !== manifestHash) return "evaluation-manifest-integrity"
    const candidate = nativeRecord(store.get(access.context.evaluationCandidate), "evaluation candidate")
    if (id(candidate) !== access.context.evaluationCandidate || candidate.kind !== "genesis-evaluation-candidate" || candidate.version !== 2 || candidate.phase !== "evaluation" || candidate.scope !== access.scope || candidate.repo_root !== access.root || JSON.stringify(candidate.evaluation) !== JSON.stringify(access.context.evaluation)) return "evaluation-candidate-identity"
    if (JSON.stringify(candidate.runtime_identity) !== JSON.stringify(evaluationRuntimeIdentity())) return "evaluation-runtime-drift"
    if (JSON.stringify(candidate.roots) !== JSON.stringify(manifest.roots) || !Array.isArray(candidate.entries) || candidate.entries.length !== manifest.entries.length || !Array.isArray(candidate.observations)) return "evaluation-candidate-coverage"
    for (const raw of candidate.observations) {
      const observation = nativeRecord(raw, "observation")
      if (typeof observation.key !== "string" || current(observation.key) !== observation.version) return "evaluation-input-drift"
    }
    for (const entry of manifest.entries) {
      const expected = candidate.entries.map((x) => nativeRecord(x, "candidate entry")).find((x) => x.key === entry.key)
      if (!expected) return "evaluation-entry-missing"
      const artifact = store.get(entry.artifact), recipe = nativeRecord(expected.artifact, "candidate artifact")
      if (!isEvaluationOwnershipArtifact(artifact) || id(artifact) !== entry.artifact) return "evaluation-artifact-integrity"
      for (const key of ["key", "scope", "title", "layer", "need", "result", "navigation"])
        if (JSON.stringify(artifact[key as keyof typeof artifact]) !== JSON.stringify(recipe[key])) return "evaluation-entry-drift"
      const receipt = store.get(artifact.receipt)
      if (!isEvaluationOwnershipReceipt(receipt) || id(receipt) !== artifact.receipt || receipt.contract !== expected.contract ||
        JSON.stringify(receipt.inputs) !== JSON.stringify(expected.inputs) || JSON.stringify(receipt.dependencies) !== JSON.stringify(expected.dependencies)) return "evaluation-receipt-drift"
    }
    return undefined
  } catch { return "evaluation-binding-unverifiable" }
}
