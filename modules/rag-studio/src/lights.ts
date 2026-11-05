import type { FileStatus, Light, SpanRef } from "../../../docs/specs/rag-studio/seam"
import type { Chunk, SourceRow } from "./context"

export function diagnose(input: {
  owners: SourceRow[]
  matches: Chunk[]
  kept: Chunk[]
  sentence: string
}): { light: Light | null; fileStatus: FileStatus | null; span: SpanRef | null } {
  const read = input.owners.filter((row) => row.status === "read")
  if (input.owners.length === 0) return { light: "not_in_corpus", fileStatus: null, span: null }
  if (read.length === 0) {
    return {
      light: null,
      fileStatus: input.owners.length === 1 ? input.owners[0].status : input.owners[0].status,
      span: null,
    }
  }
  const owner = read[0]
  const hit = input.matches.find((chunk) => chunk.sourceId === owner.id && chunk.text.includes(input.sentence))
  const span = hit ? { sourceId: hit.sourceId, start: hit.start, end: hit.end } : sentenceSpan(owner, input.sentence)
  if (!hit) return { light: "search_miss", fileStatus: null, span }
  if (!input.kept.some((chunk) => chunk.id === hit.id)) return { light: "dropped_before_model", fileStatus: null, span }
  return { light: "sent", fileStatus: null, span }
}

function sentenceSpan(row: SourceRow, sentence: string): SpanRef {
  const start = row.text.indexOf(sentence)
  return { sourceId: row.id, start, end: start + sentence.length }
}
