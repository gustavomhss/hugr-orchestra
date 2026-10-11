export * as ClaudeHostBoundary from "./boundary"

import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCodeTranscript } from "../transcript"

/** The UI's boundary is exclusive; the SDK's resumeSessionAt is inclusive. Never omit an unresolved cut. */
export function resolve(history: readonly SessionV1.WithParts[], state: Record<string, unknown>, messageID: string) {
  const index = history.findIndex((message) => message.info.id === messageID)
  if (index < 0) throw new Error(`Claude Code cannot resolve the history boundary ${messageID}`)
  if (index === 0) return undefined
  const ends = strings(state.ends)
  const uuids = strings(state.uuids)
  const previous = history.slice(0, index).findLast((message) => message.info.role === "assistant")
  const at = previous?.info.role === "assistant" ? ends[previous.info.parentID] ?? uuids[previous.info.id] : undefined
  if (!at) throw new Error(`Claude Code has no native chain boundary preceding ${messageID}`)
  return at
}

export function strings(value: unknown): Record<string, string> {
  return ClaudeCodeTranscript.record(value)
    ? Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[key, item]] : [])) : {}
}

export function remap(value: unknown, ids: ReadonlyMap<string, string>) {
  return Object.fromEntries(Object.entries(strings(value)).flatMap(([key, item]) => ids.has(key) ? [[ids.get(key)!, item]] : []))
}
