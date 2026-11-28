import type {
  Session,
  PermissionV2Request,
  QuestionV2Request,
  SessionMessage,
  Event,
} from "../types"
import { produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"
import { useArgs } from "./args"
import { batch, createEffect, on, onCleanup, onMount } from "solid-js"
import path from "path"
import { useKV } from "./kv"
import { usePermission } from "./permission"
import { isDemoRequest, settle } from "./demo"
import { applyEvent } from "./session-history"
import { createSyncStore, type SessionRevision } from "./sync-store"

function search<T>(items: T[], target: string, key: (item: T) => string) {
  let left = 0
  let right = items.length - 1
  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    const value = key(items[middle])
    if (value === target) return { found: true, index: middle }
    if (value < target) left = middle + 1
    else right = middle - 1
  }
  return { found: false, index: left }
}

function isNewer(revision: SessionRevision, previous?: SessionRevision) {
  if (!previous) return true
  if (revision.id === previous.id) return false
  if (revision.seq !== undefined && previous.seq !== undefined) return revision.seq > previous.seq
  return revision.timestamp >= previous.timestamp
}

function sameSelectionContext(left: Session, right: Session) {
  return left.agent === right.agent && left.model?.providerID === right.model?.providerID &&
    left.model?.id === right.model?.id && left.model?.variant === right.model?.variant &&
    left.location.directory === right.location.directory && left.location.workspaceID === right.location.workspaceID &&
    left.subpath === right.subpath
}

