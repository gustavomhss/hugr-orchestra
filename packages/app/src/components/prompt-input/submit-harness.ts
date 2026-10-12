import { beforeAll, beforeEach, mock } from "bun:test"
import { createStore } from "solid-js/store"
import type { Prompt, PromptStore } from "@/context/prompt"
import { pendingRules } from "../draft-subagent-models"
import { Worktree } from "@/utils/worktree"
import { ServerScope } from "@/utils/server-scope"
import { createApiForServer } from "@/utils/server"

export let createPromptSubmit: typeof import("./submit").createPromptSubmit
export let sendFollowupDraft: typeof import("./submit").sendFollowupDraft
export let followupSystem: typeof import("./submit").followupSystem

export const createdClients: string[] = []
export const createdSessions: string[] = []
export const sessionCreateInputs: Array<{
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  location?: { directory: string }
}> = []
export const enabledAutoAccept: Array<{ server: string; sessionID: string; directory: string }> = []
export const optimistic: Array<{
  directory?: string
  sessionID?: string
  message: {
    agent: string
    model: { providerID: string; modelID: string }
    variant?: string
  }
}> = []
export const optimisticSeeded: boolean[] = []
export const storedSessions: Record<string, Array<{ id: string; title?: string }>> = {}
export const promoted: Array<{ directory: string; sessionID: string }> = []
export const promotedAgents: Array<string | undefined> = []
export const sentShell: Array<{ sessionID: string; id?: string; command: string }> = []
export const syncedDirectories: string[] = []
export const promotedDrafts: Array<{ draftID: string; server: string; sessionId: string }> = []
export const sentPrompts: string[] = []
export const promptInputs: unknown[] = []
export const sentCommands: unknown[] = []
export const commands: Array<{ name: string }> = []
export const behaviorReads: Array<{ scope: string; directory: string; projects: unknown }> = []
export const behaviors = { system: undefined as string | undefined, fail: false }
export const events: string[] = []
export const profileProjects = [{ id: "project", worktree: "/repo/main", sandboxes: ["/repo/worktree-a"] }]
export const savedRules: { sessionID: string; directory: string; permission: ReturnType<typeof pendingRules> }[] = []
export const interrupts: string[] = []
export const preparations: PromiseWithResolvers<void>[] = []
export const statusWrites: { sessionID: string; type: string }[] = []

export const state = {
  serverSessionSyncs: 0,
  params: {} as { id?: string },
  search: {} as { draftId?: string },
  selected: "/repo/worktree-a",
  variant: undefined as string | undefined,
  permissionServer: "server-a",
  createSessionGate: undefined as Promise<void> | undefined,
  protocol: "v2",
  rulesFailure: false,
  rulesGate: undefined as Promise<void> | undefined,
  rulesStarted: Promise.withResolvers<void>(),
  worktreeCreates: 0,
  sdkOverride: undefined as unknown,
  serverOverride: undefined as unknown,
  createStarted: Promise.withResolvers<void>(),
  waiting: 0,
  waitersReady: Promise.withResolvers<void>(),
  promptValue: [{ type: "text", content: "ls", start: 0, end: 2 }] as Prompt,
}

const [promptStore, setPromptStore] = createStore<PromptStore>({
  prompt: state.promptValue,
  cursor: 0,
  context: { items: [] },
})
export const prompt = {
  store: [() => promptStore, setPromptStore] as [() => PromptStore, typeof setPromptStore],
  ready: Object.assign(() => true, { promise: Promise.resolve(true) }),
  current: () => state.promptValue,
  cursor: () => 0,
  dirty: () => true,
  model: {
    current: () => undefined,
    set: () => undefined,
  },
  reset: () => undefined,
  set: () => undefined,
  context: {
    add: () => undefined,
    remove: () => undefined,
    removeComment: () => undefined,
    updateComment: () => undefined,
    replaceComments: () => undefined,
    items: () => [],
  },
  capture: () => prompt,
}

export const submitInput = (): Parameters<typeof import("./submit").createPromptSubmit>[0] => ({
  prompt,
  info: () => ({ id: "session-1" }),
  imageAttachments: () => [],
  commentCount: () => 0,
  autoAccept: () => false,
  mode: () => "normal",
  working: () => false,
  editor: () => undefined,
  queueScroll: () => undefined,
  promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
  addToHistory: () => undefined,
  resetHistoryNavigation: () => undefined,
  setMode: () => undefined,
  setPopover: () => undefined,
})

