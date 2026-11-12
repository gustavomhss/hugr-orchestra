import { isOwnershipEvaluationAuthority, OWNERSHIP_ADMISSION_CRITERIA } from "./evaluation.js"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview } from "./types.js"
import type {
  OwnershipArtifact,
  OwnershipBody,
  OwnershipContract,
  OwnershipInput,
  OwnershipManifest,
  OwnershipNeed,
  OwnershipReceipt,
  OwnershipResult,
  OwnershipReview,
} from "./types.js"

const needs: readonly OwnershipNeed[] = ["entry", "ownership", "maintenance", "operational", "flow", "evidence", "component"]
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.normalize("NFC") === value
const strings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(text)
const distinct = (values: readonly string[]) => new Set(values).size === values.length
const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const keys = (value: unknown, expected: readonly string[]): value is Record<string, unknown> =>
  object(value) && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key))

export function isOwnershipNeed(value: unknown): value is OwnershipNeed {
  return typeof value === "string" && needs.some((need) => need === value)
}

export function isOwnershipBody(value: unknown): value is OwnershipBody {
  return keys(value, ["kind", "version", "bytes"]) && value.kind === "ownership-body" && value.version === 1 &&
    Array.isArray(value.bytes) && value.bytes.length > 0 && value.bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
}

export function isOwnershipResult(value: unknown): value is OwnershipResult {
  return keys(value, ["kind", "version", "body", "authority", "validity", "gaps", "evidence"]) &&
    value.kind === "ownership-result" && value.version === 1 && hash(value.body) &&
    keys(value.authority, ["scope", "basis"]) && text(value.authority.scope) && text(value.authority.basis) &&
    (value.validity === "supported" || value.validity === "blocked") && strings(value.gaps) && strings(value.evidence)
}

export function isOwnershipContract(value: unknown): value is OwnershipContract {
  return keys(value, ["kind", "version", "criteria"]) && value.kind === "ownership-contract" && value.version === 1 &&
    strings(value.criteria) && value.criteria.length > 0 && distinct(value.criteria)
}

export function isOwnershipReview(value: unknown): value is OwnershipReview {
  return keys(value, ["kind", "version", "reviewer", "contract", "inputs", "result", "criteria", "verdict", "provenance"]) &&
    value.kind === "ownership-review" && value.version === 1 && text(value.reviewer) && hash(value.contract) &&
    hash(value.inputs) && hash(value.result) && strings(value.criteria) && value.criteria.length > 0 && distinct(value.criteria) &&
    (value.verdict === "pass" || value.verdict === "hold") && text(value.provenance)
}

export function isOwnershipReceipt(value: unknown): value is OwnershipReceipt {
  if (!keys(value, ["kind", "version", "contract", "inputs", "dependencies", "reviews"]) ||
    value.kind !== "ownership-receipt" || value.version !== 1 || !hash(value.contract) ||
    !Array.isArray(value.inputs) || !value.inputs.every((input): input is OwnershipInput =>
      keys(input, ["key", "version"]) && text(input.key) && text(input.version)) ||
    !distinct(value.inputs.map((input) => input.key)) || !Array.isArray(value.dependencies) ||
    !value.dependencies.every((dependency) => keys(dependency, ["key", "result"]) && text(dependency.key) && hash(dependency.result)) ||
    !Array.isArray(value.reviews) || !value.reviews.every(hash) || value.reviews.length < 2 || !distinct(value.reviews)) return false
  return distinct(value.dependencies.map((dependency) => dependency.key))
}

export function isOwnershipArtifact(value: unknown): value is OwnershipArtifact {
  return keys(value, ["kind", "version", "key", "scope", "title", "layer", "need", "result", "receipt", "navigation"]) &&
    value.kind === "ownership-artifact" && value.version === 1 && text(value.key) && text(value.scope) && text(value.title) &&
    [1, 2, 3, 4].includes(Number(value.layer)) && typeof value.layer === "number" && isOwnershipNeed(value.need) &&
    hash(value.result) && hash(value.receipt) && strings(value.navigation) && distinct(value.navigation)
}

export function isOwnershipManifest(value: unknown): value is OwnershipManifest {
  if (!keys(value, ["kind", "version", "scope", "entries", "roots"]) || value.kind !== "ownership-manifest" ||
    value.version !== 1 || !text(value.scope) || !Array.isArray(value.entries) || value.entries.length === 0 ||
    !value.entries.every((entry) => keys(entry, ["key", "artifact"]) && text(entry.key) && hash(entry.artifact)) ||
    !distinct(value.entries.map((entry) => entry.key)) || !object(value.roots) || Object.keys(value.roots).length === 0) return false
  const entries = value.entries
  return Object.entries(value.roots).every(([need, key]) => isOwnershipNeed(need) && text(key) &&
    entries.some((entry) => entry.key === key))
}

/** Validate the v1 payload with existing exact-key validators, never persist a downgraded copy. */
function evaluationPayload(value: unknown, candidate: boolean, generation = false): Record<string, unknown> | undefined {
  if (!object(value) || value.version !== 2 || !isOwnershipEvaluationAuthority(value.evaluation) ||
    (candidate && !hash(value.evaluationCandidate)) || (generation && !hash(value.generation))) return undefined
  const payload: Record<string, unknown> = { ...value, version: 1 }
  delete payload.evaluation
  if (candidate) delete payload.evaluationCandidate
  if (generation) delete payload.generation
  return payload
}

export function isEvaluationOwnershipContract(value: unknown): value is EvaluationOwnershipContract {
  const payload = evaluationPayload(value, false)
  return isOwnershipContract(payload) && payload.criteria.length === OWNERSHIP_ADMISSION_CRITERIA.length &&
    OWNERSHIP_ADMISSION_CRITERIA.every((criterion) => payload.criteria.includes(criterion))
}

export function isEvaluationOwnershipReview(value: unknown): value is EvaluationOwnershipReview {
  return isOwnershipReview(evaluationPayload(value, true))
}

export function isEvaluationOwnershipReceipt(value: unknown): value is EvaluationOwnershipReceipt {
  const payload = evaluationPayload(value, true)
  return isOwnershipReceipt(payload) && payload.reviews.length === 2
}

export function isEvaluationOwnershipArtifact(value: unknown): value is EvaluationOwnershipArtifact {
  return isOwnershipArtifact(evaluationPayload(value, true))
}

export function isEvaluationOwnershipManifest(value: unknown): value is EvaluationOwnershipManifest {
  return isOwnershipManifest(evaluationPayload(value, true, true))
}
