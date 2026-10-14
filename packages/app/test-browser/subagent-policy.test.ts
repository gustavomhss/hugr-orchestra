import { afterEach, expect, test } from "bun:test"
import { createComponent, createRoot, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { Root } from "@kobalte/core/dialog"
import type { Provider } from "@orchestra/sdk/v2/client"
import type { ModelPolicySnapshot, ModelRule, SubagentModelPolicy } from "@/components/subagent-model-rules"
import { solidDom } from "./solid-dom"

const picker: typeof import("@/components/subagent-model-picker") = await import(solidDom("@/components/subagent-model-picker", import.meta.dir))
const language: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))
const platform: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const drafts: typeof import("@/components/draft-subagent-models") = await import(solidDom("@/components/draft-subagent-models", import.meta.dir))
const policies: typeof import("@/components/session-model-policy") = await import(solidDom("@/components/session-model-policy", import.meta.dir))
const rules: typeof import("@/components/subagent-model-rules") = await import(solidDom("@/components/subagent-model-rules", import.meta.dir))
const model = {
  id: "team/model/v1", name: "Hidden from chat", providerID: "router", api: { id: "team/model/v1", url: "", npm: "" },
  capabilities: {
    temperature: true, reasoning: false, attachment: false, toolcall: true, interleaved: false,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 1000, output: 100 }, status: "active", options: {}, headers: {}, release_date: "2020-01-01",
} satisfies Provider["models"][string]
const provider: Provider = { id: "router", name: "Router", source: "custom", env: [], options: {}, models: { [model.id]: model } }
const fixtures = new Set<() => void>()
afterEach(() => { for (const dispose of fixtures) dispose() })

function renderPicker(children: () => JSX.Element, host: HTMLElement) {
  const dispose = render(() => createComponent(platform.PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return children() },
  }), host)
  const cleanup = () => { dispose(); host.remove(); fixtures.delete(cleanup) }
  fixtures.add(cleanup)
  return cleanup
}

async function settle() {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve()
}

function switchFor(host: HTMLElement, label: string) {
  const input = [...host.querySelectorAll<HTMLInputElement>('input[role="switch"]')].find((input) => input.labels?.[0]?.textContent === label)
  if (!input) throw new Error(`Missing switch ${label}`)
  return input
}

function buttonFor(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === text)
  if (!button) throw new Error(`Missing button ${text}`)
  return button
}

test.each([
  ["v1", "ltr"], ["v1", "rtl"], ["v2", "ltr"], ["v2", "rtl"],
] as const)("real picker keeps empty %s drafts denied with populated or empty catalogs until explicit Inherit (%s)", async (protocol, direction) => {
  const key = `policy-picker/${protocol}/${direction}`
  const [state, setState] = createStore<{ providers: Provider[]; status: "success" | "error" }>({ providers: [provider], status: "success" })
  const host = document.createElement("div")
  host.dir = direction
  document.body.append(host)
  const dispose = renderPicker(() => createComponent(language.LanguageProvider, { locale: "en", get children() {
    language.useLanguage().setDirection(direction)
    return createComponent(Root, { open: true, get children() {
      return createComponent(picker.SubagentModelPicker, {
        directory: "/repo", pendingKey: key, get providers() { return state.providers }, get status() { return state.status }, protocol,
        supported: true, rulesReady: true, readRules: () => [], writeRules: async () => [], onRetry() {},
      })
    } })
  } }), host)
  await settle()
  expect(host.querySelector('[data-status="inherited"]')).not.toBeNull()
  const input = switchFor(host, model.name)
  input.click()
  await settle()
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: model.id }] })
  input.click()
  await settle()
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [] })
  expect(host.querySelector('[data-status="none-allowed"]')?.textContent).toBe("No models allowed. Subagent delegation is disabled.")
  expect(host.querySelector('[data-status="inherited"]')).toBeNull()
  expect(buttonFor(host, "Inherit").disabled).toBe(false)
  setState("providers", [])
  await settle()
  expect(host.querySelector('[data-slot="list-empty-state"]')).not.toBeNull()
  expect(host.querySelector('[data-status="none-allowed"]')?.textContent).toBe("No models allowed. Subagent delegation is disabled.")
  expect(host.querySelector('[data-status="inherited"]')).toBeNull()
  expect(buttonFor(host, "Inherit").disabled).toBe(false)
  setState("status", "error")
  await settle()
  expect(buttonFor(host, "Inherit").disabled).toBe(false)
  buttonFor(host, "Inherit").click()
  await settle()
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "inherit" })
  expect(host.querySelector('[data-status="inherited"]')).not.toBeNull()
  expect(host.querySelector('[data-status="none-allowed"]')).toBeNull()
  dispose()
  host.remove()
  drafts.clearPending(key)
})

