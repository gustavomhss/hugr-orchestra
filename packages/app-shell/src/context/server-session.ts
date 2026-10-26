import { Binary } from "@orchestra/core/util/binary"
import { retry } from "@orchestra/core/util/retry"
import type { SessionMessageInfo } from "@/session-types"

import type { ServerCurrentEvent } from "./server-sdk"
import type { PermissionRequest, PermissionV2Request, QuestionRequest } from "@/v2-types"
import type { Message, Part, SessionStatus, Todo } from "@/v2-wire"

import type { ServerApi } from "@/utils/server"
import { batch } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { message as cleanMessage } from "@/utils/diffs"
import { rootSession } from "@/utils/session-route"
import {
  decodeSessionLifecycleEvent,
  decodeSessionManagementEvent,
  normalizeSessionInfo,
  renameSession,
  type AppSession,
} from "@/utils/session"
import { compareMessages, messageKey, normalizeSessionMessages } from "@/utils/session-message"
import { dropSessionCaches, pickSessionCacheEvictions, SESSION_CACHE_LIMIT } from "./global-sync/session-cache"
import { normalizePermissionRequest } from "./global-sync/utils"
import { createV2SessionReducer, type V2SessionReduction } from "./server-session-v2-reducer"
import { executionStatus, sessionSelection, sessionUsage } from "./server-event-native"
import { eventSessionID, projectSessionManagementEvent } from "./session-management-state"
import { createSessionRecovery } from "./session-recovery"

type MessageApi = ServerApi["message"]

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const SKIP_PARTS = new Set(["patch", "step-start", "step-finish"])
const initialMessagePageSize = 20
const historyMessagePageSize = 200
const sessionInfoLimit = 2_048
const emptyIDs: ReadonlySet<string> = new Set()

function needsOlderTurnRoot(source: readonly SessionMessageInfo[]) {
  const boundary = source.find(
    (message) =>
      message.type === "user" ||
      message.type === "shell" ||
      message.type === "assistant" || message.type === "compaction" ||
      (message.type === "synthetic" && message.description?.trim()),
  )
  return boundary?.type === "assistant"
}

type OptimisticItem = {
  message: Message
  parts: Part[]
  confirmedParts?: Part[]
  confirmedMessage?: boolean
}

type MessagePage = {
  session: Message[]
  part: { id: string; part: Part[] }[]
  source?: SessionMessageInfo[]
  sourceMode?: "latest" | "older"
  projectSource?: boolean
  cursor?: string
  complete: boolean
}

function wireMessageSource(items: { info: Message; parts: Part[] }[]): SessionMessageInfo[] {
  return items
    .slice()
    .sort((a, b) => compareMessages(a.info, b.info))
    .map((item) => {
      if (item.info.role === "user") {
        return {
          id: item.info.id,
          type: "user" as const,
          text: item.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
          time: item.info.time,
        }
      }
      return {
        id: item.info.id,
        type: "assistant" as const,
        agent: item.info.agent ?? item.info.mode,
        model: { id: item.info.modelID, providerID: item.info.providerID, variant: item.info.variant },
        content: [],
        time: item.info.time,
      }
    })
}

// The markers describe the current HTTP attempt.
type MessageLoadState = {
  touchedMessages: Set<string>
  removedMessages: Set<string>
  retainedMessages: Set<string>
  touchedParts: Map<string, Set<string>>
  removedParts: Map<string, Set<string>>
  optimisticParts: Map<string, Set<string>>
  orphanParents: Set<string>
  clearedMessageParts: Set<string>
  touchedSource: Set<string>
}

type MessageLoadBaseline = Pick<
  MessageLoadState,
  "touchedMessages" | "retainedMessages" | "touchedParts" | "clearedMessageParts"
>

function mergeOptimisticPage(page: MessagePage, items: OptimisticItem[]) {
  if (items.length === 0) return { ...page, observed: [] as { messageID: string; parts: Part[] }[] }
  const session = [...page.session]
  const part = new Map(page.part.map((item) => [item.id, item.part]))
  const observed: { messageID: string; parts: Part[] }[] = []
  for (const item of items) {
    const result = Binary.search(session, messageKey(item.message), messageKey)
    const found = result.found
    if (!found) session.splice(result.index, 0, item.message)
    const current = part.get(item.message.id)
    const confirmed = found ? item.parts.filter((part) => current?.some((value) => value.id === part.id)) : []
    if (found) observed.push({ messageID: item.message.id, parts: confirmed })
    part.set(
      item.message.id,
      merge(
        found ? (current ?? []) : merge(item.confirmedParts ?? [], current ?? []),
        item.parts.filter((part) => !confirmed.includes(part)),
      ),
    )
  }
  return {
    ...page,
    session,
    part: [...part.entries()].sort((a, b) => cmp(a[0], b[0])).map(([id, parts]) => ({ id, part: parts })),
    observed,
  }
}

function runInflight(map: Map<string, Promise<void>>, key: string, task: () => Promise<void>) {
  const pending = map.get(key)
  if (pending) return pending
  const promise = task().finally(() => {
    if (map.get(key) === promise) map.delete(key)
  })
  map.set(key, promise)
  return promise
}

// Keeps the order of `a`, replacing items in place and appending new ones: part order is content order, not ID order.
function merge<T extends { id: string }>(a: readonly T[], b: readonly T[]) {
  const items = new Map(a.map((item) => [item.id, item] as const))
  for (const item of b) items.set(item.id, item)
  return [...items.values()]
}

