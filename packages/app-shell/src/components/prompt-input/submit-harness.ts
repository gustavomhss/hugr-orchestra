import { afterEach, beforeAll, beforeEach, mock } from "bun:test"
import { createRoot, getOwner } from "solid-js"
import { createStore, type Store, type SetStoreFunction } from "solid-js/store"
import type { Prompt, PromptStore } from "@/context/prompt"
import { pendingRules } from "../draft-subagent-models"
import { Worktree } from "@/utils/worktree"
import { ServerScope } from "@/utils/server-scope"
import { createApiForServer, type ServerApi } from "@/utils/server"
import type { ModelRule, SubagentModelPolicy } from "../subagent-model-rules"
import { draftSessionKey } from "./draft-session"
import { clearPending, pendingSnapshot } from "../draft-subagent-models"
import type { Part } from "../../compat/sdk-v2-client"

export let createPromptSubmit: typeof import("./submit").createPromptSubmit
export let sendFollowupDraft: typeof import("./submit").sendFollowupDraft
export let createFollowupSender: typeof import("./submit").createFollowupSender
export let followupInput: (draft: import("./submit").FollowupDraft) => import("./submit").FollowupSendInput
export let followupSystem: typeof import("./submit").followupSystem
export let acknowledgeDraftPolicy: typeof import("./submit").acknowledgeDraftPolicy
export const policyWrites: { id: string; policy: SubagentModelPolicy }[] = []
export const toasts: { title?: unknown; description?: unknown }[] = []
export const legacyBaseline: ModelRule[] = []
export const legacySessionPermissions = new Map<string, ModelRule[]>()
type FixtureServer = {
  scope: ServerScope
  protocol: Promise<"v1" | "v2">
  protocolKind: () => string
  client: ReturnType<typeof clientFor>
  currentApi: ServerApi
  createClient: (options: { directory?: string }) => ReturnType<typeof clientFor>
  sessionManagement: {
    setSubagentModels: (id: string, policy: SubagentModelPolicy) => Promise<SubagentModelPolicy>
    waitSubagentModels: (id: string) => Promise<void>
    subagentModelsWriteVersion: (id: string) => number
    readSubagentModels: (id: string) => Promise<{ policy: SubagentModelPolicy }>
  }
}
type FixtureSDK = {
  scope: ServerScope
  directory: string
  client: ReturnType<typeof clientFor>
  api: ServerApi
  url: string
  createClient: FixtureServer["createClient"]
}
type ReactiveOwner = { read?: () => { sdk: FixtureSDK; server: FixtureServer } }
export const canonicalPolicies = new Map<string, SubagentModelPolicy>()
const policyVersions = new Map<string, number>()
const roots: VoidFunction[] = []
afterEach(() => roots.splice(0).forEach((dispose) => dispose()))
export const [reactiveOwner, setReactiveOwner]: [Store<ReactiveOwner>, SetStoreFunction<ReactiveOwner>] = createStore<ReactiveOwner>({})
export const policyFixture: { server: FixtureServer; sdk: FixtureSDK } = {
  server: undefined as unknown as FixtureServer,
  sdk: undefined as unknown as FixtureSDK,
}

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
    id: string
    agent: string
    model: { providerID: string; modelID: string }
    variant?: string
  }
  parts: Part[]
}> = []
export const optimisticRemovals: { messageID: string }[] = []
export const statusUpdates: unknown[][] = []
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
export const savedPolicies: { sessionID: string; policy: SubagentModelPolicy }[] = []
export const interrupts: string[] = []
export const preparations: PromiseWithResolvers<void>[] = []
export const statusWrites: { sessionID: string; type: string }[] = []
export const sdkReads: { scope: string; directory: string }[] = []

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
  policyWrite: async () => {},
  policyWait: async () => {},
  legacyUpdateHook: async () => {},
  worktreeResets: 0,
  promoteStarted: Promise.withResolvers<void>(),
  promoteProbe: undefined as VoidFunction | undefined,
  promoteDraftHook: () => {},
  sendHook: async (_input: unknown) => {},
  behaviorHook: async () => {},
  statusObserved: (_args: unknown[]) => {},
  modelID: "model",
  agentID: "backend",
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
        legacySessionPermissions.set(`session-${createdSessions.length}`, legacyBaseline.slice())
        return {
          id: `session-${createdSessions.length}`,
          projectID: "project",
          agent: input.agent,
          model: input.model,
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1, updated: 1 },
          title: `New session ${createdSessions.length}`,
          permission: legacyBaseline.slice(),
          location: { directory: location },
        }
      },
      prompt: async (input: unknown) => {
        sentPrompts.push(directory)
        promptInputs.push(input)
        await state.sendHook(input)
        return { data: undefined }
      },
      command: async (input: unknown) => {
        sentCommands.push(input)
        await state.sendHook(input)
      },
      shell: async (input: { sessionID: string; id?: string; command: string }) => {
        sentShell.push(input)
        await state.sendHook(input)
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
        await state.legacyUpdateHook()
        legacySessionPermissions.set(input.sessionID, [...(legacySessionPermissions.get(input.sessionID) ?? legacyBaseline), ...input.permission])
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

export function serverFor(scope = ServerScope.local): FixtureServer {
  const client = clientFor("/repo/main")
  const current = createApiForServer({ server: { url: "http://fixture.invalid" } })
  return {
    scope, get protocol() { return Promise.resolve(state.protocol === "v1" ? "v1" as const : "v2" as const) },
    protocolKind: () => state.protocol,
    client, currentApi: { ...current, session: { ...current.session, ...client.api.session } } as unknown as ServerApi,
    createClient: (options: { directory?: string }) => clientFor(options.directory ?? "/repo/main"),
    sessionManagement: {
      setSubagentModels: async (sessionID: string, policy: SubagentModelPolicy) => {
        policyVersions.set(sessionID, (policyVersions.get(sessionID) ?? 0) + 1)
        savedPolicies.push({ sessionID, policy })
        policyWrites.push({ id: sessionID, policy })
        state.rulesStarted.resolve()
        await state.rulesGate
        await state.policyWrite()
        if (state.rulesFailure) throw new Error("policy persistence failed")
        canonicalPolicies.set(sessionID, structuredClone(policy))
        return policy
      },
      waitSubagentModels: () => state.policyWait(),
      subagentModelsWriteVersion: (id: string) => policyVersions.get(id) ?? 0,
      readSubagentModels: async (id: string) => ({ policy: canonicalPolicies.get(id) ?? { mode: "inherit" as const } }),
    },
  }
}

export function sdkFor(directory: string, server: FixtureServer): FixtureSDK {
  return { scope: server.scope, directory, client: server.client, api: server.currentApi, url: "http://fixture.invalid", createClient: server.createClient }
}

function promoteRoute(directory: string, id: string) {
  state.params.id = id
  state.search.draftId = undefined
  const source = state.sdkOverride ?? policyFixture.sdk
  state.sdkOverride = source && typeof source === "object" ? { ...source, directory } : undefined
  policyFixture.sdk = sdkFor(directory, policyFixture.server)
  const owner = reactiveOwner.read?.()
  if (owner) setReactiveOwner("read", () => () => ({ server: owner.server, sdk: sdkFor(directory, owner.server) }))
}

beforeAll(async () => {
  const { checksum } = await import("@orchestra/core/util/encode")

  mock.module("@solidjs/router", () => ({
    useNavigate: () => (url: string) => { const parts = url.split("/session/"); promoteRoute(parts[0].slice(1), parts[1]) },
    useParams: () => state.params,
    useLocation: () => ({}),
    useSearchParams: () => [state.search, () => undefined],
  }))

  mock.module("@orchestra/ui/toast", () => ({
    Toast: { Region: () => null },
    showToast: (input: { title?: unknown; description?: unknown }) => { toasts.push(input); return 0 },
    toaster: { dismiss: () => undefined },
  }))

  mock.module("@orchestra/core/util/encode", () => ({
    base64Encode: (value: string) => value,
    checksum,
  }))

  // This suite runs Solid's server build, where persisted stores cannot load. The real store (storage
  // failures, slow loads, profile resolution) is covered in test-browser/llm-behaviors-store.test.ts.
  mock.module("@/utils/llm-behaviors-store", () => ({
    resolveBehaviorSystem: async (input: { scope: string; directory: string; projects: unknown }) => {
      events.push("resolve behaviors")
      behaviorReads.push({ scope: input.scope, directory: input.directory, projects: input.projects })
      await state.behaviorHook()
      const preparation = preparations.shift()
      if (preparation) await preparation.promise
      if (behaviors.fail) throw new Error("storage unavailable")
      return behaviors.system
    },
  }))

  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => ({ id: state.modelID, provider: { id: "provider" } }),
        variant: { current: () => state.variant },
      },
      agent: {
        // A seat renamed from its default label: payloads must carry the stable id, never the label.
        current: () => ({ id: state.agentID, name: "Pikachu" }),
      },
      session: {
        promote(directory: string, sessionID: string, selection: { agent?: string }) {
          promoted.push({ directory, sessionID })
          state.promoteProbe?.()
          state.promoteStarted.resolve()
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
        promoteRoute(promoted.at(-1)?.directory ?? "/repo/main", session.sessionId)
        state.promoteDraftHook()
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
      return () => {
         const source = reactiveOwner.read?.().sdk ?? state.sdkOverride ?? policyFixture.sdk
        if (
          source && typeof source === "object" && "scope" in source && typeof source.scope === "string" &&
          "directory" in source && typeof source.directory === "string"
        )
          sdkReads.push({ scope: source.scope, directory: source.directory })
        return source
      }
    },
  }))

  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => () => reactiveOwner.read?.().server ?? state.serverOverride ?? policyFixture.server,
  }))

  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: { command: commands },
      session: {
        optimistic: {
          add: (value: (typeof optimistic)[number]) => {
            optimistic.push(value)
            optimisticSeeded.push(
              !!value.directory &&
                !!value.sessionID &&
                !!storedSessions[value.directory]?.find((item) => item.id === value.sessionID)?.title,
            )
          },
          remove: (value: { messageID: string }) => { optimisticRemovals.push(value) },
        },
      },
      set: (field: string, _id: string, status: { type: string }) => {
        if (field === "session_status") statusUpdates.push([field, _id, status])
        state.statusObserved([field, _id, status])
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
          if (field === "session_status") statusUpdates.push([field, sessionID, status])
          state.statusObserved([field, sessionID, status])
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

  if (process.env.ORCHESTRA_SUBMIT_PROBE === "drop-owner") {
    Bun.plugin({
      name: "submit-owner-negative-control",
      setup(build) {
        build.onLoad({ filter: /\/prompt-input\/submit\.ts$/ }, async (args) => {
          const source = await Bun.file(args.path).text()
          const anchor = "const ownsSource = () => {"
          if (!source.includes(anchor)) throw new Error("Submit owner probe anchor missing")
          // Test-only in-memory mutation; never changes the production file or the normal test path.
          return { contents: source.replace(anchor, `${anchor} return true;`), loader: "ts" }
        })
      },
    })
  }
  const mod = await import("./submit")
  createPromptSubmit = (input) => {
    if (getOwner()) return mod.createPromptSubmit(input)
    return createRoot((dispose) => { roots.push(dispose); return mod.createPromptSubmit(input) })
  }
  sendFollowupDraft = mod.sendFollowupDraft
  createFollowupSender = mod.createFollowupSender
  const { useSync } = await import("@/context/sync")
  const { useServerSync } = await import("@/context/server-sync")
  followupInput = (draft) => ({
    api: policyFixture.sdk.api.session as import("./submit").FollowupSendInput["api"],
    sync: useSync()(), serverSync: useServerSync()(), draft,
  })
  followupSystem = mod.followupSystem
  acknowledgeDraftPolicy = mod.acknowledgeDraftPolicy
})

