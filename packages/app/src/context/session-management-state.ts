import {
  applySessionManagementEvent,
  decodeSessionManagementEvent,
  mergeSessionManagementInfo,
  type AppSession,
} from "@/utils/session"

export const SESSION_MANAGEMENT_FENCE_LIMIT = 2_048
// A directory store belongs to one server. Weak ownership releases its fences on disposal.
const managementFences = new WeakMap<object, Map<string, Map<string, AppSession>>>()

export function sessionManagementFences(owner: object, directory: string) {
  const scopes = managementFences.get(owner) ?? new Map<string, Map<string, AppSession>>()
  managementFences.set(owner, scopes)
  const fences = scopes.get(directory) ?? new Map<string, AppSession>()
  scopes.set(directory, fences)
  return {
    get: (sessionID: string) => fences.get(sessionID),
    delete: (sessionID: string) => fences.delete(sessionID),
    merge(next: AppSession, current?: AppSession) {
      const previous = current ? mergeSessionManagementInfo(fences.get(next.id), current) : fences.get(next.id)
      const info = mergeSessionManagementInfo(previous, next)
      fences.delete(info.id)
      if (info.time.archived !== undefined) fences.set(info.id, info)
      // Keep removed rows until a fresh restore/delete, with deliberate oldest-entry eviction at the cap.
      const oldest = fences.size > SESSION_MANAGEMENT_FENCE_LIMIT ? fences.keys().next().value : undefined
      if (oldest !== undefined) fences.delete(oldest)
      return info
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
