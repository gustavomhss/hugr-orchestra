export * as PromptContext from "./prompt-context"

import { Schema } from "effect"

/** Host-owned, ordered rendered reminders. Neutral text, never permission or tool overrides. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  reminders: Schema.Array(Schema.String),
}).annotate({ identifier: "PromptContext.Info" })
