export * as ConfigContinuity from "./continuity"

import { Schema } from "effect"

export class Info extends Schema.Class<Info>("ConfigV2.Continuity")({
  enabled: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Keep long sessions under the context limit with masking and background summaries (default: true)",
  }),
  trigger: Schema.Finite.pipe(Schema.optional).annotate({
    description: "Fraction of the model context window at which a background summary runs, between 0 and 0.7 (default: 0.4)",
  }),
}) {}
