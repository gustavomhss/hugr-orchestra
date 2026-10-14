import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createStore } from "solid-js/store"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import type { Prompt, PromptStore } from "@/context/prompt"
import type { ModelSelection } from "@/context/local"
import type { FollowupDraft } from "./submit"
import { createPromptState } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import { ServerConnection } from "@/context/server"
import { clearPending, pendingPolicy, pendingSelection, pendingSnapshot, togglePending } from "../draft-subagent-models"
import type { ModelRule, SubagentModelPolicy } from "../subagent-model-rules"
import type { ServerApi } from "@/utils/server"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"
import { Worktree } from "@/utils/worktree"

let createPromptSubmit: typeof import("./submit").createPromptSubmit
let sendFollowupDraft: typeof import("./submit").sendFollowupDraft
let followupSystem: typeof import("./submit").followupSystem
let draftSessionKey: typeof import("./draft-session").draftSessionKey
let acknowledgeDraftPolicy: typeof import("./submit").acknowledgeDraftPolicy

const createdClients: string[] = []
const createdSessions: string[] = []
const sessionCreateInputs: Array<{
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  location?: { directory: string }
}> = []
const enabledAutoAccept: Array<{ server: string; sessionID: string; directory: string }> = []
const optimistic: Array<{
  directory?: string
  sessionID?: string
  message: {
    agent: string
    model: { providerID: string; modelID: string }
    variant?: string
  }
}> = []
const optimisticSeeded: boolean[] = []
const storedSessions: Record<string, Array<{ id: string; title?: string }>> = {}
const promoted: Array<{ directory: string; sessionID: string }> = []
const promotedAgents: Array<string | undefined> = []
const sentShell: Array<{ sessionID: string; id?: string; command: string }> = []
const syncedDirectories: string[] = []
const promotedDrafts: Array<{ draftID: string; server: string; sessionId: string }> = []
const sentPrompts: string[] = []
const promptInputs: unknown[] = []
const sentCommands: unknown[] = []
const commands: Array<{ name: string }> = []
let serverSessionSyncs = 0
const behaviorReads: Array<{ scope: string; directory: string; projects: unknown }> = []
const behaviors = { system: undefined as string | undefined, fail: false }
const events: string[] = []
const profileProjects = [{ id: "project", worktree: "/repo/main", sandboxes: ["/repo/worktree-a"] }]

let params: { id?: string } = {}
let search: { draftId?: string } = {}
let selected = "/repo/worktree-a"
let variant: string | undefined
let permissionServer = "server-a"
let createSessionGate: Promise<void> | undefined
let sendHook = async () => {}
let behaviorHook = async () => {}
let promoteHook = () => {}
const policyWrites: { id: string; policy: SubagentModelPolicy }[] = []
let policyWrite = async () => {}
let policyWait = async () => {}
let worktreeResets = 0
let currentSDK: ReturnType<typeof sdkFor>
let currentServer: ReturnType<typeof serverFor>
let protocol: "v1" | "v2" = "v2"
const legacyUpdates: unknown[] = []
const legacyBaseline: ModelRule[] = []
const legacySessionPermissions = new Map<string, ModelRule[]>()
let legacyUpdateHook = async () => {}
const interruptedSessions: string[] = []
const [reactiveOwner, setReactiveOwner] = createStore<{
  read?: () => { sdk: ReturnType<typeof sdkFor>; server: ReturnType<typeof serverFor> }
}>({})