function reconcileFetched<T extends { id: string }>(
  fetched: T[],
  current: readonly T[],
  options: {
    touched?: ReadonlySet<string>
    retained?: ReadonlySet<string>
    removed?: ReadonlySet<string>
    preserveUnfetched?: boolean | ((item: T) => boolean)
    compare?: (a: T, b: T) => number
  } = {},
) {
  const result = new Map(fetched.map((item) => [item.id, item]))
  const live = new Map(current.map((item) => [item.id, item]))
  if (options.preserveUnfetched) {
    for (const item of current) {
      if (!result.has(item.id) && (options.preserveUnfetched === true || options.preserveUnfetched(item)))
        result.set(item.id, item)
    }
  }
  for (const id of options.retained ?? emptyIDs) {
    if (result.has(id)) continue
    const item = live.get(id)
    if (item) result.set(id, item)
  }
  // Events observed while the request is pending are the freshest client state for those identities.
  for (const id of options.touched ?? emptyIDs) {
    const item = live.get(id)
    if (item) result.set(id, item)
    if (!item) result.delete(id)
  }
  for (const id of options.removed ?? emptyIDs) result.delete(id)
  const items = [...result.values()]
  return options.compare ? items.sort(options.compare) : items
}

type TodoRead = (sessionID: string) => Promise<readonly { content: string; status: string; priority: string }[]>

