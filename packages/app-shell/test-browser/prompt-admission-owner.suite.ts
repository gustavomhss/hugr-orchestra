import { beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { createRequire } from "node:module"
import { batch, createComponent, createRoot, getOwner } from "solid-js"
import { createStore } from "solid-js/store"
import { createTabMemory } from "@/context/tab-memory"
import { base64Encode } from "@orchestra/core/util/encode"
import type { Tab } from "@/context/tabs"
import type { PromptScope } from "@/context/prompt-state"
import type { ServerScope } from "@/utils/server-scope"

const servers = { A: "http://a.invalid", B: "http://b.invalid" }
const [route, setRoute] = createStore({ server: "A" as "A" | "B", draftId: undefined as string | undefined, id: undefined as string | undefined })
const [tabs, setTabs] = createStore<Tab[]>([])
const requests: { server: string; operation: string; input?: unknown }[] = []
const promotions: { draftID: string; server: string; sessionId: string }[] = []
const localPromotions: { directory: string; sessionID: string }[] = []
const handoffs: { dir: string; sessionID: string }[] = []
const policyWaits: string[] = []
const directory = "/shared/repo"
let memory = createTabMemory(null)
let created = Promise.withResolvers<void>()
let createGate = Promise.withResolvers<void>()
let saved = Promise.withResolvers<void>()
let saveGate = Promise.withResolvers<void>()
let actual: typeof import("@/context/prompt")
let createPromptSubmit: typeof import("@/components/prompt-input/submit").createPromptSubmit
let selection: typeof import("@/components/draft-subagent-models")
let draftSessionKey: typeof import("@/components/prompt-input/draft-session").draftSessionKey
let serial = 0

function promoteRoute(server: string, sessionID: string) {
  if (server !== servers.A && server !== servers.B) throw new Error("Unknown promotion server")
  setRoute({ server: server === servers.A ? "A" : "B", draftId: undefined, id: sessionID })
}

beforeAll(async () => {
  const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
  Bun.plugin({
    name: "solid-prompt-admission-owner",
    setup(build) {
      build.onLoad({ filter: /(?:prompt|helper)\.tsx\?admission-owner$/ }, async (args) => {
        const file = args.path.replace(/\?admission-owner$/, "")
        const result = await solid("@babel/core").transformAsync(await Bun.file(file).text(), {
          filename: file,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        })
        return { contents: result.code, loader: "ts" }
      })
    },
  })
  const helper = await import(`${Bun.resolveSync("@orchestra/ui/context/helper", import.meta.dir)}?admission-owner`)
  mock.module("@orchestra/ui/context", () => ({ createSimpleContext: helper.createSimpleContext }))
  mock.module("@solidjs/router", () => ({
    useParams: () => ({
      get id() {
        return route.id
      },
    }),
    useSearchParams: () => [
      {
        get draftId() {
          return route.draftId
        },
      },
      () => undefined,
    ],
    useNavigate: () => (url: string) => {
      const [dir, id] = url.slice(1).split("/session/")
      if (dir !== base64Encode(directory) || !id) throw new Error("Unexpected fixture navigation")
      promoteRoute(servers[route.server], id)
    },
  }))
  mock.module("@/context/platform", () => ({
    usePlatform: () => ({ platform: "web", fetch, openExternal: () => undefined }),
  }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
  mock.module("@/utils/toast", () => ({ showToast: () => undefined }))
  mock.module("@/utils/llm-behaviors-store", () => ({ resolveBehaviorSystem: async () => undefined }))
  mock.module("@/context/tabs", () => ({
    useTabs: () => ({
      store: tabs,
      state: <T>(tab: Tab, name: string, init: () => T) =>
        memory.ensure(tab.type === "draft" ? `draft:${tab.draftID}` : `${tab.server}:${tab.sessionId}`, name, init),
      draft: (id: string) => {
        const draft = tabs.find((tab) => tab.type === "draft" && tab.draftID === id)
        if (!draft || draft.type !== "draft") throw new Error("Missing fixture draft")
        return draft
      },
      promoteDraft: (draftID: string, session: { server: string; sessionId: string }) => {
        promotions.push({ draftID, ...session })
        const index = tabs.findIndex((tab) => tab.type === "draft" && tab.draftID === draftID)
        if (index < 0) throw new Error("Promotion draft missing")
        batch(() => {
          setTabs((current) => current.map((tab, position) => position === index
            ? { type: "session" as const, server: session.server as Tab["server"], sessionId: session.sessionId } : tab))
          promoteRoute(session.server, session.sessionId)
        })
        memory.remove(`draft:${draftID}`)
      },
    }),
  }))
  const clients = Object.fromEntries(
    (["A", "B"] as const).map((server) => [
      server,
      {
        scope: servers[server],
        directory,
        api: {
          session: {
            create: async (input: unknown) => {
              requests.push({ server, operation: "create", input })
              created.resolve()
              await createGate.promise
              return {
                id: `created-A-${serial}`,
                projectID: "project",
                title: "Created A",
                location: { directory },
                time: { created: 1, updated: 1 },
              }
            },
            prompt: async (input: unknown) => {
              requests.push({ server, operation: "prompt", input })
            },
          },
        },
      },
    ]),
  )
  const contexts = Object.fromEntries(
    (["A", "B"] as const).map((server) => [
      server,
      {
        scope: servers[server],
        server: { type: "http", http: { url: servers[server] } },
        protocol: Promise.resolve("v1"),
        // This V1 fixture has no outstanding V2 writes. Its real exercised rules boundary is update/saveGate below.
        sessionManagement: { waitSubagentModels: async (id: string) => { policyWaits.push(id) } },
        client: {
          session: {
            update: async (input: unknown) => {
              requests.push({ server, operation: "rules", input })
              saved.resolve()
              await saveGate.promise
            },
          },
        },
      },
    ]),
  )
  mock.module("@/context/sdk", () => ({ useSDK: () => () => clients[route.server] }))
  mock.module("@/context/server-sdk", () => ({ useServerSDK: () => () => contexts[route.server] }))
  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: { command: [] },
      session: { optimistic: { add: () => undefined, remove: () => undefined } },
    }),
  }))
  mock.module("@/context/server-sync", () => ({
    useServerSync: () => () => ({
      data: { project: [] },
      session: { remember: () => undefined, set: () => undefined },
      child: () => [{ session: [] }, () => undefined],
    }),
  }))
  mock.module("@/context/local", () => ({
    useLocal: () => ({
      agent: { current: () => ({ id: "maestro", name: "Maestro" }) },
      model: { current: () => ({ id: "model", provider: { id: "provider" } }), variant: { current: () => undefined } },
      session: { promote: (directory: string, sessionID: string) => localPromotions.push({ directory, sessionID }) },
    }),
  }))
  mock.module("@/context/permission", () => ({ usePermission: () => ({ currentServerState: () => ({}) }) }))
  mock.module("@/context/layout", () => ({ useLayout: () => ({ handoff: {
    setTabs: (dir: string, sessionID: string) => handoffs.push({ dir, sessionID }),
  } }) }))
  actual = await import(`${Bun.resolveSync("@/context/prompt", import.meta.dir)}?admission-owner`)
  // Submit and the mounted, real PromptProvider must share the same context.
  mock.module("@/context/prompt", () => actual)
  const submit = await import("@/components/prompt-input/submit")
  createPromptSubmit = submit.createPromptSubmit
  selection = await import("@/components/draft-subagent-models")
  draftSessionKey = (await import("@/components/prompt-input/draft-session")).draftSessionKey
})

