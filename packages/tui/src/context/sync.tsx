import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Command,
  PermissionRequest,
  QuestionRequest,
  LspStatus,
  McpStatus,
  McpResource,
  FormatterStatus,
  SessionStatus,
  ProviderListResponse,
  VcsInfo,
  SnapshotFileDiff,
  SessionMessage,
  V2Event,
} from "../compat/schema"
import { createStore, produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"
import { useArgs } from "./args"
import { batch, onMount } from "solid-js"
import path from "path"
import { useKV } from "./kv"
import { usePermission } from "./permission"
import { isDemoRequest, settle } from "./demo"
import { applyEvent, toLegacy } from "./session-history"

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
    const [store, setStore] = createStore<{
      status: "loading" | "partial" | "complete"
      provider: Provider[]
      provider_default: Record<string, string>
      provider_next: ProviderListResponse
      capabilities: {
        experimentalBackgroundSubagents: boolean
      }
      agent: Agent[]
      command: Command[]
      permission: {
        [sessionID: string]: PermissionRequest[]
      }
      question: {
        [sessionID: string]: QuestionRequest[]
      }
      config: Config
      session: Session[]
      session_status: {
        [sessionID: string]: SessionStatus
      }
      session_diff: {
        [sessionID: string]: SnapshotFileDiff[]
      }
      todo: {
        [sessionID: string]: Todo[]
      }
      message: {
        [sessionID: string]: Message[]
      }
      part: {
        [messageID: string]: Part[]
      }
      lsp: LspStatus[]
      mcp: {
        [key: string]: McpStatus
      }
      mcp_resource: {
        [key: string]: McpResource
      }
      formatter: FormatterStatus[]
      vcs: VcsInfo | undefined
    }>({
      provider_next: {
        all: [],
        default: {},
        connected: [],
      },
      capabilities: {
        experimentalBackgroundSubagents: false,
      },
      config: {},
      status: "loading",
      agent: [],
      permission: {},
      question: {},
      command: [],
      provider: [],
      provider_default: {},
      session: [],
      session_status: {},
      session_diff: {},
      todo: {},
      message: {},
      part: {},
      lsp: [],
      mcp: {},
      mcp_resource: {},
      formatter: [],
      vcs: undefined,
    })

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()

    const fullSyncedSessions = new Set<string>()
    const syncingSessions = new Map<string, Promise<void>>()
    // Message IDs that live events changed while a Session's history was being fetched.
    const hydratingSessions = new Map<string, Set<string>>()
    // V2 messages per Session, newest first. The store's V1 `message` and `part` entries are projections of them.
    const history = new Map<string, SessionMessage[]>()

    function projectHistory(sessionID: string) {
      const session = store.session.find((item) => item.id === sessionID)
      const directory = session?.directory ?? sdk.directory ?? ""
      const projected = toLegacy(sessionID, history.get(sessionID) ?? [], {
        cwd: directory,
        root: project.data.instance.path.worktree ?? directory,
      }).slice(-100)
      batch(() => {
        setStore(
          "part",
          produce((draft) => {
            for (const message of store.message[sessionID] ?? []) {
              if (!projected.some((item) => item.info.id === message.id)) delete draft[message.id]
            }
          }),
        )
        setStore("message", sessionID, reconcile(projected.map((item) => item.info)))
        projected.forEach((item) => setStore("part", item.info.id, reconcile(item.parts)))
      })
    }

    function refreshDiff(sessionID: string) {
      const session = store.session.find((item) => item.id === sessionID)
      const files = new Set(
        (history.get(sessionID) ?? []).flatMap((message) =>
          message.type === "assistant" ? (message.snapshot?.files ?? []) : [],
        ),
      )
      return sdk.catalog
        .diff({ directory: session?.directory, workspace: session?.workspaceID }, files)
        .then((diff) => setStore("session_diff", sessionID, diff))
    }

    function receiveHistory(event: V2Event) {
      if (!event.type.startsWith("session.next.") || !("sessionID" in event.data)) return
      const sessionID = event.data.sessionID
      if (!fullSyncedSessions.has(sessionID) && !hydratingSessions.has(sessionID)) return
      const messages = history.get(sessionID) ?? []
      if (!applyEvent(messages, event)) return
      history.set(sessionID, messages.slice(0, 100))
      hydratingSessions
        .get(sessionID)
        ?.add("assistantMessageID" in event.data ? event.data.assistantMessageID : messages[0].id)
      if (!fullSyncedSessions.has(sessionID)) return
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

    // A demo request's tool part is settled here: the server never heard of it.
    function settleDemo(requestID: string, outcome: Parameters<typeof settle>[1]) {
      if (!isDemoRequest(requestID)) return
      const part = settle(requestID, outcome)
      if (part) setStore("part", part.messageID, [part])
    }

    event.subscribe((event, { workspace }) => {
      receiveHistory({ ...event, data: event.properties } as V2Event)
      switch (event.type) {
        case "global.disposed":
          void bootstrap()
          break
        case "permission.replied": {
          settleDemo(event.properties.requestID, event.properties.reply === "reject" ? { type: "error", error: "permission rejected" } : { type: "completed" })
          const requests = store.permission[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "permission",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "permission.asked": {
          const request = event.properties
          if (permission.mode === "auto") {
            void sdk.actions.reply({ sessionID: request.sessionID, requestID: request.id, reply: "once" })
            break
          }
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

        case "question.replied":
        case "question.rejected": {
          settleDemo(
            event.properties.requestID,
            event.type === "question.rejected"
              ? { type: "error", error: "question rejected" }
              : { type: "completed", answers: "answers" in event.properties ? event.properties.answers : undefined },
          )
          const requests = store.question[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "question",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "question.asked": {
          const request = event.properties
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
          setStore("todo", event.properties.sessionID, event.properties.todos)
          break

        case "session.diff":
          setStore("session_diff", event.properties.sessionID, event.properties.diff)
          break

        case "session.deleted": {
          const result = search(store.session, event.properties.info.id, (s) => s.id)
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
        case "session.updated": {
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore("session", result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "session",
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            }),
          )
          break
        }

        case "session.next.moved": {
          const result = search(store.session, event.properties.sessionID, (s) => s.id)
          if (!result.found) break
          setStore(
            "session",
            result.index,
            produce((session) => {
              session.directory = event.properties.location.directory
              session.path = event.properties.subdirectory
              session.workspaceID = event.properties.location.workspaceID
              session.time.updated = event.properties.timestamp
            }),
          )
          break
        }

        case "session.status": {
          setStore("session_status", event.properties.sessionID, event.properties.status)
          break
        }

        case "lsp.updated": {
          const workspace = project.workspace.current()
          void sdk.catalog.lsp({ directory: sdk.directory, workspace }).then((x) => setStore("lsp", x))
          break
        }

        case "vcs.branch.updated": {
          if (workspace === project.workspace.current()) {
            setStore("vcs", { branch: event.properties.branch })
          }
          break
        }
      }
    })

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
            if (sessions !== undefined) setStore("session", reconcile(sessions))
          })
        })
        .then(() => {
          if (store.status !== "complete") setStore("status", "partial")
          // non-blocking
          void Promise.all([
            ...(args.continue ? [] : [sessionListPromise.then((sessions) => setStore("session", reconcile(sessions)))]),
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
            sdk.catalog.status().then((x) => setStore("session_status", reconcile(x))),
            sdk.catalog.vcs(location).then((x) => setStore("vcs", reconcile(x))),
          ]).then(() => {
            setStore("status", "complete")
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
        get(sessionID: string) {
          const match = search(store.session, sessionID, (s) => s.id)
          if (match.found) return store.session[match.index]
          return undefined
        },
        query() {
          return sessionListQuery()
        },
        async refresh() {
          const list = await listSessions()
          setStore("session", reconcile(list))
        },
        status(sessionID: string) {
          const session = result.session.get(sessionID)
          if (!session) return "idle"
          if (session.time.compacting) return "compacting"
          const messages = store.message[sessionID] ?? []
          const last = messages.at(-1)
          if (!last) return "idle"
          if (last.role === "user") return "working"
          return last.time.completed ? "idle" : "working"
        },
        async sync(sessionID: string) {
          if (fullSyncedSessions.has(sessionID)) return
          const syncing = syncingSessions.get(sessionID)
          if (syncing) return syncing
          const touched = new Set<string>()
          hydratingSessions.set(sessionID, touched)
          const task = (async () => {
            const [session, messages, todo] = await Promise.all([
              sdk.catalog.session(sessionID),
              // V1 rendered a Session whose message route failed as empty instead of failing the sync.
              sdk.catalog.messages(sessionID).catch(() => []),
              sdk.catalog.todo(sessionID),
            ])
            const live = history.get(sessionID) ?? []
            history.set(
              sessionID,
              [
                ...messages.map(
                  (message) => live.find((item) => item.id === message.id && touched.has(item.id)) ?? message,
                ),
                ...live.filter((item) => touched.has(item.id) && !messages.some((message) => message.id === item.id)),
              ].toSorted((a, b) => b.time.created - a.time.created || b.id.localeCompare(a.id)),
            )
            setStore(
              produce((draft) => {
                const match = search(draft.session, sessionID, (s) => s.id)
                if (match.found) draft.session[match.index] = session
                if (!match.found) draft.session.splice(match.index, 0, session)
                draft.todo[sessionID] = todo
              }),
            )
            projectHistory(sessionID)
            fullSyncedSessions.add(sessionID)
            await refreshDiff(sessionID)
          })().finally(() => {
            syncingSessions.delete(sessionID)
            hydratingSessions.delete(sessionID)
          })
          syncingSessions.set(sessionID, task)
          return task
        },
      },
      bootstrap,
    }
    return result
  },
})