let promptValue: Prompt = [{ type: "text", content: "ls", start: 0, end: 2 }]
const [promptStore, setPromptStore] = createStore<PromptStore>({
  prompt: promptValue,
  cursor: 0,
  context: { items: [] },
})
const prompt = {
  store: [() => promptStore, setPromptStore] as [() => PromptStore, typeof setPromptStore],
  ready: Object.assign(() => true, { promise: Promise.resolve(true) }),
  current: () => promptValue,
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

const submitInput = (): Parameters<typeof import("./submit").createPromptSubmit>[0] => ({
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

const clientFor = (directory: string) => {
  createdClients.push(directory)
  return {
    api: {
      session: {
        create: async (input: (typeof sessionCreateInputs)[number]) => {
          await createSessionGate
          const location = input.location?.directory ?? directory
          createdSessions.push(location)
          sessionCreateInputs.push(input)
          const sessionID = `session-${createdSessions.length}`
          legacySessionPermissions.set(sessionID, legacyBaseline.slice())
          return {
            id: sessionID,
            projectID: "project",
            agent: input.agent,
            model: input.model,
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 1, updated: 1 },
            title: `New session ${createdSessions.length}`,
            location: { directory: location },
            permission: legacyBaseline.slice(),
          }
        },
        prompt: async (input: unknown) => {
          sentPrompts.push(directory)
          promptInputs.push(input)
          await sendHook()
          return { data: undefined }
        },
        command: async (input: unknown) => {
          sentCommands.push(input)
          await sendHook()
        },
        shell: async (input: { sessionID: string; id?: string; command: string }) => {
          sentShell.push(input)
          await sendHook()
        },
        interrupt: async (input: { sessionID: string }) => { interruptedSessions.push(input.sessionID) },
      },
    },
    session: {
      command: async () => ({ data: undefined }),
      abort: async () => ({ data: undefined }),
      update: async (input: unknown) => { legacyUpdates.push(input); await legacyUpdateHook() },
    },
    worktree: {
      create: async () => ({ data: { directory: `${directory}/new` } }),
    },
  }
}

function serverFor(scope = ServerScope.local) {
  const client = clientFor("/repo/main")
  return {
    scope,
    protocol: Promise.resolve(protocol),
    protocolKind: () => protocol,
    client,
    currentApi: {
      ...client.api,
      session: {
        ...client.api.session,
        revert: {
          commit: async (..._args: Parameters<ServerApi["session"]["revert"]["commit"]>) => {
            throw new Error("Unexpected session.revert.commit in prompt submission fixture")
          },
        },
      },
      integration: { connect: {}, oauth: {} },
    },
    createClient: (options: { directory: string }) => clientFor(options.directory),
    sessionManagement: {
      setSubagentModels: async (id: string, policy: SubagentModelPolicy) => {
        policyWrites.push({ id, policy })
        await policyWrite()
        return policy
      },
      waitSubagentModels: async () => { await policyWait() },
    },
  }
}

function sdkFor(directory: string, server: ReturnType<typeof serverFor>) {
  return {
    scope: server.scope,
    directory,
    client: server.client,
    api: server.currentApi,
    createClient: server.createClient,
    url: "http://localhost:4096",
  }
}

function promoteRoute(directory: string, id: string) {
  params.id = id
  search.draftId = undefined
  currentSDK = sdkFor(directory, currentServer)
  const owner = reactiveOwner.read?.()
  if (owner) setReactiveOwner("read", () => () => ({ server: owner.server, sdk: sdkFor(directory, owner.server) }))
}

function deferred() {
  const callbacks: { resolve: () => void; reject: (error: Error) => void } = { resolve: () => {}, reject: () => {} }
  const promise = new Promise<void>((resolve, reject) => Object.assign(callbacks, { resolve, reject }))
  return { promise, ...callbacks }
}

beforeAll(async () => {
  const { checksum } = await import("@orchestra/core/util/encode")

  mock.module("@solidjs/router", () => ({
    useNavigate: () => (url: string) => {
      const parts = url.split("/session/")
      promoteRoute(parts[0].slice(1), parts[1])
    },
    useParams: () => params,
    useLocation: () => ({}),
    useSearchParams: () => [search, () => undefined],
  }))

  mock.module("@orchestra/sdk/v2/client", () => ({
    createOrchestraClient: (input: { directory: string }) => {
      createdClients.push(input.directory)
      return clientFor(input.directory)
    },
  }))

  mock.module("@orchestra/ui/toast", () => ({
    Toast: { Region: () => null },
    showToast: () => 0,
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
      await behaviorHook()
      if (behaviors.fail) throw new Error("storage unavailable")
      return behaviors.system
    },
  }))

  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => ({ id: "model", provider: { id: "provider" } }),
        variant: { current: () => variant },
      },
      agent: {
        // A seat renamed from its default label: payloads must carry the stable id, never the label.
        current: () => ({ id: "backend", name: "Pikachu" }),
      },
      session: {
        promote(directory: string, sessionID: string, state: { agent?: string }) {
          promoted.push({ directory, sessionID })
          promotedAgents.push(state.agent)
        },
      },
    }),
  }))

  mock.module("@/context/permission", () => {
    const state = (server: string) => ({
      enableAutoAccept(sessionID: string, directory: string) {
        enabledAutoAccept.push({ server, sessionID, directory })
      },
    })
    return { usePermission: () => ({ currentServerState: () => state(permissionServer) }) }
  })

  mock.module("@/context/tabs", () => ({
    useTabs: () => ({
      draft: () => ({ server: "project-server" }),
      get store() {
        return search.draftId ? [{ type: "draft", draftID: search.draftId, server: "project-server", directory: currentSDK.directory }] : []
      },
      promoteDraft: (draftID: string, session: { server: string; sessionId: string }) => {
        promotedDrafts.push({ draftID, ...session })
        promoteRoute(promoted.at(-1)?.directory ?? currentSDK.directory, session.sessionId)
        promoteHook()
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
    useSDK: () => () => reactiveOwner.read?.().sdk ?? currentSDK,
  }))

  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => () => reactiveOwner.read?.().server ?? currentServer,
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
      set: () => undefined,
    }),
  }))

  mock.module("@/context/server-sync", () => ({
    useServerSync: () => () => ({
      data: { project: profileProjects },
      session: {
        remember: () => undefined,
        set: () => undefined,
        sync: async () => {
          serverSessionSyncs++
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
      fetch: fetch,
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
  acknowledgeDraftPolicy = mod.acknowledgeDraftPolicy
  draftSessionKey = (await import("./draft-session")).draftSessionKey
})

describe("durable subagent policy submission", () => {
  test.each(["prompt", "command", "shell"])("fresh %s dispatch survives promotion unmount, but only after receipt", async (pathway) => {
    search.draftId = "draft-1"
    const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
    togglePending(key, "provider", "model", true)
    commands.push({ name: "review" })
    const entered = deferred()
    const gate = deferred()
    sendHook = async () => { entered.resolve(); await gate.promise }
    const root = createRoot((dispose) => {
      const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "first turn" })
      real.context.add({ type: "file", path: "/repo/main/file", comment: "retain until admission" })
      return { dispose, real, submit: createPromptSubmit({
        ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key,
        autoAccept: () => true, mode: () => pathway === "shell" ? "shell" : "normal",
        onNewSessionWorktreeReset: () => { worktreeResets++ },
      }) }
    })
    const contents = root.real.current()
    const context = root.real.context.items()
    // The production draft route unmounts here; the old fixture only changed params.
    promoteHook = root.dispose
    const sending = root.submit.handleSubmit(new Event("submit"))
    await entered.promise
    expect(promotedDrafts).toEqual([])
    expect(root.real.current()).toBe(contents)
    expect(root.real.context.items()).toBe(context)
    expect(worktreeResets).toBe(0)
    expect(pendingPolicy(key).mode).toBe("allowlist")
    expect(enabledAutoAccept).toHaveLength(1)
    await root.submit.handleSubmit(new Event("submit"))
    expect(createdSessions).toHaveLength(1)
    expect(promptInputs.length + sentCommands.length + sentShell.length).toBe(1)
    gate.resolve()
    await sending
    expect(promotedDrafts).toHaveLength(1)
    expect(worktreeResets).toBe(1)
    expect(pendingSnapshot(key).revision).toBe(0)
    await root.submit.handleSubmit(new Event("submit"))
    expect(promptInputs.length + sentCommands.length + sentShell.length).toBe(1)
  })

  test.each(["prompt", "command", "shell"])("failed fresh %s keeps admission, payload ID, context and selections for retry", async (pathway) => {
    search.draftId = "draft-1"
    const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
    commands.push({ name: "review" })
    togglePending(key, "provider", "model", true)
    const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "retry turn" })
    real.context.add({ type: "file", path: "/repo/main/file", comment: "retain context" })
    const contents = real.current()
    const context = real.context.items()
    const failure = new Error("admission failed")
    sendHook = async () => { throw failure }
    const submit = createPromptSubmit({
      ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key,
      newSessionWorktree: () => "/repo/worktree-a", mode: () => pathway === "shell" ? "shell" : "normal",
      onNewSessionWorktreeReset: () => { worktreeResets++ },
    })
    await expect(submit.handleSubmit(new Event("submit"))).rejects.toBe(failure)
    expect(real.current()).toBe(contents)
    expect(real.context.items()).toBe(context)
    expect(pendingPolicy(key).mode).toBe("allowlist")
    expect(promotedDrafts).toEqual([])
    expect(worktreeResets).toBe(0)
    const first = [...promptInputs, ...sentCommands, ...sentShell][0] as { id: string }
    sendHook = async () => {}
    await submit.handleSubmit(new Event("submit"))
    expect(createdSessions).toEqual(["/repo/worktree-a"])
    expect([...promptInputs, ...sentCommands, ...sentShell]).toEqual([
      expect.objectContaining({ id: first.id }), expect.objectContaining({ id: first.id }),
    ])
    expect(promotedDrafts).toHaveLength(1)
    expect(worktreeResets).toBe(1)
  })

  test("policy edit during request preparation gets latest ACK before actual dispatch", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    togglePending(key, "provider", "model", true)
    const entered = deferred()
    const gate = deferred()
    behaviorHook = async () => { entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "latest policy" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    const sending = submit.handleSubmit(new Event("submit"))
    await entered.promise
    clearPending(key)
    sendHook = async () => { expect(policyWrites.at(-1)?.policy).toEqual({ mode: "inherit" }) }
    gate.resolve()
    await sending
    expect(policyWrites.map((write) => write.policy.mode)).toEqual(["allowlist", "inherit"])
    expect(promptInputs).toHaveLength(1)
  })

  test.each(["prompt", "context", "policy"])("fresh receipt preserves newer %s edit instead of deleting draft", async (edit) => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const entered = deferred()
    const gate = deferred()
    sendHook = async () => { entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "admitted turn" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    const sending = submit.handleSubmit(new Event("submit"))
    await entered.promise
    if (edit === "prompt") real.set([{ type: "text", content: "newer draft", start: 0, end: 11 }])
    if (edit === "context") real.context.add({ type: "file", path: "/repo/main/new", comment: "newer context" })
    if (edit === "policy") togglePending(key, "provider", "new-model", true)
    const contents = real.current()
    const context = real.context.items()
    const policy = pendingSnapshot(key)
    gate.resolve()
    await sending
    expect(real.current()).toBe(contents)
    expect(real.context.items()).toBe(context)
    expect(pendingSnapshot(key)).toEqual(policy)
    expect(promoted).toEqual([])
    expect(promptInputs).toHaveLength(1)
    if (edit === "prompt" || edit === "context") return
    await submit.handleSubmit(new Event("submit"))
    expect(promptInputs).toHaveLength(1)
    expect(promoted).toHaveLength(1)
  })

  test.skipIf(isServer).each(["dispose", "server ABA"])("fresh admission receipt after %s cannot promote stale owner", async (change) => {
    const source = { server: currentServer, sdk: currentSDK }
    const otherServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
    setReactiveOwner("read", () => () => source)
    const entered = deferred()
    const gate = deferred()
    sendHook = async () => { entered.resolve(); await gate.promise }
    const root = createRoot((dispose) => {
      const real = createPromptState({ prompt: "captured server" })
      return { dispose, real, submit: createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined }) }
    })
    const contents = root.real.current()
    const sending = root.submit.handleSubmit(new Event("submit"))
    await entered.promise
    if (change === "dispose") root.dispose()
    if (change === "server ABA") {
      setReactiveOwner("read", () => () => ({ server: otherServer, sdk: sdkFor("/repo/main", otherServer) }))
      await Promise.resolve()
      setReactiveOwner("read", () => () => source)
    }
    gate.resolve()
    await sending
    expect(root.real.current()).toBe(contents)
    expect(promoted).toEqual([])
    expect(promptInputs).toHaveLength(1)
    root.dispose()
  })

  test("inherited-policy ABA during ACK wait persists latest inherit tombstone", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const initial = pendingSnapshot(key)
    expect(initial.revision).toBe(0)
    const entered = deferred()
    const gate = deferred()
    const writes: SubagentModelPolicy[] = []
    const saving = acknowledgeDraftPolicy({
      key, current: () => true, written: () => writes.length > 0, markWritten: () => {}, failedMessage: "bad ACK",
      write: async (policy) => { writes.push(policy); return policy },
      wait: async () => { entered.resolve(); await gate.promise },
    })
    await entered.promise
    clearPending(key)
    togglePending(key, "provider", "model", true)
    clearPending(key)
    const latest = pendingSnapshot(key)
    expect(latest.revision).toBeGreaterThan(initial.revision)
    expect(clearPending(key, initial.revision)).toBe(false)
    gate.resolve()
    const receipt = await saving
    expect(writes).toEqual([{ mode: "inherit" }])
    expect(receipt).toEqual(latest)
    expect(pendingSnapshot(key)).toEqual(latest)
    expect(clearPending(key, latest.revision)).toBe(true)
  })

  test.skipIf(isServer)("reactive owner ABA during ACK permanently expires attempt; deliberate retry adopts same Session", async () => {
    expect(isServer).toBe(false)
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const source = { server: currentServer, sdk: currentSDK }
    const otherServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
    const other = { server: otherServer, sdk: sdkFor("/repo/main", otherServer) }
    setReactiveOwner("read", () => () => source)
    const entered = deferred()
    const gate = deferred()
    togglePending(key, "provider", "model", true)
    policyWrite = async () => { entered.resolve(); await gate.promise }
    const root = createRoot((dispose) => {
      const real = createPromptState({ prompt: "source draft" })
      real.context.add({ type: "file", path: "/repo/main/file", comment: "retain context" })
      return { dispose, real, submit: createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }) }
    })
    const contents = root.real.current()
    const context = root.real.context.items()
    const sending = root.submit.handleSubmit(new Event("submit"))
    await entered.promise
    setReactiveOwner("read", () => () => other)
    await Promise.resolve()
    setReactiveOwner("read", () => () => source)
    gate.resolve()
    await sending
    expect(root.real.current()).toBe(contents)
    expect(root.real.context.items()).toBe(context)
    expect(pendingPolicy(key).mode).toBe("allowlist")
    expect(createdSessions).toHaveLength(1)
    expect(promoted).toEqual([])
    expect(promptInputs).toEqual([])
    policyWrite = async () => {}
    await root.submit.handleSubmit(new Event("submit"))
    expect(createdSessions).toHaveLength(1)
    expect(promoted).toHaveLength(1)
    expect(promptInputs).toHaveLength(1)
    root.dispose()
  })

  test.skipIf(isServer)("reactive owner disposal during ACK expires attempt without consuming draft", async () => {
    expect(isServer).toBe(false)
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const entered = deferred()
    const gate = deferred()
    togglePending(key, "provider", "model", true)
    policyWrite = async () => { entered.resolve(); await gate.promise }
    const root = createRoot((dispose) => {
      const real = createPromptState({ prompt: "retained on disposal" })
      return { dispose, real, submit: createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }) }
    })
    const contents = root.real.current()
    const sending = root.submit.handleSubmit(new Event("submit"))
    await entered.promise
    root.dispose()
    gate.resolve()
    await sending
    expect(root.real.current()).toBe(contents)
    expect(pendingPolicy(key).mode).toBe("allowlist")
    expect(promoted).toEqual([])
    expect(promptInputs).toEqual([])
  })

  test.skipIf(isServer)("reactive owner ABA after queued clear cannot revive captured queued send", async () => {
    expect(isServer).toBe(false)
    params.id = "session-1"
    const source = { server: currentServer, sdk: currentSDK }
    const otherServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
    const other = { server: otherServer, sdk: sdkFor("/repo/main", otherServer) }
    setReactiveOwner("read", () => () => source)
    const queued: FollowupDraft[] = []
    const root = createRoot((dispose) => {
      const real = createPromptState({ prompt: "queued source" })
      return { dispose, real, submit: createPromptSubmit({
        ...submitInput(), prompt: real, shouldQueue: () => true, onQueue: (draft) => { queued.push(draft) },
      }) }
    })
    await root.submit.handleSubmit(new Event("submit"))
    const draft = queued[0]
    if (!draft?.source) throw new Error("missing queued source")
    expect(root.real.current()).toEqual([{ type: "text", content: "", start: 0, end: 0 }])
    expect(draft.source.current()).toBe(true)
    setReactiveOwner("read", () => () => other)
    await Promise.resolve()
    setReactiveOwner("read", () => () => source)
    expect(draft.source.current()).toBe(false)
    expect(await sendFollowupDraft({ ...draft.source, draft })).toBe(false)
    expect(promptInputs).toEqual([])
    root.dispose()
  })

  test("distinct existing Session steer and queue submissions both reach pending policy barrier", async () => {
    params.id = "session-1"
    const entered = deferred()
    const gate = deferred()
    const waits: string[] = []
    policyWait = async () => { waits.push("policy"); entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "first steer" })
    let delivery: "steer" | "queue" = "steer"
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, delivery: () => delivery, working: () => true })
    const first = submit.handleSubmit(new Event("submit"))
    await entered.promise
    real.set([{ type: "text", content: "second queue", start: 0, end: 12 }])
    delivery = "queue"
    const second = submit.handleSubmit(new Event("submit"))
    await Bun.sleep(0)
    expect(waits).toHaveLength(2)
    expect(promptInputs).toEqual([])
    gate.resolve()
    await Promise.all([first, second])
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "first steer", delivery: "steer" }),
      expect.objectContaining({ text: "second queue", delivery: "queue" }),
    ]))
  })

  test("empty existing Session submit interrupts while another submission awaits policy", async () => {
    params.id = "session-1"
    const entered = deferred()
    const gate = deferred()
    policyWait = async () => { entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "pending send" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, working: () => true })
    const sending = submit.handleSubmit(new Event("submit"))
    await entered.promise
    real.reset()
    await submit.handleSubmit(new Event("submit"))
    expect(interruptedSessions).toEqual(["session-1"])
    expect(promptInputs).toEqual([])
    gate.resolve()
    await sending
  })

  test("untouched draft reads inherit; explicit empty selection writes deny-all", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    expect(pendingSelection(key).size).toBe(0)
    expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
    const inherited = createPromptState({ prompt: "first" })
    await createPromptSubmit({ ...submitInput(), prompt: inherited, info: () => undefined, pendingKey: () => key })
      .handleSubmit(new Event("submit"))
    expect(policyWrites).toEqual([])
    expect(promptInputs).toHaveLength(1)

    params.id = undefined
    currentSDK = sdkFor("/repo/main", currentServer)
    const denied = createPromptState({ prompt: "second" })
    togglePending(key, "provider", "model", true)
    togglePending(key, "provider", "model", false)
    expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [] })
    await createPromptSubmit({ ...submitInput(), prompt: denied, info: () => undefined, pendingKey: () => key })
      .handleSubmit(new Event("submit"))
    expect(policyWrites).toEqual([{ id: "session-2", policy: { mode: "allowlist", models: [] } }])
    expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  })

  test("failed policy ACK retains draft/context/worktree/session; retry adopts same admission", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const real = createPromptState({ prompt: "ls" })
    real.context.add({ type: "file", path: "/repo/main/file", comment: "keep me" })
    const contents = real.current()
    const context = real.context.items()
    togglePending(key, "provider", "model", true)
    const failure = new Error("policy write failed")
    policyWrite = async () => { throw failure }
    const submit = createPromptSubmit({
      ...submitInput(), prompt: real, info: () => undefined, mode: () => "shell", pendingKey: () => key,
      newSessionWorktree: () => "create", onNewSessionWorktreeReset: () => { worktreeResets++ },
    })
    await expect(submit.handleSubmit(new Event("submit"))).rejects.toBe(failure)
    expect(real.current()).toBe(contents)
    expect(real.context.items()).toBe(context)
    expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "provider", id: "model" }] })
    expect(createdSessions).toEqual(["/repo/main/new"])
    expect(promoted).toEqual([])
    expect(sentShell).toEqual([])
    expect(worktreeResets).toBe(0)

    policyWrite = async () => {}
    Worktree.ready(ServerScope.local, "/repo/main/new")
    await submit.handleSubmit(new Event("submit"))
    expect(createdSessions).toEqual(["/repo/main/new"])
    expect(sentShell).toHaveLength(1)
    expect(sentShell[0]?.sessionID).toBe("session-1")
    expect(promoted).toEqual([{ directory: "/repo/main/new", sessionID: "session-1" }])
    expect(worktreeResets).toBe(1)
    expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  })

  test("draft inheritance edit during write gets another ACK before promotion", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
    search.draftId = "draft-1"
    const entered = deferred()
    const gate = deferred()
    togglePending(key, "provider", "model", true)
    policyWrite = async () => { entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "keep draft" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    const sending = submit.handleSubmit(new Event("submit"))
    await entered.promise
    clearPending(key)
    expect(promotedDrafts).toEqual([])
    expect(promptInputs).toEqual([])
    gate.resolve()
    await sending
    expect(policyWrites.map((write) => write.policy)).toEqual([
      { mode: "allowlist", models: [{ providerID: "provider", id: "model" }] }, { mode: "inherit" },
    ])
    expect(promotedDrafts).toHaveLength(1)
    expect(promptInputs).toHaveLength(1)
  })

  test("double-click while ACK waits admits one Session and one prompt", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const entered = deferred()
    const gate = deferred()
    togglePending(key, "provider", "model", true)
    policyWrite = async () => { entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "send once" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    const first = submit.handleSubmit(new Event("submit"))
    await entered.promise
    await submit.handleSubmit(new Event("submit"))
    expect(createdSessions).toHaveLength(1)
    expect(promptInputs).toEqual([])
    gate.resolve()
    await first
    expect(createdSessions).toHaveLength(1)
    expect(promptInputs).toHaveLength(1)
  })

  test("owner switch during ACK keeps source draft and admitted Session for retry", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const source = currentServer
    const entered = deferred()
    const gate = deferred()
    togglePending(key, "provider", "model", true)
    policyWrite = async () => { entered.resolve(); await gate.promise }
    const real = createPromptState({ prompt: "source draft" })
    const contents = real.current()
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    const sending = submit.handleSubmit(new Event("submit"))
    await entered.promise
    currentServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
    currentSDK = sdkFor("/repo/main", currentServer)
    gate.resolve()
    await sending
    expect(real.current()).toBe(contents)
    expect(pendingPolicy(key).mode).toBe("allowlist")
    expect(promoted).toEqual([])
    expect(promptInputs).toEqual([])

    currentServer = source
    currentSDK = sdkFor("/repo/main", source)
    policyWrite = async () => {}
    await submit.handleSubmit(new Event("submit"))
    expect(createdSessions).toHaveLength(1)
    expect(promptInputs).toHaveLength(1)
  })

  test.each(["prompt", "command", "shell", "handoff"])("existing Session %s fences failed writes without clearing", async (pathway) => {
    params.id = "session-1"
    commands.push({ name: "review" })
    const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "keep input" })
    real.context.add({ type: "file", path: "/repo/main/file", comment: "keep comment" })
    const contents = real.current()
    const context = real.context.items()
    const failure = new Error("latest write failed")
    policyWait = async () => { throw failure }
    const queued: FollowupDraft[] = []
    const submit = createPromptSubmit({
      ...submitInput(), prompt: real, mode: () => pathway === "shell" ? "shell" : "normal",
      shouldQueue: () => pathway === "handoff", onQueue: (draft) => { queued.push(draft) },
    })
    await expect(submit.handleSubmit(new Event("submit"))).rejects.toBe(failure)
    expect(real.current()).toBe(contents)
    expect(real.context.items()).toBe(context)
    expect(promptInputs).toEqual([])
    expect(sentCommands).toEqual([])
    expect(sentShell).toEqual([])
    expect(queued).toEqual([])
  })

  test("queued handoff rechecks latest write and uses captured source at actual send", async () => {
    params.id = "session-1"
    const queued: FollowupDraft[] = []
    const real = createPromptState({ prompt: "/review changes" })
    commands.push({ name: "review" })
    await createPromptSubmit({
      ...submitInput(), prompt: real, shouldQueue: () => true, onQueue: (draft) => { queued.push(draft) },
    }).handleSubmit(new Event("submit"))
    const draft = queued[0]
    if (!draft?.source) throw new Error("missing captured queued source")
    const failure = new Error("queued policy failed")
    policyWait = async () => { throw failure }
    await expect(sendFollowupDraft({ ...draft.source, draft })).rejects.toBe(failure)
    expect(sentCommands).toEqual([])
    expect(optimistic).toEqual([])
    currentServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
    currentSDK = sdkFor("/repo/main", currentServer)
    policyWait = async () => {}
    expect(await sendFollowupDraft({ ...draft.source, draft })).toBe(false)
    expect(sentCommands).toEqual([])
  })

  test("draft ACK fence detects same-policy ABA edits and clear only consumes exact revision", async () => {
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const gate = deferred()
    const entered = deferred()
    togglePending(key, "provider", "model", true)
    const first = pendingSnapshot(key)
    const writes: SubagentModelPolicy[] = []
    const receipt = acknowledgeDraftPolicy({
      key, current: () => true, written: () => writes.length > 0, markWritten: () => {}, failedMessage: "bad ACK",
      wait: async () => {},
      write: async (policy) => { writes.push(policy); entered.resolve(); await gate.promise; return policy },
    })
    await entered.promise
    clearPending(key)
    togglePending(key, "provider", "model", true)
    expect(clearPending(key, first.revision)).toBe(false)
    gate.resolve()
    const acknowledged = await receipt
    expect(writes).toHaveLength(2)
    if (!acknowledged) throw new Error("missing draft ACK")
    expect(clearPending(key, acknowledged.revision)).toBe(true)
  })

  test("V1 fresh allowlist to inherit preserves restrictive baseline without updating permission", async () => {
    protocol = "v1"
    currentServer = serverFor()
    currentSDK = sdkFor("/repo/main", currentServer)
    legacyBaseline.push(
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "provider/original", action: "allow" },
    )
    const baseline = legacyBaseline.slice()
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    const gate = deferred()
    createSessionGate = gate.promise
    togglePending(key, "provider", "draft-model", true)
    const real = createPromptState({ prompt: "normal prompt under original rules" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    const sending = submit.handleSubmit(new Event("submit"))
    clearPending(key)
    expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
    expect(legacyUpdates).toEqual([])
    expect(promoted).toEqual([])
    gate.resolve()
    await sending
    expect(legacyUpdates).toEqual([])
    expect(legacySessionPermissions.get("session-1")).toEqual(baseline)
    expect(storedSessions["/repo/main"]?.[0]).toMatchObject({ id: "session-1" })
    expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
    expect(promptInputs).toEqual([expect.objectContaining({ sessionID: "session-1", text: "normal prompt under original rules" })])
    expect(pendingSnapshot(key)).toEqual({ revision: 0, policy: { mode: "inherit" } })
  })

  test("V1 inherit after acknowledged override blocks promotion/send and retains selection on retry", async () => {
    protocol = "v1"
    currentServer = serverFor()
    currentSDK = sdkFor("/repo/main", currentServer)
    legacyBaseline.push(
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "provider/original", action: "allow" },
    )
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    togglePending(key, "provider", "draft-model", true)
    // The first update succeeds while the draft changes; its ACK must prevent an unsafe inherit retry.
    legacyUpdateHook = async () => { clearPending(key) }
    const real = createPromptState({ prompt: "retain after legacy override" })
    real.context.add({ type: "file", path: "/repo/main/file", comment: "retain comment" })
    const contents = real.current()
    const context = real.context.items()
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
    await expect(submit.handleSubmit(new Event("submit"))).rejects.toBeInstanceOf(SessionManagementUnsupported)
    const selection = pendingSnapshot(key)
    expect(selection.policy).toEqual({ mode: "inherit" })
    expect(selection.revision).toBeGreaterThan(0)
    expect(real.current()).toBe(contents)
    expect(real.context.items()).toBe(context)
    expect(legacyUpdates).toEqual([{
      sessionID: "session-1", directory: "/repo/main", permission: [
        { permission: "task", pattern: "*/*", action: "deny" },
        { permission: "task", pattern: "provider/draft-model", action: "allow" },
      ],
    }])
    expect(createdSessions).toEqual(["/repo/main"])
    expect(promoted).toEqual([])
    expect(promptInputs).toEqual([])
    legacyUpdateHook = async () => {}
    await expect(submit.handleSubmit(new Event("submit"))).rejects.toBeInstanceOf(SessionManagementUnsupported)
    expect(createdSessions).toEqual(["/repo/main"])
    expect(legacyUpdates).toHaveLength(1)
    expect(pendingSnapshot(key)).toEqual(selection)
    expect(real.current()).toBe(contents)
    expect(real.context.items()).toBe(context)
    expect(promoted).toEqual([])
    expect(promptInputs).toEqual([])
  })

  test("V1 empty draft appends deny-all permission rules before sending", async () => {
    protocol = "v1"
    currentServer = serverFor()
    currentSDK = sdkFor("/repo/main", currentServer)
    const key = draftSessionKey(ServerScope.local, "/repo/main")
    togglePending(key, "provider", "model", false)
    const real = createPromptState({ prompt: "ls" })
    await createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, mode: () => "shell", pendingKey: () => key })
      .handleSubmit(new Event("submit"))
    expect(legacyUpdates).toEqual([{
      sessionID: "session-1", directory: "/repo/main", permission: [{ permission: "task", pattern: "*/*", action: "deny" }],
    }])
    expect(policyWrites).toEqual([])
    expect(sentShell).toHaveLength(1)
  })
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
  promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
  params = {}
  search = {}
  sentShell.length = 0
  syncedDirectories.length = 0
  selected = "/repo/worktree-a"
  variant = undefined
  permissionServer = "server-a"
  createSessionGate = undefined
  sendHook = async () => {}
  behaviorHook = async () => {}
  promoteHook = () => {}
  serverSessionSyncs = 0
  policyWrites.length = 0
  policyWrite = async () => {}
  policyWait = async () => {}
  legacyUpdates.length = 0
  legacyBaseline.length = 0
  legacySessionPermissions.clear()
  legacyUpdateHook = async () => {}
  worktreeResets = 0
  protocol = "v2"
  currentServer = serverFor()
  currentSDK = sdkFor("/repo/main", currentServer)
  setReactiveOwner("read", undefined)
  interruptedSessions.length = 0
  const workspaceKey = draftSessionKey(ServerScope.local, "/repo/main")
  const draftKey = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
  clearPending(workspaceKey, pendingSnapshot(workspaceKey).revision)
  clearPending(draftKey, pendingSnapshot(draftKey).revision)
  createdClients.length = 0
  for (const key of Object.keys(storedSessions)) delete storedSessions[key]
})

