export * as MaestroReviewTools from "./review"

import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroToolGate } from "./gate"

export const names = {
  validation: "maestro_record_validation",
  request: "maestro_request_review",
  review: "maestro_record_review",
} as const

const Check = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
  detail: Schema.String,
})

const ValidationInput = Schema.Struct({
  planRevisionID: Schema.NonEmptyString,
  contextRecordID: Schema.NonEmptyString,
  contextHash: Schema.NonEmptyString,
  projectID: Schema.String,
  workCardID: Schema.String,
  workCard: Schema.String,
  routedMemberID: Schema.String,
  validatorVersion: Schema.String,
  checks: Schema.Array(Check).annotate({
    description:
      "Nonempty observed evidence, with unique check IDs ordered lexicographically by ID. Do not claim unobserved checks passed.",
  }),
})

const RequestInput = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  // `plan` (default) reviews before approval; `code` reviews what the workers committed after it.
  stage: Schema.optional(Schema.Literals(["plan", "code"])),
})

const ReviewInput = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
  findings: Schema.Array(Schema.Struct({ path: Schema.String, line: Schema.Number, message: Schema.String })),
  artifact: Schema.Struct({
    baseSHA: Schema.NonEmptyString,
    headSHA: Schema.NonEmptyString,
    worktree: Schema.NonEmptyString,
    changedPaths: Schema.Array(Schema.NonEmptyString),
    sha256: Schema.NonEmptyString,
  }),
  checks: Schema.Array(Check),
  stage: Schema.optional(Schema.Literals(["plan", "code"])),
})

/**
 * Validation, cold-review delegation and the review receipt all bind a validation record to an Atlas-grounded
 * context, which V2 cannot record yet; each refuses after its identity check (see `MaestroToolGate.chainHold`).
 */
export function tools(input: { readonly gate: MaestroToolGate.Gate }) {
  return {
    [names.validation]: Tool.make({
      description: "Record validation evidence for one routed work card. Maestro only.",
      input: ValidationInput,
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Validation recording requires Maestro")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.chainHold("Validation recording")))),
    }),
    [names.request]: Tool.make({
      description:
        'Delegate one read-only cold review to the native cold reviewer (`lucy`). Maestro only. Stage "plan" (default) reviews the plan and its committed spec before approval; stage "code" reviews what the workers committed after it, before the workflow completes.',
      input: RequestInput,
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, AgentV2.defaultID, "Review delegation requires Maestro")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.chainHold("Review delegation")))),
    }),
    [names.review]: Tool.make({
      description: "Record cold review evidence for one validation record. Cold reviewer (`lucy`) only.",
      input: ReviewInput,
      output: Schema.String,
      execute: (_params, context) =>
        input
          .gate(context, "lucy", "Review recording requires the cold reviewer (`lucy`)")
          .pipe(Effect.andThen(Effect.fail(MaestroToolGate.chainHold("Review recording")))),
    }),
  }
}
