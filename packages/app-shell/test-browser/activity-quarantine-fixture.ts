import { expect, mock } from "bun:test"
import type { ActivityEmpty } from "@orchestra/schema/activity-empty"
import type { Locale } from "@/context/language"
import type { Platform } from "@/context/platform"
import type { ServerConnection } from "@/context/server"
import { createComponent, createContext, createSignal, useContext, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { isolatedSolid } from "./orchestra/integrations-solid.fixture"

const load = isolatedSolid("activity-quarantine-ui")
const serverContext = createContext<Accessor<ServerConnection.Any | undefined>>()
mock.module(Bun.resolveSync("@/context/server", import.meta.dir) + "?activity-quarantine-ui", () => ({
  useServer: () => {
    const current = useContext(serverContext)
    if (!current) throw new Error("Activity quarantine fixture server missing")
    return { get current() { return current() } }
  },
}))

type ReadCall = {
  serverURL: string
  promise: Promise<ActivityEmpty.Snapshot | undefined>
  respond(value: ActivityEmpty.Snapshot): void
  fail(error: unknown): void
}

function readCall(serverURL: string): ReadCall {
  const result = Promise.withResolvers<ActivityEmpty.Snapshot | undefined>()
  return { serverURL, promise: result.promise, respond: result.resolve, fail: result.reject }
}

export async function mount(options: {
  locale?: Locale
  platform?: Platform
  connection?: ServerConnection.Any
  empty?: (serverURL: string) => Promise<ActivityEmpty.Receipt | undefined>
} = {}) {
  const { ActivityQuarantine }: typeof import("@/orchestra/chapters/activity/quarantine") = await load(
    "@/orchestra/chapters/activity/quarantine",
  )
  const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await load("@/context/language")
  const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")
  const reads: ReadCall[] = []
  const empties: string[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const [query, setQuery] = createSignal("")
  const connection = options.connection ?? {
    type: "sidecar",
    variant: "base",
    http: { url: "http://127.0.0.1:4777" },
  }
  const [current, setCurrent] = createSignal<ServerConnection.Any | undefined>(connection)
  const platform = {
    platform: "desktop" as const,
    os: "windows" as const,
    openExternal() {},
    ...options.platform,
    readActivityQuarantine: (serverURL: string) => {
      const call = readCall(serverURL)
      reads.push(call)
      return call.promise
    },
    emptyActivityQuarantine: async (serverURL: string) => {
      empties.push(serverURL)
      return options.empty?.(serverURL)
    },
  } as unknown as Platform
  const dispose = render(
    () => createComponent(PlatformProvider, {
      value: platform,
      get children() {
        return createComponent(LanguageProvider, {
          locale: options.locale ?? "en",
          get children() {
            useLanguage().setLocale(options.locale ?? "en")
            return createComponent(serverContext.Provider, {
              value: current,
              get children() {
                return createComponent(ActivityQuarantine, { get query() { return query() } })
              },
            })
          },
        })
      },
    }),
    host,
  )
  const panel = () => host.querySelector<HTMLElement>("section")!
  const button = (label: string) => {
    const result = [...panel().querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)
    if (!result) throw new Error(`Quarantine button not found: ${label}`)
    return result
  }
  return {
    host,
    reads,
    empties,
    panel,
    button,
    filter(value: string) {
      setQuery(value)
    },
    dispose() {
      dispose()
      host.remove()
      reads.forEach((call) => call.fail(new DOMException("Fixture disposed", "AbortError")))
      expect(host.isConnected).toBe(false)
    },
  }
}

export function snapshot(patch: Partial<ActivityEmpty.Snapshot> = {}): ActivityEmpty.Snapshot {
  const target = (targetID: string, owner: string, originalPath: string): ActivityEmpty.Snapshot["rows"][number] => ({
    targetID,
    generation: "1",
    label: `entry ${targetID}`,
    owner,
    originalPath,
    phase: "ready",
  })
  return { rows: [target("entry-a", "Owner A", "/original/a"), target("entry-b", "Owner B", "/original/b")], canEmpty: true, partial: false, ...patch }
}

export function receipt(): ActivityEmpty.Receipt {
  return {
    previewID: "11111111-1111-1111-1111-111111111111",
    outcome: "Verified",
    targets: [
      { targetID: "entry-a", generation: "1" },
      { targetID: "entry-b", generation: "1" },
    ],
  }
}

export async function until(description: string, ready: () => boolean) {
  const deadline = Date.now() + 4_000
  while (!ready() && Date.now() < deadline) await Bun.sleep(10)
  expect(ready(), description).toBe(true)
}
