export * as ActivityMonitor from "./activity-monitor"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt, optional } from "./schema"

export const Member = Schema.Struct({
  pid: PositiveInt,
  parentPid: Schema.NullOr(PositiveInt),
  name: Schema.NullOr(Schema.String),
}).annotate({ identifier: "ActivityMonitor.Member" })
export interface Member extends Schema.Schema.Type<typeof Member> {}

export const Record = Schema.Struct({
  // A monitor record is not a supervisor address and never authorizes an action.
  recordID: Schema.String,
  supervisorID: optional(Schema.NonEmptyString),
  pid: PositiveInt,
  executable: Schema.String,
  owner: Schema.String,
  sessionID: optional(Schema.String),
  agentID: optional(Schema.String),
  tool: optional(Schema.String),
  callID: optional(Schema.String),
  startedAt: NonNegativeInt,
  state: Schema.Literals(["alive", "gone", "unknown"]),
  inspectionFailed: Schema.Boolean,
  source: optional(Schema.Literal("omni.processes")),
  sampledAt: optional(NonNegativeInt),
  members: optional(Schema.Array(Member)),
}).annotate({ identifier: "ActivityMonitor.Record" })
export interface Record extends Schema.Schema.Type<typeof Record> {}

export const CPU = Schema.Struct({
  source: Schema.Literal("node.os.cpus"),
  percent: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  windowMs: PositiveInt,
  sampledAt: NonNegativeInt,
}).annotate({ identifier: "ActivityMonitor.CPU" })
export interface CPU extends Schema.Schema.Type<typeof CPU> {}

export const Snapshot = Schema.Struct({
  instanceID: Schema.NonEmptyString,
  readAt: NonNegativeInt,
  cpu: optional(CPU),
  source: Schema.Literal("orchestra.omni.ledger"),
  // Coverage is explicit: this is not a machine-wide inventory or the native RSS sampler.
  coverage: Schema.Literal("server-pipe-spawns"),
  retired: NonNegativeInt,
  records: Schema.Array(Record),
}).annotate({ identifier: "ActivityMonitor.Snapshot" })
export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}

export const DiskRootID = Schema.Literals(["cache", "logs", "temporary"])
export type DiskRootID = typeof DiskRootID.Type

export const DiskIssue = Schema.Struct({
  path: Schema.String,
  reason: Schema.Literals(["unavailable", "symlink", "unsupported", "changed", "limit", "overflow"]),
}).annotate({ identifier: "ActivityMonitor.DiskIssue" })
export interface DiskIssue extends Schema.Schema.Type<typeof DiskIssue> {}

export const DiskAttempt = Schema.Struct({
  startedAt: NonNegativeInt,
  sampledAt: NonNegativeInt,
  state: Schema.Literals(["complete", "partial"]),
  observedBytes: NonNegativeInt,
  entries: NonNegativeInt,
  issueCount: NonNegativeInt,
  issues: Schema.Array(DiskIssue),
}).annotate({ identifier: "ActivityMonitor.DiskAttempt" })
export interface DiskAttempt extends Schema.Schema.Type<typeof DiskAttempt> {}

export const DiskRoot = Schema.Struct({
  id: DiskRootID,
  path: Schema.String,
  attempt: optional(DiskAttempt),
  // Only a closed walk replaces this reading; partial retries retain its original timestamp.
  logical: optional(Schema.Struct({ bytes: NonNegativeInt, sampledAt: NonNegativeInt })),
}).annotate({ identifier: "ActivityMonitor.DiskRoot" })
export interface DiskRoot extends Schema.Schema.Type<typeof DiskRoot> {}

export const DiskSnapshot = Schema.Struct({
  instanceID: Schema.NonEmptyString,
  readAt: NonNegativeInt,
  source: Schema.Literal("node.fs.lstat"),
  roots: Schema.Array(DiskRoot),
}).annotate({ identifier: "ActivityMonitor.DiskSnapshot" })
export interface DiskSnapshot extends Schema.Schema.Type<typeof DiskSnapshot> {}
