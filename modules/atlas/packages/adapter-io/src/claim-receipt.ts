// Receipt provenance is read-only until the ordinary governed door settles each claim.
import { asHash, id } from "@atlas/kernel"
import type { Candidate, CurrentNode, GroundedFact, StoreProjection, WriteRequest } from "@atlas/knowledge"
import { DegenerateAnchorError } from "@atlas/knowledge"
import { addressOf } from "./governed-emit-address.js"
import { claimNormOf, familyOf, isCheck, resolveWriteIdentity } from "./governed-emit-identity.js"
import type { DiskStore } from "./store.js"

export type ClaimReceipt = NonNullable<WriteRequest["claimEvidenceByClaim"]>[string]
export interface GovernedEmitOptions {
  readonly replace?: true
  readonly claimReceipt?: ClaimReceipt
}
export const REJECTED_CLAIM_RECEIPT =
  "invalid claim receipt: every claim requires its own matching CAS fact, place and optional answer"
export const REJECTED_CANDIDATE_UNREADABLE =
  "candidate bytes absent from CAS — the staged row names a contentHash the store cannot return, so there is no fact to promote"
export const REJECTED_QUARANTINED =
  "quarantined: admitted only because a sound proof abstained (could not prove the claim, did not refute it) — a quarantined candidate stays staged and is never promoted"

/** Payload carriers are never authority, including on the promoted leg and specialized family doors. */
export function stripClaimReceipt(node: GroundedFact): GroundedFact {
  const { claimReceipt: _receipt, claimEvidenceByClaim: _evidence, ...clean } = node as GroundedFact & {
    readonly claimReceipt?: unknown
    readonly claimEvidenceByClaim?: unknown
  }
  return clean
}

/** Intrinsic claim algebra only. Other families retain their existing, independently governed doors. */
function intrinsicIdentity(fact: GroundedFact) {
  const family = familyOf(fact)
  if (family !== "advisory" && family !== "predicate") return undefined
  if (family === "advisory" &&
    (fact.kind !== "advisory" || typeof fact.claimNorm !== "string" || !fact.claimNorm.trim())) return undefined
  if (family === "predicate" && !isCheck((fact as { check?: unknown }).check)) return undefined
  const view = { ...fact, slot: (fact as { predicateSlot?: unknown }).predicateSlot } as unknown as Candidate
  return { claimNorm: claimNormOf(fact, family), nodeKey: resolveWriteIdentity(fact, view).targetKey }
}

type ReadReceipt =
  | { readonly fact: GroundedFact; readonly receipt: ClaimReceipt }
  | { readonly rejected: string }

/** Both preflight and emit use actual CAS reads, the sealed hash, and the door's slot-mapped identity. */
function readClaimReceipt(
  store: DiskStore,
  raw: unknown,
  expected: { readonly claimNorm: string; readonly nodeKey: string; readonly contentHash?: string },
): ReadReceipt {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  const input = raw as { readonly factRef?: unknown; readonly answerRef?: unknown }
  const factRef = Object.hasOwn(input, "factRef") ? input.factRef : undefined
  const hasAnswerRef = Object.hasOwn(input, "answerRef")
  const answerRef = hasAnswerRef ? input.answerRef : undefined
  if (typeof factRef !== "string" || !/^[0-9a-f]{64}$/.test(factRef)) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  const fetched = store.get(asHash(factRef))
  if (fetched === undefined) return { rejected: REJECTED_CANDIDATE_UNREADABLE }
  if (typeof fetched !== "object" || fetched === null || Array.isArray(fetched)) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  const fact = stripClaimReceipt(fetched as GroundedFact)
  const addressed = addressOf(fact)
  if (
    addressed.rejected !== undefined || String(addressed.hash) !== factRef ||
    (expected.contentHash !== undefined && expected.contentHash !== factRef)
  ) return { rejected: REJECTED_CLAIM_RECEIPT }
  // Quarantined staging keys may deliberately differ from intrinsic keys. Refuse the mark before
  // requiring intrinsic identity, retaining the established whole-place refusal for those rows too.
  if (fact.kind === "advisory" && fact.quarantine !== undefined) return { rejected: REJECTED_QUARANTINED }
  const identity = intrinsicIdentity(fact)
  if (identity === undefined || identity.claimNorm !== expected.claimNorm || identity.nodeKey !== expected.nodeKey) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  if (!hasAnswerRef) return { fact, receipt: { factRef } }
  if (typeof answerRef !== "string" || !/^[0-9a-f]{64}$/.test(answerRef)) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  const answer = store.get(asHash(answerRef))
  if (typeof answer !== "string" || String(id(answer)) !== answerRef) return { rejected: REJECTED_CLAIM_RECEIPT }
  return { fact, receipt: { factRef, answerRef } }
}

