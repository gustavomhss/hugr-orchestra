export * as ClaudeHostBoundary from "./boundary"

import type { SessionV1 } from "@orchestra/core/v1/session"
import { Schema } from "effect"
import type { Session } from "@/session/session"
import { ClaudeHostAdmission } from "./admission"
import { ClaudeCodeTranscript } from "../transcript"

export class UnresolvedNativeBoundary extends Error {
  override readonly name = "UnresolvedNativeBoundary"
}

export class UnprovableNativeLineage extends Error {
  override readonly name = "UnprovableNativeLineage"
}

/** Only the lifecycle owner writes this marker, from the Session's host-issued clone map. */
const RetainedView = Schema.Struct({
  schema: Schema.Literal("native-retained-view-v1"),
  projectID: Schema.String,
  kind: Schema.Literals(["fork", "revert"]),
  messages: Schema.Record(Schema.String, Schema.Array(Schema.Struct({
    projectID: Schema.String, sessionID: Schema.String, messageID: Schema.String,
  }))),
})
export type RetainedView = typeof RetainedView.Type
export type MessageOrigin = RetainedView["messages"][string][number]

/** MEMORY must use `cut` for side-store fallback even after init clears resumeAt. */
export function retained(session: Session.Info, history: readonly SessionV1.WithParts[]) {
  const cut = session.revert ? history.findIndex((message) => message.info.id === session.revert?.messageID) : history.length
  if (cut < 0 || session.revert && (session.revert.partID || history[cut]?.info.role !== "user"))
    throw new UnresolvedNativeBoundary("NATIVE_RETAINED_BOUNDARY_UNAVAILABLE")
  if (history.some((message) => message.info.sessionID !== session.id || message.parts.some((part) =>
    part.sessionID !== session.id || part.messageID !== message.info.id)))
    throw new UnprovableNativeLineage("NATIVE_RETAINED_OWNER_MISMATCH")
  const raw = session.metadata?.claudeCode?.retainedView
  const marker = raw === undefined ? undefined : Schema.decodeUnknownOption(RetainedView)(raw)
  if (marker?._tag === "None" || marker?._tag === "Some" && (marker.value.projectID !== session.projectID ||
    Object.values(marker.value.messages).some((origins) => !origins.length || origins.some((origin) =>
      origin.projectID !== session.projectID || !origin.sessionID || !origin.messageID))))
    throw new UnprovableNativeLineage("NATIVE_RETAINED_MARKER_INVALID")
  return { session, history: history.slice(0, cut),
    cut: !!session.revert || marker?._tag === "Some" || !!session.metadata?.claudeCode?.forkFrom || !!session.metadata?.claudeCode?.resumeAt,
    lineage: marker?._tag === "Some" ? marker.value : undefined }
}
export type Retained = ReturnType<typeof retained>

/** Candidate original owners for a retained producer; each comes from the host's message map. */
export function origins(view: ReturnType<typeof retained>, messageID: string): readonly MessageOrigin[] {
  if (!view.history.some((message) => message.info.id === messageID))
    throw new UnprovableNativeLineage("NATIVE_PRODUCER_UNRETAINED")
  return [{ projectID: view.session.projectID, sessionID: view.session.id, messageID },
    ...(view.lineage?.messages[messageID] ?? [])].filter((origin, index, all) => all.findIndex((other) =>
      other.projectID === origin.projectID && other.sessionID === origin.sessionID && other.messageID === origin.messageID) === index)
}

/** Resolve both producing messages in the retained view; immutable source events keep their original owner. */
export function reference(view: ReturnType<typeof retained>, source: {
  projectID: string; sessionID: string; admissionMessageID: string; producerMessageID: string
}) {
  const find = (id: string) => view.history.filter((message) =>
    source.projectID === view.session.projectID && (source.sessionID === view.session.id && message.info.id === id ||
      view.lineage?.messages[message.info.id]?.some((origin) => origin.projectID === source.projectID &&
        origin.sessionID === source.sessionID && origin.messageID === id)))
  const admission = find(source.admissionMessageID)
  const producer = find(source.producerMessageID)
  if (admission.length !== 1 || producer.length !== 1)
    throw new UnprovableNativeLineage("NATIVE_SOURCE_MESSAGES_UNPROVABLE")
  return { source, admission: admission[0], producer: producer[0], historical: source.sessionID !== view.session.id }
}

/** The source identity is lifecycle-owned; tool/model metadata is never lineage evidence. */
export function retain(source: Session.Info, history: readonly SessionV1.WithParts[], ids: ReadonlyMap<string, string>, kind: RetainedView["kind"]): RetainedView {
  const view = retained(source, history)
  if (new Set(ids.values()).size !== ids.size || [...ids.keys()].some((id) => !view.history.some((message) => message.info.id === id)))
    throw new UnprovableNativeLineage("NATIVE_FORK_MESSAGES_UNPROVABLE")
  return { schema: "native-retained-view-v1", projectID: source.projectID, kind,
    messages: Object.fromEntries(view.history.flatMap((message) => ids.has(message.info.id)
      ? [[ids.get(message.info.id)!, origins(view, message.info.id)]] : [])) }
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
    settledResults: undefined,
  }
}

export function fork(source: Session.Info, history: readonly SessionV1.WithParts[], state: Record<string, unknown>, ids: ReadonlyMap<string, string>, messageID?: string) {
  const native = forkState(history, state, messageID)
  return { ...native, retainedView: retain(source, history, ids, "fork"),
    inputs: ClaudeHostAdmission.remap(native.inputs, ids), uuids: remap(native.uuids, ids),
    starts: remap(native.starts, ids), ends: remap(native.ends, ids),
    delivered: Array.isArray(native.delivered) ? native.delivered.flatMap((id) => ids.get(String(id)) ?? []) : native.delivered }
}

/** Keep the trusted retained marker independently of the SDK's one-shot resume cursor. */
export function revert(session: Session.Info, history: readonly SessionV1.WithParts[], state: Record<string, unknown>) {
  if (!session.revert) throw new UnresolvedNativeBoundary("NATIVE_REVERT_BOUNDARY_UNAVAILABLE")
  const view = retained(session, history)
  const at = resolve(history, state, session.revert.messageID)
  const ids = new Map<string, string>(view.history.map((message) => [message.info.id, message.info.id]))
  const inherited = ClaudeCodeTranscript.record(state.forkFrom) ? state.forkFrom : undefined
  return { resumeAt: at, sessionId: at ? state.sessionId : undefined,
    freshSessionId: at ? undefined : crypto.randomUUID(),
    cost: at ? state.cost : 0, settledResults: at ? state.settledResults : undefined,
    forkFrom: at && typeof state.sessionId !== "string" && typeof inherited?.sessionId === "string"
      ? { sessionId: inherited.sessionId, at } : undefined, chain: at,
    retainedView: retain(session, history, ids, "revert"),
    inputs: ClaudeHostAdmission.remap(state.inputs, ids), uuids: remap(state.uuids, ids),
    starts: remap(state.starts, ids), ends: remap(state.ends, ids),
    delivered: Array.isArray(state.delivered) ? state.delivered.filter((id) => ids.has(String(id))) : undefined }
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
