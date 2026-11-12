/** @jsxImportSource @opentui/solid */
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { createStore } from "solid-js/store"
import { onCleanup, onMount, Show, type ParentProps } from "solid-js"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { Orchestra } from "@orchestra/client"
import { Command } from "@orchestra/schema/command"
import { Agent } from "@orchestra/schema/agent"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { ArgsProvider } from "../../../../src/context/args"
import { KVProvider } from "../../../../src/context/kv"
import { SDKProvider, useSDK } from "../../../../src/context/sdk"
import { ProjectProvider } from "../../../../src/context/project"
import { SyncProvider, useSync } from "../../../../src/context/sync"
import { DataProvider } from "../../../../src/context/data"
import { PermissionProvider } from "../../../../src/context/permission"
import { LocalProvider, useLocal } from "../../../../src/context/local"
import { ExitProvider } from "../../../../src/context/exit"
import { RouteProvider, useRoute } from "../../../../src/context/route"
import { ThemeProvider } from "../../../../src/context/theme"
import { ClipboardProvider } from "../../../../src/context/clipboard"
import { PromptRefProvider } from "../../../../src/context/prompt"
import { EditorContextProvider } from "../../../../src/context/editor"
import { LocationProvider } from "../../../../src/context/location"
import { TuiConfigProvider } from "../../../../src/config"
import { OrchestraKeymapProvider, registerOrchestraKeymap } from "../../../../src/keymap"
import { createPluginRuntime, PluginRuntimeProvider } from "../../../../src/plugin/runtime"
import { Prompt, type PromptRef } from "../../../../src/component/prompt"
import { DialogModel } from "../../../../src/component/dialog-model"
import { DialogProvider, useDialog } from "../../../../src/ui/dialog"
import { ToastProvider } from "../../../../src/ui/toast"
import { PromptStashProvider } from "../../../../src/prompt/stash"
import { FrecencyProvider } from "../../../../src/prompt/frecency"
import { PromptHistoryProvider } from "../../../../src/prompt/history"
import { TestTuiContexts } from "../../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../../fixture/tui-runtime"
import { createEventSource, createFetch, json, v2Session } from "../../../fixture/tui-sdk"

export const ref = { providerID: "provider", id: "model" }
export const model = Model.Info.make({
  ...Model.Info.empty(Provider.ID.make(ref.providerID), Model.ID.make(ref.id)), name: "Consumer model",
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  variants: [{ id: Model.VariantID.make("high"), headers: {}, body: {} }],
})
export function decision(status: "ready" | "unsupported" | "unavailable" = "ready", variant?: string): ModelExecution.Response {
  const selection = { ref: { ...ref, variant: variant === undefined ? undefined : Model.VariantID.make(variant) }, engine: "orchestra" }
  return ModelExecution.Response.make({
    models: [{ model, engine: "orchestra", status: "ready" }, {
      model: { ...model, id: Model.ID.make("blocked"), name: "Blocked model" }, engine: "orchestra", status: "unsupported", reason: "model-denied",
    }],
    selection: status === "ready" ? { ...selection, status } : { ...selection, status, reason: "variant-unavailable" },
  })
}
export async function wait(predicate: () => boolean, label: string, milliseconds = 2000) {
  const until = Date.now() + milliseconds
  while (!predicate()) {
    if (Date.now() >= until) throw new Error(`Fixture deadline: ${label}`)
    await Bun.sleep(10)
  }
}

