import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { SessionID } from "@/session/schema"
import type { ArchiveChunk } from "./memory-types"

export function transcript(messages: SessionV1.WithParts[]): string {
  throw new Error("transcript-not-implemented")
}

export function chunks(sessionID: SessionID, messages: SessionV1.WithParts[]): ArchiveChunk[] {
  throw new Error("transcript-not-implemented")
}
