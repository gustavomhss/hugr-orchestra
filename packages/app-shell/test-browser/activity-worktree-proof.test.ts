import { expect, mock, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import type { ServerSDK } from "@/context/server-sdk"
import { createComponent, createContext, createSignal, useContext, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { isolatedSolid } from "./orchestra/integrations-solid.fixture"
import { snapshot } from "./activity-worktree-fixture"

const load = isolatedSolid("activity-worktree-proof")
const sdkContext = createContext<Accessor<Pick<ServerSDK, "orchestra" | "ready">>>()
mock.module(Bun.resolveSync("@/context/server-sdk", import.meta.dir) + "?activity-worktree-proof", () => ({
  useServerSDK: () => {
    const sdk = useContext(sdkContext)
    if (!sdk) throw new Error("Worktree proof fixture SDK missing")
    return sdk
  },
}))
const { ActivityWorktrees }: typeof import("@/orchestra/chapters/activity/worktrees") = await load(
  "@/orchestra/chapters/activity/worktrees",
)
const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await load("@/context/language")
const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")

async function until(description: string, ready: () => boolean) {
  const deadline = Date.now() + 4_000
  while (!ready() && Date.now() < deadline) await Bun.sleep(10)
  expect(ready(), description).toBe(true)
}

const text = (element: Element) => element.textContent?.trim() ?? ""

test("worktree use proof is explicit and scoped to the selected row", async () => {
  const attributes = ["lang", "dir"].map((name) => [name, document.documentElement.getAttribute(name)] as const)
  const storage = ["orchestra.global.dat:language", "language.v1"].map((key) => [key, localStorage.getItem(key)] as const)
  const cookie = document.cookie.split("; ").find((value) => value.startsWith("oc_locale="))
  const host = document.body.appendChild(document.createElement("div"))
  const calls: { request: Request; respond: (value: unknown) => void }[] = []
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
  const [query, setQuery] = createSignal("")
  const dispose = render(
    () => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
      get children() {
        return createComponent(LanguageProvider, {
          locale: "en",
          get children() {
            useLanguage().setLocale("en")
            return createComponent(sdkContext.Provider, {
              value: sdk,
              get children() { return createComponent(ActivityWorktrees, { get query() { return query() } }) },
            })
          },
        })
      },
    }),
    host,
  )
  try {
    await until("initial worktree inventory", () => calls.length === 1)
    expect(calls[0]!.request.method).toBe("GET")
    expect(new URL(calls[0]!.request.url).pathname).toBe("/api/activity/worktrees")
    calls[0]!.respond(snapshot())
    await until("two worktree rows", () => host.querySelectorAll("tbody tr").length === 2)
    const rows = () => [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")]
    expect(text(rows()[0]!)).toContain("unproved")
    expect(text(rows()[1]!)).toContain("unproved")
    setQuery("/registered/a")
    await until("filter selects row", () => rows().length === 1)
    expect(calls).toHaveLength(1)
    setQuery("")
    await until("filter restored", () => rows().length === 2)
    expect(calls).toHaveLength(1)

    const button = [...rows()[0]!.querySelectorAll("button")].find((item) => text(item) === "Read use proof")
    expect(button).toBeDefined()
    button!.click()
    await until("manual proof request", () => calls.length === 2)
    const request = calls[1]!.request
    expect(request.method).toBe("POST")
    expect(new URL(request.url).pathname).toBe("/api/activity/worktrees/a/use-proof")
    expect(new URL(request.url).search).toBe("")
    expect(request.body).toBeNull()
    calls[1]!.respond({
      recordID: "a",
      sampledAt: 1000,
      state: "held",
      checks: [
        { method: "cwd", outcome: "holder" },
        { method: "git-c", outcome: "unavailable" },
        { method: "open-file", outcome: "unavailable" },
        { method: "live-lock", outcome: "unavailable" },
      ],
    })
    await until("held proof displayed", () => text(rows()[0]!).includes("Held"))
    for (const name of ["Working directory", "git -C", "Open files", "Live process locks"]) {
      expect(text(rows()[0]!)).toContain(name)
    }
    expect(text(rows()[0]!)).toContain("in use")
    expect(text(rows()[0]!)).toContain("unproved")
    expect(text(rows()[1]!)).toContain("unproved")
    expect(text(rows()[1]!)).not.toContain("Held")
    expect(text(rows()[0]!)).toContain("Observed at")
    expect(rows()[0]!.querySelector("time")?.getAttribute("datetime")).toBe("1970-01-01T00:00:01.000Z")
    expect(text(rows()[0]!.querySelector("time")!)).toBe(new Date(1000).toLocaleString("en-US"))
    setQuery("/registered/b")
    await until("proof row filtered out", () => rows().length === 1 && text(rows()[0]!).includes("/registered/b"))
    setQuery("")
    await until("proof row restored", () => rows().length === 2 && text(rows()[0]!).includes("Held"))
    expect(rows()[0]!.querySelector("time")?.getAttribute("datetime")).toBe("1970-01-01T00:00:01.000Z")
    expect(text(host)).not.toMatch(/\bReady\b/)
    expect(calls).toHaveLength(2)
    expect([...host.querySelectorAll("button")].map(text)).not.toEqual(expect.arrayContaining(["Apply", "Move", "Delete"]))
  } finally {
    dispose()
    host.remove()
    calls.forEach((call) => call.respond(snapshot()))
    for (const [key, value] of storage) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
    for (const [key, value] of attributes) {
      if (value === null) document.documentElement.removeAttribute(key)
      else document.documentElement.setAttribute(key, value)
    }
    document.cookie = cookie ? cookie + "; Path=/" : "oc_locale=; Path=/; Max-Age=0"
  }
})
