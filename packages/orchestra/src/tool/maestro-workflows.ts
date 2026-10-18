import { Effect, Schema } from "effect"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { ProjectID } from "@orchestra/schema/project-id"
import { Agent } from "@/agent/agent"
import { WorkflowBinding } from "@/maestro/workflow-binding"
import { Session } from "@/session/session"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  workflow: Schema.optional(Schema.String).annotate({
    description: "A workflow id, or its exact name, to resolve. Omit it to list every workflow Maestro can run.",
  }),
})

const ACCEPTANCE = `Its last step lacks the ${WorkflowBinding.GLOBAL_ACCEPTANCE.join(" and ")} host checks a workflow Task requires (WORKFLOW_GLOBAL_ACCEPTANCE_MISSING).`

export const MaestroWorkflowsTool = Tool.define(
  "maestro_workflows",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    return {
      description:
        "List the published Relay workflows Maestro can run in this project: id, name, description and published version. With `workflow`, resolve one by id or exact name; a match that cannot run is listed under `unavailable` with the reason to tell the owner. Read-only. Maestro only. Running one is governed work, with its id as `workflow.documentID` in `maestro_record_plan_revision`.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true)
            return yield* Effect.fail(new Error("The workflow catalog requires Maestro"))
          const host = yield* WorkflowBinding.NativeHost
          if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
          const session = yield* sessions.get(ctx.sessionID)
          const port = yield* host.publication({ directory: session.directory, projectID: ProjectID.make(session.projectID) })
          const query = params.workflow?.trim().toLowerCase()
          const listed = (yield* RelayWorkflowBinding.catalog(port))
            .filter((entry) => !query || entry.id.toLowerCase() === query || entry.name.trim().toLowerCase() === query)
            .map((entry) => ({
              workflow: {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                publishedVersionID: entry.publishedVersionID,
              },
              // Admitted is not enough: a workflow Task also holds without the global acceptance checks.
              reason: entry.reason ?? (entry.sprint && WorkflowBinding.accepts(entry.sprint) ? undefined : ACCEPTANCE),
            }))
          const workflows = listed.filter((item) => !item.reason).map((item) => item.workflow)
          const unavailable = listed.flatMap((item) =>
            item.reason ? [{ id: item.workflow.id, name: item.workflow.name, reason: item.reason }] : [],
          )
          return {
            title: query ? `Workflow ${params.workflow}` : `${workflows.length} runnable workflows`,
            metadata: { count: workflows.length, truncated: false },
            output: JSON.stringify({ projectID: session.projectID, workflows, ...(query ? { unavailable } : {}) }),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
