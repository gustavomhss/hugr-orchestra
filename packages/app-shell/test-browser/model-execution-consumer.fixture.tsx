import { expect, mock } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRoot, mergeProps } from "solid-js"
import { createComponent, Dynamic, render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { createModelCatalog } from "@/hooks/provider-catalog"
import { mixedEngineAgents } from "@/testing/model-execution-fixture"
import { normalizeProviderList } from "@/context/global-sync/utils"
import { isolatedSolid } from "./orchestra/integrations-solid.fixture"
import { virtualScrollElement } from "../src/components/virtual-scroll-element"
import { DateTime, Effect, Fiber, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Orchestra } from "@orchestra/client"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { Prompt } from "@orchestra/schema/prompt"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionInput } from "@orchestra/schema/session-input"
import { SessionMessage } from "@orchestra/schema/session-message"
import { createPromptState, type ImageAttachmentPart } from "@/context/prompt-state"
import { createApiForServer } from "@/utils/server"
import { createSessionManagementForServer } from "@/utils/session-management"
import { registerSessionModelExecution } from "@/utils/session-model-execution"
import { createPromptSubmit, sdkFor, serverFor, state, submitInput } from "@/components/prompt-input/submit-harness"

// CONTRACT CONSUMPTION fixture: only the generated SDK serializes canonical replies.
// It does not reproduce the server's describe/eligibility algorithm.
export const ref = { providerID: "provider", id: "model" }
export const model = Model.Info.make({
  ...Model.Info.empty(Provider.ID.make(ref.providerID), Model.ID.make(ref.id)),
  name: "Consumer model", capabilities: { tools: true, input: ["text"], output: ["text"] },
  variants: [{ id: Model.VariantID.make("high"), headers: {}, body: {} }],
})
export function decision(status: "ready" | "unsupported" | "unavailable" = "ready", variant?: string): ModelExecution.Response {
  const selection = { ref: Model.Ref.make({ providerID: Provider.ID.make(ref.providerID), id: Model.ID.make(ref.id),
    variant: variant === undefined ? undefined : Model.VariantID.make(variant) }), engine: "orchestra" }
  return ModelExecution.Response.make({
    models: [{ model, engine: "orchestra", status: "ready" }, {
      model: { ...model, id: Model.ID.make("blocked") }, engine: "orchestra", status: "unsupported", reason: "model-denied",
    }],
    selection: status === "ready" ? { ...selection, status } : { ...selection, status, reason: "variant-unavailable" },
  })
}
export const text = (value: string) => [{ type: "text" as const, content: value, start: 0, end: value.length }]
export const send = (owner: ReturnType<typeof composer>) => owner.submit.handleSubmit(new Event("submit"))
export function composer(value = "canonical prompt", options: Partial<Parameters<typeof createPromptSubmit>[0]> = {}) {
  state.params.id ??= "session-1"
  return createRoot((dispose) => {
    const prompt = createPromptState({ prompt: value })
    return { dispose, prompt, submit: createPromptSubmit({ ...submitInput(), prompt,
      imageAttachments: () => prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"), ...options }) }
  })
}
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json" },
})
export function transport(options: { native?: NativeServer; reply?: (request: Request) => Response | Promise<Response> } = {}) {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const calls: { path: string; method: string; authorization: string | null; body: unknown; url: URL; signal: AbortSignal }[] = []
  const control = {
    reply: options.reply ?? ((_request: Request) => json({ location: { directory: options.native?.directory ?? "/repo/main" }, data: decision() })),
    before: async (_path: string) => {},
    after: async (_path: string, _response: Response) => {},
  }
  const fetch: typeof Bun.fetch = Object.assign(async (...args: Parameters<typeof Bun.fetch>) => {
    const request = new Request(...args)
    const url = new URL(request.url)
    calls.push({ path: url.pathname, method: request.method, authorization: request.headers.get("authorization"),
      body: request.method === "GET" ? undefined : await request.clone().json(), url, signal: request.signal })
    await control.before(url.pathname)
    if (url.pathname === "/api/health") return json({ pid: 123 })
    if (!options.native && url.pathname.endsWith("/subagent-models")) return json({ data: { mode: "inherit" } })
    if (url.pathname === "/api/event") return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        streams.push(controller)
        const stop = () => { try { controller.close() } catch { /* Reader cleanup may already close this fixture stream. */ } }
        request.signal.addEventListener("abort", stop, { once: true })
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: `greeting-${streams.length}`, type: "server.connected", data: {} })}\n\n`))
      },
    }), { headers: { "content-type": "text/event-stream" } })
    if (url.pathname === "/api/model/execution") return control.reply(request)
    const response = options.native ? await Bun.fetch(request) : /\/(agent|model|shell)$/.test(url.pathname)
      ? new Response(null, { status: 204 }) : /\/(prompt|command)$/.test(url.pathname)
        ? await admittedResponse(request, calls.filter((call) => call.method === "POST" && /\/(prompt|command)$/.test(call.path)).length) : json({})
    await control.after(url.pathname, response)
    return response
  }, { preconnect: Bun.fetch.preconnect })
  const url = options.native?.url ?? "http://consumer.fixture"
  const orchestra = Orchestra.make({ baseUrl: url, fetch, headers: { authorization: "Basic Zml4dHVyZTpub25l" } })
  return { calls, control, fetch, orchestra, url, streams, directory: options.native?.directory ?? "/repo/main", queries: () => calls.filter((call) => call.path === "/api/model/execution"),
    admissions: () => calls.filter((call) => call.path.endsWith("/prompt")) }
}
export function bind(calls: ReturnType<typeof transport>) {
  const api = createApiForServer({ server: { url: calls.url, username: "fixture", password: "none" }, fetch: calls.fetch })
  const base = serverFor()
  const server = { ...base, api, currentApi: api, orchestra: calls.orchestra,
    server: { type: "http" as const, http: { url: calls.url, username: "fixture", password: "none" } },
    sessionManagement: createSessionManagementForServer({ server: { url: calls.url }, fetch: calls.fetch, ready: Promise.resolve() }) }
  state.serverOverride = server
  state.sdkOverride = { ...sdkFor(calls.directory, server), api, orchestra: calls.orchestra, url: calls.url }
  return server
}

// This owns only process/transport lifecycle. The E1 entry and its real Core/SQL admission remain unchanged.
const Ready = Schema.Struct({ url: Schema.String, directory: Schema.String, sessionID: Schema.String })
const Rows = Schema.Struct({
  session: Schema.Struct({ id: Schema.String }),
  inputs: Schema.Array(Schema.Struct({ id: Schema.String, session_id: Schema.String, prompt: Schema.Unknown, delivery: Schema.String, admitted_seq: Schema.Number })),
  admissions: Schema.Array(Schema.Struct({ type: Schema.String, data: Schema.Unknown })),
  messages: Schema.Array(Schema.Unknown),
})
export type NativeServer = typeof Ready.Type & { inspect: () => Promise<typeof Rows.Type> }

export async function nativeServer(run: (server: NativeServer) => Promise<void>) {
  const scratch = await mkdtemp(path.join(tmpdir(), "orchestra-model-consumers-"))
  const project = path.join(scratch, "project")
  await mkdir(project)
  const ready = path.join(scratch, "ready.json")
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      const child = yield* app.spawn(ChildProcess.make(process.execPath, [path.join(import.meta.dir, "prompt-retry-native-server.fixture.ts"), project, path.join(scratch, "db.sqlite"), ready], {
        cwd: path.resolve(import.meta.dir, ".."),
        env: { ...process.env, ORCHESTRA_TEST_HOME: scratch, ORCHESTRA_DB: path.join(scratch, "db.sqlite"),
          XDG_DATA_HOME: path.join(scratch, "data"), XDG_CACHE_HOME: path.join(scratch, "cache"),
          XDG_CONFIG_HOME: path.join(scratch, "config"), XDG_STATE_HOME: path.join(scratch, "state"),
          ORCHESTRA_DISABLE_PROJECT_CONFIG: "1", ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_TEST_CHANNEL: "test",
          ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "1" }, stdin: "ignore",
      }))
      const output = yield* Effect.forkScoped(AppProcess.collectStream(child.stdout, 65_536))
      const error = yield* Effect.forkScoped(AppProcess.collectStream(child.stderr, 65_536))
      const waiting = Effect.promise(async () => {
        const expires = Date.now() + 45_000
        while (!(await Bun.file(ready).exists())) {
          if (Date.now() >= expires) throw new Error("Native Session fixture did not publish readiness")
          await Bun.sleep(20)
        }
        return Schema.decodeUnknownSync(Ready)(await Bun.file(ready).json())
      }).pipe(Effect.timeout("45 seconds"))
      const host = yield* Effect.raceFirst(waiting, child.exitCode.pipe(Effect.flatMap((code) => Effect.gen(function* () {
        const stdout = yield* Fiber.join(output)
        const stderr = yield* Fiber.join(error)
        return yield* Effect.die(new Error(`Native fixture exited before readiness (${code}): ${stdout.buffer.toString()}${stderr.buffer.toString()}`))
      }))))
      yield* Effect.promise(async () => {
        const server = { ...host, inspect: async () => {
          const response = await Bun.fetch(`${host.url}/__fixture/inspect`, { signal: AbortSignal.timeout(10_000) })
          expect(response.status).toBe(200)
          return Schema.decodeUnknownSync(Rows)(await response.json())
        } }
        try { await run(server) }
        finally {
          // The child closes the listening socket during this response; its clean exit below is the teardown witness.
          await Bun.fetch(`${host.url}/__fixture/stop`, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined)
        }
      })
      const code = yield* child.exitCode.pipe(Effect.timeout("10 seconds"))
      const stdout = yield* Fiber.join(output)
      const stderr = yield* Fiber.join(error)
      expect(Number(code), stdout.buffer.toString() + stderr.buffer.toString()).toBe(0)
    })).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
  } finally { await rm(scratch, { recursive: true, force: true }) }
}


// createLocal receives context-boundary values, but its selection, explicit state and fallback rules are production code.
// The SDK uses the generated serializer above; no decision algorithm is reproduced in this fixture.
export function selection(calls: ReturnType<typeof transport>, sessionID?: string, actual?: ReturnType<typeof liveSDK>) {
  const localModule = initialized().localModule
  const normalized = () => normalizeProviderList(
    [Provider.Info.empty(Provider.ID.make(ref.providerID))], [model, { ...model, id: Model.ID.make("blocked"), name: "Blocked model" }],
    { providerID: Provider.ID.make(ref.providerID), id: Model.ID.make(ref.id) },
  )
  const [view, setView] = createStore({ catalog: normalized(), sessionID })
  const [saved, setSaved] = createStore<import("../src/context/local").Saved>({ session: {} })
  const catalog = createModelCatalog(() => view.catalog.connected.flatMap((id) => view.catalog.all.get(id) ?? []), () => [])
  const models = { ...catalog, ready: Object.assign(() => true, { promise: Promise.resolve(true) }),
    find: (key: { providerID: string; modelID: string }) => catalog.list().find((item) => item.id === key.modelID && item.provider.id === key.providerID),
    recent: { list: () => [], push() {} }, setVisibility() {}, variant: { get: () => undefined, set() {} } }
  const server = actual?.server ?? bind(calls)
  const sdk = actual?.directory ?? { ...sdkFor(calls.directory, server), api: server.api, orchestra: calls.orchestra, url: calls.url }
  const [metadata, setMetadata] = createStore({ agent: mixedEngineAgents("orchestra"), config: {} })
  const sync = { data: metadata }
  const providers = { all: () => view.catalog.all, connected: () => view.catalog.connected.flatMap((id) => view.catalog.all.get(id) ?? []),
    default: () => view.catalog.default, defaultModel: () => view.catalog.defaultModel }
  return createRoot((dispose) => {
    const local = localModule.createLocal({
      params: { get id() { return view.sessionID } },
      sdk: () => sdk,
      sync: () => sync,
      serverSDK: () => server,
      providers,
      models, saved, setSaved, savedReady: () => true,
    } as Parameters<typeof localModule.createLocal>[0])
    return { local, dispose, setView, saved, setSaved, models, sdk, server, sync, setMetadata, providers, calls,
      removeModel() {
        const provider = view.catalog.all.get(ref.providerID)
        if (!provider) throw new Error("Missing catalog provider control")
        setView("catalog", "all", new Map(view.catalog.all).set(ref.providerID, { ...provider,
          models: Object.fromEntries(Object.entries(provider.models).filter(([id]) => id !== ref.id)) }))
      },
    }
  })
}

const currentRows: { local?: ReturnType<typeof selection>["local"] } = {}
const measuredRows = new WeakSet<HTMLElement>()
export async function selectorDOM(owner: ReturnType<typeof selection>) {
  const rowsModule = initialized().rowsModule
  const languageModule = initialized().languageModule
  const platformModule = initialized().platformModule
  currentRows.local = owner.local
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => createComponent(platformModule.PlatformProvider, {
    value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
    get children() { return createComponent(languageModule.LanguageProvider, { locale: "en", get children() {
      return createComponent(rowsModule.ModelSelectorPopoverV2, { model: owner.local.model, trigger: (props) => createComponent(Dynamic, mergeProps({ component: "button" }, props, { children: "Choose model" })) })
    } }) },
  }), root)
  const button = root.querySelector("button")
  if (!button) { dispose(); root.remove(); currentRows.local = undefined; throw new Error("Model selector control did not render") }
  button.focus()
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  await wait(() => document.querySelectorAll('[role="menuitemradio"]').length > 0, "actual model popover rows after Enter").catch((error: unknown) => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]')
    const viewport = menu?.querySelector<HTMLElement>(".scroll-view__viewport")
    const rect = viewport?.getBoundingClientRect()
    // Synthetic fixture DOM only: fixed primitive fields, bounded output, no user/config/credential data.
    console.error("E6 popover fixture diagnostic " + JSON.stringify({
      trigger: {
        expanded: button.getAttribute("aria-expanded")?.slice(0, 128) ?? null,
        controls: button.getAttribute("aria-controls")?.slice(0, 128) ?? null,
        state: button.getAttribute("data-state")?.slice(0, 128) ?? null,
        connected: button.isConnected, focused: document.activeElement === button,
      },
      menuPresent: menu !== null, menuCount: document.querySelectorAll('[role="menu"]').length,
      radioCount: document.querySelectorAll('[role="menuitemradio"]').length,
      localListCount: owner.local.model.list().length, catalogCount: owner.models.list().length,
      canonicalHttpQueries: owner.calls.queries().length, currentModel: owner.local.model.current()?.id ?? null,
      viewport: viewport ? {
        offsetWidth: viewport.offsetWidth, offsetHeight: viewport.offsetHeight,
        clientWidth: viewport.clientWidth, clientHeight: viewport.clientHeight,
        rectWidth: rect?.width ?? null, rectHeight: rect?.height ?? null,
      } : null,
      placement: {
        hostConnected: root.isConnected, bodyContainsHost: document.body.contains(root),
        bodyContainsMenu: menu ? document.body.contains(menu) : false,
        hostContainsMenu: menu ? root.contains(menu) : false,
        sameDocument: menu ? menu.ownerDocument === document : null,
        menuParentTag: menu?.parentElement?.tagName ?? null, bodyChildren: document.body.childElementCount,
        modelTextPresent: document.body.textContent?.includes("Consumer model") ?? false,
      },
    }).slice(0, 4096))
    dispose(); root.remove(); currentRows.local = undefined
    throw error
  })
  return { root, rows: () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')],
    dispose() { dispose(); root.remove(); currentRows.local = undefined } }
}

const draftBoundary: { current?: { source: ReturnType<typeof selection>; calls: ReturnType<typeof transport>; prompt: ReturnType<typeof createPromptState> } } = {}
const draftHooks = {
  models: { useModels: () => draftBoundary.current!.source.models },
  prompt: { usePrompt: () => draftBoundary.current!.prompt },
  sdk: { useSDK: () => { const sdk = draftBoundary.current!.source.sdk; return () => sdk } },
  sync: { useSync: () => { const sync = draftBoundary.current!.source.sync; return () => sync } },
  tabs: { useTabs: () => ({ store: [] }) },
  router: { useSearchParams: () => [{ draftId: "draft-1" }] },
  providers: { useProviders: () => draftBoundary.current!.source.providers },
}
export function draftSelection(calls: ReturnType<typeof transport>) {
  const draftModule = initialized().draftModule
  const source = selection(calls)
  return createRoot((dispose) => {
    const prompt = createPromptState({ prompt: "draft choice" })
    draftBoundary.current = { source, calls, prompt }
    const model = draftModule.createPromptModelSelection({ agent: source.local.agent.current })
    return { prompt, model, source, dispose() { dispose(); source.dispose(); draftBoundary.current = undefined } }
  })
}

export function liveSDK(calls: ReturnType<typeof transport>) {
  const sdkModule = initialized().sdkModule
  const sdkRegistry = initialized().sdkRegistry
  return createRoot((dispose) => {
    const sdk = sdkModule.createServerSdkContext({ type: "http", http: { url: calls.url, username: "fixture", password: "none" } }, serverFor().scope,
      { platform: "web", fetch: calls.fetch, openExternal() {}, restart: async () => {}, notify: async () => {} })
    // Transfer the actual captured execute capability across this test's isolated/normal module graphs.
    const execute = sdkRegistry.modelExecutionForSession(sdk.currentApi.session)
    if (!execute) throw new Error("Isolated actual SDK adapter lacks its captured execution client")
    registerSessionModelExecution(sdk.currentApi.session, execute)
    const greetings: string[] = []
    sdk.event.listen((event) => { if (event.details.type === "server.connected") greetings.push(event.details.id) })
    const source = sdk.ensureDirSdkContext(calls.directory)
    const server = { ...sdk, api: sdk.currentApi }
    const directory = { ...source, api: sdk.currentApi }
    state.serverOverride = server
    state.sdkOverride = directory
    void sdk.event.start()
    return { sdk, server, directory, greetings, dispose }
  })
}
export async function wait(predicate: () => boolean, label: string) {
  const until = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() >= until) throw new Error(`Fixture deadline: ${label}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
}


