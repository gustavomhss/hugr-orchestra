import type { Source } from "../../../docs/specs/rag-studio/seam"
import { digest, gate, publicSource, requireStore } from "./context"

export async function admit(input: {
  locationId: string
  path: string
}): Promise<Source | { refused: "atlas" | "permission" }> {
  const store = requireStore()
  const placed = gate(store, input.locationId, input.path)
  if ("refused" in placed) return placed
  const read = await store.readBytes(placed.path)
  if ("failed" in read && read.failed === "missing") throw new Error("rejected")
  const bytes = "text" in read ? read.text : read.bytes
  const hash = digest(bytes)
  const text = "text" in read ? read.text : ""
  const existing = store.sources().find((row) => row.locationId === input.locationId && row.path === placed.path)
  // Same bytes keep the stored status, including read. Do not insert a second row.
  if (existing && existing.contentHash === hash) return publicSource(existing)
  const row = {
    id: existing ? existing.id : `src_${digest(input.locationId + "\0" + placed.path).slice(0, 12)}`,
    locationId: input.locationId,
    path: placed.path,
    contentHash: hash,
    status: "not_yet_read" as const,
    text,
  }
  store.putSource(row)
  return publicSource(row)
}

export async function listSources(locationId: string): Promise<Source[]> {
  const store = requireStore()
  return store
    .sources()
    .filter((row) => row.locationId === locationId)
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map(publicSource)
}
