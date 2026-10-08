export * as RelayHook from "./relay-hook"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { NonNegativeInt, optional } from "./schema"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"
import { RelayLedger } from "./relay-ledger"
import { Hex64, NonEmptyNulFree } from "./relay-sprint"

// `relay.hook.v1`: the published hook export (relay_authoring/hooks.py `compile_hook`) and the installs that pin it.
// Both are strict: an unknown key is an error, so a crafted export cannot smuggle fields past install.
const strict = { parseOptions: { onExcessProperty: "error" } } as const

const NulFree = Schema.String.check(Schema.isPattern(/^[^\u0000]*$/))

/**
 * What a trigger fires on. Tool operations fire inside `ToolSafety.run`, `before` after native safety passes and
 * `after` once a successful effect settled: `read`, `edit`, `write` and `command` as in the Python export, and `tool`
 * for any tool. The session events of the former Orchestra Hooks page are additive: `session-start` (after),
 * `prompt` (before; "Before prompt") and `session-idle` (after; "On session stop").
 */
export const ToolOperation = Schema.Literals(["read", "edit", "write", "command", "tool"])
export type ToolOperation = typeof ToolOperation.Type
export const Timing = Schema.Literals(["before", "after"])
export type Timing = typeof Timing.Type

export const TriggerParameters = Schema.Union([
  Schema.Struct({ operation: ToolOperation, timing: Timing }).annotate(strict),
  Schema.Struct({ operation: Schema.Literal("session-start"), timing: Schema.Literal("after") }).annotate(strict),
  Schema.Struct({ operation: Schema.Literal("prompt"), timing: Schema.Literal("before") }).annotate(strict),
  Schema.Struct({ operation: Schema.Literal("session-idle"), timing: Schema.Literal("after") }).annotate(strict),
]).annotate({ identifier: "RelayHook.TriggerParameters" })
export type TriggerParameters = typeof TriggerParameters.Type
export type Operation = TriggerParameters["operation"]

// `event` matches `<operation>.<timing>`; `path` is project-relative and canonical; `tool` is the tool ID.
export const ConditionParameters = Schema.Struct({
  field: Schema.Literals(["path", "tool", "command", "event"]),
  pattern: NonEmptyNulFree,
}).annotate({ identifier: "RelayHook.ConditionParameters", ...strict })
export interface ConditionParameters extends Schema.Schema.Type<typeof ConditionParameters> {}

export const MessageParameters = Schema.Struct({ message: NonEmptyNulFree }).annotate({
  identifier: "RelayHook.MessageParameters",
  ...strict,
})
export interface MessageParameters extends Schema.Schema.Type<typeof MessageParameters> {}

export const VerifyParameters = Schema.Struct({ message: NonEmptyNulFree, check: NonEmptyNulFree }).annotate({
  identifier: "RelayHook.VerifyParameters",
  ...strict,
})
export interface VerifyParameters extends Schema.Schema.Type<typeof VerifyParameters> {}

// Allow's note is optional, so its message may be empty.
export const AllowParameters = Schema.Struct({ message: NulFree }).annotate({
  identifier: "RelayHook.AllowParameters",
  ...strict,
})
export interface AllowParameters extends Schema.Schema.Type<typeof AllowParameters> {}

export const NodeType = {
  trigger: "relay.hookEventTrigger",
  condition: "relay.hookCondition",
  remind: "relay.hookRemind",
  block: "relay.hookBlock",
  approve: "relay.hookApprove",
  verify: "relay.hookVerify",
  repair: "relay.hookRepair",
  record: "relay.hookRecord",
  allow: "relay.hookAllow",
} as const
export type NodeType = (typeof NodeType)[keyof typeof NodeType]

/**
 * Output ports by node type; a connection's `port` indexes this list. Condition: 0 = Yes, 1 = No. Verify ("Run gate"):
 * 0 = Pass, 1 = Fail. Port 0 is the single output a Verify had before the Pass/Fail split, so older hooks keep their
 * meaning, and an unconnected Fail keeps the default verify failure. Block has no outputs. Block and Approve need a
 * `before` trigger.
 */
