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
