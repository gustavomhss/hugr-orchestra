export * as Capability from "./capability"

import { Effect, Schema, SchemaGetter } from "effect"
import { Agent } from "./agent"
import { ascending } from "./identifier"
import { Location } from "./location"
import { Project } from "./project"
import { NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

function id<const Name extends string>(name: Name, prefix: string) {
  // Unlike $, this end assertion also rejects a trailing newline.
  return Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}[0-9A-Za-z]{26}(?![\\s\\S])`)))
    .annotate({ identifier: name })
    .pipe(
      Schema.brand(name),
      statics((schema) => ({ create: () => schema.make(prefix + ascending()) })),
    )
}

export const ConnectionID = id("Capability.ConnectionID", "cconn_")
export type ConnectionID = typeof ConnectionID.Type
export const TargetID = id("Capability.TargetID", "ctgt_")
export type TargetID = typeof TargetID.Type
export const DescriptorID = id("Capability.DescriptorID", "cdesc_")
export type DescriptorID = typeof DescriptorID.Type
export const ArtifactID = id("Capability.ArtifactID", "cart_")
export type ArtifactID = typeof ArtifactID.Type
export const JobID = id("Capability.JobID", "cjob_")
export type JobID = typeof JobID.Type
export const ScheduleID = id("Capability.ScheduleID", "csched_")
export type ScheduleID = typeof ScheduleID.Type
export const OccurrenceID = id("Capability.OccurrenceID", "cocc_")
export type OccurrenceID = typeof OccurrenceID.Type
export const DeliveryID = id("Capability.DeliveryID", "cdel_")
export type DeliveryID = typeof DeliveryID.Type
export const SecretBindingID = id("Capability.SecretBindingID", "csec_")
export type SecretBindingID = typeof SecretBindingID.Type

// References identify data only; trusted authority bindings belong to Core.
export interface ConnectionRef extends Schema.Schema.Type<typeof ConnectionRef> {}
export const ConnectionRef = Schema.Struct({
  id: ConnectionID,
  provider: Schema.NonEmptyString,
  generation: NonNegativeInt,
}).annotate({ identifier: "Capability.ConnectionRef", parseOptions: { onExcessProperty: "error" } })

export interface TargetRef extends Schema.Schema.Type<typeof TargetRef> {}
export const TargetRef = Schema.Struct({
  id: TargetID,
  connectionID: ConnectionID,
  generation: NonNegativeInt,
  environment: Schema.NonEmptyString,
}).annotate({ identifier: "Capability.TargetRef", parseOptions: { onExcessProperty: "error" } })

export interface DescriptorRef extends Schema.Schema.Type<typeof DescriptorRef> {}
export const DescriptorRef = Schema.Struct({
  id: DescriptorID,
  schemaHash: Schema.String.check(Schema.isPattern(/^[0-9a-fA-F]{64}(?![\s\S])/)),
  catalogGeneration: NonNegativeInt,
  connectionID: ConnectionID,
  targetID: TargetID,
}).annotate({ identifier: "Capability.DescriptorRef", parseOptions: { onExcessProperty: "error" } })

export interface ArtifactRef extends Schema.Schema.Type<typeof ArtifactRef> {}
export const ArtifactRef = Schema.Struct({
  id: ArtifactID,
  revision: NonNegativeInt,
}).annotate({ identifier: "Capability.ArtifactRef", parseOptions: { onExcessProperty: "error" } })

export interface JobRef extends Schema.Schema.Type<typeof JobRef> {}
export const JobRef = Schema.Struct({
  id: JobID,
}).annotate({ identifier: "Capability.JobRef", parseOptions: { onExcessProperty: "error" } })

export interface InvocationRef extends Schema.Schema.Type<typeof InvocationRef> {}
export const InvocationRef = Schema.Struct({
  sessionID: SessionID,
  agentID: Agent.ID,
  assistantMessageID: SessionMessage.ID,
  callID: Schema.NonEmptyString,
}).annotate({ identifier: "Capability.InvocationRef", parseOptions: { onExcessProperty: "error" } })

export interface Owner extends Schema.Schema.Type<typeof Owner> {}
export const Owner = Schema.Struct({
  projectID: Project.ID,
  location: Location.Ref,
  sessionID: SessionID,
  agentID: Agent.ID,
}).annotate({ identifier: "Capability.Owner", parseOptions: { onExcessProperty: "error" } })

export const Readiness = Schema.Literals([
  "disabled",
  "absent",
  "acquiring",
  "installed",
  "authentication-required",
  "ready",
  "failed",
  "unsupported",
]).annotate({ identifier: "Capability.Readiness" })
export type Readiness = typeof Readiness.Type

export const Verification = Schema.Literals(["acknowledged", "observed", "verified"]).annotate({
  identifier: "Capability.Verification",
})
export type Verification = typeof Verification.Type

// Receipt is a stable opaque reference, not a complete execution receipt.
const Outcome = { receipt: Schema.NonEmptyString, summary: Schema.String }

export interface Completed extends Schema.Schema.Type<typeof Completed> {}
export const Completed = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("completed"),
  artifactRefs: Schema.Array(ArtifactRef),
  verification: Verification,
}).annotate({ identifier: "Capability.Result.Completed", parseOptions: { onExcessProperty: "error" } })

export interface Submitted extends Schema.Schema.Type<typeof Submitted> {}
export const Submitted = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("submitted"),
  jobRef: JobRef,
}).annotate({ identifier: "Capability.Result.Submitted", parseOptions: { onExcessProperty: "error" } })

export interface Pending extends Schema.Schema.Type<typeof Pending> {}
export const Pending = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("pending"),
  userActionRef: Schema.NonEmptyString,
}).annotate({ identifier: "Capability.Result.Pending", parseOptions: { onExcessProperty: "error" } })

export interface Partial extends Schema.Schema.Type<typeof Partial> {}
export const Partial = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("partial"),
  completedEffects: Schema.Array(Schema.String),
  unresolvedEffects: Schema.Array(Schema.String),
  artifactRefs: Schema.Array(ArtifactRef),
}).annotate({ identifier: "Capability.Result.Partial", parseOptions: { onExcessProperty: "error" } })

export interface Unknown extends Schema.Schema.Type<typeof Unknown> {}
export const Unknown = Schema.Struct({
  ...Outcome,
  status: Schema.Literal("unknown"),
  reconciliationRef: optional(Schema.NonEmptyString),
}).annotate({ identifier: "Capability.Result.Unknown", parseOptions: { onExcessProperty: "error" } })

export const Result = Schema.Union([Completed, Submitted, Pending, Partial, Unknown]).annotate({
  identifier: "Capability.Result",
  parseOptions: { onExcessProperty: "error" },
})
export type Result = typeof Result.Type

// Closed foundation vocabulary: CONTRACTS C2 failures and C1 invocation binding failures.
export const ErrorCode = Schema.Literals([
  "connection_unavailable",
  "authentication_required",
  "authentication_revoked",
  "target_denied",
  "ambiguous_target",
  "stale_descriptor",
  "unsupported_operation",
  "unsupported_schema",
  "acquisition_failed",
  "quota_exceeded",
  "outcome_unknown",
  "invocation_binding_missing",
  "invocation_binding_mismatch",
]).annotate({ identifier: "Capability.ErrorCode" })
export type ErrorCode = typeof ErrorCode.Type

// At most 4 KiB of serialized UTF-8 JSON. Producers must redact provider detail before projection.
const detailBudget = SchemaGetter.checkEffect<Schema.Json>((value) =>
  Effect.succeed(
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= 4096
      ? undefined
      : "Failure detail must not exceed 4096 UTF-8 JSON bytes",
  ),
)
// A real transformation retains validation through authoritative imported clients.
export const FailureDetail = Schema.Json.pipe(
  Schema.decodeTo(Schema.Json, { decode: detailBudget, encode: detailBudget }),
).annotate({ identifier: "Capability.FailureDetail" })
export type FailureDetail = typeof FailureDetail.Type

export class Failure extends Schema.TaggedErrorClass<Failure>()(
  "Capability.Failure",
  Schema.Struct({
    code: ErrorCode,
    message: Schema.String,
    detail: optional(FailureDetail),
  }).annotate({ parseOptions: { onExcessProperty: "error" } }),
  { identifier: "Capability.Failure", parseOptions: { onExcessProperty: "error" } },
) {}

export const JobKind = Schema.Literals(["provider", "local-process", "worker", "script"]).annotate({
  identifier: "Capability.JobKind",
})
export type JobKind = typeof JobKind.Type

export const JobState = Schema.Literals([
  "intent",
  "submitting",
  "submitted",
  "running",
  "completed",
  "failed",
  "cancel-requested",
  "cancelled",
  "unknown",
  "lost",
]).annotate({ identifier: "Capability.JobState" })
export type JobState = typeof JobState.Type
