import type { Chunk } from "../../../docs/specs/rag-studio/seam"
import { requireStore } from "./context"

export async function searchWords(revisionId: string, word: string): Promise<Chunk[]> {
  const store = requireStore()
  const revision = store.revision(revisionId)
  if (!revision) throw new Error("rejected")
  const sources = new Map(store.sources().map((source) => [source.id, source]))
  return store
    .chunks()
    .flatMap((chunk) => {
      const source = sources.get(chunk.sourceId)
      if (!source) return []
      if (source.locationId !== revision.locationId) return []
      if (source.status !== "read") return []
      if (source.contentHash !== chunk.sourceHash) return []
      if (!chunk.text.includes(word)) return []
      return [{ chunk, path: source.path }]
    })
    .toSorted((left, right) => {
      const order = left.path.localeCompare(right.path)
      if (order !== 0) return order
      return left.chunk.start - right.chunk.start
    })
    .map((hit) => hit.chunk)
}
