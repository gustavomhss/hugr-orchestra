import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchTools } from "@/research/binding"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"
import { ReadTool } from "./read"
import { WebFetchTool } from "./webfetch"
import { ResearchHistory } from "@/research/history"

export const ResearchCaptureTool = Tool.define("research_capture", Effect.gen(function* () {
  const read = yield* ReadTool.pipe(Effect.flatMap(Tool.init))
  const fetch = yield* WebFetchTool.pipe(Effect.flatMap(Tool.init))
  const run = yield* ResearchTools.make
  const capture = yield* ResearchSourceCapture.make
  const history = yield* ResearchHistory.make
  return {
    parameters: Research.CaptureInput,
    jsonSchema: ToolJsonSchema.fromSchema(Research.CaptureInput),
    description: "Capture permitted file/URL evidence through native read/webfetch, or finite committed Git history (log/show/diff) for one bound worktree file. History accepts full commit hashes, defaults revision to native HEAD, and reports shallow/limited coverage; no commands, branches, process roots or dirty-tree observations are accepted. Preserve observed bytes before conversion and returned representation separately. File selectors use one-based original lines and normal read paging; receipts explicitly mark partial captures. Locators use retained representation from line 1. Use research_view for retained bytes; no owner, digest, body or storage path accepted as authority.",
    execute: (input: Research.CaptureInput, ctx: Tool.Context) => run(ctx, "research_capture", (binding) => {
      if (input.kind === "history") return capture.withCapture(ctx, "research_capture", history(binding, input, ctx), input)
      if (input.kind === "file" && input.end !== undefined && input.end < (input.start ?? 1))
        return Effect.fail(new Research.Error({ code: "reference_invalid", message: "File capture range does not exist" }))
      const acquire = input.kind === "file"
        ? read.execute({ filePath: input.path, offset: input.start ?? 1,
          ...(input.end === undefined ? {} : { limit: input.end - (input.start ?? 1) + 1 }) }, ctx)
        : fetch.execute({ url: input.url, format: input.format }, ctx)
      return capture.withCapture(ctx, "research_capture", acquire.pipe(Effect.flatMap((result) => {
          if (!result.metadata.researchSource)
            return Effect.fail(new Research.Error({ code: "unsupported", message: "Acquisition returned no supported retained source" }))
          return Effect.succeed({ title: "Research source captured", output: JSON.stringify(result.metadata.researchSource),
            metadata: { researchSource: result.metadata.researchSource,
              ...("researchReceived" in result.metadata ? { researchReceived: result.metadata.researchReceived } : {}) } })
        })), input)
    }).pipe(Effect.orDie),
  }
}))
