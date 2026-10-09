// Export only admitted, digest-checked research documents for the independent evaluator; no model calls or oracle reads.
import path from "node:path"
import { Effect, Schema } from "effect"

const root = process.argv[2]
if (!root) throw new Error("Usage: research-documents <isolated-pilot-state-root>")
process.env.ORCHESTRA_DB = path.join(root, "native.db")
const { Research } = await import("@orchestra/schema/research")
const { ResearchArtifacts } = await import("@orchestra/core/research/artifacts")
const { AppNodeBuilder } = await import("@orchestra/core/effect/app-node-builder")
const { Global } = await import("@orchestra/core/global")
const projection = Schema.decodeUnknownSync(Schema.Struct({
  output: Schema.Struct({ metadata: Schema.Struct({ workResult: Schema.Struct({ documents: Schema.optional(Schema.Array(Research.DocumentReceipt)) }) }) }),
}))(await Bun.file(path.join(root, "evaluation.json")).json())
const documents = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const artifacts = yield* ResearchArtifacts.Service
  return yield* Effect.forEach(projection.output.metadata.workResult.documents ?? [], (receipt) => Effect.gen(function* () {
    const pages: string[] = []
    const first = yield* artifacts.read(receipt.binding, receipt.artifact, undefined, "task")
    if (!("publishedAt" in first.receipt) || first.receipt.digest !== receipt.digest ||
      first.receipt.ref.id !== receipt.ref.id || first.receipt.ref.revision !== receipt.ref.revision)
      return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation document differs from declared admitted receipt" })
    pages.push(first.text)
    const drain = (cursor: string): Effect.Effect<void, Research.Error> => artifacts.read(receipt.binding, receipt.artifact, cursor, "task").pipe(
      Effect.flatMap((page) => {
        pages.push(page.text)
        return page.cursor ? drain(page.cursor) : Effect.void
      }),
    )
    if (first.cursor) yield* drain(first.cursor)
    return { receipt, text: pages.join(""), verified: true }
  }))
}).pipe(Effect.provide(AppNodeBuilder.build(ResearchArtifacts.node, [[Global.node, Global.layerWith({ data: root })]])))))
await Bun.write(path.join(root, "documents.json"), JSON.stringify({ schema: "jimmy-evaluation-documents-v1", documents }))
console.log(JSON.stringify({ artifact: path.join(root, "documents.json"), documents: documents.length }))
