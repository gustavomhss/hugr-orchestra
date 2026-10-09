export * as LeanMetrics from "./lean-metrics"

/** Local numeric provenance for one actually selected standard tool result. No command/output payload. */
export interface Decision {
  readonly version: 1
  readonly scope: "standard-registry"
  readonly owner: { readonly projectID: string; readonly location: string; readonly sessionID: string; readonly callID: string }
  readonly orchestraProfile?: string
  readonly model: { readonly provider: string; readonly id: string }
  readonly engine: "hugr-lean@0.2.0:4e46ae0534937bdf"
  readonly producer: "native-shell" | "unverified"
  readonly eligible: boolean
  readonly status: "applied" | "normalized" | "passthrough"
  readonly reason: string
  readonly filterProfile?: string
  readonly bytes: { readonly before: number; readonly after: number; readonly saved: number }
  readonly tokens:
    | { readonly kind: "estimated"; readonly counter: "chars-per-token-4"; readonly before: number; readonly after: number; readonly saved: number }
    | { readonly kind: "unavailable" }
  readonly durationMs: number
}

export interface Group {
  readonly calls: number
  readonly bytesSaved: number
  readonly estimatedTokensSaved: number
  readonly estimatedTokenCalls: number
}

export interface Summary {
  readonly coverage: "loaded-history" | "complete-history"
  readonly observedCalls: number
  readonly eligibleCalls: number
  readonly appliedCalls: number
  readonly bytesSaved: number
  readonly estimatedTokensSaved: number
  readonly estimatedTokenCalls: number
  readonly reasons: Readonly<Record<string, number>>
  readonly filterProfiles: Readonly<Record<string, Group>>
  readonly orchestraProfiles: Readonly<Record<string, Group>>
  readonly models: Readonly<Record<string, Group>>
  readonly latency: { readonly samples: number; readonly p50: number | null; readonly p95: number | null; readonly p99: number | null }
}

/** Frozen decoder signature; metrics author fills validation with the actual persisted record contract. */
export const decode: (value: unknown) => Decision | undefined = (value) => {
  try {
    const root = record(value, ["version", "scope", "owner", "orchestraProfile", "model", "engine", "producer",
      "eligible", "status", "reason", "filterProfile", "bytes", "tokens", "durationMs"])
    if (!root || root.version !== 1 || root.scope !== "standard-registry" || root.engine !== "hugr-lean@0.2.0:4e46ae0534937bdf"
      || (root.producer !== "native-shell" && root.producer !== "unverified") || typeof root.eligible !== "boolean"
      || (root.status !== "applied" && root.status !== "normalized" && root.status !== "passthrough")
      || !text(root.reason) || typeof root.durationMs !== "number" || !Number.isFinite(root.durationMs) || root.durationMs < 0
      || (root.orchestraProfile !== undefined && !text(root.orchestraProfile))
      || (root.filterProfile !== undefined && !text(root.filterProfile))) return undefined
    const owner = record(root.owner, ["projectID", "location", "sessionID", "callID"])
    const model = record(root.model, ["provider", "id"])
    const bytes = counts(root.bytes)
    const token = record(root.tokens, ["kind", "counter", "before", "after", "saved"])
    if (!owner || !text(owner.projectID) || !text(owner.location, 4096) || !text(owner.sessionID) || !text(owner.callID)
      || !model || !text(model.provider) || !text(model.id) || !bytes || !token) return undefined
    const tokens: Decision["tokens"] | undefined = token.kind === "unavailable" && Object.keys(token).length === 1
      ? Object.freeze({ kind: "unavailable" })
      : token.kind === "estimated" && token.counter === "chars-per-token-4"
        ? estimated(token) : undefined
    if (!tokens) return undefined
    if (root.status === "passthrough") {
      if (bytes.saved !== 0 || (tokens.kind === "estimated" && tokens.saved !== 0)) return undefined
    } else if (!root.eligible || root.producer !== "native-shell" || bytes.saved <= 0) return undefined
    return Object.freeze({
      version: 1, scope: "standard-registry", engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
      owner: Object.freeze({ projectID: owner.projectID, location: owner.location, sessionID: owner.sessionID, callID: owner.callID }),
      model: Object.freeze({ provider: model.provider, id: model.id }),
      ...(root.orchestraProfile === undefined ? {} : { orchestraProfile: root.orchestraProfile }),
      ...(root.filterProfile === undefined ? {} : { filterProfile: root.filterProfile }),
      producer: root.producer, eligible: root.eligible, status: root.status, reason: root.reason,
      bytes, tokens, durationMs: root.durationMs,
    })
  } catch {
    return undefined
  }
}

// Snapshot only own whitelisted fields, once. Never retain caller-owned objects or accessors.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const own = Reflect.ownKeys(value)
  if (own.some((key) => typeof key !== "string" || !keys.includes(key))) return undefined
  return Object.fromEntries(own.map((key) => [key, Reflect.get(value, key)]))
}

function text(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
}

function counts(value: unknown): Decision["bytes"] | undefined {
  const part = record(value, ["before", "after", "saved"])
  if (!part || typeof part.before !== "number" || typeof part.after !== "number" || typeof part.saved !== "number"
    || !Number.isSafeInteger(part.before) || part.before < 0 || !Number.isSafeInteger(part.after) || part.after < 0
    || !Number.isSafeInteger(part.saved) || part.saved !== part.before - part.after) return undefined
  return Object.freeze({ before: part.before, after: part.after, saved: part.saved })
}

function estimated(token: Record<string, unknown>): Decision["tokens"] | undefined {
  const part = counts({ before: token.before, after: token.after, saved: token.saved })
  return part ? Object.freeze({ kind: "estimated", counter: "chars-per-token-4", ...part }) : undefined
}
