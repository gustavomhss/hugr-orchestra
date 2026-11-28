export * as LeanRecallTool from "./lean-recall"

import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { Global } from "../global"
import { Location } from "../location"
import { LeanSummary } from "./lean-summary"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "lean_recall"

export const Input = Schema.Struct({
  id: Schema.String.annotate({ description: "The 32 hex characters from the summary's last line `[full output: lean recall <id>]`" }),
  lines: Schema.String.pipe(Schema.optional).annotate({
    description: 'Optional 1-based inclusive line range such as "120-240", "120-" or "120"; omit for the whole output',
  }),
})

export const Output = Schema.Struct({
  found: Schema.Boolean,
  output: Schema.String,
})

export const UNAVAILABLE = "unavailable: the original expired or was evicted from this project's Lean store"

/** Returns the complete original of a result Lean summarized in this project, byte for byte (optionally a line range). */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const location = yield* Location.Service
    const global = yield* Global.Service

    yield* tools
      .register({
        // Whoever can see a Lean summary (shell, read or fetch results) can fetch its original.
        [name]: Tool.withPermission(
          Tool.make({
            description: "Fetch the complete original output of a tool call that Lean summarized. Pass the id from its last line `[full output: lean recall <id>]`. Optionally pass lines as a 1-based inclusive range like \"120-240\" to fetch only part of it. Originals are kept for 7 days in this project.",
            input: Input,
            output: Output,
            toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
            execute: (input) =>
              Effect.gen(function* () {
                const id = input.id.trim().replace(/^lean recall\s+/, "")
                if (!/^[a-f0-9]{32}$/.test(id))
                  return yield* new ToolFailure({ message: "id must be the 32 lowercase hex characters from `[full output: lean recall <id>]`" })
                const text = yield* Effect.tryPromise({
                  try: () => LeanSummary.store({ projectID: location.project.id, directory: location.directory }, global.data).get(id),
                  catch: (error) => new ToolFailure({ message: `Lean store unavailable: ${String(error)}` }),
                })
                if (text === undefined) return { found: false, output: UNAVAILABLE }
                return { found: true, output: LeanSummary.recallLines(text, input.lines) }
              }),
          }),
          ["bash", "read", "webfetch"],
        ),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/lean-recall",
  layer,
  deps: [ToolRegistry.node, Location.node, Global.node],
})
