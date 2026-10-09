export * as LeanMetrics from "./lean-metrics"

/** Local numeric provenance for one actually selected standard tool result. No command/output payload. */
export interface Decision {
  readonly version: 1
  readonly scope: "standard-registry"
  readonly owner: { readonly location: string; readonly sessionID: string; readonly callID: string }
  readonly model: { readonly provider: string; readonly id: string }
  readonly engine: "hugr-lean@0.2.0:4e46ae0534937bdf"
  readonly producer: "native-shell" | "unverified"
  readonly eligible: boolean
  readonly status: "applied" | "normalized" | "passthrough"
  readonly reason: string
  readonly profile?: string
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
  readonly profiles: Readonly<Record<string, Group>>
  readonly models: Readonly<Record<string, Group>>
  readonly latency: { readonly samples: number; readonly p50: number | null; readonly p95: number | null; readonly p99: number | null }
}

/** Frozen decoder signature; metrics author fills validation with the actual persisted record contract. */
export const decode: (value: unknown) => Decision | undefined = () => undefined
