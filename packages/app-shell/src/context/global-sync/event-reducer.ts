import { Binary } from "@orchestra/core/util/binary"
import { produce, reconcile, type SetStoreFunction, type Store } from "solid-js/store"
import type { PermissionV2Request, QuestionRequest } from "@/v2-types"
import type { Session, Todo } from "@/v2-wire"

import type { State, VcsCache } from "./types"
import { trimSessions } from "./session-trim"
import { dropSessionCaches } from "./session-cache"
import { normalizePermissionRequest } from "./utils"
import {
  applySessionManagementEvent,
  decodeSessionLifecycleEvent,
  decodeSessionManagementEvent,
  mergeSessionManagementInfo,
  renameSession,
  type AppSession,
} from "@/utils/session"
import { sessionManagementFences } from "../session-management-state"

const SESSION_CONTENT_EVENTS = new Set([
  "todo.updated",
  "permission.v2.asked",
  "permission.v2.replied",
  "question.v2.asked",
  "question.v2.replied",
  "question.v2.rejected",
])

export function applyGlobalEvent(input: { event: { type: string }; refresh: () => void }) {
  if (input.event.type === "server.connected") input.refresh()
}

function cleanupSessionCaches(
  setStore: SetStoreFunction<State>,
  sessionID: string,
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void,
) {
  if (!sessionID) return
  setSessionTodo?.(sessionID, undefined)
  setStore(
    produce((draft) => {
      dropSessionCaches(draft, [sessionID])
    }),
  )
}

export function cleanupDroppedSessionCaches(
  store: Store<State>,
  setStore: SetStoreFunction<State>,
  next: Session[],
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void,
) {
  const keep = new Set(next.map((item) => item.id))
  const stale = [
    ...Object.keys(store.message),
    ...Object.keys(store.todo),
    ...Object.keys(store.permission),
    ...Object.keys(store.question),
    ...Object.keys(store.session_status),
    ...Object.values(store.part)
      .map((parts) => parts?.find((part) => !!part?.sessionID)?.sessionID)
      .filter((sessionID): sessionID is string => !!sessionID),
  ].filter((sessionID, index, list) => !keep.has(sessionID) && list.indexOf(sessionID) === index)
  if (stale.length === 0) return
  for (const sessionID of stale) {
    setSessionTodo?.(sessionID, undefined)
  }
  setStore(
    produce((draft) => {
      dropSessionCaches(draft, stale)
    }),
  )
}

type DirectoryEventInput = {
  event: { type: string; properties?: unknown; current?: unknown }
  store: Store<State>
  setStore: SetStoreFunction<State>
  push: (directory: string) => void
  directory: string
  loadReferences?: () => void
  vcsCache?: VcsCache
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void
  retainedLimit?: number
  sessionContent?: boolean
  permission?: State["permission"]
  fenceOwner?: object
  readSession?: (sessionID: string) => AppSession | undefined
}

// Index one Session row; an archived row leaves the index. `counted` marks a newly created Session,
// which adds to the root total when it enters the index.
export function upsertDirectorySession(input: Omit<DirectoryEventInput, "event">, incoming: AppSession, counted = false) {
  const fences = sessionManagementFences(input.fenceOwner ?? input.store, input.directory)
  const result = Binary.search(input.store.session, incoming.id, (s) => s.id)
  const info = fences.merge(
    mergeSessionManagementInfo(input.readSession?.(incoming.id), incoming),
    result.found ? input.store.session[result.index] : undefined,
  )
  if (info.time.archived !== undefined) {
    if (!result.found) return
    input.setStore("session", produce((draft) => void draft.splice(result.index, 1)))
    cleanupSessionCaches(input.setStore, info.id, input.setSessionTodo)
    if (!info.parentID) input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
    return
  }
  if (result.found) {
    input.setStore("session", result.index, reconcile(info))
    return
  }
  const next = input.store.session.slice()
  next.splice(result.index, 0, info)
  const limit = Math.max(input.store.limit, input.retainedLimit ?? 0)
  const trimmed = trimSessions(fences.visible(next), { limit, permission: input.permission ?? input.store.permission })
  input.setStore("session", reconcile(trimmed, { key: "id" }))
  cleanupDroppedSessionCaches(input.store, input.setStore, trimmed, input.setSessionTodo)
  if (counted && !info.parentID) input.setStore("sessionTotal", (value) => value + 1)
}

