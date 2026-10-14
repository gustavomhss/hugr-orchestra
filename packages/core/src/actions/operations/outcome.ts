import { Actions } from "@orchestra/schema/actions"
import { Cause, Effect, Option, Schema } from "effect"
import { ActionsError } from "../error"

export const decodeAcknowledgement = Schema.decodeUnknownEffect(Schema.toType(Actions.OperationAcknowledgement), {
  onExcessProperty: "error",
})

export const decodeObservation = Schema.decodeUnknownEffect(Schema.toType(Actions.OperationObservation), {
  onExcessProperty: "error",
})

export function definitive(cause: Cause.Cause<unknown>) {
  if (Cause.hasInterrupts(cause)) return
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure) || !(failure.value instanceof ActionsError)) return
  if (failure.value.disposition === "definitely_unsent" || failure.value.disposition === "definitely_rejected")
    return failure.value
}

export function combine(original?: Actions.OperationAcknowledgement, observed?: Actions.OperationAcknowledgement) {
  if ((["runID", "jobID", "resourceID", "attempt"] as const).some((field) => {
    return original?.[field] !== undefined && observed?.[field] !== undefined && original[field] !== observed[field]
  })) return new ActionsError({ kind: "intent_conflict", message: "Actions observation changed acknowledged native identity" })
  if (!original && !observed) return
  return { ...original, ...Schema.encodeSync(Actions.OperationAcknowledgement)(observed ?? {}) }
}

export function attributed(acknowledgement?: Actions.OperationAcknowledgement) {
  return acknowledgement?.unattributed !== true &&
    !!(acknowledgement?.runID || acknowledgement?.jobID || acknowledgement?.resourceID)
}

export const checkedAcknowledgement = (input: unknown) => decodeAcknowledgement(input).pipe(
  Effect.mapError(() => new ActionsError({ kind: "outcome_unknown", message: "Actions provider acknowledgement is invalid" })),
)

export const checkedObservation = (input: unknown) => decodeObservation(input).pipe(
  Effect.mapError(() => new ActionsError({ kind: "invalid_input", message: "Actions operation observation is invalid" })),
)
