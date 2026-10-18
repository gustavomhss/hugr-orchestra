export * as ActionsReadback from "./readback"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "./contract"
import type { ActionsError } from "./error"

export const observe = Effect.fn("ActionsReadback.observe")(function* (
  reader: ActionsContract.ReadAdapter,
  binding: Actions.Binding,
  intent: Actions.OperationIntent,
  acknowledged?: Actions.OperationAcknowledgement,
): Effect.fn.Return<Actions.OperationObservation, ActionsError> {
  // Unattributed dispatch cannot be recovered by guessing a nearby run.
  if (acknowledged?.unattributed || !acknowledged?.runID) return { state: "pending" }
  const run = yield* reader.run(binding, acknowledged.runID)
  if (intent.expected?.commit && run.commit !== intent.expected.commit) return { state: "pending" }
  if (intent.target.runID && run.id !== intent.target.runID) return { state: "pending" }
  if (intent.kind === "workflow.dispatch") {
    if (intent.target.workflowID && run.workflowID !== intent.target.workflowID) return { state: "pending" }
    if (intent.target.ref && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.ref !== intent.target.ref.replace(/^refs\/heads\//, "")) return { state: "pending" }
    if (intent.target.ref && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.commit.toLowerCase() !== intent.target.ref.toLowerCase()) return { state: "pending" }
    if (run.event !== "workflow_dispatch" && binding.provider.kind === "github") return { state: "pending" }
    return { state: "confirmed", acknowledgement: acknowledged }
  }
  if ((intent.kind === "run.retry" || intent.kind === "run.retryFailed") && acknowledged.attempt !== undefined &&
    run.attempt !== undefined && run.attempt >= acknowledged.attempt)
    return { state: "confirmed", acknowledgement: acknowledged }
  if ((intent.kind === "run.cancel" || intent.kind === "run.forceCancel") &&
    (run.conclusion === "cancelled" || run.status === "canceled"))
    return { state: "confirmed", acknowledgement: acknowledged }
  return { state: "pending" }
})