export function applyDirectoryEvent(input: DirectoryEventInput) {
  const event = input.event
  if (input.sessionContent === false && SESSION_CONTENT_EVENTS.has(event.type)) return
  const fences = sessionManagementFences(input.fenceOwner ?? input.store, input.directory)
  switch (event.type) {
    case "session.next.created": {
      const decoded = decodeSessionLifecycleEvent(event)
      if (decoded?.type !== "created") break
      upsertDirectorySession(input, decoded.info, true)
      break
    }
    case "session.next.renamed": {
      const decoded = decodeSessionLifecycleEvent(event)
      if (decoded?.type !== "renamed") break
      const result = Binary.search(input.store.session, decoded.sessionID, (s) => s.id)
      // A rename carries only the title, so an unindexed Session waits for its next canonical read.
      if (!result.found) break
      upsertDirectorySession(input, renameSession(input.store.session[result.index]!, decoded.title, decoded.timestamp))
      break
    }
    case "session.next.deleted": {
      const decoded = decodeSessionLifecycleEvent(event)
      if (decoded?.type !== "deleted") break
      fences.delete(decoded.sessionID)
      const result = Binary.search(input.store.session, decoded.sessionID, (s) => s.id)
      const info = result.found ? input.store.session[result.index] : undefined
      if (result.found) input.setStore("session", produce((draft) => void draft.splice(result.index, 1)))
      cleanupSessionCaches(input.setStore, decoded.sessionID, input.setSessionTodo)
      if (info?.parentID) break
      input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
      break
    }
    case "session.next.subagent.models.changed":
    case "session.next.archive.changed": {
      const decoded = decodeSessionManagementEvent(event)
      if (!decoded) break
      const properties = decoded.properties
      const result = Binary.search(input.store.session, properties.sessionID, (session) => session.id)
      if (!result.found) {
        // Metadata must outlive an absent row while an authoritative list is pending.
        if (fences.apply(decoded) && event.type === "session.next.archive.changed") input.push(input.directory)
        break
      }
      const row = input.store.session[result.index]!
      const current = fences.merge(row, input.readSession?.(row.id))
      const changed = applySessionManagementEvent(current, decoded)
      // Server and directory stores can share a row that this event already updated.
      const info = changed ? fences.merge(changed, current) : current
      if (info.time.archived !== undefined) {
        input.setStore("session", produce((draft) => void draft.splice(result.index, 1)))
        cleanupSessionCaches(input.setStore, info.id, input.setSessionTodo)
        if (!info.parentID) input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
        break
      }
      input.setStore("session", result.index, reconcile(info))
      break
    }
    case "session.moved": {
      const properties = event.properties as {
        sessionID: string
        location: { directory: string; workspaceID?: string }
        projectID?: string
        subpath?: string
      }
      const result = Binary.search(input.store.session, properties.sessionID, (session) => session.id)
      if (!result.found) break
      if (properties.location.directory === input.directory) {
        input.setStore("session", result.index, (session) => ({
          ...session,
          projectID: properties.projectID ?? session.projectID,
          workspaceID: properties.location.workspaceID,
          directory: properties.location.directory,
          path: properties.subpath,
          time: { ...session.time, updated: Date.now() },
        }))
        break
      }
      const info = input.store.session[result.index]
      input.setStore(
        "session",
        produce((draft) => void draft.splice(result.index, 1)),
      )
      if (!info?.parentID) input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
      break
    }
    case "todo.updated": {
      const props = event.properties as { sessionID: string; todos: Todo[] }
      input.setStore("todo", props.sessionID, reconcile(props.todos, { key: "id" }))
      input.setSessionTodo?.(props.sessionID, props.todos)
      break
    }
    case "vcs.branch.updated": {
      const props = event.properties as { branch?: string }
      if (input.store.vcs?.branch === props.branch) break
      const next = { ...input.store.vcs, branch: props.branch }
      input.setStore("vcs", next)
      if (input.vcsCache) input.vcsCache.setStore("value", next)
      break
    }
    case "permission.v2.asked": {
      const permission = normalizePermissionRequest(event.properties as PermissionV2Request)
      const permissions = input.store.permission[permission.sessionID]
      if (!permissions) {
        input.setStore("permission", permission.sessionID, [permission])
        break
      }
      const result = Binary.search(permissions, permission.id, (p) => p.id)
      if (result.found) {
        input.setStore("permission", permission.sessionID, result.index, reconcile(permission))
        break
      }
      input.setStore(
        "permission",
        permission.sessionID,
        produce((draft) => {
          draft.splice(result.index, 0, permission)
        }),
      )
      break
    }
    case "permission.v2.replied": {
      const props = event.properties as { sessionID: string; requestID: string }
      const permissions = input.store.permission[props.sessionID]
      if (!permissions) break
      const result = Binary.search(permissions, props.requestID, (p) => p.id)
      if (!result.found) break
      input.setStore(
        "permission",
        props.sessionID,
        produce((draft) => {
          draft.splice(result.index, 1)
        }),
      )
      break
    }
    case "question.v2.asked": {
      const question = event.properties as QuestionRequest
      const questions = input.store.question[question.sessionID]
      if (!questions) {
        input.setStore("question", question.sessionID, [question])
        break
      }
      const result = Binary.search(questions, question.id, (q) => q.id)
      if (result.found) {
        input.setStore("question", question.sessionID, result.index, reconcile(question))
        break
      }
      input.setStore(
        "question",
        question.sessionID,
        produce((draft) => {
          draft.splice(result.index, 0, question)
        }),
      )
      break
    }
    case "question.v2.replied":
    case "question.v2.rejected": {
      const props = event.properties as { sessionID: string; requestID: string }
      const questions = input.store.question[props.sessionID]
      if (!questions) break
      const result = Binary.search(questions, props.requestID, (q) => q.id)
      if (!result.found) break
      input.setStore(
        "question",
        props.sessionID,
        produce((draft) => {
          draft.splice(result.index, 1)
        }),
      )
      break
    }
    case "reference.updated": {
      input.loadReferences?.()
      break
    }
  }
}
