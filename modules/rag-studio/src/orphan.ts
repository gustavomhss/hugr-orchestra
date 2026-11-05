import type { Fill } from "./types"
import { requireStore } from "./context"

export function removeSource(sourceId: string): Promise<void> {
  requireStore().removeSource(sourceId)
  return Promise.resolve()
}

export function orphanDelete(): Promise<{ fill: Fill }> {
  const store = requireStore()
  store.chunks().forEach((chunk) => {
    if (!store.sources().some((row) => row.id === chunk.sourceId)) store.deleteChunk(chunk.id)
  })
  return Promise.resolve({ fill: "complete" })
}
