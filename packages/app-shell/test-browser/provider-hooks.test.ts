import { expect, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { base64Encode } from "@orchestra/core/util/encode"

const [state, setState] = createStore({
  route: "/route",
  directory: undefined as string | null | undefined,
  protocol: "v2" as "v2",
  server: "a" as "a" | "b",
})
const refreshed: Array<string | null | undefined> = []
const discovered: Array<unknown> = []
const requestedServers: string[] = []
const responses = new Map<string, Promise<{ data: Array<{ id: string; name: string }> }>>()
const client = (server: string) => ({
  scope: server,
  api: {
    integration: {
      list: async (input: unknown) => {
        discovered.push(input)
        requestedServers.push(server)
        return (
          responses.get(server) ?? {
            data: [
              { id: "openrouter", name: "OpenRouter" },
              { id: "anthropic", name: "Anthropic" },
            ],
          }
        )
      },
    },
  },
})
const clients = { a: client("a"), b: client("b") }
const catalog = (id: string) => ({
  all: new Map([[id, { id, name: id, models: { model: { id: "model", name: id } } }]]),
  connected: [id],
  default: {},
})
const sync = {
  data: { provider: catalog("global") },
  child: (directory: string) => [{ provider_ready: true, provider: catalog(directory) }],
  refreshProviders: async (directory?: string | null) => {
    refreshed.push(directory)
  },
}

// Scope context substitutes to these imports only: mock.module would replace contexts for unrelated
// browser tests too. The hook, ModelsProvider initialization and nested QueryClient providers are real.
const contexts = {
  sync: { useServerSync: () => () => sync },
  sdk: {
    useServerProtocol: () => () => state.protocol,
    useServerSDK: () => () => clients[state.server],
  },
  language: { useLanguage: () => ({ t: () => "Request failed" }) },
  router: {
    useParams: () => ({
      get dir() {
        return base64Encode(state.route)
      },
    }),
  },
  context: {
    createSimpleContext: (input: { init: (props: Record<string, unknown>) => unknown }) => ({
      provider: input.init,
      use: () => undefined,
    }),
  },
  persist: {
    Persist: { global: () => undefined },
    persisted: (_target: unknown, store: readonly unknown[]) => [
      store[0],
      store[1],
      null,
      Object.assign(() => true, { promise: undefined }),
    ],
  },
}
const hookPath = Bun.resolveSync("../src/hooks/use-providers", import.meta.dir)
Bun.plugin({
  name: "provider-scope-fixtures",
  setup(build) {
    build.onResolve({ filter: /^provider-context:/ }, (args) => ({
      path: args.path.slice("provider-context:".length),
      namespace: "provider-context",
    }))
    build.onLoad({ filter: /.*/, namespace: "provider-context" }, (args) => ({
      loader: "object",
      exports: contexts[args.path as keyof typeof contexts],
    }))
    build.onLoad({ filter: /(?:use-providers\.ts|models\.tsx)\?provider-test$/ }, async (args) => ({
      contents: (await Bun.file(args.path.replace(/\?provider-test$/, "")).text())
        .replace('"@/context/server-sync"', '"provider-context:sync"')
        .replace('"@/context/server-sdk"', '"provider-context:sdk"')
        .replace('"@/context/language"', '"provider-context:language"')
        .replace('"@solidjs/router"', '"provider-context:router"')
        .replace('"@orchestra/ui/context"', '"provider-context:context"')
        .replace('"@/utils/persist"', '"provider-context:persist"')
        .replace('"@/hooks/use-providers"', JSON.stringify(`${hookPath}?provider-test`)),
      loader: "ts",
    }))
  },
})
const { useProviders, useProviderDiscovery }: typeof import("../src/hooks/use-providers") = await import(
  `${hookPath}?provider-test`
)

test("nested view refresh calls ServerSync owner API; explicit global and unresolved scopes stay distinct", async () => {
  const owner = new QueryClient()
  const nested = new QueryClient()
  const scope = createRoot((dispose) => {
    const hooks: Array<ReturnType<typeof useProviders>> = []
    createComponent(QueryClientProvider, {
      client: owner,
      get children() {
        return createComponent(QueryClientProvider, {
          client: nested,
          get children() {
            hooks.push(
              useProviders(),
              useProviders(() => state.directory),
            )
            return undefined
          },
        })
      },
    })
    return { dispose, hooks }
  })
  try {
    refreshed.length = 0
    setState("directory", undefined)
    expect(scope.hooks[0].connected().map((item) => item.id)).toEqual(["/route"])
    expect(scope.hooks[1].connected()).toEqual([])
    await expect(scope.hooks[1].refresh()).rejects.toThrow("Request failed")
    expect(refreshed).toEqual([])
    await scope.hooks[0].refresh()
    expect(refreshed).toEqual(["/route"])
    setState("directory", null)
    expect(scope.hooks[1].connected().map((item) => item.id)).toEqual(["global"])
    await scope.hooks[1].refresh()
    expect(refreshed).toEqual(["/route", null])
    setState("directory", "/explicit")
    expect(scope.hooks[1].connected().map((item) => item.id)).toEqual(["/explicit"])
    await scope.hooks[1].refresh()
    expect(refreshed).toEqual(["/route", null, "/explicit"])
    expect(nested.getQueryCache().getAll()).toEqual([])
  } finally {
    scope.dispose()
    owner.clear()
    nested.clear()
  }
})

test("V2 discovery includes disconnected integrations, waits for scope, and preserves V1 catalog discovery", async () => {
  setState({ directory: undefined, protocol: "v2" })
  discovered.length = 0
  const scope = createRoot((dispose) => ({ dispose, discovery: useProviderDiscovery(() => state.directory) }))
  try {
    expect(scope.discovery.all()).toEqual([])
    expect(discovered).toEqual([])
    setState("directory", "/project")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scope.discovery.loading()).toBe(false)
    expect(discovered).toEqual([{ location: { directory: "/project" } }])
    expect(scope.discovery.all().map((item) => item.id)).toEqual(["openrouter", "anthropic"])
    expect(sync.child("/project")[0].provider.all.has("openrouter")).toBe(false)
    setState("protocol", "v1")
    expect(scope.discovery.all().map((item) => item.id)).toEqual(["/project"])
    expect(discovered).toHaveLength(1)
  } finally {
    scope.dispose()
  }
})

test("same-directory server switch captures each SDK and ignores a late previous-server reply", async () => {
  setState({ directory: "/same", server: "a", protocol: "v2" })
  requestedServers.length = 0
  const a = Promise.withResolvers<{ data: Array<{ id: string; name: string }> }>()
  const b = Promise.withResolvers<{ data: Array<{ id: string; name: string }> }>()
  responses.set("a", a.promise)
  responses.set("b", b.promise)
  const scope = createRoot((dispose) => ({ dispose, discovery: useProviderDiscovery(() => state.directory) }))
  try {
    setState("server", "b")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestedServers).toEqual(["a", "b"])
    b.resolve({ data: [{ id: "b-only", name: "B" }] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scope.discovery.all().map((item) => item.id)).toEqual(["b-only"])
    a.resolve({ data: [{ id: "a-only", name: "A" }] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scope.discovery.all().map((item) => item.id)).toEqual(["b-only"])
    expect(scope.discovery.error()).toBeUndefined()
  } finally {
    a.resolve({ data: [] })
    b.resolve({ data: [] })
    responses.clear()
    scope.dispose()
  }
})