type ConsumerModules = {
  localModule: typeof import("../src/context/local")
  rowsModule: typeof import("../src/components/dialog-select-model")
  languageModule: typeof import("../src/context/language")
  platformModule: typeof import("../src/context/platform")
  draftModule: typeof import("../src/pages/session/composer/prompt-model-selection")
  sdkModule: typeof import("../src/context/server-sdk")
  sdkRegistry: typeof import("../src/utils/session-model-execution")
}
const initialization: { pending?: Promise<void>; modules?: ConsumerModules } = {}

/** Every importing suite awaits this setup; only module exports are shared, never an SDK or Solid owner. */
export function initializeModelExecutionConsumers(): Promise<void> {
  return initialization.pending ??= (async () => {
    Bun.plugin({ name: "canonical-model-consumer-local", setup(build) {
      build.onLoad({ filter: /local\.tsx\?canonical-model-consumer$/ }, async (args) => ({
        contents: await Bun.file(args.path.replace(/\?canonical-model-consumer$/, "")).text(), loader: "ts",
      }))
    } })
    const localModule: typeof import("../src/context/local") = await import(`${Bun.resolveSync("../src/context/local.tsx", import.meta.dir)}?canonical-model-consumer`)

    const loadRows = isolatedSolid("canonical-model-consumer-rows")
    mock.module(`${Bun.resolveSync("../src/components/virtual-scroll-element.ts", import.meta.dir)}?canonical-model-consumer-rows`, () => ({
      virtualScrollElement(root: HTMLElement | undefined) {
        const viewport = virtualScrollElement(root)
        if (!viewport || measuredRows.has(viewport)) return viewport
        // Synthetic layout for this owned viewport only; the controller and TanStack still compute all visible rows.
        Object.defineProperties(viewport, {
          offsetWidth: { configurable: true, value: 600 },
          offsetHeight: { configurable: true, value: 220 },
        })
        measuredRows.add(viewport)
        return viewport
      },
    }))
    mock.module(`${Bun.resolveSync("../src/context/local.tsx", import.meta.dir)}?canonical-model-consumer-rows`, () => ({
      useLocal: () => { if (!currentRows.local) throw new Error("Selector not mounted"); return currentRows.local },
    }))
    mock.module(`${Bun.resolveSync("@orchestra/ui/context/dialog", import.meta.dir)}?canonical-model-consumer-rows`, () => ({ useDialog: () => ({ show: async () => {} }) }))
    const rowsModule: typeof import("../src/components/dialog-select-model") = await loadRows(Bun.resolveSync("../src/components/dialog-select-model.tsx", import.meta.dir))
    const languageModule: typeof import("../src/context/language") = await loadRows(Bun.resolveSync("../src/context/language.tsx", import.meta.dir))
    const platformModule: typeof import("../src/context/platform") = await loadRows(Bun.resolveSync("../src/context/platform.tsx", import.meta.dir))
    Bun.plugin({ name: "canonical-model-consumer-draft", setup(build) {
      build.onResolve({ filter: /^consumer-draft:/ }, (args) => ({ path: args.path.slice("consumer-draft:".length), namespace: "consumer-draft" }))
      build.onLoad({ filter: /.*/, namespace: "consumer-draft" }, (args) => ({
        loader: "object",
        exports: args.path === "local" ? { createModelExecutionView: localModule.createModelExecutionView }
          : draftHooks[args.path as keyof typeof draftHooks],
      }))
      build.onLoad({ filter: /prompt-model-selection\.ts\?consumer-draft$/ }, async (args) => ({ loader: "ts",
        contents: (await Bun.file(args.path.replace(/\?consumer-draft$/, "")).text())
          .replace('"@/context/models"', '"consumer-draft:models"').replace('"@/context/prompt"', '"consumer-draft:prompt"')
          .replace('"@/context/sdk"', '"consumer-draft:sdk"').replace('"@/context/sync"', '"consumer-draft:sync"')
          .replace('"@/context/tabs"', '"consumer-draft:tabs"').replace('"@solidjs/router"', '"consumer-draft:router"')
          .replace('"@/hooks/use-providers"', '"consumer-draft:providers"')
          .replace('"@/context/local"', '"consumer-draft:local"'),
      }))
    } })
    const draftModule: typeof import("../src/pages/session/composer/prompt-model-selection") = await import(`${Bun.resolveSync("../src/pages/session/composer/prompt-model-selection.ts", import.meta.dir)}?consumer-draft`)
    const sdkModule: typeof import("../src/context/server-sdk") = await loadRows(Bun.resolveSync("../src/context/server-sdk.tsx", import.meta.dir))
    const sdkRegistry: typeof import("../src/utils/session-model-execution") = await loadRows(Bun.resolveSync("../src/utils/session-model-execution.ts", import.meta.dir))
    initialization.modules = { localModule, rowsModule, languageModule, platformModule, draftModule, sdkModule, sdkRegistry }
  })()
}

function initialized() {
  if (!initialization.modules) throw new Error("Model execution consumer fixture must be initialized in beforeAll")
  return initialization.modules
}

async function admittedResponse(request: Request, admittedSeq: number) {
  const input = Schema.decodeUnknownSync(Schema.Struct({
    id: Schema.optional(SessionMessage.ID), prompt: Schema.optional(Prompt),
    command: Schema.optional(Schema.String), arguments: Schema.optional(Schema.String),
    delivery: Schema.optional(SessionInput.Delivery),
  }))(await request.clone().json())
  return json({ data: Schema.encodeSync(SessionInput.Admitted)(SessionInput.Admitted.make({
    id: input.id ?? SessionMessage.ID.make(`msg_fixture_${admittedSeq}`),
    sessionID: SessionID.make(decodeURIComponent(new URL(request.url).pathname.split("/")[3])),
    admittedSeq, prompt: input.prompt ?? { text: `/${input.command} ${input.arguments ?? ""}`.trim() },
    delivery: input.delivery ?? "steer", timeCreated: DateTime.makeUnsafe(1),
  })) })
}
