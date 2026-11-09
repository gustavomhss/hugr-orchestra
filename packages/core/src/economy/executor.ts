// @orchestra/core — src/economy/executor.ts (G1 / F2)
//
// Scoped physical-attempt guard composing with RequestExecutor.layer. RED BASELINE: typed seam.

export interface PhysicalAttemptContext {
  readonly envelopeId: string
  readonly logicalRequestId: string
  readonly ordinal: number
}

export const makeAdmissionGuard = (_context: PhysicalAttemptContext): unknown => {
  throw new Error("makeAdmissionGuard not implemented (G1 red baseline)")
}

export const guardPhysicalDispatch = (_context: PhysicalAttemptContext): Promise<void> => {
  throw new Error("guardPhysicalDispatch not implemented (G1 red baseline)")
}
