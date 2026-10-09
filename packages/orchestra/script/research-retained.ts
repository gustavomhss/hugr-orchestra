// Read admitted immutable artifacts only; this never acquires sources or writes corpus records.
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"

export const read = Effect.fn("ResearchRetained.read")(function* (receipt: Research.SourceReceipt | Research.DocumentReceipt) {
  const artifacts = yield* ResearchArtifacts.Service
  const artifact = "origin" in receipt ? receipt.ref.artifact : receipt.artifact
  const representation = "origin" in receipt ? receipt.ref.representation : "markdown"
  const digest = "origin" in receipt ? receipt.ref.digest : receipt.digest
  const pages: string[] = []
  const cursors = new Set<string>()
  const pageLimit = Math.max(1, Math.ceil(receipt.bytes / (Research.Limits.pageBytes - 3)))
  const drain = (cursor?: string): Effect.Effect<void, Research.Error> => Effect.gen(function* () {
    if (pages.length >= pageLimit)
      return yield* new Research.Error({ code: "over_cap", message: "Evaluation artifact page request budget exhausted" })
    if (cursor !== undefined && cursors.has(cursor))
      return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation artifact cursor did not advance" })
    if (cursor !== undefined) cursors.add(cursor)
    const page = yield* artifacts.read(receipt.binding, artifact, cursor, "task")
    const bytes = Buffer.byteLength(page.text)
    const total = pages.reduce((sum, text) => sum + Buffer.byteLength(text), bytes)
    if (!isDeepStrictEqual(page.receipt, receipt) || !isDeepStrictEqual(page.ref, artifact) || page.representation !== representation ||
      bytes > Research.Limits.pageBytes || (receipt.bytes > 0 && bytes === 0) || total > receipt.bytes ||
      page.complete !== (page.cursor === undefined) ||
      (page.cursor !== undefined && (!page.cursor.length || cursors.has(page.cursor) || total >= receipt.bytes)) ||
      (page.cursor === undefined && total !== receipt.bytes))
      return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation artifact page differs from admitted representation or did not advance" })
    pages.push(page.text)
    if (page.cursor !== undefined) yield* drain(page.cursor)
  })
  yield* drain()
  const text = pages.join("")
  if (Buffer.byteLength(text) !== receipt.bytes || createHash("sha256").update(text).digest("hex") !== digest)
    return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation artifact export differs from admitted bytes" })
  return { receipt, text, verified: true }
})

export * as ResearchRetained from "./research-retained"
