import { createHash } from "node:crypto"
import type { CompleteArtifact, MemoryReview } from "./memory-types"

export function seal(artifact: CompleteArtifact, decision: Omit<MemoryReview, "version" | "digest">): MemoryReview {
  const review = { version: 1 as const, state: decision.state, next: decision.next, critical: [...new Set(decision.critical)].sort() }
  return { ...review, digest: digest(artifact, review) }
}

/** Integrity of the review receipt, not independent proof of semantic truth. */
export function validReview(artifact: CompleteArtifact) {
  const review = artifact.review
  if (review === undefined) return true
  if (!review || typeof review !== "object" || Array.isArray(review)) return false
  return review.version === 1 && ["active", "waiting", "closed"].includes(review.state) &&
    ["continue", "verify", "ask-user", "wait-user"].includes(review.next) &&
    (review.state !== "closed" || ["ask-user", "wait-user"].includes(review.next)) &&
    Array.isArray(review.critical) && new Set(review.critical).size === review.critical.length &&
    review.critical.every((id) => /^m[1-9][0-9]*$/.test(id) && artifact.items.some((item) => item.id === id)) &&
    typeof review.digest === "string" && review.digest === digest(artifact, review)
}

function digest(artifact: CompleteArtifact, review: Omit<MemoryReview, "digest">) {
  return createHash("sha256").update(JSON.stringify({ artifact: {
    parentID: artifact.parentID, producerID: artifact.producerID, boundary: artifact.boundary,
    coveredThrough: artifact.coveredThrough, items: artifact.items, next: artifact.next, text: artifact.text,
    now: artifact.now, covered: artifact.covered,
  }, review: { version: review.version, state: review.state, next: review.next, critical: review.critical } }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value)).digest("hex")
}
