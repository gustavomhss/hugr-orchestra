import {
  applySessionManagementEvent,
  decodeSessionManagementEvent,
  mergeSessionManagementInfo,
  type AppSession,
  type SessionManagementInfo,
} from "@/utils/session"
import { pathKey } from "@/utils/path-key"

export const SESSION_MANAGEMENT_FENCE_LIMIT = 2_048
// Server ownership keeps metadata across directory-store eviction without retaining the server itself.
const managementFences = new WeakMap<object, Map<string, SessionManagementInfo>>()

export function sessionManagementFences(owner: object, directory: string) {
  const fences = managementFences.get(owner) ?? new Map<string, SessionManagementInfo>()
  managementFences.set(owner, fences)
  const key = (sessionID: string) => JSON.stringify([pathKey(directory), sessionID])
  const retain = (info: SessionManagementInfo) => {
    fences.delete(key(info.id))
    fences.set(key(info.id), {
      id: info.id,
      subagentModels: info.subagentModels,
      subagentModelsChangedAt: info.subagentModelsChangedAt,
      subagentModelsRevision: info.subagentModelsRevision,
      archiveChangedAt: info.archiveChangedAt,
      archiveRevision: info.archiveRevision,
      time: { updated: info.time.updated, archived: info.time.archived },
    })
    // Fresh restore/delete releases a row fence; cap pressure deliberately evicts the oldest metadata.
    const oldest = fences.size > SESSION_MANAGEMENT_FENCE_LIMIT ? fences.keys().next().value : undefined
    if (oldest !== undefined) fences.delete(oldest)
  }
  return {
    get: (sessionID: string) => fences.get(key(sessionID)),
    delete: (sessionID: string) => fences.delete(key(sessionID)),
    merge(next: AppSession, current?: AppSession) {
      const previous = current ? mergeSessionManagementInfo(fences.get(key(next.id)), current) : fences.get(key(next.id))
      const info = mergeSessionManagementInfo(previous, next)
      fences.delete(key(info.id))
      if (info.time.archived !== undefined) retain(info)
      return info
    },
    apply(event: NonNullable<ReturnType<typeof decodeSessionManagementEvent>>) {
      const sessionID = event.properties.sessionID
      const info = applySessionManagementEvent(fences.get(key(sessionID)) ?? { id: sessionID, time: { updated: 0 } }, event)
      if (info) retain(info)
      return info
    },
    visible(sessions: readonly AppSession[], read?: (sessionID: string) => AppSession | undefined): AppSession[] {
      return sessions.map((info) => this.merge(info, read?.(info.id))).filter((info) => info.time.archived === undefined)
    },
  }
}

export function eventSessionID(event: { type: string; properties?: unknown }) {
  const properties = event.properties
  if (!properties || typeof properties !== "object") return
  if ("sessionID" in properties && typeof properties.sessionID === "string") return properties.sessionID
  if (
    "info" in properties &&
    properties.info &&
    typeof properties.info === "object" &&
    "sessionID" in properties.info &&
    typeof properties.info.sessionID === "string"
  )
    return properties.info.sessionID
  if (
    "part" in properties &&
    properties.part &&
    typeof properties.part === "object" &&
    "sessionID" in properties.part &&
    typeof properties.part.sessionID === "string"
  )
    return properties.part.sessionID
}

export function projectSessionManagementEvent(
  event: Parameters<typeof applySessionManagementEvent>[1],
  sessionID: string | undefined,
  sessions: Readonly<Record<string, AppSession | undefined>>,
  remember: (info: AppSession) => unknown,
  resolve: (sessionID: string) => Promise<AppSession>,
  valid: () => boolean,
) {
  if (!sessionID) return
  const decoded = decodeSessionManagementEvent(event)
  if (!decoded) return
  const update = (info: AppSession) => {
    if (!valid()) return
    const next = applySessionManagementEvent(sessions[sessionID] ?? info, decoded)
    if (next) remember(next)
  }
  const info = sessions[sessionID]
  if (info) update(info)
  // Use the identity captured by the caller before awaiting snapshot recovery.
  if (!info) return resolve(sessionID).then(update).catch(() => {})
}
