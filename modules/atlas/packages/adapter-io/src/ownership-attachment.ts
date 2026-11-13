import { readEvaluationAdmission } from "./evaluation-admission-read.js"
import { assertEvaluationComposition } from "./ownership-evaluation-policy.js"
import { evaluationManifestRefusal } from "./evaluation-manifest-binding.js"
import type { Hash } from "@atlas/contracts"
import { id } from "@atlas/kernel"
import { isOwnershipManifest, isEvaluationOwnershipManifest, readOwnership } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { DiskStore } from "./store.js"
import type { EvaluationAccess } from "./ownership-evaluation-policy.js"
import { ownershipClaim, evaluationOwnershipClaim } from "./ownership-access.js"

/** Gate EXTENSION: attachment checks only narrow the existing emit path, after its authorization checks. */
export function ownershipAttachmentRefusal(
  node: GroundedFact,
  store: DiskStore,
  current: ((key: string) => string | undefined) | undefined,
  evaluation?: EvaluationAccess,
): string | undefined {
  if (evaluation !== undefined) {
    try { assertEvaluationComposition(evaluation.root, evaluation); evaluation.assert("admit") } catch { return "evaluation-policy-denied" }
    if (node.kind !== "advisory" || node.predicateSlot !== "ownership" || node.scope !== evaluation.scope ||
      node.claimNorm !== evaluationOwnershipClaim(evaluation.scope, evaluation.context.evaluationCandidate) || typeof node.ownership !== "string" || current === undefined)
      return "evaluation-carrier-refused"
    const manifest = store.get(node.ownership)
    if (!isEvaluationOwnershipManifest(manifest) || id(manifest) !== node.ownership) return "evaluation-manifest-unverifiable"
    const binding = evaluationManifestRefusal(store, node.ownership, evaluation, current)
    if (binding !== undefined) return binding
    // One fresh integral traversal at EACH attachment gate. Never reuse check results in emit.
    try {
      const read = readEvaluationAdmission(store, node.ownership, node.scope, manifest.entries.map((entry) => entry.key), current, evaluation.context)
      if (read.kind === "hold") return `evaluation-attachment: ${read.reason}`
    } catch (error) {
      // Normalize only the helper's documented coverage rejection; preserve unexpected failures.
      if (error instanceof Error && error.message === "evaluation-admission-coverage") return "evaluation-attachment-coverage"
      throw error
    }
    return undefined
  }
  if (node.kind === "advisory" && node.claimNorm.startsWith("Evaluation-only ownership manifest for ")) return "evaluation-operational-attachment-refused"
  if (!Object.hasOwn(node, "ownership")) return undefined
  if (node.kind !== "advisory" || typeof node.ownership !== "string" || !/^[0-9a-f]{64}$/.test(node.ownership))
    return "ownership-malformed-attachment"
  if (node.predicateSlot !== "ownership") return "ownership-attachment-slot"
  if (typeof node.scope !== "string" || node.claimNorm !== ownershipClaim(node.scope)) return "ownership-attachment-claim"
  if (current === undefined) return "ownership-input-unavailable"
  const manifest = store.get(node.ownership)
  if (!isOwnershipManifest(manifest) || id(manifest) !== node.ownership) return "ownership-manifest-unverifiable"
  if (manifest.scope !== node.scope) return "ownership-scope"
  for (const need of Object.keys(manifest.roots)) {
    const result = readOwnership(store, node.ownership as Hash, {
      scope: manifest.scope,
      need: need as keyof typeof manifest.roots,
      maxBytes: Number.MAX_SAFE_INTEGER,
    }, current)
    if (result.kind === "hold") return `${result.reason}: ${result.evidence.join(", ")}`
  }
  return undefined
}
