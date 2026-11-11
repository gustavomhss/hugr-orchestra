import type { CompareRow } from "./types"
import { requireStore } from "./context"
import type { SpanRef, StoredRevision } from "./context"

export function compareRevisions(
  leftId: string,
  rightId: string,
  proofSetId: string,
): Promise<{ rejected: true } | { questions: CompareRow[] }> {
  const store = requireStore()
  const left = store.revision(leftId)
  const right = store.revision(rightId)
  if (!left || !right) return Promise.resolve({ rejected: true })
  if (proofSetId !== left.snapshot || left.snapshot !== right.snapshot) return Promise.resolve({ rejected: true })
  const stages = ["parser", "boundary", "tokenizer", "k"] as const
  const changed = stages.filter((stage) => left[stage] !== right[stage])
  if (changed.length !== 1) return Promise.resolve({ rejected: true })
  const recut = store.chunks().some((chunk) => store.chunkCut(chunk.id) === right.boundary)
  const questions = store.questions().map((question) => {
    if (!recut || right.boundary === left.boundary) {
      return { id: question.id, startChanged: false, endChanged: false, textChanged: false }
    }
    const after = resolve(right, question.text)
    return {
      id: question.id,
      startChanged: question.span.start !== after.start,
      endChanged: question.span.end !== after.end,
      textChanged: textOf(question.span) !== textOf(after),
    }
  })
  return Promise.resolve({ questions })
}

function resolve(revision: StoredRevision, sentence: string): SpanRef {
  const store = requireStore()
  const hit = store.chunks().find((chunk) => {
    const source = store.sources().find((row) => row.id === chunk.sourceId)
    return source?.locationId === revision.locationId && store.chunkCut(chunk.id) === revision.boundary && chunk.text.includes(sentence)
  })
  if (hit) return { sourceId: hit.sourceId, start: hit.start, end: hit.end }
  const source = store.sources().find((row) => row.locationId === revision.locationId && row.text.includes(sentence))
  if (!source) return { sourceId: "", start: 0, end: 0 }
  const start = source.text.indexOf(sentence)
  return { sourceId: source.id, start, end: start + sentence.length }
}

function textOf(span: SpanRef) {
  const source = requireStore().sources().find((row) => row.id === span.sourceId)
  if (!source) return ""
  return source.text.slice(span.start, span.end)
}
