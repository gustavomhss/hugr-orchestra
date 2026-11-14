export * as ModelExecution from "./model-execution"

import { Schema } from "effect"
import { Model } from "./model"
import { Session } from "./session"
import { optional } from "./schema"

export const Reason = Schema.Literals([
  "model-missing",
  "model-disabled",
  "connection-unavailable",
  "model-denied",
  "unsupported-api",
  "invalid-options",
  "variant-unavailable",
  "host-unregistered",
  "host-unavailable",
  "host-model-unsupported",
  "host-options-unsupported",
]).annotate({ identifier: "ModelExecution.Reason" })
export type Reason = typeof Reason.Type

const Ready = Schema.Struct({ status: Schema.Literal("ready") })
const NonReady = Schema.Struct({ status: Schema.Literals(["unsupported", "unavailable"]), reason: Reason })
export const Decision = Schema.Union([Ready, NonReady]).annotate({ identifier: "ModelExecution.Decision" })
export type Decision = typeof Decision.Type

export const Input = Schema.Struct({
  context: Schema.Union([
    Schema.Struct({ type: Schema.Literal("session"), sessionID: Session.ID, agentID: Schema.String.pipe(optional) }),
    Schema.Struct({
      type: Schema.Literal("draft"),
      agentID: Schema.String.pipe(optional),
      parentID: Session.ID.pipe(optional),
    }),
  ]),
  model: Model.Ref.pipe(optional),
}).annotate({ identifier: "ModelExecution.Input" })
export interface Input extends Schema.Schema.Type<typeof Input> {}

export const Entry = Schema.Union([
  Schema.Struct({ ...Ready.fields, model: Model.Info, engine: Schema.String }),
  Schema.Struct({ ...NonReady.fields, model: Model.Info, engine: Schema.String }),
]).annotate({ identifier: "ModelExecution.Entry" })
export type Entry = typeof Entry.Type

export const Selection = Schema.Union([
  Schema.Struct({ ...Ready.fields, ref: Model.Ref, engine: Schema.String }),
  Schema.Struct({ ...NonReady.fields, ref: Model.Ref, engine: Schema.String }),
]).annotate({ identifier: "ModelExecution.Selection" })
export type Selection = typeof Selection.Type

export const Response = Schema.Struct({ models: Schema.Array(Entry), selection: Selection.pipe(optional) }).annotate({
  identifier: "ModelExecution.Response",
})
export interface Response extends Schema.Schema.Type<typeof Response> {}
