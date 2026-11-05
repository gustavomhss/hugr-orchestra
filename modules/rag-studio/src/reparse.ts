import type { Fill } from "./types"
import { digest, requireStore } from "./context"

export async function noteBytes(sourceId: string) {
  const store = requireStore()
  const row = store.sources().find((item) => item.id === sourceId)
  if (!row) throw new Error("rejected")
  const read = await store.readBytes(row.path)
  if ("failed" in read) return row
  const hash = digest(read.text)
  if (hash === row.contentHash) return row
  const next = { ...row, text: read.text, contentHash: hash, status: "not_yet_read" as const, reparsedHash: null }
  store.putSource(next)
  return next
}

export async function reparse(sourceId: string): Promise<{ fill: Fill }> {
  const store = requireStore()
  const row = store.sources().find((item) => item.id === sourceId)
  if (!row) return { fill: "failed" }
  const before = store.chunks().map((chunk) => ({ ...chunk }))
  const read = await store.readBytes(row.path)
  if ("failed" in read) {
    before.forEach((chunk) => store.putChunk(chunk))
    store.fail(row.locationId)
    return { fill: "failed" }
  }
  const hash = digest(read.text)
  store.clear(row.locationId)
  store.putSource({
    ...row,
    text: read.text,
    contentHash: hash,
    status: "read",
    reparsedHash: hash,
  })
  return { fill: "complete" }
}