beforeEach(() => {
  memory.dispose()
  memory = createTabMemory(null)
  setRoute({ server: "A", draftId: `admission-owner-${++serial}`, id: undefined })
  setTabs([{ type: "draft", draftID: route.draftId, server: servers.A as Tab["server"], directory }])
  requests.length = 0
  promotions.length = 0
  localPromotions.length = 0
  handoffs.length = 0
  policyWaits.length = 0
  created = Promise.withResolvers<void>()
  createGate = Promise.withResolvers<void>()
  saved = Promise.withResolvers<void>()
  saveGate = Promise.withResolvers<void>()
})

function mountAdmission() {
  return createRoot((dispose) => {
    memory = createTabMemory(getOwner())
    let prompt!: ReturnType<typeof actual.usePrompt>
    let submit!: ReturnType<typeof createPromptSubmit>
    createComponent(actual.PromptProvider, {
      get children() {
        prompt = actual.usePrompt()
        submit = createPromptSubmit({
          prompt, info: () => undefined, imageAttachments: () => [], commentCount: () => 0,
          autoAccept: () => false, mode: () => "normal", working: () => false, editor: () => undefined,
          queueScroll: () => undefined, promptLength: () => 0, addToHistory: () => undefined,
          resetHistoryNavigation: () => undefined, setMode: () => undefined, setPopover: () => undefined,
        })
        return null
      },
    })
    return { dispose, prompt, submit }
  })
}

