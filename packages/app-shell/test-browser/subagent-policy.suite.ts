import "./real-ui-solid"
import { beforeAll, expect, mock, test } from "bun:test"
import { createComponent } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { Root } from "@kobalte/core/dialog"
import type { Provider } from "@orchestra/sdk/v2/client"
import { clearPending, pendingPolicy } from "@/components/draft-subagent-models"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"

let SubagentModelPicker: typeof import("@/components/subagent-model-picker").SubagentModelPicker
const capabilities = {
  temperature: true, reasoning: false, attachment: false, toolcall: true, interleaved: false,
  input: { text: true, audio: false, image: false, video: false, pdf: false },
  output: { text: true, audio: false, image: false, video: false, pdf: false },
}
const model = {
  id: "team/model/v1", name: "Hidden from chat", providerID: "router", api: { id: "team/model/v1", url: "", npm: "" },
  capabilities, cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 1000, output: 100 }, status: "active" as const, options: {}, headers: {}, release_date: "2020-01-01",
}
const provider: Provider = { id: "router", name: "Router", source: "custom", env: [], options: {}, models: { [model.id]: model } }
const [direction, setDirection] = createStore({ value: "ltr" as "ltr" | "rtl" })

beforeAll(async () => {
  mock.module("@/context/language", () => ({ useLanguage: () => ({
    t: (key: string) => key.startsWith("session.subagentModels.") ? "" : key,
    direction: () => direction.value,
  }) }))
  const module = await import("@/components/subagent-model-picker")
  SubagentModelPicker = module.SubagentModelPicker
})

async function settle() { for (let turn = 0; turn < 10; turn++) await Promise.resolve() }
function switchFor(host: HTMLElement, label: string) {
  const input = [...host.querySelectorAll<HTMLInputElement>('input[role="switch"]')].find((input) =>
    input.labels?.[0]?.textContent === label,
  )
  expect(input, `missing switch ${label}`).toBeDefined()
  return input!
}

test.each(["ltr", "rtl"] as const)("real picker DOM keeps an empty V2 draft denied until explicit Inherit (%s)", async (dir) => {
  setDirection("value", dir)
  const key = `server-A\u0000draft\u0000picker/${dir}`
  const host = document.createElement("div")
  host.dir = dir
  document.body.append(host)
  const dispose = render(() => createComponent(Root, { open: true, get children() {
    return createComponent(SubagentModelPicker, {
      directory: "/repo", pendingKey: key, providers: [provider], status: "success", protocol: "v2",
      supported: true, rulesReady: true, readRules: () => [], writeRules: async () => [], onRetry() {},
    })
  } }), host)
  await settle()
  expect(host.querySelector('[data-status="inherited"]')).not.toBeNull()
  const input = switchFor(host, model.name)
  input.click()
  await settle()
  expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: model.id }] })
  input.click()
  await settle()
  expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [] })
  expect(host.querySelector('[data-status="none-allowed"]')).not.toBeNull()
  expect(host.querySelector('[data-status="inherited"]')).toBeNull()
  const inherit = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "orchestra.agents.choice.inherit")!
  inherit.click()
  await settle()
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  dispose()
  host.remove()
  clearPending(key)
}, 20_000)

test("real picker preserves unavailable V2 identities through another selection, and acknowledges Inherit", async () => {
  const writes: SubagentModelPolicy[] = []
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(Root, { open: true, get children() {
    return createComponent(SubagentModelPicker, {
      sessionID: "ses_picker", directory: "/repo", providers: [provider], status: "success", protocol: "v2",
      supported: true, rulesReady: true, readRules: () => [], writeRules: async () => [], onRetry() {},
      policy: { read: () => ({ policy: { mode: "allowlist", models: [{ providerID: "offline", id: "full/slash/model" }] }, timestamp: 1 }),
        write: async (policy) => { writes.push(policy); return policy } },
    })
  } }), host)
  await settle()
  expect(switchFor(host, "full/slash/model").checked).toBe(true)
  switchFor(host, model.name).click()
  await settle()
  expect(writes[0]).toEqual({ mode: "allowlist", models: [
    { providerID: "offline", id: "full/slash/model" }, { providerID: "router", id: "team/model/v1" },
  ] })
  expect(switchFor(host, "full/slash/model").checked).toBe(true)
  const inherit = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "orchestra.agents.choice.inherit")!
  inherit.click()
  await settle()
  expect(writes.at(-1)).toEqual({ mode: "inherit" })
  expect(host.querySelector('[data-status="inherited"]')).not.toBeNull()
  dispose()
  host.remove()
}, 20_000)
