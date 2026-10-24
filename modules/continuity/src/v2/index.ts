export * as ContinuityV2 from "./index"

import type { Host } from "@orchestra/core/host"
import { SessionCompaction } from "@orchestra/core/session"
import { ContinuityStrategy } from "./strategy"
import { ContinuityTools } from "./tools"

export { ContinuityStrategy } from "./strategy"
export { ContinuityTools } from "./tools"

/** Context continuity for V2 Locations: masking and background summaries in place of core compaction, plus the
 * `context_recall` and `context_compact` tools. */
export const contribution: Host.Contribution = {
  id: "continuity",
  replacements: [[SessionCompaction.node, ContinuityStrategy.node]],
  locationNodes: [ContinuityTools.toolsNode],
}
