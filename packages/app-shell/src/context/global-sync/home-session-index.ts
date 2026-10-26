import type { Session, SessionV2Info } from "@/v2-wire"

import type { Event, V2SessionListResponse } from "@/v2-wire"
import type { QueryClient } from "@tanstack/solid-query"
import { trimSessions } from "./session-trim"
import { pathKey } from "@/utils/path-key"
import { normalizeSessionInfo, renameSession, type AppSession } from "@/utils/session"

export const HOME_V2_SESSION_PAGE_LIMIT = 5_000

// A local change to the home index, derived from server lifecycle events or a canonical read.
export type HomeSessionEvent =
  | { type: "upsert"; info: Session }
  | { type: "rename"; sessionID: string; title: string; timestamp: number }
  | { type: "remove"; sessionID: string }
export type HomeSessionEvents = {
  sequence: number
  entries: Array<{ sequence: number; event: HomeSessionEvent }>
}
export type HomeSessionIndex = {
  sessions: Session[]
  eventSequence: number
}

export const homeSessionIndexKey = (server: string) => ["home", "session-index", server] as const
export const homeSessionEventsKey = (server: string) => ["home", "session-events", server] as const

type HomeSessionPage = { data?: V2SessionListResponse }

export async function loadHomeSessionIndex(
  list: (
    input: { limit: number; order: "desc"; cursor?: string },
    options: { signal?: AbortSignal },
  ) => Promise<HomeSessionPage>,
  eventSequence = 0,
  signal?: AbortSignal,
) {
  const data: SessionV2Info[] = []
  let cursor: string | undefined

  for (;;) {
    const response = await list(
      {
        limit: HOME_V2_SESSION_PAGE_LIMIT,
        order: "desc",
        ...(cursor ? { cursor } : {}),
      },
      { signal },
    )
    const page = response.data!
    data.push(...page.data)
    if (page.data.length < HOME_V2_SESSION_PAGE_LIMIT || !page.cursor.next)
      return { sessions: parseHomeSessionIndex(data), eventSequence }
    cursor = page.cursor.next
  }
}

export function appendHomeSessionEvent(current: HomeSessionEvents | undefined, event: HomeSessionEvent) {
  const sequence = (current?.sequence ?? 0) + 1
  return {
    sequence,
    entries: [...(current?.entries ?? []), { sequence, event }],
  }
}

export function trimHomeSessionEvents(current: HomeSessionEvents | undefined, sequence: number): HomeSessionEvents {
  return {
    sequence: current?.sequence ?? sequence,
    entries: (current?.entries ?? []).filter((entry) => entry.sequence > sequence),
  }
}

export function homeSessionIndexSessions(index: HomeSessionIndex | undefined, events: HomeSessionEvents | undefined) {
  if (!index) return []
  return (events?.entries ?? [])
    .filter((entry) => entry.sequence > index.eventSequence)
    .reduce((sessions, entry) => applyHomeSessionEvent(sessions, entry.event), index.sessions)
}

export function homeSessionIndexRefresh(event: Event["type"], connected: boolean) {
  if (event === "server.connected") return { connected: true, refetch: connected }
  return {
    connected,
    refetch: event === "session.next.moved",
  }
}

export function createHomeSessionIndexCache(queryClient: QueryClient, server: string) {
  const indexKey = homeSessionIndexKey(server)
  const eventsKey = homeSessionEventsKey(server)
  let connected = false
  const removed = new Set<string>()

  return {
    indexKey,
    eventsKey,
    eventSequence() {
      return queryClient.getQueryData<HomeSessionEvents>(eventsKey)?.sequence ?? 0
    },
    complete(sequence: number) {
      // Keep events received after the fetch began so its response cannot overwrite them.
      queryClient.setQueryData<HomeSessionEvents>(eventsKey, (current) => trimHomeSessionEvents(current, sequence))
    },
    sessions(index: HomeSessionIndex | undefined, events: HomeSessionEvents | undefined) {
      const sessions = homeSessionIndexSessions(index, events)
      return removed.size === 0 ? sessions : sessions.filter((session) => !removed.has(session.id))
    },
    apply(event: HomeSessionEvent) {
      if (event.type === "upsert" && event.info.time.archived === undefined) removed.delete(event.info.id)
      if (!queryClient.getQueryState(indexKey)) return
      const next = appendHomeSessionEvent(queryClient.getQueryData<HomeSessionEvents>(eventsKey), event)
      if (queryClient.isFetching({ queryKey: indexKey, exact: true }) > 0) {
        queryClient.setQueryData(eventsKey, next)
        return
      }

      const index = queryClient.getQueryData<HomeSessionIndex>(indexKey)
      if (index) {
        queryClient.setQueryData<HomeSessionIndex>(indexKey, {
          sessions: homeSessionIndexSessions(index, next),
          eventSequence: next.sequence,
        })
      }
      queryClient.setQueryData<HomeSessionEvents>(eventsKey, { sequence: next.sequence, entries: [] })
    },
    remove(sessionID: string) {
      removed.add(sessionID)
      if (!queryClient.getQueryState(indexKey)) return
      queryClient.setQueryData<HomeSessionIndex>(indexKey, (index) => {
        if (!index) return index
        const at = index.sessions.findIndex((session) => session.id === sessionID)
        if (at === -1) return index
        return { ...index, sessions: index.sessions.toSpliced(at, 1) }
      })
    },
    refresh(event: Event["type"]) {
      const result = homeSessionIndexRefresh(event, connected)
      connected = result.connected
      if (!result.refetch) return
      void queryClient.refetchQueries({ queryKey: indexKey, exact: true, type: "active" })
    },
  }
}

// TODO(v2): This deliberately dumb full-table scan is necessary because the
// current V2 API orders by creation time and cannot filter roots, archives, or
// multiple directories. A bounded page could omit an old session updated today.
// Once released, use client.v2.project.list() and client.v2.session.list({
// parentID: null, order: "desc" }), then remove this adapter.
export function parseHomeSessionIndex(sessions: SessionV2Info[]): AppSession[] {
  return sessions.flatMap((item) => {
    if (item.parentID || typeof item.time.archived === "number") return []
    return [toSummary(item)]
  })
}

export function retainHomeSessions(sessions: Session[], limit: number, now: number) {
  const grouped = Map.groupBy(sessions, (session) => pathKey(session.directory))
  return [...grouped.values()].flatMap((items) => trimSessions(items, { limit, permission: {}, now }))
}

export function applyHomeSessionEvent(sessions: Session[], event: HomeSessionEvent) {
  const index = sessions.findIndex((session) => session.id === (event.type === "upsert" ? event.info.id : event.sessionID))
  if (event.type === "rename") {
    if (index === -1) return sessions
    return sessions.with(index, renameSession(sessions[index]!, event.title, event.timestamp))
  }
  if (event.type === "remove" || event.info.parentID || typeof event.info.time.archived === "number") {
    if (index === -1) return sessions
    return sessions.toSpliced(index, 1)
  }
  if (index === -1) return [...sessions, event.info]
  return sessions.with(index, event.info)
}

function toSummary(session: SessionV2Info): AppSession {
  return normalizeSessionInfo(session)
}
