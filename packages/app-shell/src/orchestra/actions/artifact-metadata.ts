import type { Actions } from "@orchestra/schema/actions"

export function artifactMetadata(resource: Actions.Resource) {
  const data = record(resource.data)
  const runID = canonicalID(record(data.workflow_run).id) ?? canonicalID(record(data.pipeline).id) ?? canonicalID(resource.scope)
  const sizeBytes = count(data.size_in_bytes) ?? count(record(data.artifacts_file).size)
  const nativeExpiresAt = timestamp(data.expires_at)
  const expiresAt = nativeExpiresAt === undefined ? timestamp(data.artifacts_expire_at) : nativeExpiresAt
  const status = typeof resource.status === "string" ? resource.status.toLowerCase() : undefined
  const expired = status === "expired" || data.expired === true
  const erased = status === "erased" || (typeof data.erased_at === "string" && data.erased_at.length > 0)
  return {
    ...(runID === undefined ? {} : { runID }),
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    available: status === "available" && !expired && !erased,
    expired, erased,
  }
}

function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {} }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function canonicalID(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
  // `$` also matches before a final newline; require the entire native ID.
  return typeof value === "string" && /^[1-9]\d{0,127}$/.exec(value)?.[0] === value ? value : undefined
}
function count(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined }
function timestamp(value: unknown) { return typeof value === "string" || value === null ? value : undefined }
