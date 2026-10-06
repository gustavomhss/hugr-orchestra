export * as RelayAuthoring from "./relay-authoring"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"
import { Control, Hex64, Sprint } from "./relay-sprint"

// Authoring documents in the relay_authoring shape (graph.py, store.py). A saved document may be an incomplete draft:
// node parameters stay open here and are checked by compile, which records diagnostics instead of refusing a save.
// Stored documents are Relay data, so unknown keys are preserved.
const preserve = { parseOptions: { onExcessProperty: "preserve" } } as const

export const StartType = "relay.startTrigger"
export const StepKind = Schema.Literals(["execute", "gate", "review", "inject", "human"])
export type StepKind = typeof StepKind.Type
export const StepType = Schema.Literals(["relay.execute", "relay.gate", "relay.review", "relay.inject", "relay.human"])
export type StepType = typeof StepType.Type

export const Position = Schema.Tuple([Schema.Finite, Schema.Finite])

export const Node = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  position: Position,
  parameters: Schema.Record(Schema.String, Schema.Unknown),
  typeVersion: Schema.optionalKey(Schema.Number),
}).annotate({ identifier: "RelayAuthoring.Node", ...preserve })
export interface Node extends Schema.Schema.Type<typeof Node> {}

// The start node carries the objective and the per-WP retry budget. It is neither a WP nor a phase member.
export const StartParameters = Schema.Struct({
  relayBrief: Schema.String,
  relayRetryBudget: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
}).annotate({ identifier: "RelayAuthoring.StartParameters", ...preserve })
export interface StartParameters extends Schema.Schema.Type<typeof StartParameters> {}

// A step's parameters after catalog defaults. `checklist` is a JSON string (the editor's field) or a decoded list.
export const StepParameters = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  macro: Schema.optionalKey(Schema.String),
  instructions: Schema.String,
  checklist: Schema.Union([Schema.String, Schema.Array(Control)]),
  skill: Schema.String,
  skillMode: Schema.Literals(["combine", "replace"]),
  text: Schema.optionalKey(Schema.String),
  file: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayAuthoring.StepParameters", ...preserve })
export interface StepParameters extends Schema.Schema.Type<typeof StepParameters> {}

// `index` is the target's input, always 0; the output port is the position of the channel in `main`.
export const Edge = Schema.Struct({
  node: Schema.String,
  type: Schema.Literal("main"),
  index: Schema.Literal(0),
}).annotate({ identifier: "RelayAuthoring.Edge", ...preserve })
export interface Edge extends Schema.Schema.Type<typeof Edge> {}

// Keyed by the source node's name, not its ID.
export const Connections = Schema.Record(
  Schema.String,
  Schema.Struct({ main: Schema.Array(Schema.Array(Edge)) }).annotate(preserve),
).annotate({ identifier: "RelayAuthoring.Connections" })
export type Connections = typeof Connections.Type

// A phase: one contiguous stretch of the chain, compiled to a sprint macro.
export const NodeGroup = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
  nodeIds: Schema.Array(Schema.String),
}).annotate({ identifier: "RelayAuthoring.NodeGroup", ...preserve })
export interface NodeGroup extends Schema.Schema.Type<typeof NodeGroup> {}

// A scope reference: the scope ID, or an object carrying it.
export const Tag = Schema.Union([Schema.String, Schema.Struct({ id: Schema.String }).annotate(preserve)])
export type Tag = typeof Tag.Type

/**
 * Relay metadata. `sprint` retains plan fields the graph does not show (self_check, dod, policy origins, …) so a
 * round trip keeps them; `names` maps node IDs to the names last compiled; `diagnostics` explains why a draft cannot
 * publish or run.
 */
export const RelayMeta = Schema.Struct({
  schema: Schema.optionalKey(Schema.Literal(1)),
  kind: Schema.optionalKey(Schema.Literals(["workflow", "hook"])),
  sprint: Schema.optionalKey(Sprint),
  names: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  diagnostics: Schema.optionalKey(Schema.Array(Schema.String)),
}).annotate({ identifier: "RelayAuthoring.RelayMeta", ...preserve })
export interface RelayMeta extends Schema.Schema.Type<typeof RelayMeta> {}

export const Meta = Schema.Struct({ relay: Schema.optionalKey(RelayMeta) }).annotate({
  identifier: "RelayAuthoring.Meta",
  ...preserve,
})
export interface Meta extends Schema.Schema.Type<typeof Meta> {}

// Timestamps are ISO-8601 UTC with a `Z` suffix; `versionId` is a fresh UUID per save.
export const Document = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
  nodes: Schema.Array(Node),
  connections: Connections,
  nodeGroups: Schema.optionalKey(Schema.Array(NodeGroup)),
  tags: Schema.Array(Tag),
  isArchived: Schema.Boolean,
  active: Schema.Boolean,
  activeVersionId: Schema.NullOr(Schema.String),
  meta: Meta,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  versionId: Schema.String,
  versionCounter: NonNegativeInt,
}).annotate({ identifier: "RelayAuthoring.Document", ...preserve })
export interface Document extends Schema.Schema.Type<typeof Document> {}

// The immutable body stored per save in the `versions` table.
export const Version = Schema.Struct({ ...Document.fields, workflowId: Schema.String }).annotate({
  identifier: "RelayAuthoring.Version",
  ...preserve,
})
export interface Version extends Schema.Schema.Type<typeof Version> {}

export const Scope = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}).annotate({ identifier: "RelayAuthoring.Scope", ...preserve })
export interface Scope extends Schema.Schema.Type<typeof Scope> {}

// A skill resolved into a WP at compile time. Content and sha256 come from Orchestra's skill catalog.
export const SkillBinding = Schema.Struct({
  wp: Schema.String,
  skill: Schema.String,
  sha256: Hex64,
  mode: Schema.Literals(["combine", "replace"]),
  content: Schema.String,
}).annotate({ identifier: "RelayAuthoring.SkillBinding" })
export interface SkillBinding extends Schema.Schema.Type<typeof SkillBinding> {}

// Node catalog entries for authoring clients (`node_types()` in graph.py and hooks.py).
export const ParameterDescriptor = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  type: Schema.String,
  default: Schema.Unknown,
  options: Schema.optionalKey(Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String }))),
  minimum: Schema.optionalKey(Schema.Number),
  maximum: Schema.optionalKey(Schema.Number),
  placeholder: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayAuthoring.ParameterDescriptor" })
export interface ParameterDescriptor extends Schema.Schema.Type<typeof ParameterDescriptor> {}

export const NodeTypeDescriptor = Schema.Struct({
  type: Schema.String,
  label: Schema.String,
  inputs: NonNegativeInt,
  outputs: Schema.Array(Schema.String),
  maximum: Schema.optionalKey(NonNegativeInt),
  parameters: Schema.Array(ParameterDescriptor),
}).annotate({ identifier: "RelayAuthoring.NodeTypeDescriptor" })
export interface NodeTypeDescriptor extends Schema.Schema.Type<typeof NodeTypeDescriptor> {}

// An authoring refusal: the HTTP status, a stable code and the exact message (AuthoringError).
export const Refusal = Schema.Struct({
  status: Schema.Int,
  code: Schema.String,
  message: Schema.String,
}).annotate({ identifier: "RelayAuthoring.Refusal" })
export interface Refusal extends Schema.Schema.Type<typeof Refusal> {}
