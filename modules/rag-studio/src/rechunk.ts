import type { Fill } from "./types"
import { requireStore } from "./context"
import type { SourceRow } from "./context"

export function cuts(text: string, boundary: string) {
  if (boundary !== "line") return [{ start: 0, end: text.length, text }]
  if (text.length === 0) return [{ start: 0, end: 0, text: "" }]
  const parts = text.split("\n")
  let cursor = 0
  return parts.map((part, index) => {
    const start = cursor
    const end = start + part.length
    cursor = end + (index < parts.length - 1 ? 1 : 0)
    return { start, end, text: part }
  })
}

export function rechunk(sourceId: string): Promise<{ fill: Fill }> {
  const store = requireStore()
  const row = store.sources().find((item) => item.id === sourceId)
  if (!row || row.reparsedHash !== row.contentHash) {
    if (row) store.fail(row.locationId)
    return Promise.resolve({ fill: "failed" })
  }
  store.clear(row.locationId)
  const boundary = store.pipeline(row.locationId).boundary
  const next = cuts(row.text, boundary).map((part, index) => ({
    id: `chk_${row.id}_${index}`,
    sourceId: row.id,
    start: part.start,
    end: part.end,
    text: part.text,
    sourceHash: row.contentHash,
  }))
  store
    .chunks()
    .filter((chunk) => chunk.sourceId === sourceId)
    .forEach((chunk) => store.deleteChunk(chunk.id))
  next.forEach((chunk) => {
    store.putChunk(chunk)
    store.setChunkCut(chunk.id, boundary)
  })
  return Promise.resolve({ fill: "complete" })
}

export function replaceChunks(row: SourceRow, boundary: string) {
  return rechunk(row.id).then(() => boundary)
}
