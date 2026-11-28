import { expect, mock, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { Locale } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { createComponent, createContext, useContext, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { isolatedSolid } from "./orchestra/integrations-solid.fixture"

const load = isolatedSolid("activity-tree-telemetry")
const sdkContext = createContext<Accessor<Pick<ServerSDK, "orchestra" | "ready">>>()
mock.module(Bun.resolveSync("@/context/server-sdk", import.meta.dir) + "?activity-tree-telemetry", () => ({
  useServerSDK: () => {
    const sdk = useContext(sdkContext)
    if (!sdk) throw new Error("Activity tree SDK missing")
    return sdk
  },
}))
const { ActivityTrees }: typeof import("@/orchestra/chapters/activity/trees") = await load(
  "@/orchestra/chapters/activity/trees",
)
const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await load("@/context/language")
const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")

const recordID = "opaque/tree id?"
const record: ActivityMonitor.Record = {
  recordID,
  supervisorID: "supervisor-1",
  pid: 123,
  executable: "fixture-alpha",
  owner: "session-alpha",
  startedAt: 500,
  state: "alive",
  inspectionFailed: false,
}
const base: ActivityMonitor.Snapshot = {
  instanceID: "monitor-a",
  readAt: 3_000,
  source: "orchestra.omni.ledger",
  coverage: "server-pipe-spawns",
  retired: 0,
  records: [record, { ...record, recordID: "other", pid: 124, executable: "fixture-beta" }],
}
const measured: ActivityMonitor.Snapshot = {
  ...base,
  cpu: { source: "node.os.cpus", percent: 50, windowMs: 2_000, sampledAt: 1_000 },
}
const inspected: ActivityMonitor.Snapshot = {
  ...measured,
  records: [
    { ...record, source: "omni.processes", sampledAt: 1_000, members: [{ pid: 123, parentPid: null, name: "fixture-member" }] },
    base.records[1]!,
  ],
}

async function until(description: string, ready: () => boolean) {
  const deadline = Date.now() + 4_000
  while (!ready() && Date.now() < deadline) await Bun.sleep(10)
  expect(ready(), description).toBe(true)
}

function mount(locale: Locale) {
  const attributes = ["lang", "dir"].map((name) => [name, document.documentElement.getAttribute(name)] as const)
  const storage = ["orchestra.global.dat:language", "language.v1"].map((key) => [key, localStorage.getItem(key)] as const)
  const cookie = document.cookie.split("; ").find((value) => value.startsWith("oc_locale="))
  const host = document.body.appendChild(document.createElement("div"))
  const calls: { request: Request; respond: (value: ActivityMonitor.Snapshot) => void }[] = []
  const transport = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = new Request(input, init)
      const response = Promise.withResolvers<Response>()
      calls.push({ request, respond: (value) => response.resolve(Response.json(value)) })
      return response.promise
    },
    { preconnect: fetch.preconnect },
  )
  const sdk = () => ({ ready: Promise.resolve(), orchestra: Orchestra.make({ baseUrl: "http://activity.test", fetch: transport }) })
  const dispose = render(
    () => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
      get children() {
        return createComponent(LanguageProvider, {
          locale,
          get children() {
            useLanguage().setLocale(locale)
            return createComponent(sdkContext.Provider, {
              value: sdk,
              get children() { return createComponent(ActivityTrees, { query: "" }) },
            })
          },
        })
      },
    }),
    host,
  )
  return {
    host,
    calls,
    async call(index: number, path: string) {
      await until("request " + path, () => calls.length > index)
      const call = calls[index]!
      expect(call.request.method).toBe("GET")
      expect(new URL(call.request.url).pathname).toBe(path)
      expect(new URL(call.request.url).search).toBe("")
      expect(call.request.body).toBeNull()
      return call
    },
    dispose() {
      dispose()
      host.remove()
      calls.forEach((call) => call.respond(base))
      for (const [key, value] of storage) {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      }
      for (const [key, value] of attributes) {
        if (value === null) document.documentElement.removeAttribute(key)
        else document.documentElement.setAttribute(key, value)
      }
      document.cookie = cookie ? cookie + "; Path=/" : "oc_locale=; Path=/; Max-Age=0"
    },
  }
}

