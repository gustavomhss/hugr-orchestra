export * as MaestroWorkflowDraftTools from "./workflow-draft"

import { Effect, Schema } from "effect"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringLint } from "@orchestra/relay/authoring/lint"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import type { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Tool } from "@orchestra/core/tool/tool"
import { ProjectID } from "@orchestra/schema/project-id"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"
import { WorkflowRelayV2 } from "../workflow/relay"
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"

export const name = "archie_draft_workflow"

/**
 * Workflow drafting: the upstream seat turns a sprint into an unpublished Relay workflow in the calling Session's
 * project, saved as the editor saves one. Only the owner publishes it, so nothing drafted here can run on its own.
 */
export function tools(input: {
  readonly services: MaestroChainTools.Services
  readonly gate: MaestroToolGate.Gate
  readonly relay: Relay.Interface
  readonly publication: (placement: { readonly projectID: ProjectID }) => ReturnType<typeof WorkflowRelayV2.publication>
}) {
  return {
    [name]: Tool.make({
      description:
        "Save a sprint as an unpublished Relay workflow draft in this project, for the owner to review in Workflows and publish. Lint errors, an invalid graph or a skill the project lacks refuse the draft with the reason; warnings come back with the saved draft. Never publishes or runs it. Archie only. Load the `archie-workflow` skill before writing the sprint.",
      input: Schema.Struct({
        name: Schema.String.annotate({ description: "The workflow's name, as the owner will see it in Workflows." }),
        description: Schema.optional(Schema.String).annotate({
          description: "One or two sentences on what the workflow is for and when to run it.",
        }),
        sprint: Schema.String.annotate({
          description:
            "The sprint as a JSON string: brief, retry_budget, macros and work_packages with their checklists, in the format the `archie-workflow` skill describes. Leave out the package-verification and cold-review host checks: the host attaches them.",
        }),
      }),
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, "archie", "Drafting a workflow requires the upstream seat")
          const session = yield* MaestroChainTools.placement(input.services, context.sessionID)
          // Outside git every folder shares the global project, so a draft there would reach all of them.
          if (session.projectID === ProjectID.global)
            return yield* new Tool.Failure({ message: "Workflows need a git repository; this folder is not one." })
          const sprint = yield* AuthoringGraph.loads(params.sprint)
          const findings = AuthoringLint.lint(sprint)
          const errors = findings.filter((finding) => finding.severity === "error")
          if (errors.length > 0)
            return yield* new Tool.Failure({ message: `The sprint fails its lint: ${JSON.stringify(errors)}` })
          const projected = yield* AuthoringGraph.project(params.name.trim(), sprint as RelaySprint.Sprint)
          const port = yield* input.publication(session)
          yield* AuthoringGraph.compile(projected, port.skills)
          const draft = yield* Effect.scoped(
            Effect.gen(function* () {
              const store = yield* AuthoringStore.open(input.relay.paths.root, session.projectID)
              return yield* store.save({
                body: {
                  ...projected,
                  ...(params.description?.trim() ? { description: params.description.trim() } : {}),
                  meta: { relay: { ...projected.meta.relay, diagnostics: [] } },
                  active: false,
                  activeVersionId: null,
                },
              })
            }),
          ).pipe(
            // The store opens synchronously and dies on a bad database; that is an acquisition hold, not a crash.
            Effect.catchDefect(() => Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_ACQUISITION" }))),
          )
          return JSON.stringify({
            id: draft.id,
            name: draft.name,
            published: false,
            warnings: findings.filter((finding) => finding.severity === "warn"),
          })
        }).pipe(
          Effect.mapError((error) => {
            if (error instanceof Tool.Failure) return error
            if (error instanceof RelayWorkflowBinding.Held)
              return new Tool.Failure({ message: error.message, metadata: { status: "HOLD", reason: error.reason } })
            return new Tool.Failure({ message: error.message })
          }),
        ),
    }),
  }
}
