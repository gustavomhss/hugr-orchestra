import { applySessionManagementEvent, type AppSession } from "@/utils/session"

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
) {
  if (!sessionID) return
  const update = (info: AppSession) => {
    const next = applySessionManagementEvent(info, event)
    if (next) remember(next)
  }
  const info = sessions[sessionID]
  if (info) update(info)
  // Use the identity captured by the caller before awaiting snapshot recovery.
  if (!info) void resolve(sessionID).then(update).catch(() => {})
}
