import { beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createRoot, getOwner } from "solid-js"
import { createStore } from "solid-js/store"
import { createTabMemory } from "@/context/tab-memory"
import { base64Encode } from "@orchestra/core/util/encode"
import type { Tab } from "@/context/tabs"
import type { PromptScope } from "@/context/prompt-state"

const servers = { A: "http://a.invalid", B: "http://b.invalid" }
const [route, setRoute] = createStore({ server: "A" as "A" | "B", draftId: "", id: undefined as string | undefined })
const [tabs, setTabs] = createStore<Tab[]>([])
const requests: { server: string; operation: string; input?: unknown }[] = []
const promotions: { draftID: string; server: string; sessionId: string }[] = []
const directory = "/shared/repo"
let memory = createTabMemory(null)
let created = Promise.withResolvers<void>()
let createGate = Promise.withResolvers<void>()
let saved = Promise.withResolvers<void>()
let saveGate = Promise.withResolvers<void>()
let actual: typeof import("@/context/prompt")
let createPromptSubmit: typeof import("@/components/prompt-input/submit").createPromptSubmit
let selection: typeof import("@/components/draft-subagent-models")
let serial = 0

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
    useNavigate: () => () => undefined,
  }))
  mock.module("@/context/settings", () => ({ useSettings: () => ({ general: { newLayoutDesigns: () => true } }) }))
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
      promoteDraft: (draftID: string, session: { server: string; sessionId: string }) =>
        promotions.push({ draftID, ...session }),
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
      session: { promote: () => undefined },
    }),
  }))
  mock.module("@/context/permission", () => ({ usePermission: () => ({ currentServerState: () => ({}) }) }))
  mock.module("@/context/layout", () => ({ useLayout: () => ({ handoff: { setTabs: () => undefined } }) }))
  actual = await import(`${Bun.resolveSync("@/context/prompt", import.meta.dir)}?admission-owner`)
  // Submit and the mounted, real PromptProvider must share the same context.
  mock.module("@/context/prompt", () => actual)
  const submit = await import("@/components/prompt-input/submit")
  createPromptSubmit = submit.createPromptSubmit
  selection = await import("@/components/draft-subagent-models")
})

beforeEach(() => {
  memory.dispose()
  memory = createTabMemory(null)
  setRoute({ server: "A", draftId: `admission-owner-${++serial}`, id: undefined })
  setTabs([{ type: "draft", draftID: route.draftId, server: servers.A as Tab["server"], directory }])
  requests.length = 0
  promotions.length = 0
  created = Promise.withResolvers<void>()
  createGate = Promise.withResolvers<void>()
  saved = Promise.withResolvers<void>()
  saveGate = Promise.withResolvers<void>()
})

test.each(["create", "rules", "draft-before-sdk"] as const)(
  "real PromptProvider preserves A's unsent draft on owner change during %s",
  async (phase) => {
    const instance = createRoot((dispose) => {
      memory = createTabMemory(getOwner())
      let prompt!: ReturnType<typeof actual.usePrompt>
      let submit!: ReturnType<typeof createPromptSubmit>
      createComponent(actual.PromptProvider, {
        get children() {
          prompt = actual.usePrompt()
          submit = createPromptSubmit({
            prompt,
            info: () => undefined,
            imageAttachments: () => [],
            commentCount: () => 0,
            autoAccept: () => false,
            mode: () => "normal",
            working: () => false,
            editor: () => undefined,
            queueScroll: () => undefined,
            promptLength: () => 0,
            addToHistory: () => undefined,
            resetHistoryNavigation: () => undefined,
            setMode: () => undefined,
            setPopover: () => undefined,
          })
          return null
        },
      })
      return { dispose, prompt, submit }
    })
    await instance.prompt.ready.promise
    const source = instance.prompt.capture()
    const scope: PromptScope = { dir: base64Encode(directory), id: `created-A-${serial}` }
    const destinationA = instance.prompt.capture(scope)
    source.set([{ type: "text", content: "submitted-A", start: 0, end: 11 }])
    source.context.add({ type: "file", path: "submitted-A.ts" })
    const key = `${servers.A}\u0000draft\u0000${route.draftId}`
    if (phase === "rules") selection.togglePending(key, "provider", "restricted")
    const pending = instance.submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await created.promise
    if (phase === "rules") {
      createGate.resolve()
      await saved.promise
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

    // Re-owning the draft resumes its admitted A session, not another create.
    setTabs(0, "server", servers.A as Tab["server"])
    setRoute("server", "A")
    await instance.submit.handleSubmit({ preventDefault: () => undefined } as Event)
    expect(requests.filter((request) => request.operation === "create")).toHaveLength(1)
    expect(requests.filter((request) => request.operation === "prompt")).toEqual([
      { server: "A", operation: "prompt", input: expect.objectContaining({ sessionID: scope.id, text: "unsent-A" }) },
    ])
    expect(destinationB.current()[0]).toMatchObject({ content: "" })
    expect(destinationB.context.items()).toEqual([])
    selection.clearPending(key)
    instance.dispose()
    memory.dispose()
  },
)
