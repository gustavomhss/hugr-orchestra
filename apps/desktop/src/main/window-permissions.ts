import type { Session } from "electron"

type Renderer = { isDestroyed(): boolean; once(event: "destroyed", callback: () => void): unknown }
type PermissionSession = Pick<Session, "setPermissionRequestHandler" | "setPermissionCheckHandler">
const sessions = new WeakMap<PermissionSession, Set<Renderer>>()
const permissions = new Set(["clipboard-sanitized-write", "notifications"])

// Electron permissions belong to a Session, shared by every main window, not to its last window.
export function registerRendererPermissions(
  session: PermissionSession,
  renderer: Renderer,
  trusted: (url?: string) => boolean,
) {
  const existing = sessions.get(session)
  const registered = existing ?? new Set<Renderer>()
  registered.add(renderer)
  renderer.once("destroyed", () => registered.delete(renderer))
  if (existing) return
  sessions.set(session, registered)
  const allowed = (contents: Renderer | null, permission: string, url?: string) =>
    !!contents && registered.has(contents) && !contents.isDestroyed() && permissions.has(permission) && trusted(url)
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(contents, permission, details.requestingUrl))
  })
  session.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowed(contents, permission, details.requestingUrl || origin),
  )
}
