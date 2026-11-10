import type { Source } from "./seam"
import { digest, publicSource, requireStore } from "./context"

export async function parseSource(sourceId: string): Promise<Source> {
  const store = requireStore()
  const row = store.sources().find((item) => item.id === sourceId)
  if (!row) throw new Error("rejected")
  const read = await store.readBytes(row.path)
  const dropChunks = () => {
    store
      .chunks()
      .filter((chunk) => chunk.sourceId === sourceId)
      .forEach((chunk) => store.deleteChunk(chunk.id))
  }
  if ("failed" in read) {
    if (read.failed === "missing") throw new Error("rejected")
    const next = {
      ...row,
      text: "",
      contentHash: digest(read.bytes),
      status: "failed" as const,
    }
    store.putSource(next)
    dropChunks()
    return publicSource(next)
  }
  const text = read.text
  const contentHash = digest(text)
  const next = {
    ...row,
    text,
    contentHash,
    status: "read" as const,
  }
  store.putSource(next)
  dropChunks()
  store.putChunk({
    id: `chk_${sourceId}`,
    sourceId,
    start: 0,
    end: text.length,
    text,
    sourceHash: contentHash,
  })
  return publicSource(next)
}