async function requireGate(gate: Promise<void>, pending: Promise<unknown>, name: string) {
  expect(await Promise.race([
    gate.then(() => name), pending.then(() => "submit-finished", () => "submit-failed"),
  ])).toBe(name)
}

test.each(["create", "rules", "draft-before-sdk"] as const)(
  "real PromptProvider preserves A's unsent draft on owner change during %s",
  async (phase) => {
    const instance = mountAdmission()
    const draftID = route.draftId
    const key = draftSessionKey(servers.A as ServerScope, directory, draftID)
    let pending: Promise<unknown> | undefined
    try {
      await instance.prompt.ready.promise
      const source = instance.prompt.capture()
      const scope: PromptScope = { dir: base64Encode(directory), id: `created-A-${serial}` }
      const destinationA = instance.prompt.capture(scope)
      source.set([{ type: "text", content: "submitted-A", start: 0, end: 11 }])
      source.context.add({ type: "file", path: "submitted-A.ts" })
      if (phase === "rules") selection.togglePending(key, "provider", "restricted")
      pending = Promise.resolve(instance.submit.handleSubmit({ preventDefault: () => undefined } as Event))
      await requireGate(created.promise, pending, "create")
      if (phase === "rules") {
        createGate.resolve()
        await requireGate(saved.promise, pending, "rules")
        expect(requests.filter((request) => request.operation === "rules")).toEqual([
          { server: "A", operation: "rules", input: expect.objectContaining({ sessionID: scope.id, permission: selection.pendingRules(key) }) },
        ])
      }
      source.set([{ type: "text", content: "unsent-A", start: 0, end: 8 }])
      source.context.add({ type: "file", path: "unsent-A.ts" })
      setTabs(0, "server", servers.B as Tab["server"])
      if (phase !== "draft-before-sdk") setRoute("server", "B")
      createGate.resolve()
      saveGate.resolve()
      await pending
      expect(source.current()[0]).toMatchObject({ content: "unsent-A" })
      expect(source.context.items().map((item) => item.path)).toEqual(["submitted-A.ts", "unsent-A.ts"])
      setRoute("server", "B")
      const destinationB = instance.prompt.capture(scope)
      expect(destinationB).not.toBe(destinationA)
      expect(destinationB).not.toBe(source)
      expect(destinationB.current()[0]).toMatchObject({ content: "" })
      expect(destinationB.context.items()).toEqual([])
      expect(destinationA.context.items()).toEqual([])
      expect(promotions).toEqual([])
      expect(requests.filter((request) => request.operation === "prompt")).toEqual([])
      if (phase === "rules") expect(selection.pendingRules(key)).toHaveLength(2)

      // Returning alone never resumes the departed attempt. Deliberate retry adopts its admitted Session.
      setTabs(0, "server", servers.A as Tab["server"])
      setRoute("server", "A")
      expect(source.current()[0]).toMatchObject({ content: "unsent-A" })
      expect(requests.filter((request) => request.operation === "prompt")).toEqual([])
      await instance.submit.handleSubmit({ preventDefault: () => undefined } as Event)
      expect(requests.filter((request) => request.operation === "create")).toHaveLength(1)
      expect(requests.filter((request) => request.operation === "prompt")).toEqual([
        { server: "A", operation: "prompt", input: expect.objectContaining({ sessionID: scope.id, text: "unsent-A" }) },
      ])
      expect(destinationB.current()[0]).toMatchObject({ content: "" })
      expect(destinationB.context.items()).toEqual([])
      expect(route.id).toBe(scope.id)
      expect(route.draftId).toBeUndefined()
      expect(tabs).toEqual([{ type: "session", server: servers.A, sessionId: scope.id }])
      expect(promotions).toEqual([{ draftID, server: servers.A, sessionId: scope.id }])
      expect(localPromotions).toEqual([{ directory, sessionID: scope.id }])
      expect(handoffs).toEqual([{ dir: base64Encode(directory), sessionID: scope.id }])
      expect(policyWaits).toEqual([])
    } finally {
      createGate.resolve()
      saveGate.resolve()
      instance.dispose()
      await pending?.catch(() => undefined)
      selection.clearPending(key)
      memory.dispose()
    }
  },
)

