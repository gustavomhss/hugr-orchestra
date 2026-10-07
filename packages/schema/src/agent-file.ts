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

// The fields an agent markdown file (`.orchestra/agent/<name>.md`) defines; `system` is the body.
// `permission` keeps the file's key order because later entries win.
const fields = {
  description: Schema.String.pipe(optional),
  mode: Schema.Literals(["subagent", "primary", "all"]).pipe(optional),
  model: Schema.String.pipe(optional),
  steps: PositiveInt.pipe(optional),
  system: Schema.String.pipe(optional),
  permission: Schema.Record(Schema.String, Permission).pipe(optional),
  disable: Schema.Boolean.pipe(optional),
}

// Omitted fields are removed from the file, except `permission`: omitted leaves the file's rules as they are.
// `revision` is the value a read returned; a write fails when the file changed since.
export const Input = Schema.Struct({
  ...fields,
  revision: Schema.String.pipe(optional),
}).annotate({ identifier: "AgentFile.Input" })
export interface Input extends Schema.Schema.Type<typeof Input> {}

export const Info = Schema.Struct({
  path: Schema.String,
  exists: Schema.Boolean,
  revision: Schema.String,
  // The file exists but its front matter cannot be parsed; it is not written over.
  invalid: Schema.Boolean.pipe(optional),
  ...fields,
}).annotate({ identifier: "AgentFile.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}
