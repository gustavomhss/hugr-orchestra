import type { Chunk } from "./types"

export function block(matches: Chunk[], k: number) {
  const kept = matches.slice(0, Math.max(0, k))
  const dropped = matches.slice(Math.max(0, k))
  return {
    kept,
    dropped,
    promptText: kept.map((chunk) => chunk.text).join(""),
    promptChunkIds: kept.map((chunk) => chunk.id),
    retrievalOptional: matches.length <= k,
  }
}
