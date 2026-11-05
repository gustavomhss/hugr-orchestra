import { expect, mock, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Omni } from "@orchestra/core/omni"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { FabricContext } from "@orchestra/schema/fabric-context"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import type { ParentProps } from "solid-js"
import type { ServerConnection } from "../src/context/server"

// Isolate module mocks from the rest of the browser lane, as the existing Lean route suite does.
if (process.env.FABRIC_ENTRY_ROUTE_DOM !== "1") {
  test("Fabric native entry route acceptance in isolated browser lane", async () => {
    expectSpawn(import.meta.path)
    const before = Omni.snapshot()
    const result = await Effect.runPromise(AppProcess.Service.use((app) => app.run(
      ChildProcess.make(process.execPath, ["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
        cwd: path.resolve(import.meta.dir, ".."), env: { ...process.env, FABRIC_ENTRY_ROUTE_DOM: "1" },
      }), { timeout: 60000 },
    )).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
    const output = result.stdout.toString() + result.stderr.toString()
    expect(result.exitCode, output).toBe(0)
    expect(output).toMatch(/\b[1-9]\d* pass\b/)
    expect(output).not.toMatch(/\b[1-9]\d* skip\b/)
    expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
    expect(Omni.snapshot().delegations).toBe(before.delegations)
    console.log(output)
  }, 90000)
} else {
  const { createComponent, createRoot, onCleanup }: typeof import("solid-js") = await import("solid-js")
  const { createStore }: typeof import("solid-js/store") = await import("solid-js/store")
  const { render }: typeof import("solid-js/web") = await import("solid-js/web")
  const { MemoryRouter, Route, createMemoryHistory } = await import("@solidjs/router")
  const { solidDom } = await import("./solid-dom")
  const { createServerContextCache }: typeof import("../src/context/global") = await import(solidDom("../src/context/global", import.meta.dir))
  const { createServerSdkContext }: typeof import("../src/context/server-sdk") = await import(solidDom("../src/context/server-sdk", import.meta.dir))
  const serverModule: typeof import("../src/context/server") = await import(solidDom("../src/context/server", import.meta.dir))
  const { ServerScope }: typeof import("../src/utils/server-scope") = await import(solidDom("../src/utils/server-scope", import.meta.dir))
  const { PlatformProvider }: typeof import("../src/context/platform") = await import(solidDom("../src/context/platform", import.meta.dir))
  const { LanguageProvider, useLanguage }: typeof import("../src/context/language") = await import(solidDom("../src/context/language", import.meta.dir))
  const { I18nProvider }: typeof import("@orchestra/ui/context/i18n") = await import(solidDom("@orchestra/ui/context/i18n", import.meta.dir))
  const { DialogProvider }: typeof import("@orchestra/ui/context/dialog") = await import(solidDom("@orchestra/ui/context/dialog", import.meta.dir))
  const { SDKProvider, useSDK }: typeof import("../src/context/sdk") = await import(solidDom("../src/context/sdk", import.meta.dir))
  const { ModelsProvider, ModelPreferencesProvider, useModels }: typeof import("../src/context/models") = await import(solidDom("../src/context/models", import.meta.dir))

  function Controls(props: ParentProps) {
    const language = useLanguage()
    return createComponent(I18nProvider, {
      value: { locale: language.intl, layoutLocale: language.layoutLocale, t: language.t, plural: language.plural },
      get children() { return createComponent(DialogProvider, { get children() { return props.children } }) },
    })
  }

  test("FEN01 actual registered Fabric route waits for hydration and uses only the explicitly selected server without Git or AI", async () => {
    const selected: ServerConnection.Http = { type: "http", http: { url: "http://fabric-selected.fixture", password: "synthetic-selected" } }
    const fallback: ServerConnection.Http = { type: "http", http: { url: "http://fabric-fallback.fixture", password: "synthetic-fallback" } }
    const ref = { id: FabricContext.ID.create(), generation: 1 }
    const calls: Request[] = []
    const mounted: { kind: "sdk" | "models"; disposed: boolean }[] = []
    const provider: NormalizedProviderListResponse = { all: new Map(), connected: [], default: {} }
    const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === "/api/health") return Response.json({ healthy: true, version: "2", pid: 1 })
      calls.push(request)
      expect(request.method).toBe("GET")
      expect(url.origin).toBe(selected.http.url)
      expect(request.headers.get("authorization")).toBe(`Basic ${btoa("orchestra:synthetic-selected")}`)
      if (url.pathname === "/api/fabric/contexts") return Response.json({ items: [ref] })
      expect(url.pathname).toBe("/api/fabric/contexts/preparing")
      return Response.json({ items: [] })
    }, { preconnect: fetch.preconnect })
    const platform = { platform: "web" as const, fetch: transport, openExternal() {}, async restart() {}, async notify() {} }
    const owner = createRoot((dispose) => {
      const [state, setState] = createStore({ ready: false,
        servers: [selected, fallback] as ServerConnection.Any[],
        selection: { server: serverModule.ServerConnection.key(selected), directory: undefined as string | undefined } })
      const ensure = createServerContextCache(() => state.servers, (connection) => ({
        sdk: createServerSdkContext(connection, ServerScope.local, platform),
        // Composition-only catalog fixture; real SDK/Models providers remain wrapped, not replaced.
        sync: { ready: true, data: { provider, config: {}, project: [] },
          child: () => [{ provider_ready: true, provider }], refreshProviders: async () => {} },
      }))
      return { dispose, state, setState, ensure }
    })
    mock.module(solidDom("../src/context/global", import.meta.dir), () => ({
      createServerContextCache, useGlobal: () => ({
        servers: { list: () => owner.state.servers }, ensureServerCtx: owner.ensure,
      }),
    }))
    mock.module(solidDom("../src/context/layout", import.meta.dir), () => ({ useLayout: () => ({
      ready: () => owner.state.ready, home: { selection: () => owner.state.selection },
    }) }))
    mock.module(solidDom("../src/context/server", import.meta.dir), () => ({
      ...serverModule, useServer: () => ({ list: owner.state.servers, current: fallback, setActive() {} }),
    }))
    mock.module(solidDom("../src/context/sdk", import.meta.dir), () => ({ useSDK,
      SDKProvider: (props: Parameters<typeof SDKProvider>[0]) => {
        const entry = { kind: "sdk" as const, disposed: false }
        mounted.push(entry)
        onCleanup(() => { entry.disposed = true })
        return createComponent(SDKProvider, props)
      },
    }))
    mock.module(solidDom("../src/context/models", import.meta.dir), () => ({ useModels, ModelPreferencesProvider,
      ModelsProvider: (props: Parameters<typeof ModelsProvider>[0]) => {
        const entry = { kind: "models" as const, disposed: false }
        mounted.push(entry)
        onCleanup(() => { entry.disposed = true })
        return createComponent(ModelsProvider, props)
      },
    }))
    const host = document.createElement("div")
    document.body.append(host)
    const history = createMemoryHistory()
    history.set({ value: "/orchestra/fabric", scroll: false, replace: true })
    const until = async (predicate: () => boolean) => {
      for (let n = 0; n < 500 && !predicate(); n++) await Bun.sleep(10)
      expect(predicate(), host.textContent ?? "missing DOM").toBe(true)
    }
    const lifetime = { dispose: () => {} }
    try {
      const { OrchestraChapterRoute, chapterPages }: typeof import("../src/orchestra/chapter-route") =
        await import(solidDom("../src/orchestra/chapter-route", import.meta.dir))
      // Positive registry control prevents an import/lookup mistake from masquerading as missing Fabric.
      expect(typeof chapterPages.lean).toBe("function")
      expect(typeof chapterPages.fabric, "FEN01 native Fabric chapter is not registered").toBe("function")
      lifetime.dispose = render(() => createComponent(PlatformProvider, { value: platform, get children() {
        return createComponent(LanguageProvider, { locale: "en", get children() {
          return createComponent(Controls, { get children() {
            return createComponent(MemoryRouter, { history, get children() {
              return createComponent(Route, { path: "/orchestra/:chapter", component: OrchestraChapterRoute })
            } })
          } })
        } })
      } }), host)
      await Promise.resolve()
      expect(calls).toEqual([])
      expect(mounted).toEqual([])
      // Hydration completes with a missing selection while another server.current is healthy.
      owner.setState("selection", "server", serverModule.ServerConnection.key({ type: "http", http: { url: "http://missing.fixture" } }))
      owner.setState("ready", true)
      await Promise.resolve()
      expect(calls).toEqual([])
      expect(mounted).toEqual([])
      owner.setState("selection", "server", serverModule.ServerConnection.key(selected))
      await until(() => calls.some((request) => new URL(request.url).pathname === "/api/fabric/contexts/preparing")
        && host.textContent?.includes(ref.id) === true)
      expect(calls.map((request) => new URL(request.url).pathname).sort()).toEqual([
        "/api/fabric/contexts", "/api/fabric/contexts/preparing",
      ])
      expect(mounted).toEqual([])
      expect(owner.state.selection.directory).toBeUndefined()
      expect(provider.connected).toEqual([])
      expect(host.querySelector('[data-slot="orchestra-chapter-empty"]')).toBeNull()
      expect(host.outerHTML).not.toContain("synthetic-selected")
      expect(host.outerHTML).not.toContain("synthetic-fallback")
    } finally {
      lifetime.dispose()
      host.remove()
      owner.dispose()
      mock.restore()
    }
  }, 15000)
}
