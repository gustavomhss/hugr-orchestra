export * as GovernanceInputV2 from "./input"

import { Schema } from "effect"
import { Domains } from "@orchestra/core/tool/websearch"
import { Event } from "@orchestra/schema/event"
import { Research } from "@orchestra/schema/research"
import { WriteRootsV2 } from "./write-roots"

// The earlier runtime's Task fields, so a recorded call decodes the same way on both runtimes.

export const fields = {
  governed: Schema.optional(
    Schema.Struct({
      sessionID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      approvalMessageID: Schema.String,
      planRevisionID: Schema.String,
      revisionHash: Schema.String,
      validationRecordID: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
    }),
  ).annotate({ description: `Exact approval binding required only for an explicit governed Task.` }),
  authorizationID: Schema.optional(Schema.String).annotate({
    description: "AuthorizationGranted ID for current team dispatch.",
  }),
  writePaths: WriteRootsV2.Param,
  workflow: Schema.optional(
    Schema.Struct({
      documentID: Schema.NonEmptyString,
      planRevisionID: Event.ID,
      parameters: Schema.Record(Schema.String, Schema.String),
    }),
  ).annotate({
    description:
      "A Relay workflow step this Task runs: the approved plan revision, its published document and exactly its approved parameters. writePaths must equal the approved ones, and the Maestro arms its completion contract first.",
  }),
  memoryUnit: Schema.optional(
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal("task"), id: Schema.NonEmptyString }),
      Schema.Struct({ kind: Schema.Literal("pr"), id: Schema.NonEmptyString }),
    ]),
  ).annotate({
    description: `Native Atlas specialist resume only: the task or PR unit whose latest own Atlas Memory checkpoint the host adds to the resumed Session once. Ignored for unsupported agents.`,
  }),
  effort: Schema.optional(Research.Depth).annotate({
    description: "jimmy only: the research effort tier, fixed for this dispatch. quick (default), focused or deep; each step doubles its provider-call, tool and time allowance. Ignored for other teammates.",
  }),
  allowedDomains: Schema.optional(Domains).annotate({
    description: "jimmy only: lower-case host names its web search may return for this dispatch. Ignored for other teammates.",
  }),
  card: Schema.optional(Schema.String.check(Schema.isPattern(/^[A-Z]{2,6}-[1-9]\d*$/))).annotate({
    description:
      "The board card this teammate builds, as KEY-N. The host links the teammate and its Session on the card and moves it from Backlog or Ready to Building.",
  }),
  background: Schema.optional(Schema.Boolean).annotate({
    description: "Return at once while the teammate works; its result arrives as a new message.",
  }),
}

// Core's own Task fields the governance reads; core decodes and checks them first.
export const Input = Schema.Struct({
  description: Schema.String,
  prompt: Schema.String,
  subagent_type: Schema.String,
  model: Schema.optional(Schema.String),
  task_id: Schema.optional(Schema.String),
  ...fields,
})
export type Input = typeof Input.Type
