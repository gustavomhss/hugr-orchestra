import type { SessionActiveOutput, SessionStatus } from "@/v2-wire"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import type { createHomeSessionIndexCache } from "./global-sync/home-session-index"
import type { ServerConnection } from "./server"
import type { ServerSession } from "./server-session"

/**
 * Makes `active` the truth after a gap in the event stream: every status it names is overwritten, and a session it does
 * not name is no longer running, whatever the missed events would have said.
 */
export function reconcileActiveSessionStatuses(
  session: Pick<ServerSession, "data" | "set">,
  active: SessionActiveOutput | Record<string, SessionStatus>,
) {
  Object.keys(session.data.session_status)
    .filter((sessionID) => active[sessionID] === undefined && session.data.session_status[sessionID]?.type !== "idle")
    .forEach((sessionID) => session.set("session_status", sessionID, { type: "idle" }))
  for (const sessionID of Object.keys(active)) {
    const status = active[sessionID]
    session.set("session_status", sessionID, status?.type === "running" ? { type: "busy" } : status)
  }
}

/**
 * The server keeps no replay, so a reconnect loses what happened in between. Reload the open sessions and any cached
 * session that was or is running, so a tool that finished while disconnected does not stay "running". `active` is the
 * server's current list; without it (the read failed) statuses stay as they are.
 */
export function resyncAfterReconnect(
  session: Pick<ServerSession, "data" | "set" | "sync" | "open">,
  active?: SessionActiveOutput,
) {
  const wasBusy = Object.keys(session.data.session_status).filter(
    (sessionID) => session.data.session_status[sessionID]?.type !== "idle",
  )
  if (active) reconcileActiveSessionStatuses(session, active)
  // A session that was never loaded has nothing stale; it loads when opened.
  const loaded = [...wasBusy, ...Object.keys(active ?? {})].filter((sessionID) => session.data.message[sessionID] !== undefined)
  return Promise.all(
    [...new Set([...session.open(), ...loaded])].map((sessionID) =>
      session.sync(sessionID, { force: true }).catch(() => undefined),
    ),
  ).then(() => undefined)
}

/** A session the server deleted: drop it from the home index and close its tabs, as an archive does. */
export function closeDeletedSession(input: {
  homeSessions: Pick<ReturnType<typeof createHomeSessionIndexCache>, "apply">
  server: ServerConnection.Key
  directory: string
  sessionID: string
}) {
  input.homeSessions.apply({ type: "remove", sessionID: input.sessionID })
  notifySessionTabsRemoved({ server: input.server, directory: input.directory, sessionIDs: [input.sessionID] })
}
