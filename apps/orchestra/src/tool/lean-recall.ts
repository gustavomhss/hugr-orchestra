import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { LeanSummary } from "@orchestra/core/tool/lean-summary"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  id: Schema.String.annotate({ description: "The 32 hex characters from the summary's last line `[full output: lean recall <id>]`" }),
  lines: Schema.optional(Schema.String).annotate({
    description: 'Optional 1-based inclusive line range such as "120-240", "120-" or "120"; omit for the whole output',
  }),
})

/** Returns the complete original of a result Lean summarized in this project, byte for byte (optionally a line range). */
export const LeanRecallTool = Tool.define(
  "lean_recall",
  Effect.succeed({
    description: "Fetch the complete original output of a tool call that Lean summarized. Pass the id from its last line `[full output: lean recall <id>]`. Optionally pass lines as a 1-based inclusive range like \"120-240\" to fetch only part of it. Originals are kept for 7 days in this project.",
    parameters: Parameters,
    execute: (params: { id: string; lines?: string }) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const id = params.id.trim().replace(/^lean recall\s+/, "")
        if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("id must be the 32 lowercase hex characters from `[full output: lean recall <id>]`")
        const text = yield* Effect.promise(() => LeanSummary.store({ projectID: instance.project.id, directory: instance.directory }).get(id))
        const output = text === undefined
          ? "unavailable: the original expired or was evicted from this project's Lean store"
          : LeanSummary.recallLines(text, params.lines)
        return { title: `lean recall ${id}${params.lines ? ` ${params.lines}` : ""}`, output, metadata: { found: text !== undefined } }
      }),
  }),
)
