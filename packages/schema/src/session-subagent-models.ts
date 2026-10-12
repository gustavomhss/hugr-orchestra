export * as SessionSubagentModels from "./session-subagent-models"

import { Schema } from "effect"
import { Model } from "./model"

// The policy constrains delegated provider/model identities, not reasoning variants or the parent's own turns.
export const Policy = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("inherit") }),
  Schema.Struct({ mode: Schema.Literal("allowlist"), models: Schema.Array(Model.Ref) }),
])
  .pipe(Schema.toTaggedUnion("mode"))
  .annotate({ identifier: "Session.SubagentModels.Policy" })
export type Policy = typeof Policy.Type

export const inherit = Policy.make({ mode: "inherit" })
