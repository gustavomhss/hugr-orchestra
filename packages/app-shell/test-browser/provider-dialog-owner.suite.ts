import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, createEffect, createRoot, ErrorBoundary, type JSX, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { insert, render } from "solid-js/web"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { ServerConnection } from "../src/context/server"
import { createServerContextCache } from "../src/context/global"
import { ServerScope } from "../src/utils/server-scope"
import type { Config } from "@orchestra/sdk/v2/client"
import { DOMFormData } from "../happydom"

const compiler = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
const subject = (path: string) => `${Bun.resolveSync(path, import.meta.dir)}?provider-owner`
const calls: Request[] = []
const modelCatalogs: string[][] = []
const failures: unknown[] = []
const controls = { protocol: "v2" as "v1" | "v2" }
const nativeHTTP = { FormData, Request, Response, Headers, fetch }
const a: ServerConnection.Http = {
  type: "http",
  http: { url: "http://owner-a.test", username: "a", password: "synthetic-a" },
}
const b: ServerConnection.Http = {
  type: "http",
  http: { url: "http://owner-b.test", username: "b", password: "synthetic-b" },
}
const [state, setState] = createStore({ servers: [a, b] as ServerConnection.Any[], directory: "/b" })
const contexts = {
  ensure: undefined as undefined | ((server: ServerConnection.Any) => { sdk: unknown; sync: unknown }),
}
const transport = Object.assign(
  async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    calls.push(request)
    const url = new URL(request.url)
    if (url.pathname === "/global/health")
      return controls.protocol === "v1" ? Response.json({ healthy: true }) : new Response(null, { status: 404 })
    if (url.pathname === "/api/health") return Response.json({ pid: 1 })
    if (url.pathname === "/api/integration")
      return Response.json({
        data: [{ id: "openrouter", name: `${url.hostname} discovery`, methods: [], connections: [] }],
      })
    if (url.pathname === "/api/integration/openrouter")
      return Response.json({
        data: {
          id: "openrouter",
          name: `${url.hostname} integration`,
          methods: [{ id: "key", type: "key", label: "API key" }],
          connections: [],
        },
      })
    if (url.pathname === "/api/provider")
      return Response.json({
        data: [
          {
            id: "openrouter",
            name: `${url.hostname} catalog`,
            api: { type: "aisdk", package: "x" },
            request: { headers: {}, body: {} },
          },
        ],
      })
    if (url.pathname === "/api/model") return Response.json({ data: [] })
    if (url.pathname.endsWith("/connect/key")) return new Response(null, { status: 204 })
    if (request.method === "PUT" || request.method === "PATCH") return Response.json(true)
    throw new Error(`Unexpected fixture request: ${request.method} ${request.url}`)
  },
  { preconnect: fetch.preconnect },
)
const catalog = (server: string) => ({
  all: new Map([
    [
      "openrouter",
      {
        id: "openrouter",
        name: `${server} catalog`,
        source: "api",
        models: { model: { id: "model", name: `${server} model` } },
      },
    ],
  ]),
  connected: ["openrouter"],
  default: {},
})
const container = (props: { children?: JSX.Element }) => {
  const node = document.createElement("div")
  insert(node, () => props.children)
  return node
}
const button = (props: {
  children?: JSX.Element
  onClick?: (event: MouseEvent) => void
  disabled?: boolean
  type?: string
}) => {
  const node = document.createElement("button")
  node.type = props.type === "submit" ? "submit" : "button"
  insert(node, () => props.children)
  createEffect(() => {
    node.disabled = !!props.disabled
  })
  node.addEventListener("click", (event) => props.onClick?.(event))
  return node
}
const field = (props: {
  name?: string
  value?: string
  placeholder?: string
  onInput?: (event: Event & { currentTarget: HTMLInputElement }) => void
  onChange?: (value: string) => void
}) => {
  const node = document.createElement("input")
  node.name = props.name ?? ""
  node.placeholder = props.placeholder ?? ""
  createEffect(() => {
    node.value = props.value ?? ""
  })
  node.addEventListener("input", (event) => {
    props.onInput?.(event as Event & { currentTarget: HTMLInputElement })
    props.onChange?.(node.value)
  })
  return node
}
const tabs = Object.assign(container, {
  List: () => undefined,
  SectionTitle: container,
  Trigger: button,
  Content: (props: { value: string; children?: JSX.Element }) =>
    props.value === "providers" ? container(props) : undefined,
})
// View atoms and shell selection are fixtures. DialogProvider.show, runtime providers, model
// preferences, SDK requests and transport revocation are real; sync supplies distinct A/B catalogs.
// Settings › Providers renders the Providers chapter's list, so its connect actions are the ones driven.
const fixtures = {
  forms: { FormData: DOMFormData },
  ui: {
    Button: button,
    ButtonV2: button,
    IconButton: button,
    TextField: field,
    TextInputV2: field,
    SecretInputV2: field,
    Dialog: container,
    DialogV2: (props: { children?: JSX.Element }) => {
      modelCatalogs.push(
        useModels()
          .list()
          .map((model) => model.name),
      )
      return container(props)
    },
    DialogBody: container,
    DialogHeader: container,
    DialogTitle: container,
    DialogFooter: container,
    Tag: container,
    Icon: () => undefined,
    ProviderIcon: () => undefined,
    Spinner: () => undefined,
    List: container,
    TabsV2: tabs,
    iconNames: [] as string[],
  },
  language: { useLanguage: () => ({ t: (key: string) => key, locale: () => "en" }) },
  platform: { usePlatform: () => ({ platform: "web", fetch: transport }) },
  server: { ServerConnection, serverName: () => "server", useServer: () => ({ current: a }) },
  bootstrap: { loadDefaultModel: async () => undefined },
  helpers: { displayName: (project: { worktree: string }) => project.worktree },
  global: {
    useGlobal: () => ({
      servers: { list: () => state.servers },
      ensureServerCtx: (server: ServerConnection.Any) => contexts.ensure!(server),
    }),
  },
  layout: {
    useLayout: () => ({
      route: () => ({ type: "home" }),
      home: { selection: () => ({ server: ServerConnection.key(b), directory: state.directory }) },
    }),
  },
  tabs: { useTabs: () => ({ store: [] }) },
  router: { useParams: () => ({}), useNavigate: () => () => undefined },
  toast: { showToast: () => undefined },
  unused: {
    SettingsGeneralV2: () => undefined,
    SettingsModelsV2: () => undefined,
    SettingsServersV2: () => undefined,
    ShortcutsEditor: () => undefined,
    ShortcutsReset: () => undefined,
  },
}
const imports: Record<string, string> = {
  "@orchestra/ui/context": subject("../../ui/src/context/helper.tsx"),
  "@orchestra/ui/context/dialog": subject("../../ui/src/context/dialog.tsx"),
  "@/context/server-sdk": subject("../src/context/server-sdk.tsx"),
  "@/context/server-sync": subject("../src/context/server-sync.tsx"),
  "@/components/server-unavailable": subject("../src/components/server-unavailable.tsx"),
  "@/context/models": subject("../src/context/models.tsx"),
  "@/utils/persist": subject("../src/utils/persist.ts"),
  "@/hooks/use-providers": subject("../src/hooks/use-providers.ts"),
  "@/components/dialog-connect-provider": subject("../src/components/dialog-connect-provider.tsx"),
  "@/orchestra/use-claude-mode": subject("../src/orchestra/use-claude-mode.ts"),
  "./claude-mode": subject("../src/orchestra/chapters/claude-mode.tsx"),
  "./dialog-custom-provider": subject("../src/components/dialog-custom-provider.tsx"),
  "@/components/settings-v2/provider-dialog-scope": subject("../src/components/settings-v2/provider-dialog-scope.tsx"),
  "@/orchestra/chapters/providers-list": subject("../src/orchestra/chapters/providers-list.tsx"),
  "./kit": subject("../src/orchestra/chapters/kit.tsx"),
  "./providers-dialogs": subject("../src/orchestra/chapters/providers-dialogs.tsx"),
  "@/context/global-sync/bootstrap": "owner-fixture:bootstrap",
  "@/pages/layout/helpers": "owner-fixture:helpers",
  "@/orchestra/chapters/shortcuts-editor": "owner-fixture:unused",
  "@/context/language": "owner-fixture:language",
  "./language": "owner-fixture:language",
  "@/context/platform": "owner-fixture:platform",
  "./platform": "owner-fixture:platform",
  "@/context/server": "owner-fixture:server",
  "./server": "owner-fixture:server",
  "@/context/global": "owner-fixture:global",
  "./global": "owner-fixture:global",
  "@/context/layout": "owner-fixture:layout",
  "@/context/tabs": "owner-fixture:tabs",
  "@solidjs/router": "owner-fixture:router",
  "@/utils/toast": "owner-fixture:toast",
  "./general": "owner-fixture:unused",
  "./models": "owner-fixture:unused",
  "./servers": "owner-fixture:unused",
  "@/components/secret-input-v2": "owner-fixture:ui",
}
Bun.plugin({
  name: "provider-owner-boundaries",
  setup(build) {
    build.onResolve({ filter: /^owner-fixture:/ }, (args) => ({
      path: args.path.slice("owner-fixture:".length),
      namespace: "owner-fixture",
    }))
    build.onLoad({ filter: /.*/, namespace: "owner-fixture" }, (args) => ({
      loader: "object",
      exports: fixtures[args.path as keyof typeof fixtures],
    }))
    build.onLoad({ filter: /\.tsx?\?provider-owner$/ }, async (args) => {
      const file = args.path.replace(/\?provider-owner$/, "")
      const source = (await Bun.file(file).text()).replace(/from (["'])([^"']+)\1/g, (match, _quote, spec: string) => {
        const replacement = imports[spec] ?? (spec.startsWith("@orchestra/ui/") ? "owner-fixture:ui" : undefined)
        return replacement ? `from ${JSON.stringify(replacement)}` : match
      })
      if (!file.endsWith(".tsx")) return { contents: source, loader: "ts" }
      const result = await compiler("@babel/core").transformAsync(
        file.endsWith("dialog-connect-provider.tsx")
          ? `import { FormData } from "owner-fixture:forms"\n${source}`
          : source,
        {
          filename: file,
          presets: [[compiler("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        },
      )
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { DialogProvider, useDialog }: typeof import("@orchestra/ui/context/dialog") = await import(
  subject("../../ui/src/context/dialog.tsx")
)
const { ServerSDKProvider, createServerSdkContext }: typeof import("../src/context/server-sdk") = await import(
  subject("../src/context/server-sdk.tsx")
)
const { ServerSyncProvider }: typeof import("../src/context/server-sync") = await import(
  subject("../src/context/server-sync.tsx")
)
const { ModelsProvider, useModels }: typeof import("../src/context/models") = await import(
  subject("../src/context/models.tsx")
)
const { DialogSettings }: typeof import("../src/components/settings-v2/dialog-settings-v2") = await import(
  subject("../src/components/settings-v2/dialog-settings-v2.tsx")
)

async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await Bun.sleep(10)
  expect(
    predicate(),
    JSON.stringify({
      failures: failures.map(String),
      requests: calls.map((request) => request.url),
      body: document.body.textContent,
    }),
  ).toBe(true)
}
function labelled(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("button")].find((node) => node.textContent === text)!
}
function fill(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function filledKey(input: HTMLInputElement, value: string) {
  fill(input, value)
  const form = input.form
  const realm = form?.ownerDocument.defaultView as typeof window | null
  if (!form || !realm) throw new Error("Filled provider key has no form realm")
  const measured = {
    name: input.name,
    value: input.value,
    associated: form.elements.namedItem(input.name) === input,
    sameConstructor: globalThis.FormData === realm.FormData,
    globalEntry: new globalThis.FormData(form).get(input.name),
    realmEntry: new realm.FormData(form).get(input.name),
    fixtureEntry: new fixtures.forms.FormData(form).get(input.name),
  }
  console.log("provider form realm", JSON.stringify(measured))
  expect(measured.name).toBe("apiKey")
  expect(measured.value).toBe(value)
  expect(measured.associated).toBe(true)
  expect(measured.fixtureEntry).toBe(value)
  Object.entries(nativeHTTP).forEach(([key, constructor]) => expect(Reflect.get(globalThis, key)).toBe(constructor))
}
function mount() {
  const root = createRoot((dispose) => {
    contexts.ensure = createServerContextCache(
      () => state.servers,
      (server) => {
        const sdk = createServerSdkContext(server, ServerScope.local, {
          platform: "web",
          fetch: transport,
          openExternal() {},
          restart: async () => {},
          notify: async () => {},
        })
        const provider = catalog(new URL(server.http.url).hostname)
        return {
          sdk,
          sync: {
            ready: true,
            data: { provider, config: {}, project: [] },
            child: () => [{ provider_ready: true, provider }],
            refreshProviders: async () => {
              await sdk.api.integration.list({ location: { directory: "/b" } })
            },
            updateConfig: (config: Config) => sdk.client.global.config.update({ config }),
          },
        }
      },
    )
    return { dispose }
  })
  const query = new QueryClient()
  const host = document.createElement("div")
  document.body.append(host)
  const scope = { dialog: undefined as ReturnType<typeof useDialog> | undefined }
  const dispose = render(
    () =>
      createComponent(ErrorBoundary, {
        fallback: (error: unknown) => {
          failures.push(error)
          return "root failure"
        },
        get children() {
          return createComponent(QueryClientProvider, {
            client: query,
            get children() {
              return createComponent(ServerSDKProvider, {
                server: () => a,
                get children() {
                  return createComponent(ServerSyncProvider, {
                    server: () => a,
                    get children() {
                      return createComponent(ModelsProvider, {
                        directory: () => "/a",
                        get children() {
                          return createComponent(DialogProvider, {
                            get children() {
                              scope.dialog = useDialog()
                              onMount(() => {
                                void scope.dialog!.show(() =>
                                  createComponent(DialogSettings, { defaultValue: "providers" }),
                                )
                              })
                              return undefined
                            },
                          })
                        },
                      })
                    },
                  })
                },
              })
            },
          })
        },
      }),
    host,
  )
  return {
    ...scope,
    host: document.body,
    close: () => {
      scope.dialog?.active?.dispose()
      dispose()
      root.dispose()
      query.clear()
      host.remove()
    },
  }
}

test("A-opened Settings replaces with B picker, catalog and key request; revoked B transport stays local", async () => {
  calls.length = 0
  controls.protocol = "v2"
  setState({ servers: [a, b], directory: "/b" })
  const screen = mount()
  try {
    await until(() => screen.host.textContent?.includes("owner-b.test catalog") === true)
    expect(screen.dialog?.active?.owner).toBeDefined()
    labelled(screen.host, "orchestra.providers.connect").click()
    await until(() => screen.host.textContent?.includes("owner-b.test discovery") === true)
    screen.host.querySelector<HTMLButtonElement>('[data-provider-id="openrouter"]')!.click()
    await until(() => !!screen.host.querySelector('input[name="apiKey"]'))
    filledKey(screen.host.querySelector<HTMLInputElement>('input[name="apiKey"]')!, "synthetic-provider-key")
    expect(modelCatalogs.at(-1)).toEqual(["owner-b.test model"])
    // Changing the route and same-key credentials must not silently retarget an open secret form.
    setState("directory", "/changed")
    screen.host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await until(() => calls.some((request) => request.method === "POST" && request.url.includes("/connect/key")))
    const write = calls.find((request) => request.method === "POST" && request.url.includes("/connect/key"))!
    expect(new URL(write.url).origin).toBe(b.http.url)
    expect(write).toBeInstanceOf(nativeHTTP.Request)
    expect(write.headers.get("authorization")).toBe(`Basic ${btoa("b:synthetic-b")}`)
    expect(await write.clone().json()).toMatchObject({ key: "synthetic-provider-key" })
    expect(write.url).toContain(encodeURIComponent("/b"))
    await until(() => !screen.dialog?.open)
    const requests = calls.filter((request) => new URL(request.url).pathname.startsWith("/api/integration"))
    expect(requests.map((request) => new URL(request.url).pathname)).toContain("/api/integration/openrouter")
    requests.forEach((request) => {
      const url = new URL(request.url)
      expect(url.origin).toBe(b.http.url)
      expect(url.searchParams.get("location[directory]")).toBe("/b")
      expect(request.headers.get("authorization")).toBe(`Basic ${btoa("b:synthetic-b")}`)
    })
    setState("directory", "/b")
    await screen.dialog!.show(() => createComponent(DialogSettings, { defaultValue: "providers" }))
    await until(() => screen.host.textContent?.includes("owner-b.test catalog") === true)
    // Configure on the provider's card opens the connect dialog straight on that provider.
    labelled(screen.host, "orchestra.providers.configure").click()
    await until(() => !!screen.host.querySelector('input[name="apiKey"]'))
    filledKey(screen.host.querySelector<HTMLInputElement>('input[name="apiKey"]')!, "synthetic-revoked-key")
    setState("servers", [a, { ...b, http: { ...b.http, password: "synthetic-edited" } }])
    const before = calls.filter((request) => request.url.includes("/connect/key")).length
    screen.host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await until(() => !!screen.host.querySelector('[role="alert"]'))
    expect(calls.filter((request) => request.url.includes("/connect/key"))).toHaveLength(before)
    expect(screen.dialog?.open).toBe(true)
    expect(failures).toEqual([])
  } finally {
    screen.close()
  }
})

test("direct custom-provider replacement writes B auth and config under A dialog root", async () => {
  calls.length = 0
  controls.protocol = "v1"
  setState({ servers: [a, b], directory: "/b" })
  const screen = mount()
  try {
    await until(() => !!labelled(screen.host, "orchestra.providers.connect"))
    labelled(screen.host, "orchestra.providers.connect").click()
    // The connect dialog's picker offers the custom provider form on a v1 server.
    await until(() => !!screen.host.querySelector('[data-provider-id="_custom"]'))
    screen.host.querySelector<HTMLButtonElement>('[data-provider-id="_custom"]')!.click()
    await until(() => !!screen.host.querySelector('input[placeholder="provider.custom.field.providerID.placeholder"]'))
    for (const [key, value] of [
      ["provider.custom.field.providerID.placeholder", "synthetic-custom"],
      ["provider.custom.field.name.placeholder", "Synthetic custom"],
      ["provider.custom.field.baseURL.placeholder", "https://synthetic.invalid/v1"],
      ["provider.custom.field.apiKey.placeholder", "synthetic-custom-key"],
      ["provider.custom.models.id.placeholder", "synthetic-model"],
      ["provider.custom.models.name.placeholder", "Synthetic model"],
    ])
      fill(screen.host.querySelector<HTMLInputElement>(`input[placeholder="${key}"]`)!, value)
    screen.host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await until(() => calls.some((request) => request.method === "PATCH"))
    const writes = calls.filter((request) => request.method === "PUT" || request.method === "PATCH")
    expect(writes).toHaveLength(2)
    for (const write of writes) {
      expect(new URL(write.url).origin).toBe(b.http.url)
      expect(write.headers.get("authorization")).toBe(`Basic ${btoa("b:synthetic-b")}`)
    }
    expect(await writes[0].clone().json()).toMatchObject({ type: "api", key: "synthetic-custom-key" })
    expect(await writes[1].clone().json()).toMatchObject({
      provider: { "synthetic-custom": { name: "Synthetic custom" } },
    })
    expect(failures).toEqual([])
  } finally {
    screen.close()
  }
})