test("real PromptProvider fresh A admission promotes coherently and sends once", async () => {
  const instance = mountAdmission()
  const draftID = route.draftId
  let pending: Promise<unknown> | undefined
  try {
    await instance.prompt.ready.promise
    instance.prompt.capture().set([{ type: "text", content: "fresh-A", start: 0, end: 7 }])
    createGate.resolve()
    saveGate.resolve()
    pending = Promise.resolve(instance.submit.handleSubmit({ preventDefault: () => undefined } as Event))
    await pending
    const sessionId = `created-A-${serial}`
    expect(route.server).toBe("A")
    expect(route.draftId).toBeUndefined()
    expect(route.id).toBe(sessionId)
    expect(tabs).toEqual([{ type: "session", server: servers.A, sessionId }])
    expect(promotions).toEqual([{ draftID, server: servers.A, sessionId }])
    expect(localPromotions).toEqual([{ directory, sessionID: sessionId }])
    expect(handoffs).toEqual([{ dir: base64Encode(directory), sessionID: sessionId }])
    expect(requests.filter((request) => request.operation === "create")).toHaveLength(1)
    expect(requests.filter((request) => request.operation === "prompt")).toEqual([
      { server: "A", operation: "prompt", input: expect.objectContaining({ sessionID: sessionId, text: "fresh-A" }) },
    ])
    expect(instance.prompt.current()[0]).toMatchObject({ content: "" })
  } finally {
    createGate.resolve(); saveGate.resolve(); instance.dispose()
    await pending?.catch(() => undefined)
    memory.dispose()
  }
})

test("real PromptProvider owner ABA permanently holds old attempt until deliberate retry", async () => {
  const instance = mountAdmission()
  const key = draftSessionKey(servers.A as ServerScope, directory, route.draftId)
  let pending: Promise<unknown> | undefined
  try {
    await instance.prompt.ready.promise
    const source = instance.prompt.capture()
    source.set([{ type: "text", content: "held-A", start: 0, end: 6 }])
    selection.togglePending(key, "provider", "restricted")
    pending = Promise.resolve(instance.submit.handleSubmit({ preventDefault: () => undefined } as Event))
    await requireGate(created.promise, pending, "create")
    createGate.resolve()
    await requireGate(saved.promise, pending, "rules")
    batch(() => { setTabs(0, "server", servers.B as Tab["server"]); setRoute("server", "B") })
    const scope: PromptScope = { dir: base64Encode(directory), id: `created-A-${serial}` }
    const foreign = instance.prompt.capture(scope)
    batch(() => { setTabs(0, "server", servers.A as Tab["server"]); setRoute("server", "A") })
    saveGate.resolve()
    await pending
    expect(source.current()[0]).toMatchObject({ content: "held-A" })
    expect(promotions).toEqual([])
    expect(requests.filter((request) => request.operation === "prompt")).toEqual([])
    expect(selection.pendingRules(key)).toHaveLength(2)
    await instance.submit.handleSubmit({ preventDefault: () => undefined } as Event)
    expect(requests.filter((request) => request.operation === "create")).toHaveLength(1)
    expect(requests.filter((request) => request.operation === "prompt")).toEqual([
      { server: "A", operation: "prompt", input: expect.objectContaining({ sessionID: scope.id, text: "held-A" }) },
    ])
    expect(foreign.current()[0]).toMatchObject({ content: "" })
    expect(foreign.context.items()).toEqual([])
  } finally {
    createGate.resolve(); saveGate.resolve(); instance.dispose()
    await pending?.catch(() => undefined)
    selection.clearPending(key)
    memory.dispose()
  }
})
