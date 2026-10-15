export * as Behavior from "./behavior"

import { Schema } from "effect"

// Lowercase so each behavior can name its own System Context source.
export const ID = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/)).annotate({
  description: "Stable behavior identifier: lowercase letters, digits, dots, underscores and hyphens.",
})

/** One model instruction a client applies to every Session of a project. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  name: Schema.NonEmptyString,
  instructions: Schema.NonEmptyString,
}).annotate({ identifier: "Behavior.Info" })

export interface SetInput extends Schema.Schema.Type<typeof SetInput> {}
export const SetInput = Schema.Struct({
  /** The complete set, in order. An empty list removes every behavior from the project. */
  behaviors: Schema.Array(Info),
}).annotate({ identifier: "Behavior.SetInput" })
