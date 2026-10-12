import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchTools } from "@/research/binding"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"

export const ResearchViewTool = Tool.define("research_view", Effect.gen(function* () {
  const records = yield* ResearchRecords.Service
  const run = yield* ResearchTools.make
  return {
    parameters: Research.ViewInput,
    jsonSchema: ToolJsonSchema.fromSchema(Research.ViewInput),
    description: "Reopen retained research: corpus lists bounded admitted source/record/document handles; attempts pages actual acquisition outcomes; records/source/document reopen exact revisions; find searches literal text in one admitted representation. Use returned handles/revisions/cursors, never filesystem paths or guessed owner/root fields. Bounded pages and partial captures remain explicit. Locators address retained representation from line 1. Historical records do not prove present applicability.",
    execute: (input: Research.ViewInput, ctx: Tool.Context) => run(ctx, "research_view", (binding) =>
      records.view(binding, input).pipe(Effect.map((result) => ({
        title: `Research ${input.action}`, output: JSON.stringify(result), metadata: { research: result },
      }))),
    ).pipe(Effect.orDie),
  }
}))
