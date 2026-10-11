export * as LeanSummary from "./lean-summary"

import { LeanMetrics } from "./lean-metrics"

export interface Input {
  readonly projectID: string
  readonly orchestraProfile?: string
  readonly sessionID?: string
  readonly location?: string
  readonly coverage: LeanMetrics.Summary["coverage"]
  readonly records: ReadonlyArray<unknown>
}

/** Derived from unique persisted owner identities, never render or replay increments. */
export const summarize: (input: Input) => LeanMetrics.Summary = (input) => {
  if (!scopeText(input.projectID) || (input.orchestraProfile !== undefined && !scopeText(input.orchestraProfile))
    || (input.sessionID !== undefined && !scopeText(input.sessionID))
    || (input.location !== undefined && !scopeText(input.location, 4096))) {
    return { coverage: input.coverage, unavailable: "invalid-scope" }
  }
  const unique = new Map<string, { record: LeanMetrics.Decision; signature: string } | null>()
  for (const value of input.records) {
    const record = LeanMetrics.decode(value)
    if (!record || record.owner.projectID !== input.projectID) continue
    const key = JSON.stringify([record.owner.projectID, record.owner.location, record.owner.sessionID, record.owner.callID])
    const previous = unique.get(key)
    if (previous === null) continue
    const signature = fingerprint(record)
    // Conflicts invalidate the whole identity, including records outside a requested profile.
    if (previous && previous.signature !== signature) unique.set(key, null)
    if (!previous) unique.set(key, { record, signature })
  }
  const total = draft()
  const reasons = new Map<string, number>()
  const filterProfiles = new Map<string, ReturnType<typeof draft>>()
  const orchestraProfiles = new Map<string, ReturnType<typeof draft>>()
  const models = new Map<string, ReturnType<typeof draft>>()
  const durations: number[] = []
  let eligibleCalls = 0
  let appliedCalls = 0
  for (const entry of unique.values()) {
    if (!entry) continue
    const record = entry.record
    if (input.orchestraProfile !== undefined && record.orchestraProfile !== input.orchestraProfile) continue
    if (input.sessionID !== undefined && record.owner.sessionID !== input.sessionID) continue
    if (input.location !== undefined && record.owner.location !== input.location) continue
    accumulate(total, record)
    if (record.eligible) eligibleCalls++
    if (record.status === "applied" || record.status === "normalized") appliedCalls++
    reasons.set(record.reason, (reasons.get(record.reason) ?? 0) + 1)
    if (typeof record.filterProfile === "string") group(filterProfiles, record.filterProfile, record)
    if (typeof record.orchestraProfile === "string") group(orchestraProfiles, record.orchestraProfile, record)
    group(models, JSON.stringify([record.model.provider, record.model.id]), record)
    if (Number.isFinite(record.durationMs)) durations.push(record.durationMs)
  }
  durations.sort((a, b) => a - b)
  const totals = finish(total)
  const filters = groups(filterProfiles)
  const profiles = groups(orchestraProfiles)
  const modelGroups = groups(models)
  if (!totals || !filters || !profiles || !modelGroups) return { coverage: input.coverage, unavailable: "overflow" }
  return {
    coverage: input.coverage, observedCalls: totals.calls, eligibleCalls, appliedCalls,
    bytesSaved: totals.bytesSaved, estimatedTokensSaved: totals.estimatedTokensSaved,
    estimatedTokenCalls: totals.estimatedTokenCalls, reasons: Object.fromEntries(reasons),
    filterProfiles: filters, orchestraProfiles: profiles, models: modelGroups,
    latency: { samples: durations.length, p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95), p99: percentile(durations, 0.99) },
  }
}

function fingerprint(record: LeanMetrics.Decision) {
  // Fixed field order compares decoded evidence, not persisted object property order.
  return JSON.stringify([record.version, record.scope, record.engine, record.producer, record.orchestraProfile,
    record.model.provider, record.model.id, record.eligible, record.status, record.reason, record.filterProfile,
    record.bytes.before, record.bytes.after, record.bytes.saved, record.tokens.kind,
    record.tokens.kind === "estimated"
      ? [record.tokens.counter, record.tokens.before, record.tokens.after, record.tokens.saved] : null,
    record.durationMs])
}

function draft() {
  return { calls: 0, bytesSaved: 0n, estimatedTokensSaved: 0n, estimatedTokenCalls: 0 }
}

function accumulate(total: ReturnType<typeof draft>, record: LeanMetrics.Decision) {
  total.calls++
  total.bytesSaved += BigInt(record.bytes.saved)
  if (record.tokens.kind !== "estimated") return
  total.estimatedTokensSaved += BigInt(record.tokens.saved)
  total.estimatedTokenCalls++
}

function group(map: Map<string, ReturnType<typeof draft>>, key: string, record: LeanMetrics.Decision) {
  const total = map.get(key) ?? draft()
  accumulate(total, record)
  map.set(key, total)
}

function finish(total: ReturnType<typeof draft>): LeanMetrics.Group | undefined {
  const bytesSaved = exact(total.bytesSaved)
  const estimatedTokensSaved = exact(total.estimatedTokensSaved)
  if (bytesSaved === undefined || estimatedTokensSaved === undefined) return undefined
  return { calls: total.calls, bytesSaved, estimatedTokensSaved, estimatedTokenCalls: total.estimatedTokenCalls }
}

function groups(map: Map<string, ReturnType<typeof draft>>) {
  const result = new Map<string, LeanMetrics.Group>()
  for (const [key, total] of map) {
    const value = finish(total)
    if (!value) return undefined
    result.set(key, value)
  }
  return Object.fromEntries(result)
}

function exact(value: bigint) {
  const limit = BigInt(Number.MAX_SAFE_INTEGER)
  if (value > limit || value < -limit) return undefined
  return Number(value)
}

function scopeText(value: unknown, max = 256): value is string {
  // Caller scope follows the persisted decoder's inclusive length and well-formed UTF-16 bounds.
  return typeof value === "string" && value.length > 0 && value.length <= max
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
}

function percentile(sorted: readonly number[], probability: number) {
  return sorted.length === 0 ? null : sorted[Math.ceil(probability * sorted.length) - 1]!
}