test.each([
  ["v1", "ltr"], ["v1", "rtl"], ["v2", "ltr"], ["v2", "rtl"],
] as const)("real picker Enter toggles focused second row despite a different search-active row (%s, %s)", async (protocol, direction) => {
  const key = `policy-picker-focus/${protocol}/${direction}`
  const second = { ...model, id: "team/model:second/v2", name: "Second model", api: { ...model.api, id: "team/model:second/v2" } }
  const host = document.createElement("div")
  host.dir = direction
  document.body.append(host)
  const dispose = renderPicker(() => createComponent(language.LanguageProvider, { locale: "en", get children() {
    language.useLanguage().setDirection(direction)
    return createComponent(Root, { open: true, get children() {
      return createComponent(picker.SubagentModelPicker, {
        directory: "/repo", pendingKey: key, providers: [{ ...provider, models: { [model.id]: model, [second.id]: second } }],
        status: "success", protocol, supported: true, rulesReady: true,
        readRules: () => [], writeRules: async () => [], onRetry() {},
      })
    } })
  } }), host)
  await settle()
  const rows = host.querySelectorAll<HTMLButtonElement>('button[data-slot="list-item"]')
  expect(rows.length).toBe(2)
  expect(rows[0].textContent).toContain(model.name)
  expect(rows[1].textContent).toContain(second.name)
  expect(rows[0].getAttribute("data-active")).toBe("true")
  rows[1].focus()
  expect(document.activeElement).toBe(rows[1])
  const move = new MouseEvent("mousemove", { bubbles: true, clientX: 20, clientY: 20 })
  // Synthetic DOM events do not derive OS pointer deltas from client coordinates.
  Object.defineProperty(move, "movementX", { value: 1 })
  rows[0].dispatchEvent(move)
  await settle()
  expect(rows[0].getAttribute("data-active")).toBe("true")
  expect(document.activeElement).toBe(rows[1])
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  rows[1].dispatchEvent(enter)
  await settle()
  expect(enter.defaultPrevented).toBe(true)
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: provider.id, id: second.id }] })
  expect(switchFor(host, model.name).checked).toBe(false)
  expect(switchFor(host, second.name).checked).toBe(true)
  rows[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  await settle()
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [] })
  const search = host.querySelector<HTMLInputElement>('[data-slot="list-search"] input')
  if (!search) throw new Error("Missing picker search input")
  search.focus()
  search.value = "Hidden"
  search.dispatchEvent(new InputEvent("input", { bubbles: true }))
  await settle()
  expect(document.activeElement).toBe(search)
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  await settle()
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: provider.id, id: model.id }] })
  expect(switchFor(host, model.name).checked).toBe(true)
  dispose()
  host.remove()
  drafts.clearPending(key)
})

test("real picker preserves unavailable refs, waits for ACK and retries failed saves", async () => {
  const gate = Promise.withResolvers<SubagentModelPolicy>()
  const writes: SubagentModelPolicy[] = []
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = renderPicker(() => createComponent(language.LanguageProvider, { locale: "en", get children() {
    return createComponent(Root, { open: true, get children() {
      return createComponent(picker.SubagentModelPicker, {
        sessionID: "ses_picker", directory: "/repo", providers: [provider], status: "success", protocol: "v2",
        supported: true, rulesReady: true, readRules: () => [], writeRules: async () => [], onRetry() {},
        policy: {
          read: () => ({ policy: { mode: "allowlist", models: [{ providerID: "offline", id: "full/slash/model" }] }, timestamp: 1 }),
          write: async (policy) => {
            writes.push(policy)
            if (writes.length === 1) return gate.promise
            return policy
          },
        },
      })
    } })
  } }), host)
  await settle()
  expect(switchFor(host, "full/slash/model").checked).toBe(true)
  switchFor(host, model.name).click()
  await settle()
  expect(writes).toEqual([{ mode: "allowlist", models: [
    { providerID: "offline", id: "full/slash/model" }, { providerID: "router", id: "team/model/v1" },
  ] }])
  expect(switchFor(host, model.name).checked).toBe(false)
  expect(switchFor(host, model.name).closest('[data-component="switch"]')?.getAttribute("aria-busy")).toBe("true")
  gate.reject(new Error("offline"))
  await settle()
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Model permissions could not be confirmed. Try again.")
  buttonFor(host, "Retry").click()
  await settle()
  expect(writes[1]).toEqual(writes[0])
  expect(switchFor(host, model.name).checked).toBe(true)
  expect(switchFor(host, "full/slash/model").checked).toBe(true)
  buttonFor(host, "Inherit").click()
  await settle()
  expect(writes.at(-1)).toEqual({ mode: "inherit" })
  expect(host.querySelector('[data-status="inherited"]')).not.toBeNull()
  dispose()
  host.remove()
})