export const clientFor = (directory: string) => {
  createdClients.push(directory)
  const api = {
    session: {
      create: async (input: (typeof sessionCreateInputs)[number]) => {
        state.createStarted.resolve()
        await state.createSessionGate
        const location = input.location?.directory ?? directory
        createdSessions.push(location)
        sessionCreateInputs.push(input)
        return {
          id: `session-${createdSessions.length}`,
          projectID: "project",
          agent: input.agent,
          model: input.model,
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1, updated: 1 },
          title: `New session ${createdSessions.length}`,
          location: { directory: location },
        }
      },
      prompt: async (input: unknown) => {
        sentPrompts.push(directory)
        promptInputs.push(input)
        return { data: undefined }
      },
      command: async (input: unknown) => {
        sentCommands.push(input)
      },
      shell: async (input: { sessionID: string; id?: string; command: string }) => {
        sentShell.push(input)
      },
      interrupt: async (input: { sessionID: string }) => {
        interrupts.push(input.sessionID)
      },
    },
  }
  return {
    api,
    session: {
      create: async (input: { directory?: string }) => ({
        data: {
          ...(await api.session.create({ location: { directory: input.directory ?? directory } })),
          directory: input.directory ?? directory,
        },
      }),
      promptAsync: async (input: { messageID: string; parts: { type: string; text?: string }[] }) => {
        await api.session.prompt({
          ...input,
          id: input.messageID,
          sessionID: "session-1",
          text: input.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(""),
        })
        return { data: undefined }
      },
      update: async (input: (typeof savedRules)[number]) => {
        savedRules.push(input)
        state.rulesStarted.resolve()
        await state.rulesGate
        if (state.rulesFailure) throw new Error("permission persistence failed")
        return { data: { ...input, id: input.sessionID } }
      },
      command: async () => ({ data: undefined }),
      abort: async () => ({ data: undefined }),
    },
    worktree: {
      create: async () => {
        state.worktreeCreates++
        Worktree.ready(ServerScope.local, `${directory}/new`)
        return { data: { directory: `${directory}/new` } }
      },
    },
  }
}

