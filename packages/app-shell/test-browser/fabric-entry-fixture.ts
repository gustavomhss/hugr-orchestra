export * as FabricEntryFixture from "./fabric-entry-fixture"

import { expect, mock } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import { Schema } from "effect"
import type { ParentProps } from "solid-js"
import type { ServerConnection } from "../src/context/server"
import { solidDom } from "./solid-dom"

const { createComponent, createRoot, onCleanup, ErrorBoundary }: typeof import("solid-js") = await import("solid-js")
const { createStore }: typeof import("solid-js/store") = await import("solid-js/store")
const { render }: typeof import("solid-js/web") = await import("solid-js/web")
const { MemoryRouter, Route, createMemoryHistory } = await import("@solidjs/router")
const { createServerContextCache }: typeof import("../src/context/global") = await import(solidDom("../src/context/global", import.meta.dir))
const { createServerSdkContext, useServerSDK }: typeof import("../src/context/server-sdk") = await import(solidDom("../src/context/server-sdk", import.meta.dir))
const serverModule: typeof import("../src/context/server") = await import(solidDom("../src/context/server", import.meta.dir))
const { ServerScope }: typeof import("../src/utils/server-scope") = await import(solidDom("../src/utils/server-scope", import.meta.dir))
const { PlatformProvider }: typeof import("../src/context/platform") = await import(solidDom("../src/context/platform", import.meta.dir))
const { LanguageProvider, useLanguage }: typeof import("../src/context/language") = await import(solidDom("../src/context/language", import.meta.dir))
const { I18nProvider }: typeof import("@orchestra/ui/context/i18n") = await import(solidDom("@orchestra/ui/context/i18n", import.meta.dir))
const { DialogProvider }: typeof import("@orchestra/ui/context/dialog") = await import(solidDom("@orchestra/ui/context/dialog", import.meta.dir))
const { SDKProvider, useSDK }: typeof import("../src/context/sdk") = await import(solidDom("../src/context/sdk", import.meta.dir))
const { ModelsProvider, ModelPreferencesProvider, useModels }: typeof import("../src/context/models") = await import(solidDom("../src/context/models", import.meta.dir))

// Same native i18n bridge/dialog composition as AppBaseProviders, without app startup or telemetry.
function Controls(props: ParentProps) {
  const language = useLanguage()
  return createComponent(I18nProvider, {
    value: { locale: language.intl, layoutLocale: language.layoutLocale, t: language.t, plural: language.plural },
    get children() { return createComponent(DialogProvider, { get children() { return props.children } }) },
  })
}

export const key = serverModule.ServerConnection.key
export function context(directory: string) {
  return Schema.decodeUnknownSync(FabricContext.Info)({ context: { id: FabricContext.ID.create(), generation: 1 },
    location: { directory, project: { id: "global", directory: "/" } } })
}

/** A real Response whose body is consumed after headers, as calibrated by FEN00. */
export function held(status: number, value: unknown) {
  const reading = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const delivered = Promise.withResolvers<void>()
  class HeldBody extends Response {
    override async text() {
      reading.resolve()
      const body = await super.text()
      delivered.resolve()
      return body
    }
  }
  return { reading: reading.promise, delivered: delivered.promise, release: () => release.resolve(),
    response: new HeldBody(new ReadableStream<Uint8Array>({ async pull(controller) {
      await release.promise
      controller.enqueue(new TextEncoder().encode(JSON.stringify(value)))
      controller.close()
    } }, { highWaterMark: 0 }), { status, headers: { "content-type": "application/json" } }) }
}

