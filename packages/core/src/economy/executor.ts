// @orchestra/core — src/economy/executor.ts (G1 / F2)
//
// Scoped physical-attempt guard composing with RequestExecutor.layer. GREEN: dispatch is
// authorized only for a durable, unconsumed grant in the host ledger; route/bound/capability
// refusals are typed and happen before any open/send/forward.

import { reserveAttempt } from "./admission.js"
import type { EconomyEnvelope, EconomyGrant, EconomyRefusal, LogicalRequest } from "./admission.js"

export interface PhysicalAttemptContext {
  readonly envelopeId: string
  readonly logicalRequestId: string
  readonly ordinal: number
  readonly key?: string
  readonly route?: string
}

export class EconomyDispatchRefused extends Error {
  readonly refusal: EconomyRefusal
  constructor(refusal: EconomyRefusal) {
    super(`economy admission refused: ${refusal.reason}`)
    this.name = "EconomyDispatchRefused"
    this.refusal = refusal
  }
}

export const makeAdmissionGuard = (_context: PhysicalAttemptContext): { dispatch: <T>(fn: () => Promise<T>) => Promise<T> } => {
  throw new Error("makeAdmissionGuard not implemented (G1 green pending dispatch seam)")
}

export const guardPhysicalDispatch = (_context: PhysicalAttemptContext): Promise<void> => {
  throw new Error("guardPhysicalDispatch not implemented (G1 green pending dispatch seam)")
}

export interface SealedRequest {
  readonly bound: { readonly outputTokens?: number; readonly inputTokens?: number }
  readonly finalBytes: string
  readonly fingerprint: string
  readonly provider: string
  readonly model: string
}

/** Authorized single forward: reserves, then runs `forward` only with a consumable grant. */
export const authorizedForward = async (request: {
  readonly envelope: EconomyEnvelope
  readonly logical: LogicalRequest
  readonly key: string
  readonly route: string
  readonly request?: SealedRequest
  readonly forward: () => Promise<void>
}): Promise<void> => {
  if (request.request !== undefined && (request.request.provider !== request.envelope.provider || request.request.model !== request.envelope.model))
    throw new EconomyDispatchRefused({ kind: "economy-refusal", reason: "identity", evidence: [request.key] })
  const grant: EconomyGrant | EconomyRefusal = await reserveAttempt({ ...request, bound: request.request?.bound })
  if (grant.kind === "economy-refusal") throw new EconomyDispatchRefused(grant)
  if (!grant.consumable) throw new EconomyDispatchRefused({ kind: "economy-refusal", reason: "conflict", evidence: [request.key] })
  await request.forward()
}
