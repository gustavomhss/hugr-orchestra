import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchTools } from "@/research/binding"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"

export const ResearchViewTool = Tool.define("research_view", Effect.gen(function* () {
  const records = yield* ResearchRecords.Service
  const run = yield* ResearchTools.make
  // Match offsets are UTF-16 indexes into the whole retained text, so the pages up to the last match are reassembled.
  const locate = (binding: Research.Binding, ref: Research.SourceRef, found: Extract<ResearchRecords.View, { matches: unknown }>) =>
    Effect.gen(function* () {
      const last = found.matches.at(-1)?.start ?? 0
      const state = { text: "", cursor: undefined as string | undefined, receipt: undefined as Research.SourceReceipt | undefined }
      do {
        const next = yield* records.view(binding, { action: "source", ref, ...(state.cursor ? { cursor: state.cursor } : {}) })
        if (!("receipt" in next) || !("origin" in next.receipt)) return found
        state.text += next.text
        state.cursor = next.cursor
        state.receipt = next.receipt
      } while (state.cursor && state.text.length <= last)
      if (!state.receipt) return found
      const origin = basis(state.receipt)
      const breaks = [...state.text.matchAll(/\r\n|\n|\r/g)].map((match) => match.index)
      return { ...found, lineBasis: origin.basis, matches: found.matches.map((match) => ({ ...match,
        line: origin.start + breaks.filter((index) => index < match.start).length })) }
    })
  return {
    parameters: Research.ViewInput,
    jsonSchema: ToolJsonSchema.fromSchema(Research.ViewInput),
    description: [
      "Reopen retained research: corpus lists bounded admitted source/record/document handles; attempts pages actual acquisition outcomes;",
      "records/source/document reopen exact revisions; find searches literal text in one admitted representation and gives each match its line.",
      "Use returned handles/revisions/cursors, never filesystem paths or guessed owner/root fields. Bounded pages and partial captures remain explicit.",
      "Line numbers are original-file lines, 1-based and inclusive (lines.basis \"original\"); basis \"retained\" means the source has no original line origin.",
      "A source or document page still in your context comes back as {ref, unchanged:true}, not its bytes again.",
      "Historical records do not prove present applicability.",
    ].join(" "),
    execute: (input: Research.ViewInput, ctx: Tool.Context) => run(ctx, "research_view", (binding) => Effect.gen(function* () {
      if ((input.action === "source" || input.action === "document") && shown(ctx, input))
        return { title: `Research ${input.action}`, output: JSON.stringify({ ref: input.ref, ...(input.cursor ? { cursor: input.cursor } : {}),
          unchanged: true, summary: "This exact page is already in your context from an earlier research_view call; its bytes are immutable" }),
          metadata: { research: { ref: input.ref, unchanged: true } } }
      const result = yield* records.view(binding, input)
      if (input.action === "source" && "receipt" in result && "origin" in result.receipt && !input.cursor) {
        const origin = basis(result.receipt)
        return page(input.action, { ...result, lines: { basis: origin.basis, start: origin.start } })
      }
      if (input.action !== "find" || !("matches" in result) || result.matches.length === 0) return page(input.action, result)
      return page(input.action, yield* locate(binding, input.ref, result))
    })).pipe(Effect.orDie),
  }
}))

function page(action: Research.ViewInput["action"], result: unknown) {
  return { title: `Research ${action}`, output: JSON.stringify(result), metadata: { research: result } }
}

/** Where line 1 of a retained representation sits in its original file (J5.3). */
function basis(receipt: Research.SourceReceipt) {
  if (receipt.observed?.lineStart !== undefined) return { basis: "original" as const, start: receipt.observed.lineStart }
  return { basis: (receipt.observed?.byteStart ?? 0) === 0 ? "original" as const : "retained" as const, start: 1 }
}

// An earlier call with the same input whose output is still uncompacted in this Session's context.
function shown(ctx: Tool.Context, input: Research.ViewInput) {
  const key = ResearchLedger.canonical(input)
  return ctx.messages.some((message) => message.parts.some((part) => part.type === "tool" && part.tool === "research_view" &&
    part.callID !== ctx.callID && part.state.status === "completed" && !part.state.time.compacted &&
    ResearchLedger.canonical(part.state.input) === key))
}