const text = (element: Element) => element.textContent?.trim() ?? ""
const cases = [
  { locale: "en", cpu: "Host CPU · non-idle time", unread: "unread", hypothesis: "Hypothesis: insufficient", reachability: "Reachability: unread", read: "Read members", refresh: "Refresh", window: "Window 2.0 s", pressure: "Machine memory pressure is unread." },
  { locale: "br", cpu: "CPU da máquina · tempo não ocioso", unread: "não lido", hypothesis: "Hipótese: insuficiente", reachability: "Alcançabilidade: não lido", read: "Ler membros", refresh: "Atualizar", window: "Janela 2.0 s", pressure: "Pressão de memória da máquina não foi lida." },
] as const

for (const labels of cases) {
  test(`tree telemetry is sourced, scoped and read only (${labels.locale})`, async () => {
    const app = mount(labels.locale)
    try {
      const first = await app.call(0, "/api/activity")
      await until("localized unread host CPU", () => {
        const cpu = text(app.host.querySelector(".activity-cpu")!)
        return cpu.includes(labels.cpu) && cpu.includes(labels.unread)
      })
      first.respond(base)
      await until("unread tree rows", () => app.host.querySelectorAll("tbody tr").length === 2)
      const rows = () => [...app.host.querySelectorAll<HTMLTableRowElement>("tbody tr")]
      const footprint = () => {
        const headings = [...app.host.querySelectorAll("thead th")].map(text)
        return text(rows()[0]!.querySelectorAll("td")[headings.indexOf("Footprint")]!)
      }
      expect(footprint()).toBe(labels.unread)
      expect(text(app.host.querySelector(".activity-cpu")!)).toContain(labels.unread)
      const refresh = [...app.host.querySelectorAll("button")].find((button) => text(button) === labels.refresh)!
      await until("refresh ready", () => !refresh.disabled)
      refresh.click()
      ;(await app.call(1, "/api/activity")).respond(measured)
      await until("host CPU", () => text(app.host.querySelector(".activity-cpu")!).includes("50.0%"))
      expect(text(app.host.querySelector(".activity-cpu")!)).toContain("node.os.cpus")
      expect(text(app.host.querySelector(".activity-cpu")!)).toContain(labels.window)
      expect(text(app.host.querySelector(".activity-cpu")!)).toMatch(/\b2 s\b/)
      expect(footprint()).toBe(labels.unread)
      expect(text(app.host)).toContain(labels.pressure)

      const details = [...app.host.querySelectorAll<HTMLDetailsElement>("tbody details")]
      expect(details).toHaveLength(2)
      expect(details.every((detail) => !detail.open)).toBe(true)
      // Native disclosure hides closed detail content; inspect the outside scope explicitly.
      const outside = app.host.cloneNode(true) as HTMLElement
      outside.querySelectorAll("details").forEach((detail) => detail.remove())
      expect(text(outside)).not.toContain(labels.hypothesis)
      expect(text(outside)).not.toContain(labels.reachability)
      const before = app.calls.length
      details[0]!.querySelector("summary")!.click()
      expect(details[0]!.open).toBe(true)
      expect(details[1]!.open).toBe(false)
      expect(app.calls).toHaveLength(before)
      expect(text(details[0]!)).toContain(labels.hypothesis)
      expect(text(details[0]!)).toContain(labels.reachability)
      expect(text(app.host)).not.toMatch(/\b(leak|cache|allocator|alocador)\b/i)

      const read = [...details[0]!.querySelectorAll("button")].find((button) => text(button) === labels.read)!
      read.click()
      ;(await app.call(before, `/api/activity/${encodeURIComponent(recordID)}/inspection`)).respond(inspected)
      await until("member reading", () => text(details[0]!).includes("fixture-member"))
      expect(text(details[0]!)).toContain("omni.processes")
      expect(text(rows()[0]!)).toMatch(/\b2 s\b/)
      expect(footprint()).toBe(labels.unread)
      expect(text(app.host)).toContain(labels.pressure)
      expect(text(details[0]!)).toContain(labels.hypothesis)
      expect(text(details[0]!)).toContain(labels.reachability)
      expect(text(app.host)).not.toMatch(/\b(leak|cache|allocator|alocador)\b/i)
      expect(app.calls.every((call) => call.request.method === "GET")).toBe(true)
    } finally {
      app.dispose()
    }
  })
}
