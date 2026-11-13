import type { Chunk, CompareRow } from "./types"
import { requireStore } from "./context"
import type { SpanRef, StoredRevision } from "./context"
import { fuse } from "./embed"

export async function compareRevisions(
  leftId: string,
  rightId: string,
  proofSetId: string,
): Promise<{ rejected: true } | { questions: CompareRow[] }> {
  const store = requireStore()
  const left = store.revision(leftId)
  const right = store.revision(rightId)
  if (!left || !right) return { rejected: true }
  if (proofSetId !== left.snapshot || left.snapshot !== right.snapshot) return { rejected: true }
  const stages = ["parser", "boundary", "tokenizer", "k", "embeddingModel"] as const
  const changed = stages.filter((stage) => (left[stage] ?? "") !== (right[stage] ?? ""))
  if (changed.length !== 1) return { rejected: true }
  if (changed[0] === "embeddingModel") return embeddingDiff(right)
  const recut = store.chunks().some((chunk) => store.chunkCut(chunk.id) === right.boundary)
  return {
    questions: store.questions().map((question) => {
      if (!recut || right.boundary === left.boundary) {
        return { id: question.id, text: question.text, startChanged: false, endChanged: false, textChanged: false }
      }
      const after = resolve(right, question.text)
      return moved(question.id, question.text, question.span, after)
    }),
  }
}

async function embeddingDiff(right: StoredRevision): Promise<{ rejected: true } | { questions: CompareRow[] }> {
  const store = requireStore()
  if (!vectorsReady(right)) return { rejected: true }
  const pipeline = store.pipeline(right.locationId)
  const questions: CompareRow[] = []
  for (const question of store.questions()) {
    const fused = await fuse({
      locationId: right.locationId,
      boundary: right.boundary ?? "document",
      sentence: question.text,
      words: [],
      pipeline: { ...pipeline, embeddingModel: right.embeddingModel ?? "" },
    })
    if (fused.sense !== "fused") return { rejected: true }
    const hit = fused.matches.find((chunk) => chunk.text.includes(question.text))
    questions.push(moved(question.id, question.text, question.span, spanOf(hit, question.text)))
  }
  return { questions }
}

function vectorsReady(revision: StoredRevision) {
  const store = requireStore()
  const model = revision.embeddingModel
  if (!model) return false
  return store.chunks().some((chunk) => {
    const source = store.sources().find((row) => row.id === chunk.sourceId)
    return source?.locationId === revision.locationId && store.vector(chunk.id, model) !== undefined
  })
}

function spanOf(chunk: Chunk | undefined, sentence: string): SpanRef {
  if (!chunk) return { sourceId: "", start: 0, end: 0 }
  const at = chunk.text.indexOf(sentence)
  if (at < 0) return { sourceId: chunk.sourceId, start: chunk.start, end: chunk.end }
  return { sourceId: chunk.sourceId, start: chunk.start + at, end: chunk.start + at + sentence.length }
}

function moved(id: string, text: string, before: SpanRef, after: SpanRef) {
  return {
    id,
    text,
    startChanged: before.start !== after.start,
    endChanged: before.end !== after.end,
    textChanged: textOf(before) !== textOf(after),
  }
}

function resolve(revision: StoredRevision, sentence: string): SpanRef {
  const store = requireStore()
  const hit = store.chunks().find((chunk) => {
    const source = store.sources().find((row) => row.id === chunk.sourceId)
    return (
      source?.locationId === revision.locationId &&
      store.chunkCut(chunk.id) === revision.boundary &&
      chunk.text.includes(sentence)
    )
  })
  if (hit) return { sourceId: hit.sourceId, start: hit.start, end: hit.end }
  const source = store.sources().find((row) => row.locationId === revision.locationId && row.text.includes(sentence))
  if (!source) return { sourceId: "", start: 0, end: 0 }
  const start = source.text.indexOf(sentence)
  return { sourceId: source.id, start, end: start + sentence.length }
}

function textOf(span: SpanRef) {
  const source = requireStore()
    .sources()
    .find((row) => row.id === span.sourceId)
  if (!source) return ""
  return source.text.slice(span.start, span.end)
}
