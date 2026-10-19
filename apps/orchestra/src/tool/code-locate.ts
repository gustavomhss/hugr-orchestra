import path from "path"
import { Context, Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Locate } from "@orchestra/core/research-toolkit/locate"
import { ResearchTools } from "@/research/binding"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"
import DESCRIPTION from "./code-locate.txt"

/**
 * The lexical (L1, `C/research-toolkit/search.ts`) and index (X3, `C/research-toolkit/code-index/query.ts`) sources for
 * one worktree. CodeIndexTools binds them; without that layer search reports index_unavailable and locate has no index
 * (J3.7). Read once, when the tool registry builds the tool.
 */
export const Index = Context.Reference<(worktree: string) => Pick<Locate.Sources, "search" | "query">>("@orchestra/CodeLocate/Index", {
  defaultValue: () => () => ({
    search: () => Effect.fail(new Research.Error({ code: "index_unavailable", message: "Lexical search (ripgrep) is not available" })),
  }),
})

export const CodeLocateTool = Tool.define("code_locate", Effect.gen(function* () {
  const run = yield* ResearchTools.make
  const index = yield* Index
  return {
    description: DESCRIPTION,
    parameters: CodeIndex.LocateInput,
    jsonSchema: ToolJsonSchema.fromSchema(CodeIndex.LocateInput),
    execute: (input: CodeIndex.LocateInput, ctx: Tool.Context) => run(ctx, "code_locate", (binding) => Effect.gen(function* () {
      const capture = yield* ResearchSourceCapture.Current
      if (!capture)
        return yield* new Research.Error({ code: "unsupported", message: "code_locate retains its ranges only inside a research dispatch" })
      const state: { receipt?: Research.SourceReceipt; snapshot?: string } = {}
      const result = yield* Locate.run(input, {
        ...index(binding.worktree),
        read: (file) => {
          const absolute = path.resolve(binding.worktree, file)
          const relative = path.relative(binding.worktree, absolute)
          if (relative.startsWith("..") || path.isAbsolute(relative)) return Effect.succeed(undefined)
          return Effect.promise(() => Bun.file(absolute).text().catch(() => undefined))
        },
        // One snapshot of every range, in original coordinates; the worktree is its origin since ranges span files.
        retain: (snapshot) => capture({ origin: { kind: "file", uri: binding.worktree }, representation: "text",
          mediaType: "text/plain", content: snapshot, complete: true }).pipe(
          Effect.tap((receipt) => Effect.sync(() => { state.receipt = receipt; state.snapshot = snapshot })),
          Effect.map((receipt) => receipt.ref),
        ),
      })
      return {
        title: `${result.ranges.length} located range${result.ranges.length === 1 ? "" : "s"}`,
        // The result on the first line, then the lines of every range from the retained snapshot, so the seat reads and
        // cites what it located without a second read.
        output: [JSON.stringify(result), ...(state.snapshot ? [shown(state.snapshot)] : [])].join("\n\n"),
        metadata: { ...(state.receipt ? { researchSource: state.receipt } : {}), truncated: result.basis.bounds.truncated },
      }
    })).pipe(Effect.orDie),
  }
}))

const RANGE_LINES = 40
const SHOWN_LINES = 320

/** The snapshot's ranges, each cut to its first lines; the cut lines stay in the snapshot and remain citable. */
function shown(snapshot: string) {
  const blocks = snapshot.split("\n\n").slice(1).map((block) => block.split("\n"))
  const budget = { left: SHOWN_LINES }
  return blocks.map(([head, ...rows]) => {
    const keep = rows.slice(0, Math.max(0, Math.min(RANGE_LINES, budget.left)))
    budget.left -= keep.length
    const rest = rows.slice(keep.length)
    return [head, ...keep, ...(rest.length ? [`(${rest.length} more lines held in the snapshot; research_capture the file range to see them)`] : [])].join("\n")
  }).join("\n\n")
}
