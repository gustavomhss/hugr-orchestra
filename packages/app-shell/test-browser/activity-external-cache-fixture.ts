import { expect, mock } from "bun:test"
import { Orchestra } from "@orchestra/client"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { Locale } from "@/context/language"
import type { ServerConnection } from "@/context/server"
import type { ServerSDK } from "@/context/server-sdk"
import { createComponent, createContext, createSignal, useContext, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { isolatedSolid } from "./orchestra/integrations-solid.fixture"

const load = isolatedSolid("activity-external-cache")
const serverContext =
  createContext<Accessor<Pick<ServerSDK, "orchestra" | "ready"> & { connection: ServerConnection.Any }>>()

function useFixtureServer() {
  const active = useContext(serverContext)
  if (!active) throw new Error("Activity fixture server missing")
  return active
}

mock.module(Bun.resolveSync("@/context/server-sdk", import.meta.dir) + "?activity-external-cache", () => ({
  useServerSDK: useFixtureServer,
}))
mock.module(Bun.resolveSync("@/context/server", import.meta.dir) + "?activity-external-cache", () => ({
  useServer: () => {
    const active = useFixtureServer()
    return {
      get current() {
        return active().connection
      },
    }
  },
}))
export const cachePath = "/api/activity/external-caches"
export const readPath = (id: string) => cachePath + "/" + encodeURIComponent(id) + "/read"

export async function until(description: string, ready: () => boolean) {
  const deadline = Date.now() + 4_000
  while (!ready() && Date.now() < deadline) await Bun.sleep(10)
  expect(ready(), description).toBe(true)
}

function intercepted(request: Request) {
  const response = Promise.withResolvers<Response>()
  return {
    request,
    url: new URL(request.url),
    response: response.promise,
    respond(value: unknown, status = 200) {
      response.resolve(Response.json(value, { status }))
    },
  }
}

export async function mount(initialLocale: Locale = "en") {
  const { default: ActivityPage }: typeof import("@/orchestra/chapters/activity/page") = await load(
    "@/orchestra/chapters/activity/page",
  )
  const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await load("@/context/language")
  const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")

  const attributes = ["lang", "dir"].map((name) => [name, document.documentElement.getAttribute(name)] as const)
  const storage = ["orchestra.global.dat:language", "language.v1"].map(
    (key) => [key, localStorage.getItem(key)] as const,
  )
  const localeCookie = document.cookie.split("; ").find((cookie) => cookie.startsWith("oc_locale="))
  const host = document.body.appendChild(document.createElement("div"))
  const calls: ReturnType<typeof intercepted>[] = []
  const unexpected: string[] = []
  let treesRead = false
  const transport = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = new Request(input, init)
      const pathname = new URL(request.url).pathname
      if (
        (pathname === cachePath && request.method === "GET") ||
        (pathname.startsWith(cachePath + "/") && pathname.endsWith("/read") && request.method === "POST")
      ) {
        const call = intercepted(request)
        calls.push(call)
        return call.response
      }
      if (pathname === "/api/activity/disk" && request.method === "GET") {
        return Promise.resolve(Response.json({ instanceID: "disk", readAt: 3000, source: "node.fs.lstat", roots: [] }))
      }
      if (pathname === "/api/activity" && request.method === "GET" && !treesRead) {
        treesRead = true
        return Promise.resolve(
          Response.json({
            instanceID: "trees",
            readAt: 3_000,
            source: "orchestra.omni.ledger",
            coverage: "server-pipe-spawns",
            retired: 0,
            records: [],
          }),
        )
      }
      unexpected.push(request.method + " " + pathname)
      return Promise.resolve(Response.json({ message: "Unexpected fixture endpoint: " + pathname }, { status: 404 }))
    },
    { preconnect: fetch.preconnect },
  )
  const server = (name: string) => {
    const connection: ServerConnection.Any = { type: "http", http: { url: "http://" + name + ".test" } }
    return {
      connection,
      ready: Promise.resolve(),
      orchestra: Orchestra.make({ baseUrl: connection.http.url, fetch: transport }),
    }
  }
  const [active, setActive] = createSignal(server("first"))
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: initialLocale,
            get children() {
              useLanguage().setLocale(initialLocale)
              return createComponent(serverContext.Provider, {
                value: active,
                get children() {
                  return createComponent(ActivityPage, {
                    get server() {
                      return active().connection
                    },
                    directory: "/fixture",
                  })
                },
              })
            },
          })
        },
      }),
    host,
  )

  function element<E extends HTMLElement>(selector: string) {
    const found = host.querySelector<E>(selector)
    if (!found) throw new Error("Activity element missing: " + selector)
    return found
  }
  const panel = () => element("[role='tabpanel']")
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>("[role='tab']")]
  return {
    host,
    calls,
    panel,
    tabs,
    switchServer: (name: string) => setActive(server(name)),
    select(name: string) {
      const tab = tabs().find((item) => item.textContent?.trim() === name)
      if (!tab) throw new Error("Activity tab missing: " + name)
      tab.click()
    },
    button(label: string) {
      const buttons = [...panel().querySelectorAll<HTMLButtonElement>("button")]
      const button = buttons.find((item) => item.textContent?.trim() === label)
      if (!button) throw new Error("Missing " + label + " button in Activity panel: " + panel().textContent)
      return button
    },
    filter(value: string) {
      const filter = element<HTMLInputElement>("input[type='search']")
      filter.value = value
      filter.dispatchEvent(new Event("input", { bubbles: true }))
    },
    async call(index: number, method: string, pathname: string) {
      await until(method + " " + pathname + " request missing", () => calls.length > index)
      const call = calls[index]!
      expect(call.request.method).toBe(method)
      expect(call.url.pathname).toBe(pathname)
      expect(call.url.search).toBe("")
      expect(call.request.body).toBeNull()
      return call
    },
    dispose() {
      dispose()
      host.remove()
      for (const call of calls) call.respond({ message: "Fixture disposed" }, 503)
      for (const [key, value] of storage) {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      }
      for (const [key, value] of attributes) {
        if (value === null) document.documentElement.removeAttribute(key)
        else document.documentElement.setAttribute(key, value)
      }
      document.cookie = localeCookie ? localeCookie + "; Path=/" : "oc_locale=; Path=/; Max-Age=0"
      expect(unexpected).toEqual([])
    },
  }
}
