import type { JSONSchema7 } from "@ai-sdk/provider"
import type { SessionID } from "@/session/schema"
import type { ArchiveReference, MemoryArtifact, MemorySnapshot } from "./memory-types"

export function decode(input: {
  text: string
  snapshot: MemorySnapshot
  producerID: SessionID
  available: ArchiveReference[]
  maxTokens: number
}): MemoryArtifact | undefined {
  return undefined
}

export function responseSchema(available: ArchiveReference[]): JSONSchema7 {
  throw new Error("memory-not-implemented")
}