export const {
  context: SyncContext,
  use: useSync,
  provider: SyncProvider,
} = createSimpleContext({
  name: "Sync",
  init: () => {
    const startup = useTuiStartup()
    const kv = useKV()
    const permission = usePermission()
    const [store, setStore] = createSyncStore()

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()

    const fullSyncedSessions = new Set<string>()
    const syncingSessions = new Map<string, Promise<void>>()
    const trailing = new Map<string, { predecessor: Promise<void>; task: Promise<void> }>()
    const owners = new Map<string, object>()
    const metadataReads = new Map<string, { epoch: number; task: Promise<Session | undefined> }>()
    const pendingMoves = new Map<string, Set<object>>()
    const placements = new Map<string, SessionRevision & Pick<Session, "location" | "subpath">>()
    const titles = new Map<string, SessionRevision & Pick<Session, "title">>()
    const statusReads = new Set<Set<string>>()
    const lifetime = { disposed: false }
    const statusEpoch = () => Math.max(0, sdk.connectionEpoch() - 1)
    const statusChanged = (sessionID: string) => statusReads.forEach((touched) => touched.add(sessionID))
    // Message IDs that live events changed while a Session's history was being fetched.
    const hydratingSessions = new Map<string, Set<string>>()
    const pendingHistoryChanges = new Map<string, Set<string>>()
    // V2 messages per Session, newest first as the history route returns them; the store holds them oldest first.
    const history = new Map<string, SessionMessage[]>()
    const requestHydrations = new Set<Set<string>>()
    const autoReplies = new Set<string>()
    const settledRequests = new Set<string>()
    const requestLocations = new Map<string, { directory: string; workspaceID?: string }>()
    onCleanup(() => {
      lifetime.disposed = true
      owners.clear()
      metadataReads.clear()
      pendingMoves.clear()
      placements.clear()
      titles.clear()
      syncingSessions.clear()
      trailing.clear()
      hydratingSessions.clear()
      pendingHistoryChanges.clear()
      fullSyncedSessions.clear()
      history.clear()
      statusReads.clear()
    })

    async function readStatuses() {
      if (lifetime.disposed) return
      const epoch = statusEpoch()
      const touched = new Set<string>()
      statusReads.add(touched)
      try {
        const active = await sdk.catalog.status()
        if (lifetime.disposed || statusEpoch() !== epoch) return
        batch(() => {
          for (const sessionID of Object.keys(store.session_status)) {
            if (!touched.has(sessionID) && !active[sessionID])
              setStore("session_status", sessionID, reconcile({ type: "idle" }))
          }
          for (const sessionID of Object.keys(active)) {
            if (!touched.has(sessionID)) setStore("session_status", sessionID, reconcile(active[sessionID]))
          }
        })
      } finally {
        statusReads.delete(touched)
      }
    }

    function acceptPermission(request: PermissionV2Request) {
      if (permission.mode !== "auto") return false
      if (autoReplies.has(request.id)) return true
      autoReplies.add(request.id)
      void sdk.actions.reply({ sessionID: request.sessionID, requestID: request.id, reply: "once" }).catch((error) => {
        autoReplies.delete(request.id)
        console.error("tui permission reply failed", error)
      })
      return true
    }

    async function hydrateRequests(location: { directory: string; workspaceID?: string }, current = () => !lifetime.disposed) {
      const touched = new Set<string>()
      requestHydrations.add(touched)
      const results = await Promise.allSettled([
        sdk.api.permissions.listRequests({ location }).then((result) => {
          if (!current()) return
          const requests = result.data as PermissionV2Request[]
          for (const request of requests) requestLocations.set(request.sessionID, location)
          const sessions = new Set([
            ...requests.map((request) => request.sessionID),
            ...Object.keys(store.permission).filter((sessionID) => {
              const placement =
                requestLocations.get(sessionID) ?? store.session.find((session) => session.id === sessionID)?.location
              return (
                !placement ||
                (placement.directory === location.directory && placement.workspaceID === location.workspaceID)
              )
            }),
            ...store.session
              .filter(
                (session) =>
                  session.location.directory === location.directory &&
                  session.location.workspaceID === location.workspaceID,
              )
              .map((session) => session.id),
          ])
          for (const sessionID of sessions) {
            const merged = [
              ...requests.filter(
                (request) =>
                  request.sessionID === sessionID && !touched.has(request.id) && !settledRequests.has(request.id),
              ),
              ...(store.permission[sessionID] ?? []).filter((request) => touched.has(request.id)),
            ]
            setStore(
              "permission",
              sessionID,
              reconcile(
                merged.filter((request) => !acceptPermission(request)).toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
              ),
            )
          }
        }),
        sdk.api.questions.listRequests({ location }).then((result) => {
          if (!current()) return
          const requests = result.data as QuestionV2Request[]
          for (const request of requests) requestLocations.set(request.sessionID, location)
          const sessions = new Set([
            ...requests.map((request) => request.sessionID),
            ...Object.keys(store.question).filter((sessionID) => {
              const placement =
                requestLocations.get(sessionID) ?? store.session.find((session) => session.id === sessionID)?.location
              return (
                !placement ||
                (placement.directory === location.directory && placement.workspaceID === location.workspaceID)
              )
            }),
            ...store.session
              .filter(
                (session) =>
                  session.location.directory === location.directory &&
                  session.location.workspaceID === location.workspaceID,
              )
              .map((session) => session.id),
          ])
          for (const sessionID of sessions) {
            setStore(
              "question",
              sessionID,
              reconcile(
                [
                  ...requests.filter(
                    (request) =>
                      request.sessionID === sessionID && !touched.has(request.id) && !settledRequests.has(request.id),
                  ),
                  ...(store.question[sessionID] ?? []).filter((request) => touched.has(request.id)),
                ].toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
              ),
            )
          }
        }),
      ])
      requestHydrations.delete(touched)
      // A failed request read is retried when the Session opens or bootstrap runs again.
      for (const result of results)
        if (result.status === "rejected") console.error("tui pending request hydration failed", result.reason)
    }
    function hydrateSessionRequests(session: Session, current?: () => boolean) {
      const root = session.parentID ?? session.id
      const locations = new Map([session, ...store.session.filter((candidate) => candidate.id === root || candidate.parentID === root)].map((candidate) => [JSON.stringify([candidate.location.directory, candidate.location.workspaceID]), candidate.location]))
      return Promise.all([...locations.values()].map((location) => hydrateRequests(location, current)))
    }

    // Sessions with a compaction in progress, between its started and ended events.
    const compacting = new Set<string>()

    function projectHistory(sessionID: string) {
      setStore("message", sessionID, reconcile((history.get(sessionID) ?? []).toReversed()))
    }

    function refreshDiff(sessionID: string) {
      const active = owners.get(sessionID)
      if (!active || lifetime.disposed) return Promise.resolve()
      const session = getSession(sessionID)
      const files = new Set(
        (history.get(sessionID) ?? []).flatMap((message) =>
          message.type === "assistant" ? (message.snapshot?.files ?? []) : [],
        ),
      )
      return sdk.catalog
        .diff({ directory: session?.location.directory, workspace: session?.location.workspaceID }, files)
        .then((diff) => {
          if (!lifetime.disposed && owners.get(sessionID) === active) setStore("session_diff", sessionID, diff)
        })
    }

    function receiveHistory(event: Event) {
      if (!event.type.startsWith("session.next.")) return
      const sessionID = "sessionID" in event.data ? event.data.sessionID : undefined
      if (!sessionID) return
      if (!history.has(sessionID) && !hydratingSessions.has(sessionID)) return
      const messages = history.get(sessionID) ?? []
      if (!applyEvent(messages, event)) return
      history.set(sessionID, messages.slice(0, 100))
      ;(hydratingSessions.get(sessionID) ?? pendingHistoryChanges.get(sessionID))?.add(
        ("assistantMessageID" in event.data ? event.data.assistantMessageID : undefined) ?? messages[0].id,
      )
      if (store.message[sessionID] === undefined && hydratingSessions.has(sessionID)) return
      projectHistory(sessionID)
      if (event.type === "session.next.step.ended") void refreshDiff(sessionID)
    }

    function sessionListQuery(): { scope?: "project"; path?: string } {
      if (!kv.get("session_directory_filter_enabled", true)) return { scope: "project" }
      if (!project.data.instance.path.worktree || !project.data.instance.path.directory) return { scope: "project" }
      return {
        path: path
          .relative(path.resolve(project.data.instance.path.worktree), project.data.instance.path.directory)
          .replaceAll("\\", "/"),
      }
    }

    function listSessions() {
      const query = sessionListQuery()
      return sdk.catalog.sessions({
        workspace: project.workspace.current(),
        project: project.data.project.id,
        subpath: query.path || undefined,
      })
    }

    function withLiveMetadata(session: Session, baseline?: { agent?: string; model?: string; placement?: string; title?: string }) {
      const selection = store.session_selection[session.id]
      const placement = placements.get(session.id)
      const renamed = titles.get(session.id)
      const changed = (revision: SessionRevision | undefined, previous: string | undefined) =>
        revision && (baseline ? revision.id !== previous : revision.timestamp >= session.time.updated)
      const agent = changed(selection?.agent, baseline?.agent) ? selection?.agent : undefined
      const model = changed(selection?.model, baseline?.model) ? selection?.model : undefined
      const moved = changed(placement, baseline?.placement) ? placement : undefined
      const title = changed(renamed, baseline?.title) ? renamed : undefined
      if (!agent && !model && !moved && !title) return session
      return {
        ...session,
        agent: agent?.value ?? session.agent,
        model: model ? { ...model.value } : session.model,
        location: moved ? { ...moved.location } : session.location,
        subpath: moved ? moved.subpath : session.subpath,
        title: title?.title ?? session.title,
        time: {
          ...session.time,
          updated: Math.max(session.time.updated, agent?.timestamp ?? 0, model?.timestamp ?? 0,
            moved?.timestamp ?? 0, title?.timestamp ?? 0),
        },
      }
    }

    function replaceSessionList(sessions: Session[]) {
      if (lifetime.disposed) return
      setStore("session", reconcile(sessions.map((session) =>
        store.session_metadata[session.id]?.snapshot ?? withLiveMetadata(session))))
    }

    function getSession(sessionID: string) {
      const metadata = store.session_metadata[sessionID]
      if (metadata) return metadata.snapshot
      const match = search(store.session, sessionID, (session) => session.id)
      if (match.found) return store.session[match.index]
    }

    function publishSession(session: Session, http?: { epoch: number; updated: number }) {
      batch(() => {
        const metadata = store.session_metadata[session.id]
        if (http || metadata) setStore("session_metadata", session.id, reconcile({
          epoch: http?.epoch ?? metadata?.epoch,
          httpUpdated: http?.updated ?? metadata?.httpUpdated,
          snapshot: session,
        }))
        const match = search(store.session, session.id, (candidate) => candidate.id)
        if (match.found) setStore("session", match.index, reconcile(session))
        if (!match.found) setStore("session", produce((draft) => { draft.splice(match.index, 0, session) }))
      })
    }

    function selectionReady(sessionID: string) {
      return !lifetime.disposed && sdk.eventStreamReady() && sdk.binding().active &&
        store.session_metadata[sessionID]?.epoch === sdk.connectionEpoch()
    }

    function invalidateSelection(sessionID: string) {
      if (store.session_metadata[sessionID]?.epoch !== undefined)
        setStore("session_metadata", sessionID, "epoch", undefined)
    }

    function refreshSelection(sessionID: string): Promise<Session | undefined> {
      if (lifetime.disposed || pendingMoves.has(sessionID)) return Promise.resolve(undefined)
      const epoch = sdk.connectionEpoch()
      const pending = metadataReads.get(sessionID)
      if (pending?.epoch === epoch) return pending.task
      const current = (): boolean =>
        !lifetime.disposed && sdk.connectionEpoch() === epoch && metadataReads.get(sessionID)?.task === task
      async function read(confirmConflict: boolean): Promise<Session | undefined> {
        const selection = store.session_selection[sessionID]
        const baseline = {
          agent: selection?.agent?.id,
          model: selection?.model?.id,
          placement: placements.get(sessionID)?.id,
          title: titles.get(sessionID)?.id,
        }
        const snapshot = await sdk.catalog.session(sessionID)
        if (!current()) return
        const http = { epoch, updated: snapshot.time.updated }
        const live = withLiveMetadata(snapshot, baseline)
        const sameContext = sameSelectionContext(live, snapshot)
        // Commit and event publication can straddle the read. A fresh read after the conflicting event
        // verifies the result without treating either the arrival order or the wall clock as a snapshot cursor.
        if (!sameContext || live.title !== snapshot.title) {
          if (sameContext) publishSession(live, http)
          if (!sameContext) invalidateSelection(sessionID)
          if (confirmConflict) return read(false)
          return sameContext ? live : undefined
        }
        publishSession(snapshot, http)
        return snapshot
      }
      const task = read(true).catch((error) => {
        if (current()) throw error
        return undefined
      }).finally(() => {
        if (metadataReads.get(sessionID)?.task === task) metadataReads.delete(sessionID)
      })
      metadataReads.set(sessionID, { epoch, task })
      return task
    }

    function beginMove(sessionID: string) {
      const moves = pendingMoves.get(sessionID) ?? new Set<object>()
      const move = {}
      moves.add(move)
      pendingMoves.set(sessionID, moves)
      // The move returns no Session body. Reopen selection only after its confirmation read.
      metadataReads.delete(sessionID)
      invalidateSelection(sessionID)
      return () => {
        if (lifetime.disposed || pendingMoves.get(sessionID) !== moves || !moves.delete(move) || moves.size > 0)
          return Promise.resolve(undefined)
        pendingMoves.delete(sessionID)
        return refreshSelection(sessionID)
      }
    }

    // A demo request's tool call is settled here: the server never heard of it.
    function settleDemo(sessionID: string, requestID: string, outcome: Parameters<typeof settle>[1]) {
      if (!isDemoRequest(requestID)) return
      const settled = settle(requestID, outcome)
      if (!settled || !store.message[sessionID]) return
      setStore(
        "message",
        sessionID,
        produce((messages) => {
          const message = messages.find((item) => item.id === settled.messageID)
          if (message?.type !== "assistant") return
          message.content = message.content.map((item) =>
            item.type === "tool" && item.id === settled.tool.id ? settled.tool : item,
          )
        }),
      )
    }

    onCleanup(event.subscribe((event, { workspace, directory, durable }) => {
      if (lifetime.disposed) return
      receiveHistory(event)
      if (event.type === "permission.v2.asked" || event.type === "question.v2.asked") {
        requestLocations.set(event.data.sessionID, { directory, workspaceID: workspace })
        if (settledRequests.has(event.data.id)) return
        for (const touched of requestHydrations) touched.add(event.data.id)
      }
      if (
        event.type === "permission.v2.replied" ||
        event.type === "question.v2.replied" ||
        event.type === "question.v2.rejected"
      ) {
        for (const touched of requestHydrations) touched.add(event.data.requestID)
        settledRequests.add(event.data.requestID)
        autoReplies.delete(event.data.requestID)
      }
      switch (event.type) {
        case "permission.v2.replied": {
          settleDemo(
            event.data.sessionID,
            event.data.requestID,
            event.data.reply === "reject" ? { type: "error", error: "permission rejected" } : { type: "completed" },
          )
          const requests = store.permission[event.data.sessionID]
          if (!requests) break
          const match = search(requests, event.data.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "permission",
            event.data.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "permission.v2.asked": {
          const request = event.data
          if (acceptPermission(request)) break
          const requests = store.permission[request.sessionID]
          if (!requests) {
            setStore("permission", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("permission", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "permission",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "question.v2.replied":
        case "question.v2.rejected": {
          settleDemo(
            event.data.sessionID,
            event.data.requestID,
            event.type === "question.v2.rejected"
              ? { type: "error", error: "question rejected" }
              : { type: "completed", answers: "answers" in event.data ? event.data.answers : undefined },
          )
          const requests = store.question[event.data.sessionID]
          if (!requests) break
          const match = search(requests, event.data.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "question",
            event.data.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "question.v2.asked": {
          const request = event.data
          const requests = store.question[request.sessionID]
          if (!requests) {
            setStore("question", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("question", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "question",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "todo.updated":
          setStore("todo", event.data.sessionID, event.data.todos)
          break

        case "session.next.deleted": {
          statusChanged(event.data.sessionID)
          owners.delete(event.data.sessionID)
          metadataReads.delete(event.data.sessionID)
          pendingMoves.delete(event.data.sessionID)
          placements.delete(event.data.sessionID)
          titles.delete(event.data.sessionID)
          syncingSessions.delete(event.data.sessionID)
          trailing.delete(event.data.sessionID)
          hydratingSessions.delete(event.data.sessionID)
          pendingHistoryChanges.delete(event.data.sessionID)
          fullSyncedSessions.delete(event.data.sessionID)
          history.delete(event.data.sessionID)
          setStore(produce((draft) => {
            delete draft.message[event.data.sessionID]
            delete draft.todo[event.data.sessionID]
            delete draft.session_diff[event.data.sessionID]
            delete draft.session_status[event.data.sessionID]
            delete draft.session_metadata[event.data.sessionID]
            delete draft.session_selection[event.data.sessionID]
          }))
          const result = search(store.session, event.data.sessionID, (s) => s.id)
          if (result.found) {
            setStore(
              "session",
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }
        case "session.next.created":
          void refreshSelection(event.data.sessionID).catch(() => undefined)
          break

        case "session.next.renamed": {
          const { sessionID, title, timestamp } = event.data
          const revision = { id: event.id, timestamp, seq: durable?.aggregateID === sessionID ? durable.seq : undefined, title }
          if (!isNewer(revision, titles.get(sessionID))) break
          titles.set(sessionID, revision)
          const session = getSession(sessionID)
          if (session) publishSession({
            ...session, title, time: { ...session.time, updated: Math.max(session.time.updated, timestamp) },
          })
          void refreshSelection(sessionID).catch(() => undefined)
          break
        }

        case "session.next.agent.switched":
        case "session.next.model.switched": {
          const sessionID = event.data.sessionID
          const revision = { id: event.id, timestamp: event.data.timestamp,
            seq: durable?.aggregateID === sessionID ? durable.seq : undefined }
          const previous = store.session_selection[sessionID]
          const reading = metadataReads.get(sessionID)?.epoch === sdk.connectionEpoch()
          const metadata = store.session_metadata[sessionID]
          if (!reading && metadata?.epoch === sdk.connectionEpoch() &&
              metadata.httpUpdated !== undefined && revision.timestamp < metadata.httpUpdated) break
          const session = getSession(sessionID)
          const fields = event.type === "session.next.agent.switched"
            ? { agent: event.data.agent }
            : { model: { ...event.data.model } }
          batch(() => {
            if (event.type === "session.next.agent.switched") {
              if (!isNewer(revision, previous?.agent)) return
              setStore("session_selection", sessionID, { ...previous, agent: { ...revision, value: event.data.agent } })
            } else {
              if (!isNewer(revision, previous?.model)) return
              setStore("session_selection", sessionID, { ...previous, model: { ...revision, value: event.data.model } })
            }
            if (reading) invalidateSelection(sessionID)
            if (session) publishSession({
              ...session, ...fields, time: { ...session.time, updated: Math.max(session.time.updated, revision.timestamp) },
            })
          })
          break
        }

        case "session.next.compaction.started":
          compacting.add(event.data.sessionID)
          break

        case "session.next.compaction.ended":
          compacting.delete(event.data.sessionID)
          break

        case "session.next.moved": {
          const { sessionID, location, subdirectory, timestamp } = event.data
          const revision = { id: event.id, timestamp, seq: durable?.aggregateID === sessionID ? durable.seq : undefined,
            location: { ...location }, subpath: subdirectory }
          if (!isNewer(revision, placements.get(sessionID))) break
          placements.set(sessionID, revision)
          if (metadataReads.get(sessionID)?.epoch === sdk.connectionEpoch()) invalidateSelection(sessionID)
          const session = getSession(sessionID)
          if (session) publishSession({
            ...session, location: revision.location, subpath: subdirectory,
            time: { ...session.time, updated: Math.max(session.time.updated, timestamp) },
          })
          break
        }

        case "session.status": {
          statusChanged(event.data.sessionID)
          setStore("session_status", event.data.sessionID, event.data.status)
          break
        }

        case "session.next.step.started": {
          statusChanged(event.data.sessionID)
          setStore("session_status", event.data.sessionID, reconcile({ type: "busy" }))
          break
        }
        case "session.next.step.failed":
        case "session.next.step.ended": {
          if (event.type === "session.next.step.ended" && event.data.finish === "tool-calls") break
          statusChanged(event.data.sessionID)
          setStore("session_status", event.data.sessionID, reconcile({ type: "idle" }))
          break
        }
        case "session.next.retried": {
          statusChanged(event.data.sessionID)
          setStore("session_status", event.data.sessionID, reconcile({
            type: "retry", attempt: event.data.attempt, message: event.data.error.message, next: event.data.timestamp,
          }))
          break
        }

        case "lsp.updated": {
          const workspace = project.workspace.current()
          void sdk.catalog.lsp({ directory: sdk.directory, workspace }).then((x) => setStore("lsp", x))
          break
        }

        case "vcs.branch.updated": {
          if (workspace === project.workspace.current()) {
            setStore("vcs", { branch: event.data.branch })
          }
          break
        }
      }
    }))

    const exit = useExit()
    const args = useArgs()

    async function bootstrap(input: { fatal?: boolean } = {}) {
      const fatal = input.fatal ?? true
      const workspace = project.workspace.current()
      const projectPromise = project.sync()
      const sessionListPromise = projectPromise.then(() => listSessions())

      const location = { directory: sdk.directory, workspace }

      // blocking - include session.list when continuing a session
      const catalogPromise = sdk.catalog.bootstrap(location)
      await Promise.all([catalogPromise, projectPromise, ...(args.continue ? [sessionListPromise] : [])])
        .then(async () => {
          if (lifetime.disposed) return
          const catalog = await catalogPromise
          const sessions = args.continue ? await sessionListPromise : undefined
          batch(() => {
            setStore("provider", reconcile(catalog.provider))
            setStore("provider_default", reconcile(catalog.default))
            setStore("provider_next", reconcile(catalog.next))
            // V2 always serves session.background, so foreground subagents can always be moved to the background.
            setStore("capabilities", "experimentalBackgroundSubagents", true)
            setStore("agent", reconcile(catalog.agent))
            setStore("config", reconcile(catalog.config))
            setStore("catalogRevision", (value) => value + 1)
            if (sessions !== undefined) replaceSessionList(sessions)
          })
        })
        .then(() => {
          if (lifetime.disposed) return
          if (store.status !== "complete") setStore("status", "partial")
          // non-blocking
          void Promise.all([
            ...(args.continue ? [] : [sessionListPromise.then(replaceSessionList)]),
            hydrateRequests({ directory: sdk.directory ?? project.data.instance.path.directory, workspaceID: workspace }),
            sdk.catalog.commands(location).then((x) => setStore("command", reconcile(x))),
            sdk.catalog.lsp(location).then((x) => setStore("lsp", reconcile(x))),
            sdk.catalog.formatter(location).then((x) => setStore("formatter", reconcile(x))),
            sdk.catalog.mcp(location).then((x) => setStore("mcp", reconcile(x))),
            sdk.api.mcp
              .resources({ location })
              .then((result) =>
                setStore(
                  "mcp_resource",
                  reconcile(
                    Object.fromEntries(
                      result.data.resources.map((resource) => [
                        `${resource.server}:${resource.uri}`,
                        {
                          name: resource.name,
                          uri: resource.uri,
                          description: resource.description ?? undefined,
                          mimeType: resource.mimeType ?? undefined,
                          client: resource.server,
                        },
                      ]),
                    ),
                  ),
                ),
              )
              .catch(() => undefined),
            readStatuses(),
            sdk.catalog.vcs(location).then((x) => setStore("vcs", reconcile(x))),
          ]).then(() => {
            if (!lifetime.disposed) setStore("status", "complete")
          }).catch((error) => {
            if (!lifetime.disposed) console.error("tui bootstrap refresh failed", error)
          })
        })
        .catch(async (e) => {
          console.error("tui bootstrap failed", {
            error: e instanceof Error ? e.message : String(e),
            name: e instanceof Error ? e.name : undefined,
            stack: e instanceof Error ? e.stack : undefined,
          })
          if (fatal) {
            exit(e)
          } else {
            throw e
          }
        })
    }

    onMount(() => {
      void bootstrap()
    })

    const result = {
      data: store,
      set: setStore,
      get status() {
        return store.status
      },
      get ready() {
        if (startup.skipInitialLoading) return true
        return store.status !== "loading"
      },
      get path() {
        return project.instance.path()
      },
      session: {
        beginMove,
        refreshSelection,
        selectionReady,
        selection(sessionID: string) {
          return store.session_selection[sessionID]
        },
        get: getSession,
        query() {
          return sessionListQuery()
        },
        async refresh() {
          replaceSessionList(await listSessions())
        },
        status(sessionID: string) {
          if (!result.session.get(sessionID)) return "idle"
          if (compacting.has(sessionID)) return "compacting"
          const last = store.message[sessionID]?.at(-1)
          if (last?.type === "user" || last?.type === "synthetic") return "working"
          if (last?.type === "assistant" || last?.type === "shell") return last.time.completed ? "idle" : "working"
          return "idle"
        },
        async sync(sessionID: string, options?: { force?: boolean }, recovery?: Promise<Session | undefined>) {
          if (lifetime.disposed) return
          const active = owners.get(sessionID) ?? {}
          owners.set(sessionID, active)
          const current = () => !lifetime.disposed && owners.get(sessionID) === active
          const read = () => {
            if (!current()) return Promise.resolve()
            const pending = syncingSessions.get(sessionID)
            if (pending) return pending
            fullSyncedSessions.delete(sessionID)
            const touched = pendingHistoryChanges.get(sessionID) ?? new Set<string>()
            pendingHistoryChanges.set(sessionID, touched)
            hydratingSessions.set(sessionID, touched)
            const task = (async () => {
              // Rejection of one child does not settle the other HTTP operations this owner started.
              const [session, messages, todo] = await Promise.allSettled([
                recovery ?? refreshSelection(sessionID),
                sdk.catalog.messages(sessionID).catch((error) => {
                  console.error("tui history hydration failed", error)
                  return undefined
                }),
                sdk.catalog.todo(sessionID),
              ])
              if (session.status === "rejected") throw session.reason
              if (messages.status === "rejected") throw messages.reason
              if (todo.status === "rejected") throw todo.reason
              if (!current()) return
              const metadata = getSession(sessionID)
              if (metadata) await hydrateSessionRequests(metadata, current)
              if (!current()) return
              if (!messages.value) {
                if (!history.has(sessionID)) history.set(sessionID, [])
                projectHistory(sessionID)
                return
              }
              const live = history.get(sessionID) ?? []
              const fetched = messages.value
              history.set(
                sessionID,
                [
                  ...fetched.map((message) => live.find((item) => item.id === message.id && touched.has(item.id)) ?? message),
                  ...live.filter((item) => !fetched.some((message) => message.id === item.id)),
                ].toSorted((a, b) => b.time.created - a.time.created || b.id.localeCompare(a.id)),
              )
              setStore("todo", sessionID, todo.value)
              projectHistory(sessionID)
              fullSyncedSessions.add(sessionID)
              if (pendingHistoryChanges.get(sessionID) === touched) pendingHistoryChanges.delete(sessionID)
              await refreshDiff(sessionID)
            })().catch((error) => {
              if (current()) projectHistory(sessionID)
              throw error
            }).finally(() => {
              if (syncingSessions.get(sessionID) === task) syncingSessions.delete(sessionID)
              if (hydratingSessions.get(sessionID) === touched) hydratingSessions.delete(sessionID)
            })
            syncingSessions.set(sessionID, task)
            return task
          }
          const pending = syncingSessions.get(sessionID)
          if (pending) {
            if (!options?.force) return pending
            const queued = trailing.get(sessionID)
            if (queued?.predecessor === pending) return queued.task
            const task = pending.then(read, read).finally(() => {
              if (trailing.get(sessionID)?.task === task) trailing.delete(sessionID)
            })
            trailing.set(sessionID, { predecessor: pending, task })
            return task
          }
          if (fullSyncedSessions.has(sessionID) && selectionReady(sessionID) && !options?.force) {
            const session = result.session.get(sessionID)
            if (session) await hydrateSessionRequests(session, current)
            return
          }
          return read()
        },
      },
      bootstrap,
    }
    createEffect(on(sdk.connectionEpoch, (epoch) => {
      if (epoch === 0 || lifetime.disposed) return
      // An exact read before the first greeting may have missed a commit before subscription.
      // Initial status and history hydration continue as usual.
      const sessions = new Set(epoch === 1 ? [
        ...Object.keys(store.session_metadata), ...metadataReads.keys(),
      ] : [
        ...history.keys(), ...fullSyncedSessions, ...syncingSessions.keys(),
        ...hydratingSessions.keys(), ...pendingHistoryChanges.keys(), ...metadataReads.keys(),
      ])
      void Promise.allSettled([
        ...(epoch > 1 ? [readStatuses()] : []),
        ...[...sessions].map((sessionID) => {
          // A held history request must not delay the new epoch's metadata read.
          const metadata = refreshSelection(sessionID)
          if (epoch === 1) return metadata
          return Promise.allSettled([metadata, result.session.sync(sessionID, { force: true }, metadata)]).then(
            ([selection, hydration]) => {
              if (selection.status === "rejected") throw selection.reason
              if (hydration.status === "rejected") throw hydration.reason
            },
          )
        }),
      ]).then((results) => {
        if (lifetime.disposed) return
        for (const result of results)
          if (result.status === "rejected") console.error("tui reconnect recovery failed", result.reason)
      })
    }))
    return result
  },
})
