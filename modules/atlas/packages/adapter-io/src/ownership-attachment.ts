import type { Hash } from "@atlas/contracts"
import { id } from "@atlas/kernel"
import { isOwnershipManifest, readOwnership } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { DiskStore } from "./store.js"
import { ownershipClaim } from "./ownership-access.js"

/** Gate EXTENSION: attachment checks only narrow the existing emit path, after its authorization checks. */
export function ownershipAttachmentRefusal(
  node: GroundedFact,
  store: DiskStore,
  current: ((key: string) => string | undefined) | undefined,
): string | undefined {
  if (!Object.hasOwn(node, "ownership")) return undefined
  if (node.kind !== "advisory" || typeof node.ownership !== "string" || !/^[0-9a-f]{64}$/.test(node.ownership))
    return "ownership-malformed-attachment"
  if (node.predicateSlot !== "ownership") return "ownership-attachment-slot"
  if (node.claimNorm !== ownershipClaim(node.scope)) return "ownership-attachment-claim"
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
