export type KnownFact = {
  text: string
  source: "stakeholder" | "orientation"
}

export type Proposal = {
  text: string
  source: "maestro"
}

export type IntentAssessment = {
  kind: "orient" | "work"
  goal?: string
  known: KnownFact[]
  proposals: Proposal[]
  unknowns: string[]
  uncertainty: string
  activeWorkEffect: "none" | "new-scope-or-revision"
  reason: string
}

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

function known(value: unknown): value is KnownFact[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        text(item.text) &&
        (item.source === "stakeholder" || item.source === "orientation"),
    )
  )
}

function proposals(value: unknown): value is Proposal[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "object" && item !== null && text(item.text) && item.source === "maestro")
  )
}

export function isIntentAssessment(value: unknown): value is IntentAssessment {
  if (typeof value !== "object" || value === null) return false
  const item = value as Partial<IntentAssessment>
  return (
    (item.kind === "orient" || item.kind === "work") &&
    (item.goal === undefined || typeof item.goal === "string") &&
    known(item.known) &&
    proposals(item.proposals) &&
    Array.isArray(item.unknowns) &&
    item.unknowns.every(text) &&
    text(item.uncertainty) &&
    (item.activeWorkEffect === "none" || item.activeWorkEffect === "new-scope-or-revision") &&
    text(item.reason)
  )
}

/** Applies admission policy after frame-request has returned an untrusted assessment. */
export function decideAdmission(input: unknown): AdmissionDecision {
  if (!isIntentAssessment(input)) return { outcome: "CLARIFY", reason: "invalid-assessment" }
  if (input.kind === "orient") return { outcome: "ORIENT", assessment: input }
  if (input.activeWorkEffect !== "none") return { outcome: "CLARIFY", reason: "active-work-conflict" }
  if (!text(input.goal)) return { outcome: "CLARIFY", reason: "missing-usable-goal" }
  if (input.unknowns.length > 0) return { outcome: "CLARIFY", reason: "material-blocker" }
  return { outcome: "READY_TO_DRAFT", assessment: input }
}
