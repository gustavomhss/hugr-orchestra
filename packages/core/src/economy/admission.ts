// @orchestra/core — src/economy/admission.ts (G1 / F2)
//
// Physical-attempt admission authority. Contract:
// modules/atlas/docs/design/genesis-g1-contract.md (Astra decision 2026-11-09, snapshot
// 02b732601442b2ae2ec204eb0137a09654f8290b). RED BASELINE: typed seams only; every function
// throws until the green implementation lands.



/** Immutable admission envelope (contract §1.1): one shared balance for every stage. */
export interface EconomyEnvelope {
  readonly envelopeId: string
  readonly authorityId: string
  readonly policyDigest: string
  readonly scope: string
  readonly provider: string
  readonly model: string
  readonly allowedRoutes: readonly string[]
  readonly stages: readonly string[]
  readonly limits: {
    readonly attempts: number
    readonly outputTokens?: number
    readonly inputTokens?: number
    readonly inFlight: number
  }
  readonly retryPolicy: { readonly maxRetries: number; readonly statuses: readonly number[] }
}

/** Logical request identity (host-stable across restarts). */
export interface LogicalRequest {
  readonly logicalRequestId: string
  readonly stage: string
  readonly snapshot: string
}

/** Physical attempt identity (envelope + logical request + ordinal, with predecessor link). */
export interface AttemptId {
  readonly envelopeId: string
  readonly logicalRequestId: string
  readonly ordinal: number
  readonly predecessor?: AttemptId
}

export type EconomyRefusalReason =
  | "balance" | "slot" | "bound" | "capability" | "route" | "policy"
  | "conflict" | "storage" | "usage" | "ambient" | "identity" | "overrun"

export interface EconomyRefusal {
  readonly kind: "economy-refusal"
  readonly reason: EconomyRefusalReason
  readonly evidence: readonly string[]
}

export interface EconomyGrant {
  readonly kind: "economy-grant"
  readonly attempt: AttemptId
  readonly key: string
}

export type AdmissionResult = EconomyGrant | EconomyRefusal

export interface ReserveRequest {
  readonly envelope: EconomyEnvelope
  readonly logical: LogicalRequest
  readonly key: string
  readonly prior?: AttemptId
  readonly route: string
}

export interface Settlement {
  readonly attempt: AttemptId
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
  readonly evidenceDigest: string
  readonly terminal: boolean
}

export const reserveAttempt = (_request: ReserveRequest): Promise<AdmissionResult> => {
  throw new Error("reserveAttempt not implemented (G1 red baseline)")
}

export const settleAttempt = (_settlement: Settlement): Promise<{ kind: "settled" } | EconomyRefusal> => {
  throw new Error("settleAttempt not implemented (G1 red baseline)")
}

export const recoverAttempts = (_envelopeId: string): Promise<readonly AttemptId[]> => {
  throw new Error("recoverAttempts not implemented (G1 red baseline)")
}
