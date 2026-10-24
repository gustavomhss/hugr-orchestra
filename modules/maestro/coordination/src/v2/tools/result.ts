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
 * V1 decides a backend WorkResult stored on the Task's V1 tool part. A V2 Task result has no part identity, and V2
 * Task settlement does not store a backend WorkResult yet, so there is nothing durable to decide.
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
                  "V2 Task settlement stores no backend WorkResult to decide yet, and a V2 Task result has no V1 part identity. Report the Task's result to the owner instead of recording a decision.",
                ),
              ),
            ),
          ),
    }),
  }
}
