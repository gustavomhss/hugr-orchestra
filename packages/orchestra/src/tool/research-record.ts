import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchTools } from "@/research/binding"
import { ResearchExecution } from "@/research/allowance"
import { ResearchQualifications } from "@/research/qualifications"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"

export const ResearchRecordTool = Tool.define("research_record", Effect.gen(function* () {
  const records = yield* ResearchRecords.Service
  const execution = yield* ResearchExecution.Service
  const run = yield* ResearchTools.make
  return {
    parameters: Research.RecordInput,
    jsonSchema: ToolJsonSchema.fromSchema(Research.RecordInput),
    description: "Retain a research question, evidenced finding, justified relation or cohesive Markdown document. Supply authored fields and exact admitted references only. Updates require id/baseRevision and findings require a material revision reason. Documents use citations mapped to EvidenceRef and Markdown links research:<label>. Returned IDs/receipts are host facts. Product files, approval and shared Knowledge are not edited. Simple source answers need not create a dossier.",
    execute: (input: Research.RecordInput, ctx: Tool.Context) => run(ctx, "research_record", (binding, context) =>
      execution.captureBytes(ctx.sessionID, `${ctx.messageID}:${ctx.callID}:${input.action}`, input.action === "document"
        ? Buffer.byteLength(input.document.body, "utf8") : 0,
      records.record(binding, context, input)).pipe(Effect.flatMap((result) => Effect.gen(function* () {
        const qualifications = result.document
          ? yield* ResearchQualifications.collect(records, binding, result.document.findingRefs) : undefined
        const reply = { ...result, ...(qualifications ? { qualifications } : {}) }
        return { title: result.document ? `Research document: ${result.document.title}` : `Research ${input.action} retained`,
          output: JSON.stringify(reply), metadata: { research: reply } }
      }))),
    ).pipe(Effect.orDie),
  }
}))
