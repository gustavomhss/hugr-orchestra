export * as MaestroPlanningTools from "./planning"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { Database } from "@orchestra/core/database/database"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { MaestroAdmissionTools } from "./admission"
import { MaestroToolGate } from "./gate"

export const names = {
  catalog: "maestro_catalog_context",
  plan: "maestro_record_plan_revision",
  context: "maestro_record_context",
} as const

const Field = MaestroEvent.PlanRevision.RecordedV3.data.fields.goal
const PlanInput = Schema.Struct({
  admissionMessageID: Schema.String,
  methodVersion: Schema.String,
  goal: Field,
  acceptance: Schema.Array(Field),
  scope: Schema.Array(Field),
  units: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  constraints: Schema.Array(Field),
  reviewRequirement: Field,
  assumptions: Schema.Array(Field),
  risks: Schema.Array(Field),
  upstream: Schema.optional(
    Schema.Struct({
      parentMessageID: UpstreamAttribution.V1.fields.parentMessageID,
      parentCallID: UpstreamAttribution.V1.fields.parentCallID,
      authorSessionID: UpstreamAttribution.V1.fields.authorSessionID,
      authorMessageID: UpstreamAttribution.V1.fields.authorMessageID,
      logicalTaskID: UpstreamAttribution.V1.fields.logicalTaskID,
      dispatchKind: Schema.optional(Schema.Literals(["orchestra-task", "claude-code-agent"])),
    }),
  ),
  workflow: Schema.optional(
    Schema.Struct({
      documentID: Schema.NonEmptyString,
      parameters: Schema.Record(Schema.String, Schema.String),
      writePaths: Schema.Array(Schema.NonEmptyString),
    }),
  ).annotate({
    description:
      "A published Relay workflow this plan runs: its id from `maestro_workflows` as `documentID`, its `parameters`, and the `writePaths` the workflow Task will pass, in the same order.",
  }),
})

/**
 * The planning steps read the Atlas source, which V2 cannot read yet (see `MaestroToolGate.atlasHold`). The plan step
 * still checks what it can check without it first, so a model that skipped admission learns that before the hold.
 */
export function tools(input: {
  readonly db: Database.Interface["db"]
  readonly projectID: string
  readonly gate: MaestroToolGate.Gate
}) {
  return {
    [names.catalog]: Tool.make({
      description:
        "Read verified project-bound Atlas territory names and static Own availability. Maestro only. No scope inference or runtime retrieval. Tier is criticality: T0 (must be right) and T1 (load-bearing) are ratified and binding; T2 is the unratified default and only advisory.",
      input: Schema.Struct({}),
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Atlas context catalog requires Maestro")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.atlasHold(input.projectID)))),
    }),
    [names.plan]: Tool.make({
      description:
        "Persist one immutable grounded PlanRevision using exact catalog territory names in scope and verified Own unit IDs in units. Maestro only. With upstream, call it in the Session that dispatched the archie Task: that calling Session is recorded as the dispatch parent.",
      input: PlanInput,
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Plan revision requires Maestro")
          if (params.workflow && !params.upstream)
            return yield* held(
              "UPSTREAM_ATTRIBUTION_MISSING",
              "A workflow plan is authored upstream: dispatch archie with task for the plan, then record this revision in this Session with upstream naming that Task.",
            )
          // V1 resolves the publication through its native workflow host; V2 has none bound.
          if (params.workflow) return yield* held("WORKFLOW_NATIVE_HOST_UNBOUND")
          const admission = yield* MaestroAdmissionTools.read(input.db, {
            sessionID: context.sessionID,
            messageID: params.admissionMessageID,
            methodVersion: MaestroAdmissionTools.methodVersion,
          })
          if (admission?.outcome !== "READY_TO_DRAFT")
            return yield* new Tool.Failure({
              message: `MaestroPlanRevisionConflict: admission message ${params.admissionMessageID} has no READY_TO_DRAFT admission recorded under admit-request-v1 in this Session. Plan only from the admission message ID of a READY_TO_DRAFT maestro_record_admission result with methodVersion "admit-request-v1".`,
            })
          const fields = [
            params.goal,
            params.reviewRequirement,
            ...params.acceptance,
            ...params.scope,
            ...params.constraints,
            ...params.assumptions,
            ...params.risks,
          ]
          if (!params.upstream && fields.some((field) => field.source === "upstream"))
            return yield* held("UPSTREAM_ATTRIBUTION_MISSING")
          return yield* MaestroToolGate.atlasHold(input.projectID)
        }),
    }),
    [names.context]: Tool.make({
      description:
        "Load exact verified static Own skills and record GROUNDED context bound to one current PlanRevision and clean Git worktree. Maestro only.",
      input: Schema.Struct({ planRevisionID: Schema.String }),
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Context recording requires Maestro")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.atlasHold(input.projectID)))),
    }),
  }
}

function held(reason: string, detail?: string) {
  const error = new RelayWorkflowBinding.Held({ reason, ...(detail === undefined ? {} : { detail }) })
  return new Tool.Failure({ message: error.message, metadata: { status: "HOLD", reason } })
}