beforeEach(() => {
  createdClients.length = 0
  createdSessions.length = 0
  sessionCreateInputs.length = 0
  enabledAutoAccept.length = 0
  optimistic.length = 0
  optimisticRemovals.length = 0
  statusUpdates.length = 0
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
  savedPolicies.length = 0
  state.worktreeCreates = 0
  state.sdkOverride = undefined
  state.serverOverride = undefined
  state.createStarted = Promise.withResolvers<void>()
  interrupts.length = 0
  preparations.length = 0
  statusWrites.length = 0
  sdkReads.length = 0
  state.waiting = 0
  state.waitersReady = Promise.withResolvers<void>()
  state.serverSessionSyncs = 0
  state.policyWrite = async () => {}
  state.policyWait = async () => {}
  state.legacyUpdateHook = async () => {}
  state.worktreeResets = 0
  state.promoteStarted = Promise.withResolvers<void>()
  state.promoteProbe = undefined
  state.promoteDraftHook = () => {}
  state.sendHook = async () => {}
  state.behaviorHook = async () => {}
  state.statusObserved = () => {}
  state.modelID = "model"
  state.agentID = "backend"
  policyWrites.length = 0
  toasts.length = 0
  legacyBaseline.length = 0
  legacySessionPermissions.clear()
  canonicalPolicies.clear()
  policyVersions.clear()
  policyFixture.server = serverFor()
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  setReactiveOwner("read", undefined)
  ;[draftSessionKey(ServerScope.local, "/repo/main"), draftSessionKey(ServerScope.local, "/repo/main", "draft-1")]
    .forEach((key) => clearPending(key, pendingSnapshot(key).revision))
  createdClients.length = 0
  for (const key of Object.keys(storedSessions)) delete storedSessions[key]
})
