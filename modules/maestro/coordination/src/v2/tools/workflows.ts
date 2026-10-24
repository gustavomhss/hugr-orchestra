export * as MaestroWorkflowTools from "./workflows"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroToolGate } from "./gate"

export const name = "maestro_workflows"

/**
 * The catalog reads published workflows through the native workflow host's publication port. V1 binds that host;
 * V2 has none, so the tool refuses exactly as V1 does with no host bound.
 */
export function tools(input: { readonly gate: MaestroToolGate.Gate }) {
  return {
    [name]: Tool.make({
      description:
        "List the published Relay workflows Maestro can run in this project: id, name, description and published version. With `workflow`, resolve one by id or exact name; a match that cannot run is listed under `unavailable` with the reason to tell the owner. Read-only. Maestro only. Running one is governed work, with its id as `workflow.documentID` in `maestro_record_plan_revision`. The host arms its Task with the approved plan's own checks: before dispatching it, arm `relay-arm` with only `sessionID` and a `label` naming that Task, without `chain`.",
      input: Schema.Struct({
        workflow: Schema.optional(Schema.String).annotate({
          description: "A workflow id, or its exact name, to resolve. Omit it to list every workflow Maestro can run.",
        }),
      }),
      output: Schema.String,
      execute: (_params, context) =>
        input.gate(context, AgentV2.defaultID, "The workflow catalog requires Maestro").pipe(
          Effect.andThen(
            Effect.fail(
              new Tool.Failure({
                message: new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" }).message,
                metadata: { status: "HOLD", reason: "WORKFLOW_NATIVE_HOST_UNBOUND" },
              }),
            ),
          ),
        ),
    }),
  }
}
