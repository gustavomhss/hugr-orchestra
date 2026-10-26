export * as MaestroResultTools from "./result"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { MaestroToolGate } from "./gate"

export const name = "maestro_record_result_decision"

const Input = Schema.Struct({
  parentSessionID: Schema.String.check(Schema.isPattern(/^ses_/)),
  messageID: Schema.String.check(Schema.isPattern(/^msg_/)),
  partID: Schema.String.check(Schema.isPattern(/^prt_/)),
  decision: MaestroEvent.WorkResult.Decided.data.fields.decision,
  reason: Schema.optional(Schema.String),
})

/**
 * The earlier runtime decides a backend WorkResult stored on the Task's tool part. V2 Task settlement carries the WorkResult in the
 * Task's structured result, but that result has no tool-part identity and no decision record, so nothing here decides it.
 */
export function tools(input: { readonly gate: MaestroToolGate.Gate }) {
  return {
    [name]: Tool.make({
      description:
        "Record acceptance or rejection of a stored final backend Task WorkResult. Native root Maestro only. Accepting host-failed or host-incomplete requires a nonblank override reason. Background running results cannot be decided; target an actual durable final Task result when available.",
      input: Input,
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "WorkResult decision requires Maestro")
          .pipe(
            Effect.andThen(
              Effect.fail(
                MaestroToolGate.hold(
                  "work-result-unavailable",
                  "A V2 Task result carries its backend WorkResult but has no tool-part identity to record a decision on. Report the Task's result to the owner instead of recording a decision.",
                ),
              ),
            ),
          ),
    }),
  }
}
