import { expect, test } from "bun:test"
import { createComponent, render } from "./lean-project-metrics.test-helper"
import type { Config } from "@orchestra/sdk/v2/client"
import type { ServerSDK } from "@/context/server-sdk"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { ServerScope } from "@/utils/server-scope"

const { createServerSyncContextInner } = await import("@/context/server-sync")
const { createLeanSettingsController } = await import("@/components/settings-v2/general-controllers")
const { PlatformProvider } = await import("@/context/platform")
const { LanguageProvider } = await import("@/context/language")

async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await Bun.sleep(10)
  expect(predicate()).toBe(true)
}

test("rejected config GET can finish real bootstrap but never enables Lean writes; refetch readiness is reactive", async () => {
  const writes: Config[] = []
  const transport = { reads: 0, config: {} as Config, read: async (): Promise<{ data: Config }> => { throw new Error("config GET denied") } }
  const client = {
    global: { config: {
      get: () => { transport.reads++; return transport.read() },
      update: async ({ config }: { config: Config }) => { writes.push(config); transport.config = config; return { data: config } },
    } },
    provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
    path: { get: async () => ({ data: { state: "", config: "", worktree: "/repo", directory: "/repo", home: "/home" } }) },
    session: { status: async () => ({ data: {} }) },
  }
  const sdk = {
    scope: ServerScope.local, server: { type: "http", http: { url: "http://config-test" } }, protocol: Promise.resolve("v1"),
    client, createClient: () => client, api: { project: { list: async () => [] }, session: {}, message: {} },
    event: { listen: () => () => {}, start: async () => {} },
  } as unknown as ServerSDK
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } })
  const scope: { sync?: ReturnType<typeof createServerSyncContextInner>; lean?: ReturnType<typeof createLeanSettingsController> } = {}
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en", get children() { return createComponent(QueryClientProvider, {
        client: queryClient, get children() { return createComponent(() => {
          scope.sync = createServerSyncContextInner(sdk)
          scope.lean = createLeanSettingsController(() => scope.sync!, () => true)
          return undefined
        }, {}) },
      }) },
    }) },
  }), document.createElement("div"))
  const key = [ServerScope.local, "config"]
  const state = () => queryClient.getQueryState(key)
  try {
    await until(() => scope.sync!.ready && state()?.status === "error" && state()?.fetchStatus === "idle")
    expect(transport.reads).toBeGreaterThan(0)
    expect(scope.sync!.error).toBeUndefined()
    expect(scope.sync!.data.config).toEqual({})
    expect(scope.lean!.enabled()).toBeUndefined()
    expect(scope.sync!.configReady).toBe(false)
    await scope.lean!.set(true)
    expect(writes).toHaveLength(0)
    const empty = Promise.withResolvers<{ data: Config }>()
    transport.read = () => empty.promise
    const pending = queryClient.refetchQueries({ queryKey: key })
    await until(() => state()?.fetchStatus === "fetching")
    expect(scope.sync!.configReady).toBe(false)
    expect(scope.lean!.enabled()).toBeUndefined()
    empty.resolve({ data: {} })
    await pending
    await until(() => scope.sync!.configReady)
    expect(scope.sync!.data.config).toEqual({})
    expect(scope.lean!.enabled()).toBe(true)
    transport.read = async () => ({ data: transport.config })
    await scope.lean!.set(false)
    await until(() => scope.sync!.configReady && scope.lean!.enabled() === false)
    expect(writes).toEqual([{ tool_output: { lean: { enabled: false } } }])
    const failed = Promise.withResolvers<{ data: Config }>()
    transport.read = () => failed.promise
    const refetch = queryClient.refetchQueries({ queryKey: key })
    await until(() => state()?.fetchStatus === "fetching")
    expect(scope.sync!.configReady).toBe(false)
    expect(scope.lean!.enabled()).toBeUndefined()
    await scope.lean!.set(true)
    expect(writes).toHaveLength(1)
    failed.reject(new Error("config refetch denied"))
    await refetch
    await until(() => state()?.status === "error" && state()?.fetchStatus === "idle")
    expect(scope.sync!.ready).toBe(true)
    expect(scope.sync!.error).toBeUndefined()
    expect(scope.sync!.configReady).toBe(false)
    expect(scope.lean!.enabled()).toBeUndefined()
    await scope.lean!.set(true)
    expect(writes).toHaveLength(1)
    transport.read = async () => ({ data: transport.config })
    await queryClient.refetchQueries({ queryKey: key })
    await until(() => scope.sync!.configReady)
    expect(scope.lean!.enabled()).toBe(false)
  } finally { dispose(); queryClient.clear() }
})
