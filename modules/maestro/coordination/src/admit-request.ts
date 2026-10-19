import { Schema } from "effect"

const NonBlank = Schema.String.check(Schema.isPattern(/\S/))

export const IntentAssessment = Schema.Struct({
  kind: Schema.Literals(["orient", "work"]),
  goal: Schema.optional(Schema.String),
  known: Schema.Array(Schema.Struct({ text: NonBlank, source: Schema.Literals(["stakeholder", "orientation"]) })),
  proposals: Schema.Array(Schema.Struct({ text: NonBlank, source: Schema.Literal("maestro") })),
  unknowns: Schema.Array(NonBlank),
  uncertainty: NonBlank,
  activeWorkEffect: Schema.Literals(["none", "new-scope-or-revision"]),
  reason: NonBlank,
}).annotate({ description: "admit-request-v1 assessment; admission outcome is computed by runtime policy." })

export type IntentAssessment = Schema.Schema.Type<typeof IntentAssessment>
export type KnownFact = IntentAssessment["known"][number]
export type Proposal = IntentAssessment["proposals"][number]

export type AdmissionDecision =
  | { outcome: "ORIENT"; assessment: IntentAssessment }
  | { outcome: "READY_TO_DRAFT"; assessment: IntentAssessment }
  | {
      outcome: "CLARIFY"
      reason: "invalid-assessment" | "missing-usable-goal" | "material-blocker" | "active-work-conflict"
    }

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export const isIntentAssessment = Schema.is(IntentAssessment)

/** Applies admission policy after frame-request has returned an untrusted assessment. */
export function decideAdmission(input: unknown): AdmissionDecision {
  if (!isIntentAssessment(input)) return { outcome: "CLARIFY", reason: "invalid-assessment" }
  if (input.kind === "orient") return { outcome: "ORIENT", assessment: input }
  if (input.activeWorkEffect !== "none") return { outcome: "CLARIFY", reason: "active-work-conflict" }
  if (!text(input.goal)) return { outcome: "CLARIFY", reason: "missing-usable-goal" }
  if (input.unknowns.length > 0) return { outcome: "CLARIFY", reason: "material-blocker" }
  return { outcome: "READY_TO_DRAFT", assessment: input }
}
