import { createHash } from "node:crypto"
import type { CompleteArtifact, MemoryChecklist } from "./memory-types"

export function sealChecklist(artifact: CompleteArtifact, critical: readonly string[]): MemoryChecklist {
  const check = { version: 1 as const, critical: [...new Set(critical)].sort() }
  return { ...check, digest: digest(artifact, check) }
}

/** Structural receipt integrity only; a digest cannot prove semantic accuracy. */
export function validChecklist(artifact: CompleteArtifact) {
  const check = artifact.checklist
  if (check === undefined) return true
  if (!check || typeof check !== "object" || Array.isArray(check) || artifact.review !== undefined) return false
  return check.version === 1 && Array.isArray(check.critical) && new Set(check.critical).size === check.critical.length &&
    check.critical.every((id) => typeof id === "string" && /^m[1-9][0-9]*$/.test(id) && artifact.items.some((item) => item.id === id)) &&
    typeof check.digest === "string" && check.digest === digest(artifact, check)
}

function digest(artifact: CompleteArtifact, check: Omit<MemoryChecklist, "digest">) {
  return createHash("sha256").update(JSON.stringify({ artifact: {
    version: artifact.version, parentID: artifact.parentID, producerID: artifact.producerID, boundary: artifact.boundary,
    coveredThrough: artifact.coveredThrough, items: artifact.items, next: artifact.next, text: artifact.text,
    now: artifact.now, covered: artifact.covered,
  }, checklist: { version: check.version, critical: check.critical } }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value)).digest("hex")
}