// One injected transport preserves the actual generated SDK, catalog adapter, providers and Prompt.
// This is contract-consumption evidence, not a substitute for the backend describe HTTP gate.
export async function mount(options: { draft?: boolean; initial?: ModelExecution.Response; reply?: (request: Request) => Response | Promise<Response> } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "orchestra-model-consumer-"))
  const state = path.join(root, "state")
  await mkdir(state)
  await Bun.write(path.join(state, "kv.json"), "{}")
  const [owner, setOwner] = createStore({ sessionID: options.draft ? undefined : "session-1", directory: root, url: "http://consumer.fixture", authorization: "Basic Zml4dHVyZTpub25l", generation: 1 })
  const calls: { path: string; method: string; body: unknown; authorization: string | null; url: URL; signal: AbortSignal }[] = []
  const control = { reply: options.reply ?? ((_request: Request) => json({ location: { directory: owner.directory }, data: options.initial ?? decision() })),
    before: async (_path: string) => {} }
  const events = createEventSource()
  const fallback = createFetch()
  const fetch: typeof Bun.fetch = Object.assign(async (...args: Parameters<typeof Bun.fetch>) => {
    const request = new Request(...args)
    const url = new URL(request.url)
    calls.push({ path: url.pathname, method: request.method, body: request.method === "GET" ? undefined : await request.clone().json(),
      authorization: request.headers.get("authorization"), url, signal: request.signal })
    await control.before(url.pathname)
    if (url.pathname === "/api/model/execution") return control.reply(request)
    const envelope = (data: unknown) => json({ location: { directory: root }, data })
    if (url.pathname === "/api/command") return envelope([Command.Info.make({ name: "known", template: "fixture command" })])
    if (url.pathname === "/api/provider") return envelope([Provider.Info.empty(Provider.ID.make(ref.providerID))])
    if (url.pathname === "/api/model") return envelope([model, { ...model, id: Model.ID.make("blocked"), name: "Blocked model" }])
    if (url.pathname === "/api/model/default") return envelope(ref)
    if (url.pathname === "/api/agent") return envelope([{ ...Agent.Info.empty(Agent.ID.make("maestro")), engine: "orchestra" }, { ...Agent.Info.empty(Agent.ID.make("backend")), engine: "orchestra" }])
    if (url.pathname === "/api/permission/request" || url.pathname === "/api/question/request") return json({ data: [] })
    if (url.pathname === "/api/mcp/resource") return envelope({ resources: [] })
    if (url.pathname === "/api/location") return json({ directory: root, project: { id: "proj_test", directory: root } })
    if (url.pathname === "/api/session") return request.method === "POST" ? json(v2Session({ id: "created-session", directory: root }))
      : json({ data: [v2Session({ id: "session-1", directory: root }), v2Session({ id: "session-2", directory: root })], cursor: {} })
    if (/^\/api\/session\/[^/]+$/.test(url.pathname)) return json(v2Session({ id: url.pathname.split("/").at(-1)!, directory: root }))
    if (url.pathname.endsWith("/todo")) return json({ data: [] })
    if (url.pathname.endsWith("/message")) return json({ data: [], cursor: {} })
    if (request.method === "POST" && (url.pathname.endsWith("/agent") || url.pathname.endsWith("/model"))) return new Response(null, { status: 204 })
    if (request.method === "POST") return json({})
    return fallback.fetch(request)
  }, { preconnect: Bun.fetch.preconnect })
  const sdkReady = Promise.withResolvers<void>()
  const gateReady = Promise.withResolvers<void>()
  let greetingSDK: ReturnType<typeof useSDK> | undefined
  function GreetingGate(props: ParentProps) {
    const sdk = useSDK()
    greetingSDK = sdk
    onMount(() => gateReady.resolve())
    // Setup barrier only: the model consumer mounts after the initial greeting, so its later greeting is a real gap.
    return <Show when={sdk.connectionEpoch() > 0}>{props.children}</Show>
  }
  let context!: { sdk: ReturnType<typeof useSDK>; sync: ReturnType<typeof useSync>; local: ReturnType<typeof useLocal>; route: ReturnType<typeof useRoute>; dialog: ReturnType<typeof useDialog> }
  let prompt: PromptRef | undefined
  function Probe() {
    context = { sdk: useSDK(), sync: useSync(), local: useLocal(), route: useRoute(), dialog: useDialog() }
    onMount(() => sdkReady.resolve())
    return <Prompt sessionID={owner.sessionID} ref={(value) => { prompt = value }} />
  }
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    onCleanup(registerOrchestraKeymap(keymap, renderer, config))
    return <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
      <ExitProvider exit={() => {}}><ClipboardProvider value={{ read: async () => undefined, write: async () => {} }}>
        <OrchestraKeymapProvider keymap={keymap}><ArgsProvider><KVProvider><ToastProvider>
          <RouteProvider initialRoute={options.draft ? { type: "home" } : { type: "session", sessionID: "session-1" }}>
            <TuiConfigProvider config={config}><PluginRuntimeProvider value={createPluginRuntime()}>
              <Show when={owner.generation} keyed>{() => <SDKProvider url={owner.url} directory={owner.directory} fetch={fetch} headers={{ authorization: owner.authorization }} events={events.source}>
                <GreetingGate><PermissionProvider><ProjectProvider><SyncProvider><DataProvider>
                  <ThemeProvider mode="dark" source={{ discover: async () => ({}), subscribeRefresh: () => () => {} }}>
                    <LocalProvider><PromptStashProvider><DialogProvider><FrecencyProvider><PromptHistoryProvider>
                      <PromptRefProvider><EditorContextProvider><LocationProvider location={{ directory: owner.directory }}><Probe /></LocationProvider></EditorContextProvider></PromptRefProvider>
                    </PromptHistoryProvider></FrecencyProvider></DialogProvider></PromptStashProvider></LocalProvider>
                  </ThemeProvider>
                </DataProvider></SyncProvider></ProjectProvider></PermissionProvider></GreetingGate>
              </SDKProvider>}</Show>
            </PluginRuntimeProvider></TuiConfigProvider>
          </RouteProvider>
        </ToastProvider></KVProvider></ArgsProvider></OrchestraKeymapProvider>
      </ClipboardProvider></ExitProvider>
    </TestTuiContexts>
  }
  const lifecycle = { disposed: false }
  const app = await testRender(() => <Harness />, { width: 120, height: 40, kittyKeyboard: true })
  try {
    await gateReady.promise
    events.emit({ directory: root, workspace: undefined, payload: { type: "server.connected", properties: {} } })
    await sdkReady.promise
    await wait(() => context.sync.status === "complete" && prompt !== undefined, "real Sync bootstrap and Prompt ref")
    return { app, calls, control, get context() { return context }, owner, setOwner, events, root,
      client: Orchestra.make({ baseUrl: "http://consumer.fixture", fetch, headers: { authorization: "Basic Zml4dHVyZTpub25l" } }),
      get prompt() { if (!prompt) throw new Error("Prompt disposed"); return prompt },
      queries: () => calls.filter((call) => call.path === "/api/model/execution"),
      admissions: () => calls.filter((call) => call.path.endsWith("/prompt")),
      showModels() { context.dialog.replace(() => <DialogModel />) },
      async dispose() {
        if (lifecycle.disposed) return
        lifecycle.disposed = true
        app.renderer.destroy()
        await rm(root, { recursive: true, force: true })
      },
      async reload() {
        const previous = greetingSDK
        setOwner("generation", (value) => value + 1)
        await wait(() => greetingSDK !== previous, "new SDK owner mounted")
        events.emit({ directory: owner.directory, workspace: undefined, payload: { type: "server.connected", properties: {} } })
        await wait(() => context.sdk === greetingSDK && prompt !== undefined, "consumer remounted after initial greeting")
      },
    }
  } catch (error) { app.renderer.destroy(); await rm(root, { recursive: true, force: true }); throw error }
}


// Establish a real selected choice under a READY endpoint before a submit fault is installed.
// Loading/bootstrap acceptance deliberately uses mount() instead of this prerequisite.
export async function ready(options: { draft?: boolean; initial?: ModelExecution.Response } = {}) {
  const fixture = await mount(options)
  try {
    await wait(() => fixture.context.local.model.current()?.modelID === ref.id, "READY real model choice")
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await wait(() => fixture.context.local.model.current()?.modelID === ref.id, "explicit real selected model")
    await Bun.sleep(0)
    return fixture
  } catch (error) { await fixture.dispose(); throw error }
}