export async function make(options: {
  servers: ServerConnection.Any[]
  selected: ServerConnection.Key
  current?: ServerConnection.Any
  directory?: string
  ready?: boolean
  handle: (request: Request) => Response | Promise<Response>
}) {
  const requests: Request[] = []
  const errors: unknown[] = []
  const mounts: { kind: "sdk" | "models"; directory: string | undefined; client: ReturnType<typeof createServerSdkContext>["orchestra"]; disposed: boolean }[] = []
  const provider: NormalizedProviderListResponse = { all: new Map(), connected: [], default: {} }
  const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    if (new URL(request.url).pathname === "/api/health") return Response.json({ healthy: true, version: "2", pid: 1 })
    requests.push(request)
    return options.handle(request)
  }, { preconnect: fetch.preconnect })
  const platform = { platform: "web" as const, fetch: transport, openExternal() {}, async restart() {}, async notify() {} }
  const owner = createRoot((dispose) => {
    const [state, setState] = createStore({ ready: options.ready ?? true, servers: options.servers,
      selection: { server: options.selected, directory: options.directory } })
    const ensure = createServerContextCache(() => state.servers, (connection) => ({
      sdk: createServerSdkContext(connection, ServerScope.local, platform),
      sync: { ready: true, data: { provider, config: {}, project: [] },
        child: () => [{ provider_ready: true, provider }], refreshProviders: async () => {} },
    }))
    return { dispose, state, setState, ensure }
  })
  mock.module(solidDom("../src/context/global", import.meta.dir), () => ({ createServerContextCache,
    useGlobal: () => ({ servers: { list: () => owner.state.servers }, ensureServerCtx: owner.ensure }),
  }))
  mock.module(solidDom("../src/context/layout", import.meta.dir), () => ({ useLayout: () => ({
    ready: () => owner.state.ready, home: { selection: () => owner.state.selection },
  }) }))
  mock.module(solidDom("../src/context/server", import.meta.dir), () => ({ ...serverModule, useServer: () => ({
    get list() { return owner.state.servers }, get current() { return options.current ?? owner.state.servers[0] }, setActive() {},
  }) }))
  mock.module(solidDom("../src/context/sdk", import.meta.dir), () => ({ useSDK,
    SDKProvider: (props: Parameters<typeof SDKProvider>[0]) => {
      const entry = { kind: "sdk" as const, directory: typeof props.directory === "function" ? props.directory() : props.directory,
        client: useServerSDK()().orchestra, disposed: false }
      mounts.push(entry)
      onCleanup(() => { entry.disposed = true })
      return createComponent(SDKProvider, props)
    },
  }))
  mock.module(solidDom("../src/context/models", import.meta.dir), () => ({ useModels, ModelPreferencesProvider,
    ModelsProvider: (props: Parameters<typeof ModelsProvider>[0]) => {
      const entry = { kind: "models" as const, directory: props.directory?.() ?? undefined,
        client: useServerSDK()().orchestra, disposed: false }
      mounts.push(entry)
      onCleanup(() => { entry.disposed = true })
      return createComponent(ModelsProvider, props)
    },
  }))
  const host = document.createElement("div")
  document.body.append(host)
  const history = createMemoryHistory()
  history.set({ value: "/orchestra/fabric", scroll: false, replace: true })
  const lifetime = { dispose: () => {}, closed: false }
  const dispose = () => {
    if (lifetime.closed) return
    lifetime.closed = true
    lifetime.dispose()
    host.remove()
    owner.dispose()
    mock.restore()
  }
  try {
    const { OrchestraChapterRoute, chapterPages }: typeof import("../src/orchestra/chapter-route") =
      await import(solidDom("../src/orchestra/chapter-route", import.meta.dir))
    expect(typeof chapterPages.lean).toBe("function")
    expect(typeof chapterPages.fabric, "Fabric entry acceptance: native chapter is not registered").toBe("function")
    lifetime.dispose = render(() => createComponent(PlatformProvider, { value: platform, get children() {
      return createComponent(LanguageProvider, { locale: "en", get children() {
        return createComponent(ErrorBoundary, { fallback: (error: unknown) => {
          errors.push(error)
          return document.createTextNode("Fabric test fixture error")
        }, get children() {
          return createComponent(Controls, { get children() {
            return createComponent(MemoryRouter, { history, get children() {
              return [createComponent(Route, { path: "/orchestra/:chapter", component: OrchestraChapterRoute }),
                createComponent(Route, { path: "/", component: () => null })]
            } })
          } })
        } })
      } })
    } }), host)
    return { host, state: owner.state, set: owner.setState, requests, mounts, errors, dispose,
      sdk: (connection: ServerConnection.Any) => owner.ensure(connection).sdk,
      navigate: (value: string) => history.set({ value, scroll: false, replace: true }),
      button: (action: string, id?: FabricContext.ID) => {
        const selector = `button[data-fabric-action="${action}"]${id ? `[data-context-id="${id}"]` : ""}`
        const button = host.querySelector<HTMLButtonElement>(selector)
          ?? (["confirm-remove", "dismiss-remove"].includes(action)
            ? document.querySelector<HTMLButtonElement>(`[data-component="dialog"] ${selector}`) : null)
        expect(button, `Missing Fabric action ${action}`).not.toBeNull()
        return button!
      },
      until: async (predicate: () => boolean) => {
        for (let n = 0; n < 500 && !predicate() && errors.length === 0; n++) await Bun.sleep(10)
        expect(errors).toEqual([])
        expect(predicate(), host.textContent ?? "missing DOM").toBe(true)
      },
    }
  } catch (error) {
    dispose()
    throw error
  }
}
