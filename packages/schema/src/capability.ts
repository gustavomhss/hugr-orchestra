export * as Capability from "./capability"

import { Schema } from "effect"
import { Agent } from "./agent"
import { ascending } from "./identifier"
import { Location } from "./location"
import { Project } from "./project"
import { NonNegativeInt, statics } from "./schema"
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