beforeAll(async () => {
  const rootClient = clientFor("/repo/main")
  const current = createApiForServer({ server: { url: "http://fixture.invalid" } })
  const currentApi = { ...current, session: { ...current.session, ...rootClient.api.session } }

  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => state.params,
    useLocation: () => ({}),
    useSearchParams: () => [state.search, () => undefined],
  }))

  mock.module("@orchestra/ui/toast", () => ({
    Toast: { Region: () => null },
    showToast: () => 0,
    toaster: { dismiss: () => undefined },
  }))

  mock.module("@orchestra/core/util/encode", () => ({
    base64Encode: (value: string) => value,
  }))

  // This suite runs Solid's server build, where persisted stores cannot load. The real store (storage
  // failures, slow loads, profile resolution) is covered in test-browser/llm-behaviors-store.test.ts.
  mock.module("@/utils/llm-behaviors-store", () => ({
    resolveBehaviorSystem: async (input: { scope: string; directory: string; projects: unknown }) => {
      events.push("resolve behaviors")
      behaviorReads.push({ scope: input.scope, directory: input.directory, projects: input.projects })
      const preparation = preparations.shift()
      if (preparation) await preparation.promise
      if (behaviors.fail) throw new Error("storage unavailable")
      return behaviors.system
    },
  }))

  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => ({ id: "model", provider: { id: "provider" } }),
        variant: { current: () => state.variant },
      },
      agent: {
        // A seat renamed from its default label: payloads must carry the stable id, never the label.
        current: () => ({ id: "backend", name: "Pikachu" }),
      },
      session: {
        promote(directory: string, sessionID: string, selection: { agent?: string }) {
          promoted.push({ directory, sessionID })
          promotedAgents.push(selection.agent)
        },
      },
    }),
  }))

  mock.module("@/context/permission", () => {
    const permissionState = (server: string) => ({
      enableAutoAccept(sessionID: string, directory: string) {
        enabledAutoAccept.push({ server, sessionID, directory })
      },
    })
    return { usePermission: () => ({ currentServerState: () => permissionState(state.permissionServer) }) }
  })

  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => () => ({ protocol: "v2", client: rootClient }),
  }))

  mock.module("@/context/tabs", () => ({
    useTabs: () => ({
      get store() {
        return state.search.draftId
          ? [{ type: "draft", draftID: state.search.draftId, server: "project-server", directory: "/repo/main" }]
          : []
      },
      draft: () => ({ server: "project-server" }),
      promoteDraft: (draftID: string, session: { server: string; sessionId: string }) => {
        promotedDrafts.push({ draftID, ...session })
      },
    }),
  }))

  mock.module("@/context/prompt", () => ({
    usePrompt: () => prompt,
  }))

  mock.module("@/context/layout", () => ({
    useLayout: () => ({
      handoff: {
        setTabs: () => undefined,
      },
    }),
  }))

  mock.module("@/context/sdk", () => ({
    useSDK: () => {
      const sdk = {
        scope: "local",
        directory: "/repo/main",
        client: rootClient,
        api: rootClient.api,
        url: "http://localhost:4096",
        createClient(opts: { directory: string }) {
          return clientFor(opts.directory)
        },
      }
      return () => state.sdkOverride ?? sdk
    },
  }))

  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => () =>
      state.serverOverride ?? {
        protocol: Promise.resolve(state.protocol),
        client: rootClient,
        currentApi,
        createClient: (opts: { directory?: string }) => clientFor(opts.directory ?? "/repo/main"),
      },
  }))

  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: { command: commands },
      session: {
        optimistic: {
          add: (value: {
            directory?: string
            sessionID?: string
            message: { agent: string; model: { providerID: string; modelID: string; variant?: string } }
          }) => {
            optimistic.push(value)
            optimisticSeeded.push(
              !!value.directory &&
                !!value.sessionID &&
                !!storedSessions[value.directory]?.find((item) => item.id === value.sessionID)?.title,
            )
          },
          remove: () => undefined,
        },
      },
      set: (field: string, _id: string, status: { type: string }) => {
        if (field === "session_status" && status.type === "busy" && ++state.waiting === 2)
          state.waitersReady.resolve()
      },
    }),
  }))

  mock.module("@/context/server-sync", () => ({
    useServerSync: () => () => ({
      data: { project: profileProjects },
      session: {
        remember: () => undefined,
        set: (field: string, sessionID: string, status: { type: string }) => {
          if (field === "session_status") statusWrites.push({ sessionID, type: status.type })
        },
        sync: async () => {
          state.serverSessionSyncs++
        },
      },
      child: (directory: string) => {
        syncedDirectories.push(directory)
        storedSessions[directory] ??= []
        return [
          { session: storedSessions[directory] },
          (...args: unknown[]) => {
            if (args[0] !== "session") return
            const next = args[1]
            if (typeof next === "function") {
              storedSessions[directory] = next(storedSessions[directory]) as Array<{ id: string; title?: string }>
              return
            }
            if (Array.isArray(next)) {
              storedSessions[directory] = next as Array<{ id: string; title?: string }>
            }
          },
        ]
      },
    }),
  }))

  mock.module("@/context/platform", () => ({
    usePlatform: () => ({
      fetch,
    }),
  }))

  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: string) => key,
    }),
  }))

  const mod = await import("./submit")
  createPromptSubmit = mod.createPromptSubmit
  sendFollowupDraft = mod.sendFollowupDraft
  followupSystem = mod.followupSystem
})

beforeEach(() => {
  createdClients.length = 0
  createdSessions.length = 0
  sessionCreateInputs.length = 0
  enabledAutoAccept.length = 0
  optimistic.length = 0
  optimisticSeeded.length = 0
  promoted.length = 0
  promotedAgents.length = 0
  promotedDrafts.length = 0
  sentPrompts.length = 0
  promptInputs.length = 0
  behaviorReads.length = 0
  behaviors.system = undefined
  behaviors.fail = false
  events.length = 0
  sentCommands.length = 0
  commands.length = 0
  state.promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
  state.params = {}
  state.search = {}
  sentShell.length = 0
  syncedDirectories.length = 0
  state.selected = "/repo/worktree-a"
  state.variant = undefined
  state.permissionServer = "server-a"
  state.createSessionGate = undefined
  state.protocol = "v2"
  state.rulesFailure = false
  state.rulesGate = undefined
  state.rulesStarted = Promise.withResolvers<void>()
  savedRules.length = 0
  state.worktreeCreates = 0
  state.sdkOverride = undefined
  state.serverOverride = undefined
  state.createStarted = Promise.withResolvers<void>()
  interrupts.length = 0
  preparations.length = 0
  statusWrites.length = 0
  state.waiting = 0
  state.waitersReady = Promise.withResolvers<void>()
  state.serverSessionSyncs = 0
  for (const key of Object.keys(storedSessions)) delete storedSessions[key]
})
