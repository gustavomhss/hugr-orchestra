import { Effect, Schema } from "effect"
import { SessionContinuity } from "@/continuity/service"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({})

const OUTPUT: Record<SessionContinuity.Compacted, string> = {
  applied: "Working memory updated: the covered history is now summarized and archived; context_recall restores any of it.",
  masked: "Old tool output was replaced by one-line records; context_recall restores any of it.",
  fits: "Nothing new to compact: the working memory already covers the history up to the recent turns.",
  over: "Compaction ran but the context is still large; continue, and compact again after the next milestone.",
  disabled: "Context continuity is disabled for this project.",
}

export const ContextCompactTool = Tool.define(
  "context_compact",
  Effect.gen(function* () {
    const continuity = yield* SessionContinuity.Service
    return {
      description: [
        "Compact your own context now, without waiting for the automatic trigger.",
        "Call it when a milestone is reached and earlier work has become stale: finished subtasks, superseded plans, old",
        "tool output, logs. A maintenance pass on your real context summarizes and organizes the older history into",
        "working memory and archives it; recent turns stay verbatim and context_recall restores anything archived.",
        "It takes no parameters and changes no files.",
      ].join(" "),
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const outcome = yield* continuity.compact({ sessionID: ctx.sessionID, force: true })
          return { title: "Context compaction", output: OUTPUT[outcome], metadata: { outcome, truncated: false } }
        }),
    }
  }),
)