test("real picker disables unresolved policy/catalog state and retries catalog failure", async () => {
  const [state, setState] = createStore<{ status: "pending" | "error" | "success"; ready: boolean }>({ status: "pending", ready: false })
  const retries = { count: 0 }
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = renderPicker(() => createComponent(language.LanguageProvider, { locale: "en", get children() {
    return createComponent(Root, { open: true, get children() {
      return createComponent(picker.SubagentModelPicker, {
        sessionID: "ses_loading", directory: "/repo", providers: [provider], protocol: "v2", supported: true,
        get status() { return state.status }, get rulesReady() { return state.ready },
        readRules: () => [], writeRules: async () => [], onRetry() { retries.count++ },
        policy: { read: () => ({ policy: { mode: "inherit" } }), write: async (policy) => policy },
      })
    } })
  } }), host)
  await settle()
  expect(host.querySelector('input[role="switch"]')).toBeNull()
  setState("status", "success")
  await settle()
  expect(switchFor(host, model.name).disabled).toBe(true)
  setState("ready", true)
  await settle()
  expect(switchFor(host, model.name).disabled).toBe(false)
  setState("status", "error")
  await settle()
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Connected models could not be loaded. Try again.")
  buttonFor(host, "Retry").click()
  expect(retries.count).toBe(1)
  dispose()
  host.remove()
})

test("real V1 session picker leaves last-matching ask unchecked and other allowed models checked", async () => {
  const permission: ModelRule[] = [
    { permission: "task", pattern: "*/*", action: "allow" },
    { permission: "task", pattern: `router/${model.id}`, action: "ask" },
  ]
  const other = { ...model, id: "other", name: "Other allowed model" }
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = renderPicker(() => createComponent(language.LanguageProvider, { locale: "en", get children() {
    return createComponent(Root, { open: true, get children() {
      return createComponent(picker.SubagentModelPicker, {
        sessionID: "ses_legacy_ask", directory: "/repo", status: "success", protocol: "v1", supported: true, rulesReady: true,
        providers: [{ ...provider, models: { [model.id]: model, other } }],
        readRules: () => permission, writeRules: async () => permission, onRetry() {},
      })
    } })
  } }), host)
  await settle()
  expect(switchFor(host, model.name).checked).toBe(false)
  expect(switchFor(host, other.name).checked).toBe(true)
  dispose()
})

test("equal-time policy events retain ACK until a post-event canonical read without inventing ACK sequence", async () => {
  const first: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: model.id }] }
  const [event, setEvent] = createStore<ModelPolicySnapshot>({ policy: first, timestamp: 1, revision: 1 })
  const fixture: { snapshot: ModelPolicySnapshot; gate?: Promise<ModelPolicySnapshot> } = { snapshot: { policy: first, timestamp: 1 } }
  const started = Promise.withResolvers<void>()
  const delayed = Promise.withResolvers<ModelPolicySnapshot>()
  const root = createRoot((dispose) => {
    const policy = policies.createSessionModelPolicy({
      sessionID: "ses_equal_time", readEvent: () => event,
      management: {
        getSubagentModels: async () => fixture.snapshot.policy,
        readSubagentModels: async () => { if (!fixture.gate) return fixture.snapshot; started.resolve(); return fixture.gate },
        setSubagentModels: async (_id, next) => { fixture.snapshot = { policy: next, timestamp: 20 }; return next },
      },
    })
    return { dispose, policy, editor: rules.createModelPolicyEditor({ read: policy.read, write: policy.write }) }
  })
  await root.policy.load()
  await root.editor.set("router", model.id, false)
  expect(root.editor.policy()).toEqual({ mode: "allowlist", models: [] })
  expect(root.policy.read().revision).toBeUndefined()
  fixture.gate = delayed.promise
  setEvent({ policy: first, timestamp: 20, revision: 2 })
  await started.promise
  expect(root.editor.policy()).toEqual({ mode: "allowlist", models: [] })
  delayed.resolve(fixture.snapshot)
  await settle()
  expect(root.editor.policy()).toEqual({ mode: "allowlist", models: [] })
  fixture.gate = undefined
  fixture.snapshot = { policy: { mode: "inherit" }, timestamp: 20 }
  setEvent({ policy: { mode: "inherit" }, timestamp: 20, revision: 3 })
  await settle()
  expect(root.editor.policy()).toEqual({ mode: "inherit" })
  expect(root.policy.read().revision).toBeUndefined()
  root.dispose()
})