describe("prompt submit worktree selection", () => {
  test("reads the latest worktree accessor value per submit", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    params.id = undefined
    currentSDK = sdkFor("/repo/main", currentServer)
    selected = "/repo/worktree-b"
    await submit.handleSubmit(event)

    expect(createdClients).toEqual([])
    expect(createdSessions).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
    expect(sessionCreateInputs).toEqual([
      {
        agent: "backend",
        model: { id: "model", providerID: "provider", variant: undefined },
        location: { directory: "/repo/worktree-a" },
      },
      {
        agent: "backend",
        model: { id: "model", providerID: "provider", variant: undefined },
        location: { directory: "/repo/worktree-b" },
      },
    ])
    expect(sentShell).toEqual([
      expect.objectContaining({ sessionID: "session-1", id: expect.stringMatching(/^evt_/), command: "ls" }),
      expect.objectContaining({ sessionID: "session-2", id: expect.stringMatching(/^evt_/), command: "ls" }),
    ])
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"])
    expect(serverSessionSyncs).toBe(0)
    expect(promoted).toEqual([
      { directory: "/repo/worktree-a", sessionID: "session-1" },
      { directory: "/repo/worktree-b", sessionID: "session-2" },
    ])
    expect(promotedAgents).toEqual(["backend", "backend"])
    expect(JSON.stringify([sessionCreateInputs, sentShell])).not.toContain("Pikachu")
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"])
  })

  test("applies auto-accept to newly created sessions", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(enabledAutoAccept).toEqual([{ server: "server-a", sessionID: "session-1", directory: "/repo/worktree-a" }])
  })

  test("keeps auto-accept bound to the submission server", async () => {
    let release = () => {}
    createSessionGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const result = submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)
    permissionServer = "server-b"
    release()
    await result

    expect(enabledAutoAccept).toEqual([{ server: "server-a", sessionID: "session-1", directory: "/repo/worktree-a" }])
  })

  test("promotes drafts using the selected project's server", async () => {
    search = { draftId: "draft-1" }
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
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
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(promotedDrafts).toEqual([{ draftID: "draft-1", server: "project-server", sessionId: "session-1" }])
  })

  test("includes the selected variant on optimistic prompts", async () => {
    params = { id: "session-1" }
    variant = "high"

    const submit = createPromptSubmit({
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
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    await Bun.sleep(0)

    expect(optimistic).toHaveLength(1)
    expect(optimistic[0]).toMatchObject({
      message: {
        agent: "backend",
        model: { providerID: "provider", modelID: "model", variant: "high" },
      },
    })
    expect(sentPrompts).toEqual(["/repo/main"])
    expect(promptInputs[0]).toMatchObject({
      sessionID: "session-1",
      text: "ls",
      files: [],
      agents: [],
    })
    expect((promptInputs[0] as { id?: string }).id).toStartWith("msg_")
    expect((promptInputs[0] as { legacyParts?: { id: string; type: string; text?: string }[] }).legacyParts).toEqual([
      { id: expect.stringMatching(/^prt_/), type: "text", text: "ls" },
    ])
  })

  test("reads the profile's LLM behaviors when each message is sent, after the input clears", async () => {
    params = { id: "session-1" }
    const submit = createPromptSubmit({
      ...submitInput(),
      setPopover: () => void events.push("clear input"),
    })
    const event = { preventDefault: () => undefined } as unknown as Event

    behaviors.system = "## Caveman (intensity: ultra)"
    await submit.handleSubmit(event)
    await Bun.sleep(0)
    behaviors.system = undefined
    await submit.handleSubmit(event)
    await Bun.sleep(0)

    expect(events).toEqual(["clear input", "resolve behaviors", "clear input", "resolve behaviors"])
    expect(behaviorReads).toEqual([
      { scope: "local", directory: "/repo/main", projects: profileProjects },
      { scope: "local", directory: "/repo/main", projects: profileProjects },
    ])
    expect(promptInputs).toHaveLength(2)
    expect((promptInputs[0] as { system?: string }).system).toBe("## Caveman (intensity: ultra)")
    expect((promptInputs[1] as { system?: string }).system).toBeUndefined()
  })

  test("a failing behavior read still sends the message, without behaviors", async () => {
    params = { id: "session-1" }
    behaviors.fail = true
    await createPromptSubmit(submitInput()).handleSubmit({ preventDefault: () => undefined } as unknown as Event)
    await Bun.sleep(0)

    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "ls" })
    expect((promptInputs[0] as { system?: string }).system).toBeUndefined()
  })

  test("a queued message stores no behaviors; they are read when it is sent", async () => {
    params = { id: "session-1" }
    behaviors.system = "## Caveman (intensity: lite)"
    const queued: FollowupDraft[] = []
    await createPromptSubmit({
      ...submitInput(),
      shouldQueue: () => true,
      onQueue: (draft) => void queued.push(draft),
    }).handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(queued).toHaveLength(1)
    expect(queued[0]).not.toHaveProperty("system")
    expect(behaviorReads).toEqual([])
    expect(promptInputs).toEqual([])

    const sync = { data: { command: [] }, session: { optimistic: { add: () => {}, remove: () => {} } } }
    const serverSync = { data: { project: profileProjects }, session: { set: () => {} } }
    const send = (draft: FollowupDraft) =>
      sendFollowupDraft({
        api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
        sync: sync as unknown as Parameters<typeof sendFollowupDraft>[0]["sync"],
        serverSync: serverSync as unknown as Parameters<typeof sendFollowupDraft>[0]["serverSync"],
        draft,
      })
    const system = await followupSystem(
      { platform: "web" } as Parameters<typeof followupSystem>[0],
      "local" as Parameters<typeof followupSystem>[1],
      serverSync as unknown as Parameters<typeof followupSystem>[2],
      "/repo/worktree-a",
    )
    await send({ ...queued[0]!, system })
    await send(queued[0]!)

    expect(behaviorReads).toEqual([{ scope: "local", directory: "/repo/worktree-a", projects: profileProjects }])
    expect((promptInputs[0] as { system?: string }).system).toBe("## Caveman (intensity: lite)")
    expect((promptInputs[1] as { system?: string }).system).toBeUndefined()
  })

  test("sends the composer's delivery choice with prompts and commands to an existing session", async () => {
    params = { id: "session-1" }
    commands.push({ name: "review" })
    const submit = (delivery: "steer" | "queue" | undefined) =>
      createPromptSubmit({
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
        delivery: () => delivery,
      })
    const event = { preventDefault: () => undefined } as unknown as Event

    await submit("queue").handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "ls", delivery: "queue" })

    // Without a choice (a V1 server), no delivery field is sent at all.
    promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
    await submit(undefined).handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs[1]).not.toHaveProperty("delivery", expect.anything())

    promptValue = [{ type: "text", content: "/review staged changes", start: 0, end: 22 }]
    await submit("steer").handleSubmit(event)
    expect(sentCommands).toHaveLength(1)
    expect(sentCommands[0]).toMatchObject({ command: "review", delivery: "steer" })
  })

  test("a queued prompt sent while the session works gets no optimistic sent turn", async () => {
    params = { id: "session-1" }
    const submit = (working: boolean) =>
      createPromptSubmit({
        prompt,
        info: () => ({ id: "session-1" }),
        imageAttachments: () => [],
        commentCount: () => 0,
        autoAccept: () => false,
        mode: () => "normal",
        working: () => working,
        editor: () => undefined,
        queueScroll: () => undefined,
        promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
        addToHistory: () => undefined,
        resetHistoryNavigation: () => undefined,
        setMode: () => undefined,
        setPopover: () => undefined,
        delivery: () => "queue",
      })
    const event = { preventDefault: () => undefined } as unknown as Event

    await submit(true).handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ delivery: "queue" })
    expect(optimistic).toHaveLength(0)

    // Idle, the queued prompt promotes at once, so it shows as sent like any prompt.
    promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
    await submit(false).handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(2)
    expect(optimistic).toHaveLength(1)
  })

  test("submits slash commands through the current session API", async () => {
    params = { id: "session-1" }
    variant = "high"
    commands.push({ name: "review" })
    promptValue = [{ type: "text", content: "/review staged changes", start: 0, end: 22 }]

    const submit = createPromptSubmit({
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

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(sentCommands).toEqual([
      {
        sessionID: "session-1",
        id: expect.stringMatching(/^msg_/),
        command: "review",
        arguments: "staged changes",
        agent: "backend",
        model: { id: "model", providerID: "provider", variant: "high" },
        files: [],
      },
    ])
    expect(serverSessionSyncs).toBe(0)
  })

  test("uses an injected model selection", async () => {
    params = { id: "session-1" }
    const model = {
      current: () => ({ id: "draft-model", provider: { id: "draft-provider" } }),
      variant: { current: () => "draft-variant" },
    } as unknown as ModelSelection
    const submit = createPromptSubmit({
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
      model,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(optimistic[0]).toMatchObject({
      message: {
        model: { providerID: "draft-provider", modelID: "draft-model", variant: "draft-variant" },
      },
    })
  })

  test("seeds new sessions before optimistic prompts are added", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
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
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(storedSessions["/repo/worktree-a"]).toHaveLength(1)
    expect(storedSessions["/repo/worktree-a"]?.[0]).toMatchObject({ id: "session-1", title: "New session 1" })
    expect(optimisticSeeded).toEqual([true])
  })
})