export const Outputs = {
  [NodeType.trigger]: ["main"],
  [NodeType.condition]: ["Yes", "No"],
  [NodeType.remind]: ["main"],
  [NodeType.block]: [],
  [NodeType.approve]: ["main"],
  [NodeType.verify]: ["Pass", "Fail"],
  [NodeType.repair]: ["main"],
  [NodeType.record]: ["main"],
  [NodeType.allow]: ["main"],
} as const satisfies Record<NodeType, ReadonlyArray<string>>

const node = <const Type extends NodeType, Parameters extends Schema.Top>(type: Type, parameters: Parameters) =>
  Schema.Struct({
    id: NonEmptyNulFree,
    name: NonEmptyNulFree,
    type: Schema.Literal(type),
    position: Schema.Tuple([Schema.Finite, Schema.Finite]),
    parameters,
    typeVersion: Schema.optionalKey(Schema.Number),
  }).annotate(strict)

export const Node = Schema.Union([
  node(NodeType.trigger, TriggerParameters),
  node(NodeType.condition, ConditionParameters),
  node(NodeType.remind, MessageParameters),
  node(NodeType.block, MessageParameters),
  node(NodeType.approve, MessageParameters),
  node(NodeType.verify, VerifyParameters),
  node(NodeType.repair, MessageParameters),
  node(NodeType.record, MessageParameters),
  node(NodeType.allow, AllowParameters),
]).annotate({ identifier: "RelayHook.Node" })
export type Node = typeof Node.Type

// Connections reference node IDs, not names.
export const Connection = Schema.Struct({
  from: NonEmptyNulFree,
  port: NonNegativeInt,
  to: NonEmptyNulFree,
}).annotate({ identifier: "RelayHook.Connection", ...strict })
export interface Connection extends Schema.Schema.Type<typeof Connection> {}

/**
 * The export. Structure only: the graph rules (one trigger, every node reachable, acyclic, ports in range, Block and
 * Approve only `before`) are `compile_hook`'s and the install writer's, with their own refusal messages.
 * `installed: false` is never install state; Orchestra's install record is.
 */
export const V1 = Schema.Struct({
  schema: Schema.Literal("relay.hook.v1"),
  name: NonEmptyNulFree,
  nodes: Schema.Array(Node),
  connections: Schema.Array(Connection),
  binding: Schema.Literal("host-required"),
  installed: Schema.Literal(false),
}).annotate({ identifier: "RelayHook.V1", ...strict })
export type V1 = typeof V1.Type

/**
 * One pinned install in `<Global.data>/<projectID>/profile/hooks.json`. `sha256` = sha256(json.compact(snapshot)).
 * `version` is the document versionId; `installedBy` the principal; `installedAt` epoch milliseconds.
 */
export const Install = Schema.Struct({
  installID: NonEmptyNulFree,
  document: Schema.String,
  version: Schema.String,
  sha256: Hex64,
  order: NonNegativeInt,
  enabled: Schema.Boolean,
  installedBy: Schema.String,
  installedAt: NonNegativeInt,
  snapshot: V1,
}).annotate({ identifier: "RelayHook.Install", ...strict })
export type Install = typeof Install.Type

export const Installs = Schema.Struct({ installs: Schema.Array(Install) }).annotate({
  identifier: "RelayHook.Installs",
  ...strict,
})
export type Installs = typeof Installs.Type

/**
 * The durable decision of one matched hook action, written before any receipt. `trigger` is `<operation>.<timing>`.
 * `subject` is the path or sha256(command). `tool` and `callID` are absent for session triggers. `replier` is the
 * principal that answered an Approve.
 */
export const Decided = define({
  type: "relay.hook.decided",
  durable: { version: 1, aggregate: "sessionID" },
  schema: {
    decisionID: Schema.String,
    installID: Schema.String,
    version: Schema.String,
    sha256: Hex64,
    nodeID: Schema.String,
    action: RelayLedger.HookAction,
    trigger: Schema.String,
    tool: optional(Schema.String),
    sessionID: SessionID,
    callID: optional(Schema.String),
    assistantMessageID: optional(SessionMessage.ID),
    agent: optional(Schema.String),
    subject: Schema.String,
    outcome: RelayLedger.HookOutcome,
    replier: optional(Schema.String),
    durationMs: NonNegativeInt,
  },
})
export type Decided = typeof Decided.Type

export const Definitions = inventory(Decided)
