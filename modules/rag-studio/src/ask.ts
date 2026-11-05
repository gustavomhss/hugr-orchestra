import type { QuestionResult } from "../../../docs/specs/rag-studio/seam"
import { requireStore } from "./context"
import { diagnose } from "./lights"
import { block } from "./prompt"
import { shape } from "./report"
import { searchWords } from "./search"
import { record } from "./trace"

export async function ask(revisionId: string, text: string): Promise<QuestionResult> {
  const store = requireStore()
  const revision = store.revision(revisionId)
  if (!revision) throw new Error("rejected")
  if (revision.fill === "failed" || store.failed(revision.locationId)) throw new Error("rejected")
  const stale = store.chunks().some((chunk) => {
    const source = store.sources().find((row) => row.id === chunk.sourceId)
    if (!source || source.locationId !== revision.locationId) return false
    return source.contentHash !== chunk.sourceHash
  })
  if (stale) throw new Error("rejected")
  const boundary = revision.boundary ?? "document"
  const k = revision.k ?? store.pipeline(revision.locationId).k
  const matches = (await searchWords(revisionId, text)).filter((chunk) => store.chunkCut(chunk.id) === boundary)
  const owners = store
    .sources()
    .filter((row) => row.locationId === revision.locationId && row.text.includes(text))
    .sort((left, right) => left.path.localeCompare(right.path))
  const cut = block(matches, k)
  const found = diagnose({ owners, matches, kept: cut.kept, sentence: text })
  record(revisionId, found.span ? matches.map((chunk) => chunk.id) : matches.map((chunk) => chunk.id), cut.dropped.map((chunk) => chunk.id), k)
  return shape({
    revisionId,
    light: found.light,
    fileStatus: found.fileStatus,
    span: found.span,
    hits: matches.map((chunk) => chunk.id),
    dropped: cut.dropped.map((chunk) => chunk.id),
    promptText: cut.promptText,
    promptChunkIds: cut.promptChunkIds,
    retrievalOptional: cut.retrievalOptional,
  })
}
