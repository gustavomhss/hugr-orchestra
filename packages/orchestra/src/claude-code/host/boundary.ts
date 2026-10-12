export * as ClaudeHostBoundary from "./boundary"

import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeHostAdmission } from "./admission"
import { ClaudeCodeTranscript } from "../transcript"

export class UnresolvedNativeBoundary extends Error {
  override readonly name = "UnresolvedNativeBoundary"
}

/** The UI's boundary is exclusive; the SDK's resumeSessionAt is inclusive. Never omit an unresolved cut. */
export function resolve(history: readonly SessionV1.WithParts[], state: Record<string, unknown>, messageID: string) {
  const index = history.findIndex((message) => message.info.id === messageID)
  if (index < 0) throw new UnresolvedNativeBoundary(`Claude Code cannot resolve the history boundary ${messageID}`)
  if (history[index].info.role !== "user")
    throw new UnresolvedNativeBoundary("Claude Code requires a user-message history boundary")
  if (index === 0) return undefined
  const input = ClaudeHostAdmission.read(state.inputs)[messageID]
  if (input?.inseparable && input.inseparable.indexOf(messageID) > 0)
    throw new UnresolvedNativeBoundary(
      `Claude Code cannot cut inside an inseparable native input batch at ${messageID}`,
    )
  const before = strings(state.starts)[messageID]
  if (before) return before
  // A receipt for several UUIDs proves consumption, not an exclusive chain position for each send.
  // Without its user echo, a consumed input cannot supply a guessed interior cut.
  if (input && input.status !== "pending")
    throw new UnresolvedNativeBoundary(`Claude Code has no exact native input boundary for ${messageID}`)
  const previousUser = history.slice(0, index).findLast((message) => message.info.role === "user")
  const ends = strings(state.ends)
  const at = previousUser ? ends[previousUser.info.id] : undefined
  if (!at) throw new UnresolvedNativeBoundary(`Claude Code has no native chain boundary preceding ${messageID}`)
  return at
}

/** A pending revert cut belongs to the native ownership even before any query has reopened that history. */
export function forkState(history: readonly SessionV1.WithParts[], state: Record<string, unknown>, messageID?: string) {
  const inherited = ClaudeCodeTranscript.record(state.forkFrom) ? state.forkFrom : undefined
  const at = messageID
    ? resolve(history, state, messageID)
    : typeof state.resumeAt === "string"
      ? state.resumeAt
      : typeof state.sessionId !== "string" && typeof inherited?.at === "string"
        ? inherited.at
        : undefined
  const nativeID =
    typeof state.sessionId === "string"
      ? state.sessionId
      : typeof inherited?.sessionId === "string"
        ? inherited.sessionId
        : undefined
  return {
    ...state,
    inputs: state.inputs,
    uuids: state.uuids,
    starts: state.starts,
    ends: state.ends,
    delivered: state.delivered,
    forkFrom: nativeID && (!messageID || at) ? { sessionId: nativeID, ...(at ? { at } : {}) } : undefined,
    sessionId: undefined,
    freshSessionId: undefined,
    resumeAt: undefined,
    chain: messageID ? at : (state.chain ?? at),
    cost: 0,
  }
}

export function strings(value: unknown): Record<string, string> {
  return ClaudeCodeTranscript.record(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => (typeof item === "string" ? [[key, item]] : [])),
      )
    : {}
}

export function remap(value: unknown, ids: ReadonlyMap<string, string>) {
  return Object.fromEntries(
    Object.entries(strings(value)).flatMap(([key, item]) => (ids.has(key) ? [[ids.get(key)!, item]] : [])),
  )
}
