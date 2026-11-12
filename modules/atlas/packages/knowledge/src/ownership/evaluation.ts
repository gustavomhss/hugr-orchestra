import type { Hash } from "@atlas/contracts"
import type { OwnershipEvaluationAuthority, OwnershipEvaluationContext, OwnershipEvaluationLabel } from "./types.js"

export const OWNERSHIP_ADMISSION_CRITERIA = [
  "ADMIT-EXACT-TRANSFORM", "ADMIT-SOURCE-BINDINGS", "ADMIT-SEMANTIC-SCOPE", "ADMIT-ISOLATED-PLAN",
] as const

const hash = (value: unknown): value is Hash => typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
const keys = (value: unknown, expected: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key))

export function isOwnershipEvaluationAuthority(value: unknown): value is OwnershipEvaluationAuthority {
  return keys(value, ["phase", "evaluationPlan", "obligationSet"]) && value.phase === "evaluation" &&
    hash(value.evaluationPlan) && hash(value.obligationSet)
}

export function isOwnershipEvaluationContext(value: unknown): value is OwnershipEvaluationContext {
  return keys(value, ["evaluation", "evaluationCandidate", "generation"]) &&
    isOwnershipEvaluationAuthority(value.evaluation) && hash(value.evaluationCandidate) && hash(value.generation)
}

export function sameOwnershipEvaluation(a: OwnershipEvaluationAuthority, b: OwnershipEvaluationAuthority): boolean {
  return a.phase === b.phase && a.evaluationPlan === b.evaluationPlan && a.obligationSet === b.obligationSet
}

export function ownershipEvaluationLabel(context: OwnershipEvaluationContext, manifest: Hash): OwnershipEvaluationLabel {
  return { ...context.evaluation, evaluationCandidate: context.evaluationCandidate, generation: context.generation, manifest }
}
