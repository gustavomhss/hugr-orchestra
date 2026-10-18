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
 * one worktree. Integration binds them; until then search reports index_unavailable and locate has no index (J3.7).
 */
export const Index = Context.Reference<(worktree: string) => Pick<Locate.Sources, "search" | "query">>("@orchestra/CodeLocate/Index", {
  defaultValue: () => () => ({
    search: () => Effect.fail(new Research.Error({ code: "index_unavailable", message: "Lexical search (ripgrep) is not available" })),
  }),
})

export const CodeLocateTool = Tool.define("code_locate", Effect.gen(function* () {
  const run = yield* ResearchTools.make
  return {
    description: DESCRIPTION,
    parameters: CodeIndex.LocateInput,
    jsonSchema: ToolJsonSchema.fromSchema(CodeIndex.LocateInput),
    execute: (input: CodeIndex.LocateInput, ctx: Tool.Context) => run(ctx, "code_locate", (binding) => Effect.gen(function* () {
      const capture = yield* ResearchSourceCapture.Current
      if (!capture)
        return yield* new Research.Error({ code: "unsupported", message: "code_locate retains its ranges only inside a research dispatch" })
      const index = yield* Index
      const state: { receipt?: Research.SourceReceipt } = {}
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
          Effect.tap((receipt) => Effect.sync(() => { state.receipt = receipt })),
          Effect.map((receipt) => receipt.ref),
        ),
      })
      return {
        title: `${result.ranges.length} located range${result.ranges.length === 1 ? "" : "s"}`,
        output: JSON.stringify(result),
        metadata: { ...(state.receipt ? { researchSource: state.receipt } : {}), truncated: result.basis.bounds.truncated },
      }
    })).pipe(Effect.orDie),
  }
}))
