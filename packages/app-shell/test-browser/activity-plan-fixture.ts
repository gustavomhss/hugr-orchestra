import { expect, mock } from "bun:test"
import type { ActivityArm } from "@orchestra/schema/activity-arm"
import type { Locale } from "@/context/language"
import type { Platform } from "@/context/platform"
import type { ServerConnection } from "@/context/server"
import type { ServerSDK } from "@/context/server-sdk"
import { createComponent, createContext, createSignal, useContext, type Accessor } from "solid-js"
import { render } from "solid-js/web"
import { isolatedSolid } from "./orchestra/integrations-solid.fixture"

const load = isolatedSolid("activity-plan-ui")
const sdkContext = createContext<Accessor<Pick<ServerSDK, "orchestra" | "ready">>>()
const serverContext = createContext<Accessor<ServerConnection.Any | undefined>>()
mock.module(Bun.resolveSync("@/context/server-sdk", import.meta.dir) + "?activity-plan-ui", () => ({
  useServerSDK: () => {
    const sdk = useContext(sdkContext)
    if (!sdk) throw new Error("Activity plan fixture SDK missing")
    return sdk
  },
}))
mock.module(Bun.resolveSync("@/context/server", import.meta.dir) + "?activity-plan-ui", () => ({
  useServer: () => {
    const current = useContext(serverContext)
    if (!current) throw new Error("Activity plan fixture server missing")
    return { get current() { return current() } }
  },
}))

type PlanCall = {
  signal?: AbortSignal
  promise: Promise<ActivityArm.PlanSnapshot>
  respond(value: ActivityArm.PlanSnapshot): void
  fail(error: unknown): void
}

function planCall(options?: { signal?: AbortSignal }): PlanCall {
  const result = Promise.withResolvers<ActivityArm.PlanSnapshot>()
  return {
    signal: options?.signal,
    promise: result.promise,
    respond: result.resolve,
    fail: result.reject,
  }
}

export async function mount(options: {
  locale?: Locale
  platform?: Platform
  connection?: ServerConnection.Any
  arm?: (serverURL: string, request: ActivityArm.Request) => Promise<ActivityArm.Receipt | undefined>
} = {}) {
  const { ActivityPlan }: typeof import("@/orchestra/chapters/activity/plan") = await load(
    "@/orchestra/chapters/activity/plan",
  )
  const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await load("@/context/language")
  const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")
  const calls: PlanCall[] = []
  const arms: { serverURL: string; request: ActivityArm.Request }[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const [query, setQuery] = createSignal("")
  const connection = options.connection ?? { type: "http", http: { url: "http://plan-first.test" } }
  const [current, setCurrent] = createSignal<ServerConnection.Any | undefined>(connection)
  const sdk = {
    ready: Promise.resolve(),
    orchestra: {
      activity: {
        plan: (request?: { signal?: AbortSignal }) => {
          const call = planCall(request)
          calls.push(call)
          return call.promise
        },
      },
    },
  } as unknown as Pick<ServerSDK, "orchestra" | "ready">
  const arm = async (serverURL: string, request: ActivityArm.Request) => {
    arms.push({ serverURL, request })
    return options.arm?.(serverURL, request)
  }
  const platform = {
    platform: "web" as const,
    openExternal() {},
    async restart() {},
    async notify() {},
    ...options.platform,
    armActivityQuarantine: arm,
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
                return createComponent(sdkContext.Provider, {
                  value: () => sdk,
                  get children() {
                    return createComponent(ActivityPlan, { get query() { return query() } })
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
  const panel = () => host.querySelector<HTMLElement>("section")!
  const button = (label: string) => {
    const result = [...panel().querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)
    if (!result) throw new Error(`Activity plan button not found: ${label}`)
    return result
  }
  return {
    host,
    calls,
    arms,
    panel,
    button,
    filter(value: string) {
      setQuery(value)
    },
    switchServer(name: string) {
      setCurrent({ type: "http", http: { url: `http://${name}.test` } })
    },
    dispose() {
      dispose()
      host.remove()
      calls.forEach((call) => call.fail(new DOMException("Fixture disposed", "AbortError")))
      expect(host.isConnected).toBe(false)
    },
  }
}

export function target(targetID: string, patch: Partial<ActivityArm.Target> = {}): ActivityArm.Target {
  return { targetID, generation: "1", label: `/workspace/${targetID}`, owner: "recorded session", ...patch }
}

export function snapshot(patch: Partial<ActivityArm.PlanSnapshot> = {}): ActivityArm.PlanSnapshot {
  return { ready: [target("ready-a")], approvals: [], partial: false, ...patch }
}

export function receipt(...targets: ActivityArm.Target[]): ActivityArm.Receipt {
  return { approvalID: "approval-1", action: "arm-quarantine", approvedAt: 100, targets }
}

export async function until(description: string, ready: () => boolean) {
  const deadline = Date.now() + 4_000
  while (!ready() && Date.now() < deadline) await Bun.sleep(10)
  expect(ready(), description).toBe(true)
}