test("disposed or departed policy controllers refuse load and write without transport calls", async () => {
  const calls: string[] = []
  const owner = { active: true }
  const root = createRoot((dispose) => ({ dispose, policy: policies.createSessionModelPolicy({
    sessionID: "ses_disposed", readEvent: () => undefined, owns: () => owner.active,
    management: {
      getSubagentModels: async () => { calls.push("get"); return { mode: "inherit" } },
      readSubagentModels: async () => { calls.push("read"); return { policy: { mode: "inherit" } } },
      setSubagentModels: async (_id, next) => { calls.push("write"); return next },
    },
  }) }))
  owner.active = false
  await expect(root.policy.load()).rejects.toMatchObject({ name: "AbortError" })
  await expect(root.policy.write({ mode: "inherit" })).rejects.toMatchObject({ name: "AbortError" })
  owner.active = true
  await root.policy.load()
  expect(calls).toEqual(["get", "read"])
  root.dispose()
  await expect(root.policy.load()).rejects.toMatchObject({ name: "AbortError" })
  await expect(root.policy.write({ mode: "inherit" })).rejects.toMatchObject({ name: "AbortError" })
  expect(calls).toEqual(["get", "read"])
})

test("failed pre-ACK reads never prevent mandatory fresh canonical read after successful write ACK", async () => {
  const started = Promise.withResolvers<void>()
  const before = Promise.withResolvers<ModelPolicySnapshot>()
  const ack = Promise.withResolvers<SubagentModelPolicy>()
  const calls: string[] = []
  const canonical: SubagentModelPolicy = { mode: "allowlist", models: [] }
  const root = createRoot((dispose) => ({ dispose, policy: policies.createSessionModelPolicy({
    sessionID: "ses_read_fence", readEvent: () => undefined,
    management: {
      getSubagentModels: async () => ({ mode: "inherit" }),
      readSubagentModels: async () => {
        calls.push("read")
        if (calls.length === 1) { started.resolve(); return before.promise }
        return { policy: canonical, timestamp: 20 }
      },
      setSubagentModels: async () => { calls.push("write"); return ack.promise },
    },
  }) }))
  const loading = root.policy.load().catch((error: unknown) => error)
  await started.promise
  const writing = root.policy.write(canonical)
  ack.resolve(canonical)
  await settle()
  expect(calls).toEqual(["read", "write"])
  const failure = new Error("pre-write read failed")
  before.reject(failure)
  expect(await loading).toBe(failure)
  expect(await writing).toMatchObject({ policy: canonical, timestamp: 20, readVersion: 1 })
  expect(calls).toEqual(["read", "write", "read"])
  expect(root.policy.read().policy).toEqual(canonical)
  expect(root.policy.state.error).toBeUndefined()
  root.dispose()
})

test.each(["ltr", "rtl"] as const)("real picker virtualizes full catalog and retains focus on search-revealed last model (%s)", async (direction) => {
  const key = `virtual-picker/${direction}`
  const models = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => {
    const id = `model-${String(index).padStart(4, "0")}`
    return [id, { ...model, id, name: id }] as const
  }))
  const host = document.createElement("div")
  host.dir = direction
  document.body.append(host)
  const dispose = renderPicker(() => createComponent(language.LanguageProvider, { locale: "en", get children() {
    language.useLanguage().setDirection(direction)
    return createComponent(Root, { open: true, get children() {
      return createComponent(picker.SubagentModelPicker, {
        directory: "/repo", pendingKey: key, providers: [{ ...provider, models }], status: "success", protocol: "v2",
        supported: true, rulesReady: true, readRules: () => [], writeRules: async () => [], onRetry() {},
      })
    } })
  } }), host)
  await settle()
  expect(host.querySelector('[data-virtual="true"]')).not.toBeNull()
  expect(host.querySelectorAll('[data-slot="list-item"]').length).toBeLessThan(30)
  const search = host.querySelector<HTMLInputElement>('[data-slot="list-search"] input')
  if (!search) throw new Error("Missing virtualized search input")
  search.focus()
  search.value = "model-0999"
  search.dispatchEvent(new InputEvent("input", { bubbles: true }))
  await settle()
  const last = host.querySelector<HTMLButtonElement>('[data-slot="list-item"][data-key="router:model-0999"]')
  if (!last) throw new Error("Search did not reveal the last catalog model")
  expect(host.querySelectorAll('[data-slot="list-item"]').length).toBe(1)
  last.focus()
  expect(document.activeElement).toBe(last)
  last.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  await settle()
  expect(drafts.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: "model-0999" }] })
  expect(document.activeElement).toBe(last)
  expect(host.querySelectorAll('[data-slot="list-item"]').length).toBeLessThan(30)
  dispose()
  host.remove()
  drafts.clearPending(key)
})