export function createServerSession(
  sessionApi: Pick<ServerApi["session"], "get" | "message">,
  messageApi: MessageApi,
  options: { retry?: typeof retry; todo: TodoRead },
) {
  const [data, setData] = createStore({
    info: {} as Record<string, AppSession | undefined>,
    session_status: {} as Record<string, SessionStatus>,
    todo: {} as Record<string, Todo[]>,
    permission: {} as Record<string, PermissionRequest[]>,
    question: {} as Record<string, QuestionRequest[]>,
    message: {} as Record<string, Message[]>,
    session_message: {} as Record<string, SessionMessageInfo[]>,
    part: {} as Record<string, Part[]>,
    session_working(id: string) {
      return (this.session_status[id]?.type ?? "idle") !== "idle"
    },
  })
  const requests = new Map<string, Promise<AppSession>>()
  const inflight = new Map<string, Promise<void>>()
  const inflightTodo = new Map<string, Promise<void>>()
  const optimistic = new Map<string, Map<string, OptimisticItem>>()
  const v2 = createV2SessionReducer()
  const messageLoads = new Map<string, MessageLoadState>()
  const pendingParts = new Map<string, Map<string, Set<string>>>()
  const orphanParts = new Map<string, Set<string>>()
  const deleteMessageParts = (cache: { part: Record<string, Part[] | undefined> }, messageID: string) => {
    delete cache.part[messageID]
  }
  const seen = new Set<string>()
  const infoSeen = new Set<string>()
  const pinned = new Map<string, number>()
  const generations = new Map<string, object>()
  const [meta, setMeta] = createStore({
    limit: {} as Record<string, number | undefined>,
    cursor: {} as Record<string, string | undefined>,
    complete: {} as Record<string, boolean | undefined>,
    loading: {} as Record<string, boolean | undefined>,
    at: {} as Record<string, number | undefined>,
  })

  const indexWireMessage = (message: Message) => {
    const current = data.session_message[message.sessionID] ?? []
    if (current.some((item) => item.id === message.id)) return
    setData(
      "session_message",
      message.sessionID,
      reconcile([...current, ...wireMessageSource([{ info: message, parts: [] }])]),
    )
  }

  const remember = (session: AppSession) => {
    setData("info", session.id, reconcile(recovery.merge(session)))
    infoSeen.delete(session.id)
    infoSeen.add(session.id)
    if (infoSeen.size > sessionInfoLimit) {
      const preserve = protectedSessions()
      for (const sessionID of preserve) {
        let current = data.info[sessionID]
        while (current) {
          preserve.add(current.id)
          current = current.parentID ? data.info[current.parentID] : undefined
        }
      }
      const stale: string[] = []
      for (const sessionID of infoSeen) {
        if (infoSeen.size - stale.length <= sessionInfoLimit) break
        if (!preserve.has(sessionID)) stale.push(sessionID)
      }
      stale.forEach((sessionID) => infoSeen.delete(sessionID))
      stale.forEach((sessionID) => generations.delete(sessionID))
      setData(
        "info",
        produce((draft) => stale.forEach((sessionID) => delete draft[sessionID])),
      )
    }
    return data.info[session.id]!
  }

  const recovery = createSessionRecovery({
    requests,
    generations,
    read: (sessionID) => data.info[sessionID],
    source: "canonical",
    request: (sessionID) => sessionApi.get({ sessionID }).then(normalizeSessionInfo),
    retain: remember,
    busy: (sessionID) => messageLoads.has(sessionID) || inflight.has(sessionID) || inflightTodo.has(sessionID),
  })

  const peekLineage = (sessionID: string) => {
    const session = data.info[sessionID]
    if (!session) return
    const seen = new Set([session.id])
    let root = session
    while (root.parentID) {
      if (seen.has(root.parentID)) throw new Error(`Session parent cycle: ${root.parentID}`)
      seen.add(root.parentID)
      const parent = data.info[root.parentID]
      if (!parent) return
      root = parent
    }
    return { session, root }
  }

  const clearOptimistic = (sessionID: string, messageID?: string) => {
    if (!messageID) {
      optimistic.delete(sessionID)
      return
    }
    const items = optimistic.get(sessionID)
    if (!items) return
    items.delete(messageID)
    if (items.size === 0) optimistic.delete(sessionID)
  }

  const clearOptimisticPart = (sessionID: string, messageID: string, partID: string) => {
    const items = optimistic.get(sessionID)
    const item = items?.get(messageID)
    if (!items || !item) return
    const parts = item.parts.filter((part) => part.id !== partID)
    const confirmedParts = item.confirmedParts?.filter((part) => part.id !== partID)
    if (parts.length === 0) {
      clearOptimistic(sessionID, messageID)
      return
    }
    items.set(messageID, { ...item, parts, confirmedParts, confirmedMessage: true })
  }

  const confirmOptimisticPart = (sessionID: string, messageID: string, part: Part) => {
    const items = optimistic.get(sessionID)
    const item = items?.get(messageID)
    if (!items || !item) return
    const parts = item.parts.filter((value) => value.id !== part.id)
    if (parts.length === 0) {
      clearOptimistic(sessionID, messageID)
      return
    }
    items.set(messageID, {
      ...item,
      parts,
      confirmedParts: merge(item.confirmedParts ?? [], [part]),
      confirmedMessage: true,
    })
  }

  const confirmOptimistic = (sessionID: string, messageID: string, confirmedParts: Part[]) => {
    const items = optimistic.get(sessionID)
    const item = items?.get(messageID)
    if (!items || !item) return
    const confirmed = new Set(confirmedParts.map((part) => part.id))
    const parts = item.parts.filter((part) => !confirmed.has(part.id))
    if (parts.length === 0) {
      clearOptimistic(sessionID, messageID)
      return
    }
    items.set(messageID, {
      ...item,
      parts,
      confirmedParts: merge(item.confirmedParts ?? [], confirmedParts),
      confirmedMessage: true,
    })
  }

  const trackPartChange = (sessionID: string, messageID: string, partID: string) => {
    const load = messageLoads.get(sessionID)
    if (!load) return
    // A part event keeps an existing parent when the fetched page omits it without overriding fetched metadata.
    const messages = data.message[sessionID]
    if (messages?.some((message) => message.id === messageID)) load.retainedMessages.add(messageID)
    const parts = load.touchedParts.get(messageID)
    if (parts) {
      parts.add(partID)
      return
    }
    load.touchedParts.set(messageID, new Set([partID]))
  }

  const resetMessageLoad = (sessionID: string, load: MessageLoadState, baseline?: MessageLoadBaseline) => {
    load.touchedMessages.clear()
    load.retainedMessages.clear()
    load.touchedParts.clear()
    load.clearedMessageParts.clear()
    for (const messageID of load.removedMessages) {
      load.touchedMessages.add(messageID)
      load.clearedMessageParts.add(messageID)
    }
    for (const [messageID, parts] of load.removedParts) {
      const touched = load.touchedParts.get(messageID) ?? new Set<string>()
      parts.forEach((partID) => touched.add(partID))
      load.touchedParts.set(messageID, touched)
      const messages = data.message[sessionID]
      if (messages?.some((message) => message.id === messageID)) load.retainedMessages.add(messageID)
    }
    for (const [messageID, parts] of load.optimisticParts) {
      load.removedMessages.delete(messageID)
      load.clearedMessageParts.add(messageID)
      load.touchedMessages.add(messageID)
      const touched = load.touchedParts.get(messageID) ?? new Set<string>()
      parts.forEach((partID) => touched.add(partID))
      load.touchedParts.set(messageID, touched)
    }
    baseline?.touchedMessages.forEach((messageID) => load.touchedMessages.add(messageID))
    baseline?.retainedMessages.forEach((messageID) => load.retainedMessages.add(messageID))
    baseline?.clearedMessageParts.forEach((messageID) => load.clearedMessageParts.add(messageID))
    baseline?.touchedParts.forEach((parts, messageID) => {
      const touched = load.touchedParts.get(messageID) ?? new Set<string>()
      parts.forEach((partID) => touched.add(partID))
      load.touchedParts.set(messageID, touched)
    })
  }

  const messageLoadBaseline = (load: MessageLoadState, exclude: string): MessageLoadBaseline => ({
    touchedMessages: new Set([...load.touchedMessages].filter((messageID) => messageID !== exclude)),
    retainedMessages: new Set([...load.retainedMessages].filter((messageID) => messageID !== exclude)),
    touchedParts: new Map(
      [...load.touchedParts]
        .filter(([messageID]) => messageID !== exclude)
        .map(([messageID, parts]) => [messageID, new Set(parts)]),
    ),
    clearedMessageParts: new Set([...load.clearedMessageParts].filter((messageID) => messageID !== exclude)),
  })

  const evict = (sessionIDs: string[]) => {
    if (sessionIDs.length === 0) return
    const evicted = new Set(sessionIDs)
    sessionIDs.forEach((sessionID) => {
      generations.delete(sessionID)
      clearOptimistic(sessionID)
      requests.delete(sessionID)
      inflight.delete(sessionID)
      inflightTodo.delete(sessionID)
      messageLoads.delete(sessionID)
      v2.clear(sessionID)
      pendingParts.delete(sessionID)
      orphanParts.delete(sessionID)
    })
    setData(
      produce((draft) => {
        dropSessionCaches(draft, sessionIDs)
      }),
    )
    setMeta(
      produce((draft) => {
        for (const sessionID of sessionIDs) {
          delete draft.limit[sessionID]
          delete draft.cursor[sessionID]
          delete draft.complete[sessionID]
          delete draft.loading[sessionID]
          delete draft.at[sessionID]
        }
      }),
    )
  }

  const protectedSessions = () =>
    new Set([
      ...pinned.keys(),
      ...requests.keys(),
      ...inflight.keys(),
      ...inflightTodo.keys(),
      ...messageLoads.keys(),
      ...optimistic.keys(),
      ...Object.entries(data.permission)
        .filter(([, items]) => items.length > 0)
        .map(([sessionID]) => sessionID),
      ...Object.entries(data.question)
        .filter(([, items]) => items.length > 0)
        .map(([sessionID]) => sessionID),
      ...Object.entries(data.session_status)
        .filter(([, status]) => status.type !== "idle")
        .map(([sessionID]) => sessionID),
    ])

  const touch = (sessionID: string) =>
    evict(
      pickSessionCacheEvictions({ seen, keep: sessionID, limit: SESSION_CACHE_LIMIT, preserve: protectedSessions() }),
    )

  const fetchMessages = async (sessionID: string, limit: number, before?: string, onAttempt?: () => void) => {
    const request = (cursor?: string) =>
      (options.retry ?? retry)(() => {
        onAttempt?.()
        return messageApi.list(cursor ? { sessionID, limit, cursor } : { sessionID, limit, order: "desc" })
      })
    const first = await request(before)
    const pages = [first]
    while (pages.at(-1)?.cursor.next && needsOlderTurnRoot(pages.flatMap((page) => page.data).toReversed())) {
      const response = await request(pages.at(-1)!.cursor.next ?? undefined)
      pages.push(response)
      if (!response.data.length) break
    }
    const response = pages.at(-1)!
    const source = pages.flatMap((page) => page.data).toReversed()
    const normalized = normalizeSessionMessages(sessionID, source)
    return {
      session: normalized.messages.sort(compareMessages),
      part: [...normalized.parts.entries()]
        .map(([id, part]) => ({ id, part: part.sort((a, b) => cmp(a.id, b.id)) }))
        .sort((a, b) => cmp(a.id, b.id)),
      source,
      sourceMode: before ? ("older" as const) : ("latest" as const),
      projectSource: true,
      cursor: response.cursor.next ?? undefined,
      complete: response.data.length === 0,
    }
  }

  const fetchMessage = async (sessionID: string, messageID: string, onAttempt?: () => void) => {
    const response = await (options.retry ?? retry)(() => {
      onAttempt?.()
      return sessionApi.message({ sessionID, messageID })
    })
    const normalized = normalizeSessionMessages(sessionID, [response])
    const message = normalized.messages[0]
    if (!message) throw new Error(`Message not found: ${messageID}`)
    return { message, parts: normalized.parts.get(messageID) ?? [] }
  }

  const replaceMessages = (sessionID: string, messages: Message[]) => {
    const messageIDs = new Set(messages.map((message) => message.id))
    const dropped = (data.message[sessionID] ?? []).filter((message) => !messageIDs.has(message.id))
    setData("message", sessionID, reconcile(messages, { key: "id" }))
    setData(
      produce((draft) => {
        for (const message of dropped) deleteMessageParts(draft, message.id)
      }),
    )
    return messageIDs
  }

  const replaceParts = (
    sessionID: string,
    items: MessagePage["part"],
    messageIDs: Set<string>,
    load?: MessageLoadState,
  ) => {
    for (const item of items) {
      if (!messageIDs.has(item.id)) continue
      const fetched = load?.clearedMessageParts.has(item.id)
        ? []
        : item.part.filter((part) => !SKIP_PARTS.has(part.type))
      const pending = pendingParts.get(sessionID)?.get(item.id)
      const touched = new Set([...(load?.touchedParts.get(item.id) ?? []), ...(pending ?? [])])
      const parts = reconcileFetched(fetched, data.part[item.id] ?? [], { touched })
      if (!parts.length) {
        orphanParts.get(sessionID)?.delete(item.id)
        setData(produce((draft) => deleteMessageParts(draft, item.id)))
        continue
      }
      setData("part", item.id, reconcile(parts, { key: "id" }))
      orphanParts.get(sessionID)?.delete(item.id)
    }
  }

  const applyMessagePage = (
    sessionID: string,
    page: MessagePage,
    load: MessageLoadState | undefined,
    preserveUnfetched: boolean | ((message: Message) => boolean),
    cleanupOrphans: boolean,
  ) => {
    const source = page.source
      ? (() => {
          const incoming = new Map(page.source.map((message) => [message.id, message]))
          const existing = data.session_message[sessionID] ?? []
          const current = existing.filter((message) => !incoming.has(message.id))
          const live = new Map(existing.map((message) => [message.id, message]))
          return (page.sourceMode === "older" ? [...page.source, ...current] : [...current, ...page.source]).map(
            (message) => (load?.touchedSource.has(message.id) ? (live.get(message.id) ?? message) : message),
          )
        })()
      : undefined
    const projected =
      page.projectSource && source
        ? (() => {
            const normalized = normalizeSessionMessages(sessionID, source)
            return {
              ...page,
              session: normalized.messages.sort(compareMessages),
              part: [...normalized.parts.entries()]
                .map(([id, part]) => ({ id, part }))
                .sort((a, b) => cmp(a.id, b.id)),
            }
          })()
        : page
    const merged = mergeOptimisticPage(projected, [...(optimistic.get(sessionID)?.values() ?? [])])
    merged.observed.forEach((item) => {
      if (!load?.clearedMessageParts.has(item.messageID)) confirmOptimistic(sessionID, item.messageID, item.parts)
    })
    const messages = reconcileFetched(merged.session, data.message[sessionID] ?? [], {
      touched: load?.touchedMessages,
      retained: load?.retainedMessages,
      removed: load?.removedMessages,
      preserveUnfetched,
      compare: compareMessages,
    })
    batch(() => {
      if (source) setData("session_message", sessionID, reconcile(source))
      const messageIDs = replaceMessages(sessionID, messages)
      replaceParts(sessionID, merged.part, messageIDs, load)
      const orphans = orphanParts.get(sessionID)
      if (cleanupOrphans && page.complete && orphans) {
        for (const messageID of orphans) {
          if (!messageIDs.has(messageID)) setData(produce((draft) => deleteMessageParts(draft, messageID)))
        }
        orphanParts.delete(sessionID)
      }
      setMeta("limit", sessionID, messages.length)
      setMeta("cursor", sessionID, merged.cursor)
      setMeta("complete", sessionID, merged.complete)
      setMeta("at", sessionID, Date.now())
    })
  }

  const loadMessages = async (sessionID: string, limit: number, before?: string, mode?: "replace" | "prepend") => {
    if (meta.loading[sessionID]) return
    const active = recovery.generation(sessionID)
    const load: MessageLoadState = {
      touchedMessages: new Set(),
      removedMessages: new Set(),
      retainedMessages: new Set(),
      touchedParts: new Map(),
      removedParts: new Map(),
      optimisticParts: new Map(),
      orphanParents: new Set(),
      clearedMessageParts: new Set(),
      touchedSource: new Set(),
    }
    messageLoads.set(sessionID, load)
    setMeta("loading", sessionID, true)
    let applied = false
    try {
      const page = await fetchMessages(sessionID, limit, before, () => resetMessageLoad(sessionID, load))
      const first = page.session.reduce<Message | undefined>(
        (oldest, message) => (!oldest || compareMessages(message, oldest) < 0 ? message : oldest),
        undefined,
      )
      if (generations.get(sessionID) !== active) return

      const parents = [] as Awaited<ReturnType<typeof fetchMessage>>[]
      if (mode !== "prepend") {
        const users = new Set([
          ...page.session.filter((message) => message.role === "user").map((message) => message.id),
          ...(data.message[sessionID] ?? [])
            .filter((message) => {
              if (message.role !== "user") return false
              const item = optimistic.get(sessionID)?.get(message.id)
              return load.touchedMessages.has(message.id) && (!item || item.confirmedMessage === true)
            })
            .map((message) => message.id),
        ])
        const parentIDs = [
          ...new Set(
            page.session.flatMap((message) =>
              message.role === "assistant" && !users.has(message.parentID) ? [message.parentID] : [],
            ),
          ),
        ]
        for (const parentID of parentIDs) {
          if (generations.get(sessionID) !== active) break
          const parent = await fetchMessage(sessionID, parentID, () =>
            resetMessageLoad(sessionID, load, messageLoadBaseline(load, parentID)),
          ).catch((error) => {
            const cause = error instanceof Error && typeof error.cause === "object" ? error.cause : undefined
            if (cause && "status" in cause && cause.status === 404) {
              load.removedMessages.add(parentID)
              return
            }
            throw error
          })
          if (!parent) continue
          if (parent.message.role !== "user") throw new Error(`Assistant parent is not a user message: ${parentID}`)
          parents.push(parent)
        }
      }
      if (generations.get(sessionID) !== active) return
      const result =
        mode === "prepend"
          ? page
          : {
              ...page,
              session: merge(
                page.session,
                parents.map((parent) => parent.message),
              ).sort(compareMessages),
              part: merge(
                page.part,
                parents.map((parent) => ({ id: parent.message.id, part: parent.parts })),
              ),
            }
      const preserveUnfetched =
        mode === "prepend" ||
        (!result.complete && (!first || ((message: Message) => compareMessages(message, first) < 0)))
      applyMessagePage(
        sessionID,
        result,
        messageLoads.get(sessionID) === load ? load : undefined,
        preserveUnfetched,
        mode !== "prepend",
      )
      applied = true
    } finally {
      if (!applied && generations.get(sessionID) === active && messageLoads.get(sessionID) === load) {
        for (const messageID of load.orphanParents) {
          if (!orphanParts.get(sessionID)?.has(messageID)) continue
          setData(produce((draft) => deleteMessageParts(draft, messageID)))
          orphanParts.get(sessionID)?.delete(messageID)
        }
        if (orphanParts.get(sessionID)?.size === 0) orphanParts.delete(sessionID)
      }
      if (messageLoads.get(sessionID) === load) messageLoads.delete(sessionID)
      if (generations.get(sessionID) === active) setMeta("loading", sessionID, false)
    }
  }

  const sync = (sessionID: string, options?: { force?: boolean; messageLimit?: number }) => {
    touch(sessionID)
    return runInflight(inflight, sessionID, async () => {
      const active = recovery.generation(sessionID)
      const cached = data.message[sessionID] !== undefined && meta.limit[sessionID] !== undefined
      if (cached && data.info[sessionID] && !options?.force) return
      await Promise.all([
        recovery.resolve(sessionID, options).catch((error: unknown) => {
          if (generations.get(sessionID) !== active && error instanceof DOMException && error.name === "AbortError") return
          throw error
        }),
        cached && !options?.force
          ? Promise.resolve()
          : loadMessages(sessionID, options?.messageLimit ?? meta.limit[sessionID] ?? initialMessagePageSize),
      ])
    })
  }

  const prefetch = async (sessionID: string, limit: number) => {
    touch(sessionID)
    await inflight.get(sessionID)
    if (
      Date.now() - (meta.at[sessionID] ?? 0) <= 15_000 &&
      (meta.complete[sessionID] || (data.message[sessionID]?.length ?? 0) >= limit)
    )
      return
    await runInflight(inflight, sessionID, () => loadMessages(sessionID, limit))
  }

  // Transcript store writes: projectV2 maps each touched V2 message onto these view-model rows.
  const transcript = {
    putMessage(message: Message) {
      const info = cleanMessage(message)
      indexWireMessage(info)
      const load = messageLoads.get(info.sessionID)
      load?.touchedMessages.add(info.id)
      load?.removedMessages.delete(info.id)
      const items = optimistic.get(info.sessionID)
      const item = items?.get(info.id)
      if (items && item) {
        if (item.parts.length === 0) clearOptimistic(info.sessionID, info.id)
        if (item.parts.length > 0) items.set(info.id, { ...item, confirmedMessage: true })
      }
      const orphans = orphanParts.get(info.sessionID)
      orphans?.delete(info.id)
      if (orphans?.size === 0) orphanParts.delete(info.sessionID)
      const messages = data.message[info.sessionID]
      if (!messages) {
        setData("message", info.sessionID, [info])
        return
      }
      const result = Binary.search(messages, messageKey(info), messageKey)
      if (result.found) setData("message", info.sessionID, result.index, reconcile(info))
      if (!result.found)
        setData("message", info.sessionID, (value = []) => {
          const next = value.slice()
          next.splice(result.index, 0, info)
          return next
        })
    },
    putPart(part: Part) {
      if (SKIP_PARTS.has(part.type)) return
      const messages = data.message[part.sessionID]
      const load = messageLoads.get(part.sessionID)
      const missing = !messages?.some((message) => message.id === part.messageID)
      // Outside a page load, accepting a part without its ordered parent event would create an unbounded orphan.
      if (missing && (!load || load.clearedMessageParts.has(part.messageID))) return
      if (missing) {
        const orphans = orphanParts.get(part.sessionID) ?? new Set<string>()
        orphans.add(part.messageID)
        orphanParts.set(part.sessionID, orphans)
        load?.orphanParents.add(part.messageID)
      }
      const removed = load?.removedParts.get(part.messageID)
      removed?.delete(part.id)
      if (removed?.size === 0) load?.removedParts.delete(part.messageID)
      const pending = pendingParts.get(part.sessionID)?.get(part.messageID)
      pending?.delete(part.id)
      if (pending?.size === 0) pendingParts.get(part.sessionID)?.delete(part.messageID)
      if (pendingParts.get(part.sessionID)?.size === 0) pendingParts.delete(part.sessionID)
      const optimistic = load?.optimisticParts.get(part.messageID)
      optimistic?.delete(part.id)
      if (optimistic?.size === 0) load?.optimisticParts.delete(part.messageID)
      trackPartChange(part.sessionID, part.messageID, part.id)
      confirmOptimisticPart(part.sessionID, part.messageID, part)
      const parts = data.part[part.messageID]
      if (!parts) {
        setData("part", part.messageID, [part])
        return
      }
      const index = parts.findIndex((item) => item.id === part.id)
      if (index >= 0) setData("part", part.messageID, index, reconcile(part))
      if (index < 0) setData("part", part.messageID, (value = []) => [...value, part])
    },
    dropPart(props: { sessionID: string; messageID: string; partID: string }) {
      // Part removal is event-only on the server, so its tombstone lasts until a later update or eviction.
      const pending = pendingParts.get(props.sessionID) ?? new Map<string, Set<string>>()
      const parts = pending.get(props.messageID) ?? new Set<string>()
      parts.add(props.partID)
      pending.set(props.messageID, parts)
      pendingParts.set(props.sessionID, pending)
      const load = messageLoads.get(props.sessionID)
      if (load) {
        const parts = load.removedParts.get(props.messageID) ?? new Set<string>()
        parts.add(props.partID)
        load.removedParts.set(props.messageID, parts)
        const optimistic = load.optimisticParts.get(props.messageID)
        optimistic?.delete(props.partID)
        if (optimistic?.size === 0) load.optimisticParts.delete(props.messageID)
      }
      trackPartChange(props.sessionID, props.messageID, props.partID)
      clearOptimisticPart(props.sessionID, props.messageID, props.partID)
      setData(
        produce((draft) => {
          const parts = draft.part[props.messageID]
          if (!parts) return
          const index = parts.findIndex((part) => part.id === props.partID)
          if (index >= 0) parts.splice(index, 1)
          if (parts.length === 0) delete draft.part[props.messageID]
        }),
      )
    },
  }

  const projectV2 = (reduction: V2SessionReduction) => {
    reduction.touched.forEach((messageID) => messageLoads.get(reduction.sessionID)?.touchedSource.add(messageID))
    setData("session_message", reduction.sessionID, reconcile(reduction.messages))
    if (reduction.touched.length === 0) return

    const touched = new Set(reduction.touched)
    let parentID: string | undefined
    for (const message of reduction.messages) {
      if (message.type === "user" || message.type === "compaction" || (message.type === "synthetic" && message.description?.trim()))
        parentID = message.id
      if (message.type === "shell") {
        if (touched.has(message.id)) touched.add(`${message.id}:assistant`)
        parentID = undefined
      }
      if (message.type === "assistant" && touched.has(message.id) && parentID) touched.add(parentID)
      if (message.type === "compaction" && touched.has(message.id)) touched.add(`${message.id}:assistant`)
    }

    const normalized = normalizeSessionMessages(reduction.sessionID, reduction.messages)
    batch(() => {
      for (const message of normalized.messages) {
        if (!touched.has(message.id)) continue
        transcript.putMessage(message)
      }
      for (const messageID of touched) {
        const next = normalized.parts.get(messageID) ?? []
        const nextIDs = new Set(next.map((part) => part.id))
        for (const part of next) {
          transcript.putPart(part)
        }
        for (const part of data.part[messageID] ?? []) {
          if (nextIDs.has(part.id)) continue
          transcript.dropPart({ sessionID: reduction.sessionID, messageID, partID: part.id })
        }
        // Updates append parts they have not seen, so put the message back in the server's content order.
        const order = new Map(next.map((part, index) => [part.id, index]))
        const rank = (part: Part) => order.get(part.id) ?? order.size
        const parts = data.part[messageID]
        if (parts?.some((part, index) => index > 0 && rank(parts[index - 1]!) > rank(part)))
          setData("part", messageID, parts.toSorted((a, b) => rank(a) - rank(b)))
      }
    })
  }

  const hydrateV2Message = (sessionID: string, messageID: string) => {
    void sessionApi
      .message({ sessionID, messageID })
      .then((message) => {
        const current = data.session_message[sessionID] ?? []
        const messages = [...current.filter((item) => item.id !== message.id), message].sort(compareMessages)
        projectV2({ sessionID, messages, touched: [message.id] })
      })
      .catch(() => {})
  }

  const applyV2 = (event: ServerCurrentEvent) => {
    const eventType: string = event.type
    if (eventType === "session.next.subagent.models.changed") return
    if (!("data" in event) || !("sessionID" in event.data) || typeof event.data.sessionID !== "string") return
    const sessionID = event.data.sessionID
    const reduction = v2.reduce(data.session_message[sessionID] ?? [], event)
    if (reduction) {
      projectV2(reduction)
      if (reduction.missing) hydrateV2Message(sessionID, reduction.missing)
    }

    const info = data.info[sessionID]
    if (event.type === "session.moved" && info)
      remember({
        ...info,
        projectID: event.data.projectID ?? info.projectID,
        workspaceID: event.data.location.workspaceID,
        directory: event.data.location.directory,
        path: event.data.subpath,
        time: { ...info.time, updated: event.created },
      })
    const usage = info && (sessionSelection(info, event) ?? sessionUsage(info, event))
    if (usage) remember(usage)
    // if (event.type === "session.archived") {
    //   if (info) remember({ ...info, time: { ...info.time, archived: event.created, updated: event.created } })
    //   evict([sessionID])
    // }
    const status = executionStatus(event)
    if (status) setData("session_status", sessionID, { type: status })
    if (event.type === "session.retry.scheduled")
      setData("session_status", sessionID, {
        type: "retry",
        attempt: event.data.attempt,
        message: event.data.error.message,
        next: event.data.at,
      })
    if (
      event.type === "session.revert.staged" ||
      event.type === "session.revert.cleared" ||
      event.type === "session.revert.committed"
    )
      void recovery.resolve(sessionID, { force: true }).catch(() => {})
  }

  const apply = (event: { type: string; properties?: unknown; current?: unknown }) => {
    const eventID = eventSessionID(event)
    if (eventID) {
      touch(eventID)
      if (
        !data.info[eventID] &&
        event.type !== "session.next.created" &&
        event.type !== "session.next.deleted" &&
        event.type !== "session.next.subagent.models.changed" &&
        event.type !== "session.next.archive.changed"
      )
        void recovery.resolve(eventID).catch(() => {})
    }
    switch (event.type) {
      case "session.next.subagent.models.changed":
        return recovery.applyPolicy(event)
      case "session.next.archive.changed": {
        const decoded = decodeSessionManagementEvent(event)
        if (!decoded) return
        const sessionID = decoded.properties.sessionID
        const active = recovery.generation(sessionID)
        return projectSessionManagementEvent(
          decoded,
          sessionID,
          data.info,
          remember,
          recovery.resolve,
          () => generations.get(sessionID) === active,
        )
      }
      case "session.next.created": {
        const decoded = decodeSessionLifecycleEvent(event)
        if (decoded?.type === "created") remember(decoded.info)
        return
      }
      case "session.next.renamed": {
        const decoded = decodeSessionLifecycleEvent(event)
        if (decoded?.type !== "renamed") return
        const info = data.info[decoded.sessionID]
        // A rename carries only the title; the guard above reads an unknown Session whole instead.
        if (info) remember(renameSession(info, decoded.title, decoded.timestamp))
        return
      }
      case "session.next.deleted": {
        const decoded = decodeSessionLifecycleEvent(event)
        if (decoded?.type !== "deleted") return
        recovery.forget(decoded.sessionID)
        infoSeen.delete(decoded.sessionID)
        setData(
          "info",
          produce((draft) => void delete draft[decoded.sessionID]),
        )
        evict([decoded.sessionID])
        return
      }
      case "todo.updated": {
        const props = event.properties as { sessionID: string; todos: Todo[] }
        setData("todo", props.sessionID, reconcile(props.todos, { key: "id" }))
        return
      }
      case "permission.v2.asked": {
        const permission = normalizePermissionRequest(event.properties as PermissionV2Request)
        const permissions = data.permission[permission.sessionID]
        if (!permissions) {
          setData("permission", permission.sessionID, [permission])
          return
        }
        const result = Binary.search(permissions, permission.id, (item) => item.id)
        if (result.found) setData("permission", permission.sessionID, result.index, reconcile(permission))
        if (!result.found)
          setData(
            "permission",
            permission.sessionID,
            produce((draft) => void draft.splice(result.index, 0, permission)),
          )
        return
      }
      case "permission.v2.replied": {
        const props = event.properties as { sessionID: string; requestID: string }
        setData(
          "permission",
          props.sessionID,
          produce((draft) => {
            if (!draft) return
            const result = Binary.search(draft, props.requestID, (item) => item.id)
            if (result.found) draft.splice(result.index, 1)
          }),
        )
        return
      }
      case "question.v2.asked": {
        const question = event.properties as QuestionRequest
        const questions = data.question[question.sessionID]
        if (!questions) {
          setData("question", question.sessionID, [question])
          return
        }
        const result = Binary.search(questions, question.id, (item) => item.id)
        if (result.found) setData("question", question.sessionID, result.index, reconcile(question))
        if (!result.found)
          setData(
            "question",
            question.sessionID,
            produce((draft) => void draft.splice(result.index, 0, question)),
          )
        return
      }
      case "question.v2.replied":
      case "question.v2.rejected": {
        const props = event.properties as { sessionID: string; requestID: string }
        setData(
          "question",
          props.sessionID,
          produce((draft) => {
            if (!draft) return
            const result = Binary.search(draft, props.requestID, (item) => item.id)
            if (result.found) draft.splice(result.index, 1)
          }),
        )
      }
    }
  }

  return {
    data,
    set: setData,
    get: (sessionID: string) => data.info[sessionID],
    peek: (sessionID: string) => data.info[sessionID],
    remember,
    resolve: (sessionID: string, options?: { force?: boolean }) => recovery.resolve(sessionID, options),
    lineage: {
      peek: peekLineage,
      async resolve(sessionID: string) {
        const session = await recovery.resolve(sessionID)
        return { session, root: await rootSession(session, recovery.resolve) }
      },
    },
    sync,
    prefetch,
    shouldPrefetch(sessionID: string, limit: number) {
      if (data.message[sessionID] === undefined) return true
      if (Date.now() - (meta.at[sessionID] ?? 0) > 15_000) return true
      if (meta.complete[sessionID]) return false
      return (meta.limit[sessionID] ?? 0) <= limit
    },
    fresh(sessionID: string, ttl: number) {
      return Date.now() - (meta.at[sessionID] ?? 0) <= ttl
    },
    optimistic: {
      add(input: { sessionID: string; message: Message; parts: Part[] }) {
        const parts = input.parts.filter((part) => !!part?.id && !SKIP_PARTS.has(part.type))
        const load = messageLoads.get(input.sessionID)
        if (load?.clearedMessageParts.has(input.message.id)) {
          const touched = load.touchedParts.get(input.message.id) ?? new Set<string>()
          parts.forEach((part) => touched.add(part.id))
          load.touchedParts.set(input.message.id, touched)
        }
        if (load) {
          load.removedMessages.delete(input.message.id)
          load.optimisticParts.set(input.message.id, new Set(parts.map((part) => part.id)))
        }
        const items = optimistic.get(input.sessionID)
        if (items) items.set(input.message.id, { ...input, parts, confirmedParts: [] })
        if (!items)
          optimistic.set(input.sessionID, new Map([[input.message.id, { ...input, parts, confirmedParts: [] }]]))
        setData("message", input.sessionID, (messages = []) => merge(messages, [input.message]).sort(compareMessages))
        setData("part", input.message.id, parts)
      },
      remove(input: { sessionID: string; messageID: string }) {
        const item = optimistic.get(input.sessionID)?.get(input.messageID)
        if (!item) return
        messageLoads.get(input.sessionID)?.optimisticParts.delete(input.messageID)
        clearOptimistic(input.sessionID, input.messageID)
        if (item.confirmedMessage) {
          const partIDs = new Set(item.parts.map((part) => part.id))
          setData(
            produce((draft) => {
              const parts = draft.part[input.messageID]
              if (!parts) return
              draft.part[input.messageID] = parts.filter((part) => !partIDs.has(part.id))
              if (draft.part[input.messageID]?.length === 0) delete draft.part[input.messageID]
            }),
          )
          return
        }
        setData("message", input.sessionID, (messages) => messages?.filter((message) => message.id !== input.messageID))
        setData(produce((draft) => deleteMessageParts(draft, input.messageID)))
      },
    },
    async todo(sessionID: string, request?: { force?: boolean }) {
      touch(sessionID)
      if (data.todo[sessionID] !== undefined && !request?.force) return
      return runInflight(inflightTodo, sessionID, () => {
        const active = recovery.generation(sessionID)
        const read = (): Promise<Todo[]> => options.todo(sessionID).then((todos) => [...todos])
        return (options.retry ?? retry)(read).then((todos) => {
          if (generations.get(sessionID) !== active) return
          setData("todo", sessionID, reconcile(todos, { key: "id" }))
        })
      })
    },
    history: {
      loaded: (sessionID: string) => meta.limit[sessionID] !== undefined && !meta.loading[sessionID],
      more: (sessionID: string) =>
        meta.limit[sessionID] !== undefined && !meta.complete[sessionID] && !!meta.cursor[sessionID],
      loading: (sessionID: string) => meta.loading[sessionID] ?? false,
      async loadMore(sessionID: string, count = historyMessagePageSize) {
        touch(sessionID)
        if (meta.loading[sessionID] || meta.complete[sessionID] || !meta.cursor[sessionID]) return
        await loadMessages(sessionID, count, meta.cursor[sessionID], "prepend")
      },
    },
    evict(sessionID: string) {
      if (protectedSessions().has(sessionID)) return
      seen.delete(sessionID)
      evict([sessionID])
    },
    pin(sessionID: string) {
      pinned.set(sessionID, (pinned.get(sessionID) ?? 0) + 1)
      touch(sessionID)
    },
    unpin(sessionID: string) {
      const count = pinned.get(sessionID)
      if (!count || count === 1) pinned.delete(sessionID)
      if (count && count > 1) pinned.set(sessionID, count - 1)
    },
    apply,
    applyV2,
    transcript,
  }
}

export type ServerSession = ReturnType<typeof createServerSession>
