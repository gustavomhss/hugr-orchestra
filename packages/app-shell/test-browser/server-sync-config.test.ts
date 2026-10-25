import { expect, test } from "bun:test"
import { createComponent } from "solid-js"
import { render } from "solid-js/web"

import type { ServerSDK } from "@/context/server-sdk"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { solidDom } from "./solid-dom"

// Real server sync, compiled with the app's Solid preset whichever test file loaded the plain modules first.
const { ServerScope }: typeof import("@/utils/server-scope") = await import(solidDom("@/utils/server-scope", import.meta.dir))
const { createServerSyncContextInner }: typeof import("@/context/server-sync") = await import(
  solidDom("@/context/server-sync", import.meta.dir)
)
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))

async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await Bun.sleep(10)
  expect(predicate()).toBe(true)
}

test("a rejected global config GET still completes the global bootstrap; a later config refetch fills the config", async () => {
  type Settings = { model?: string; disabledProviders: string[] }
  const transport = { reads: 0, read: async (): Promise<Settings> => { throw new Error("config GET denied") } }
  const client = {}
  const sdk = {
    scope: ServerScope.local, server: { type: "http", http: { url: "http://config-test" } }, ready: Promise.resolve(),
    client, createClient: () => client,
    api: {
      project: { list: async () => [] }, session: {}, message: {},
      provider: { list: async () => ({ data: [] }) }, model: { list: async () => ({ data: [] }) },
    },
    orchestra: { config: { get: () => { transport.reads++; return transport.read() } }, sessions: {} },
    event: { listen: () => () => {}, start: async () => {} },
  } as unknown as ServerSDK
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } })
  const scope: { sync?: ReturnType<typeof createServerSyncContextInner> } = {}
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en", get children() { return createComponent(QueryClientProvider, {
        client: queryClient, get children() { return createComponent(() => {
          scope.sync = createServerSyncContextInner(sdk)
          return undefined
        }, {}) },
      }) },
    }) },
  }), document.createElement("div"))
  const config = () => queryClient.getQueryState([ServerScope.local, "config"])
  const bootstrap = () => queryClient.getQueryState([ServerScope.local, "bootstrap"])
  try {
    await until(() => scope.sync!.ready && config()?.status === "error" && config()?.fetchStatus === "idle")
    expect(transport.reads).toBeGreaterThan(0)
    // The rejected read neither fails the bootstrap nor surfaces as a server-sync error, and the other reads land.
    expect(bootstrap()?.status).toBe("success")
    expect(scope.sync!.error).toBeUndefined()
    expect(scope.sync!.data.config).toEqual({})
    transport.read = async () => ({ model: "provider/model", disabledProviders: [] })
    await queryClient.refetchQueries({ queryKey: [ServerScope.local, "config"] })
    await until(() => config()?.status === "success")
    expect(scope.sync!.data.config).toEqual({ model: "provider/model", disabled_providers: [] })
    expect(scope.sync!.ready).toBe(true)
    expect(scope.sync!.error).toBeUndefined()
  } finally { dispose(); queryClient.clear() }
})