/** Trusted context must describe THIS snapshot, not merely a sibling with the same prose. */
export function emissionClaimReceipt(store: DiskStore, node: GroundedFact, contentHash: string, raw: unknown): ReadReceipt {
  try {
    const identity = intrinsicIdentity(node)
    return identity === undefined
      ? { rejected: REJECTED_CLAIM_RECEIPT }
      : readClaimReceipt(store, raw, { ...identity, contentHash })
  } catch (error) {
    if (!(error instanceof DegenerateAnchorError) &&
      (error as { name?: unknown } | null)?.name !== "DegenerateAnchorError") throw error
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
}

type PreparedClaims =
  | { readonly claims: readonly { readonly fact: GroundedFact; readonly receipt?: ClaimReceipt }[] }
  | { readonly rejected: string }

/** No emit, truth gate, CAS put or projection write may run before this WHOLE place is prepared. */
export function prepareClaimReceipts(store: DiskStore, row: CurrentNode): PreparedClaims {
  if (!Array.isArray(row.claims)) return { rejected: REJECTED_CLAIM_RECEIPT }
  // Non-intrinsic families have their own claim algebra/grounding. Never invent an intrinsic receipt for
  // them, or fan out a legacy row from only its representative. Empty legacy negation rows remain valid.
  if (row.family !== "advisory" && row.family !== "predicate") {
    if (row.claims.length > 1) return { rejected: REJECTED_CLAIM_RECEIPT }
    const fetched = store.get(asHash(row.contentHash))
    if (fetched === undefined) return { rejected: REJECTED_CANDIDATE_UNREADABLE }
    if (typeof fetched !== "object" || fetched === null || Array.isArray(fetched)) return { rejected: REJECTED_CLAIM_RECEIPT }
    const fact = fetched as GroundedFact
    if (fact.kind !== row.family) return { rejected: REJECTED_CLAIM_RECEIPT }
    return { claims: [{ fact }] }
  }
  if (row.claims.length === 0 || new Set(row.claims).size !== row.claims.length) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  const evidence: unknown = row.claimEvidenceByClaim
  if (evidence === undefined && row.claims.length !== 1) return { rejected: REJECTED_CLAIM_RECEIPT }
  if (evidence !== undefined && (typeof evidence !== "object" || evidence === null || Array.isArray(evidence))) {
    return { rejected: REJECTED_CLAIM_RECEIPT }
  }
  const claims: { fact: GroundedFact; receipt: ClaimReceipt }[] = []
  for (const claimNorm of row.claims) {
    if (typeof claimNorm !== "string" || !claimNorm.trim()) return { rejected: REJECTED_CLAIM_RECEIPT }
    if (evidence !== undefined && !Object.hasOwn(evidence, claimNorm)) return { rejected: REJECTED_CLAIM_RECEIPT }
    const receipt = evidence === undefined
      ? { factRef: row.contentHash, ...(row.answerRef !== undefined ? { answerRef: row.answerRef } : {}) }
      : (evidence as Readonly<Record<string, unknown>>)[claimNorm]
    const prepared = readClaimReceipt(store, receipt, { claimNorm, nodeKey: row.nodeKey })
    if ("rejected" in prepared) return prepared
    claims.push(prepared)
  }
  return { claims }
}

/** The reducer's DEDUP is intentionally inert. After the gates, migrate a surviving legacy claim's
 * missing receipt too, without changing its content pointer, CAS membership, governance or claim set. */
export function retainClaimReceipt(projection: StoreProjection, req: WriteRequest): StoreProjection {
  const receipt = req.claimEvidenceByClaim?.[req.claimNorm]
  const row = projection.current.get(req.nodeKey)
  if (receipt === undefined || row === undefined || !row.claims.includes(req.claimNorm)) return projection
  const prior = row.claimEvidenceByClaim
  if (prior !== undefined && Object.hasOwn(prior, req.claimNorm) &&
    prior[req.claimNorm]?.factRef === receipt.factRef && prior[req.claimNorm]?.answerRef === receipt.answerRef) return projection
  const entries = row.claims.flatMap((claim) => {
    const priorReceipt = prior !== undefined && Object.hasOwn(prior, claim) ? prior[claim] : undefined
    const nextReceipt = claim === req.claimNorm ? receipt : priorReceipt
    return nextReceipt === undefined ? [] : [[claim, nextReceipt] as const]
  })
  return {
    ...projection,
    current: new Map([...projection.current, [req.nodeKey, { ...row, claimEvidenceByClaim: Object.fromEntries(entries) }]]),
  }
}
