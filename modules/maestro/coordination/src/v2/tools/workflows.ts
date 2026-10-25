export * as MaestroWorkflowTools from "./workflows"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Tool } from "@orchestra/core/tool/tool"
import type { ProjectID } from "@orchestra/schema/project-id"
import { WorkflowRelayV2 } from "../workflow/relay"
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"

export const name = "maestro_workflows"

const ACCEPTANCE = `Its last step lacks the ${WorkflowRelayV2.GLOBAL_ACCEPTANCE.join(" and ")} host checks a workflow Task requires (WORKFLOW_GLOBAL_ACCEPTANCE_MISSING).`

/**
 * V2 port of V1's workflow catalog (`apps/orchestra/src/tool/maestro-workflows.ts`): the published workflows of the
 * calling Session's project, read through its Location's publication port, and why a match cannot run.
 */
export function tools(input: {
  readonly services: MaestroChainTools.Services
  readonly gate: MaestroToolGate.Gate
  readonly publication: (placement: { readonly projectID: ProjectID }) => ReturnType<typeof WorkflowRelayV2.publication>
}) {
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
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "The workflow catalog requires Maestro")
          const session = yield* MaestroChainTools.placement(input.services, context.sessionID)
          const query = params.workflow?.trim().toLowerCase()
          const listed = (yield* RelayWorkflowBinding.catalog(yield* input.publication(session)))
            .filter((entry) => !query || entry.id.toLowerCase() === query || entry.name.trim().toLowerCase() === query)
            .map((entry) => ({
              workflow: {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                publishedVersionID: entry.publishedVersionID,
              },
              // Admitted is not enough: a workflow Task also holds without the global acceptance checks.
              reason:
                entry.reason ??
                (WorkflowRelayV2.GLOBAL_ACCEPTANCE.every((check) =>
                  entry.sprint?.work_packages.at(-1)?.checklist?.some((control) => control.host_check === check),
                )
                  ? undefined
                  : ACCEPTANCE),
            }))
          return JSON.stringify({
            projectID: session.projectID,
            workflows: listed.filter((item) => !item.reason).map((item) => item.workflow),
            ...(query
              ? {
                  unavailable: listed.flatMap((item) =>
                    item.reason ? [{ id: item.workflow.id, name: item.workflow.name, reason: item.reason }] : [],
                  ),
                }
              : {}),
          })
        }).pipe(
          Effect.mapError((error) => {
            if (error instanceof Tool.Failure) return error
            // A store that fails to list is an acquisition hold, as a publication the port cannot open.
            const hold =
              error instanceof RelayWorkflowBinding.Held
                ? error
                : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_ACQUISITION" })
            return new Tool.Failure({ message: hold.message, metadata: { status: "HOLD", reason: hold.reason } })
          }),
        ),
    }),
  }
}
