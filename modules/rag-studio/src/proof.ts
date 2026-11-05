import type { SpanRef } from "../../../docs/specs/rag-studio/seam"
import { promptChunkIds, requireStore, textAt } from "./context"

export async function saveQuestion(revisionId: string, text: string, span: SpanRef): Promise<{ id: string }> {
  const store = requireStore()
  if (!store.revision(revisionId)) throw new Error("rejected")
  const id = store.allocate("q")
  store.putQuestion({ id, revisionId, text, span })
  return { id }
}

export async function retrievalProof(questionId: string, revisionId: string): Promise<boolean> {
  const store = requireStore()
  const question = store.questions().find((row) => row.id === questionId)
  if (!question) return false
  if (question.revisionId !== revisionId) return false
  const chunk = store
    .chunks()
    .find((item) => item.sourceId === question.span.sourceId && item.start === question.span.start && item.end === question.span.end)
  if (!chunk) return false
  const trace = store.trace(questionId)
  if (!trace) return false
  const revision = store.revision(revisionId)
  if (trace.k !== undefined && revision?.k !== undefined && trace.k !== revision.k) throw new Error("rejected")
  return promptChunkIds(trace).includes(chunk.id)
}

export async function citationProof(questionId: string, sentence: string): Promise<boolean> {
  const store = requireStore()
  const question = store.questions().find((row) => row.id === questionId)
  if (!question) return false
  return textAt(store, question.span).includes(sentence)
}
