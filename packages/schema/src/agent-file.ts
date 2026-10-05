export * as AgentFile from "./agent-file"

import { Schema } from "effect"
import { optional, PositiveInt } from "./schema"

export const Action = Schema.Literals(["allow", "ask", "deny"]).annotate({ identifier: "AgentFile.Action" })
export type Action = typeof Action.Type

// One action for the whole tool, or a pattern map such as `{ "git *": "allow", "*": "ask" }`.
export const Permission = Schema.Union([Action, Schema.Record(Schema.String, Action)]).annotate({
  identifier: "AgentFile.Permission",
})
export type Permission = typeof Permission.Type

// The fields an agent markdown file (`.opencode/agent/<name>.md`) defines; `system` is the body.
export const Input = Schema.Struct({
  description: Schema.String.pipe(optional),
  mode: Schema.Literals(["subagent", "primary", "all"]).pipe(optional),
  model: Schema.String.pipe(optional),
  steps: PositiveInt.pipe(optional),
  system: Schema.String.pipe(optional),
  permission: Schema.Record(Schema.String, Permission).pipe(optional),
  disable: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "AgentFile.Input" })
export interface Input extends Schema.Schema.Type<typeof Input> {}

export const Info = Schema.Struct({
  path: Schema.String,
  exists: Schema.Boolean,
  ...Input.fields,
}).annotate({ identifier: "AgentFile.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
