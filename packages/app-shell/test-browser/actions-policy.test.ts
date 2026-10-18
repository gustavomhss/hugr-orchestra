import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createComponent, createRoot, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { initial, type Dialog, type Model, type State, type ViewProps } from "../src/orchestra/actions/contract"
import { solidDom } from "./solid-dom"

const { Settings }: typeof import("../src/orchestra/actions/settings") = await import(solidDom("../src/orchestra/actions/settings", import.meta.dir))
const { ResourceDialogs }: typeof import("../src/orchestra/actions/resource-dialogs") = await import(solidDom("../src/orchestra/actions/resource-dialogs", import.meta.dir))
const { createActionsAPI }: typeof import("../src/orchestra/actions/api") = await import(solidDom("../src/orchestra/actions/api", import.meta.dir))
const { createActionsModel }: typeof import("../src/orchestra/actions/model") = await import(solidDom("../src/orchestra/actions/model", import.meta.dir))

function fixture(kind: Actions.ProviderKind = "github", data?: Actions.Resource["data"]) {
  const binding: Actions.Binding = { id: Actions.BindingID.make("ab_policy"), revision: 7, remote: "origin", directory: "/repo/policy", projectID: "42", projectPath: "org/repo", account: "alice",
    provider: { kind, hostname: `${kind}.com`, apiOrigin: `https://${kind}.com` } }
  const resource: Actions.Resource = { id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy", scope: kind === "github" ? "Repository" : "Project",
    data: data ?? { policy: { retentionDays: 17, execution: "Restricted to approved actions" }, resourceVersion: "native:version",
      nativePolicy: kind === "github" ? "Project default" : { state: "unavailable" },
      nativeSettings: kind === "github" ? { enabled: false, allowed_actions: "all" } : { id: 42, keep_latest_artifact: false } } }
  const [state, setState] = createStore<State>({ ...initial(), route: { view: "settings" }, binding,
    bindings: { status: "ready", value: [binding] }, capabilities: { status: "ready", value: [] },
    resources: { status: "ready", value: { capturedAt: 1, items: [resource] } } })
  const dialogs: (Dialog | undefined)[] = []
  const model: Model = {
    state,
    dialog(dialog) { dialogs.push(dialog); setState("dialog", dialog) },
    selectBinding() {}, navigate() {}, filter() {}, async refresh() {}, async more() {}, async connect() {}, async removeBinding() {},
    async submit() { throw new Error("Unexpected submission") }, async download() {}, async previewLog() {}, editSource() {},
    async validateSource() {}, async resourceAction() {}, async workflowState() {}, dispose() {}, discardSource() {},
    async inspectWorkflow() { throw new Error("Unexpected workflow inspection") },
    async resourceScopes() { throw new Error("Unexpected resource scope inspection") },
  }
  return { state, setState, model, dialogs }
}

function mount(component: (props: ViewProps) => JSX.Element, scope: { model: Model }) {
  const host = document.createElement("div")
  host.dir = "rtl"
  document.body.append(host)
  const dispose = render(() => createComponent(component, { model: scope.model, t: (key) => key }), host)
  return { host, [Symbol.dispose]() { dispose(); host.remove() } }
}

function control<T extends Element>(host: Element, selector: string): T {
  const element = host.querySelector<T>(selector)
  if (!element) throw new Error(`Missing control: ${selector}`)
  return element
}

function card(host: Element, key: string) {
  const element = [...host.querySelectorAll("article")].find((item) => item.querySelector("h3")?.textContent === key)
  if (!element) throw new Error(`Missing settings card: ${key}`)
  return element
}

function policyFocusFixture() {
  const directory = "/repo/policy-focus"
  const binding: Actions.Binding = { id: Actions.BindingID.make("ab_focus"), revision: 7, directory, remote: "origin", projectID: "42", projectPath: "org/repo",
    provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
  const page: Actions.ResourcePage = { capturedAt: 1, items: [{ id: "project-settings", name: "Project settings", kind: "policy", bindingID: binding.id, scope: "Repository",
    data: { policy: "Project default", nativeSettings: { enabled: false, allowed_actions: "all" }, resourceVersion: "native:version" } }] }
  const hydration: { resolve?: (response: Response) => void; promise?: Promise<Response> } = {}
  const located = (data: unknown) => Response.json({ location: { directory }, data })
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    const path = new URL(request.url).pathname
    if (request.method !== "GET") throw new Error(`Unexpected policy focus mutation: ${request.method} ${path}`)
    if (path === "/api/actions/binding") return located([binding])
    if (path.endsWith("/capabilities")) return located([])
    if (path === `/api/actions/workflow/${binding.id}`) return located({ items: [], capturedAt: 1 })
    if (path.endsWith("/policy")) return located({ binding: { id: binding.id, revision: binding.revision }, policy: { retentionDays: 17, execution: "Project default" } })
    if (path === `/api/actions/resource/${binding.id}`) return hydration.promise ?? located(page)
    throw new Error(`Unexpected policy focus request: ${path}`)
  }, { preconnect() {} })
  const api = createActionsAPI({ directory, fetch, server: { type: "http", http: { url: "http://localhost:4096" } } })
  const owner = createRoot((dispose) => ({ dispose, model: createActionsModel({ api, preferences: { route: { view: "settings" } }, save: async () => undefined }) }))
  return {
    model: owner.model,
    hydrate() {
      hydration.promise = new Promise<Response>((resolve) => { hydration.resolve = resolve })
      return () => { hydration.resolve?.(located(page)); hydration.promise = undefined; hydration.resolve = undefined }
    },
    [Symbol.dispose]() { owner.dispose(); hydration.resolve?.(located(page)); hydration.promise = undefined; hydration.resolve = undefined },
  }
}

test.each(["native", "local"] as const)("%s policy Edit survives asynchronous hydration and restores focus after Escape", async (target) => {
  using scope = policyFocusFixture()
  await scope.model.refresh()
  using settings = mount(Settings, scope)
  using dialogs = mount(ResourceDialogs, scope)
  const invoker = control<HTMLButtonElement>(card(settings.host, target === "native" ? "orchestra.actions.nativePolicy" : "orchestra.actions.settings.policy"), "button")
  const release = scope.hydrate()
  invoker.focus()
  expect(document.activeElement).toBe(invoker)
  invoker.click()
  expect(scope.model.state.resources.status).toBe("loading")
  expect(scope.model.state.dialog).toBeUndefined()
  expect(invoker.disabled).toBe(true)
  // Simulate browser focus fixup when hydration disables the focused invoker; Happy DOM ignores blur() on disabled controls.
  invoker.disabled = false
  invoker.blur()
  invoker.disabled = true
  await Bun.sleep(0)
  expect(document.activeElement).toBe(document.body)
  expect(dialogs.host.querySelector("dialog")).toBeNull()
  release()
  await Bun.sleep(0)
  expect(scope.model.state.dialog).toEqual({ kind: "project-settings", target })
  const dialog = control<HTMLDialogElement>(dialogs.host, "dialog")
  expect(dialog.open).toBe(true)
  expect(dialog.contains(document.activeElement)).toBe(true)
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
  await Bun.sleep(0)
  expect(scope.model.state.dialog).toBeUndefined()
  expect(dialogs.host.querySelector("dialog")).toBeNull()
  expect(invoker.disabled).toBe(false)
  expect(document.activeElement).toBe(invoker)
  invoker.blur()
  await scope.model.refresh()
  expect(document.activeElement).toBe(document.body)
})

test("policy focus waits for resources readiness and completed submission after dialog close", async () => {
  const scope = fixture()
  using settings = mount(Settings, scope)
  using dialogs = mount(ResourceDialogs, scope)
  const invoker = control<HTMLButtonElement>(card(settings.host, "orchestra.actions.nativePolicy"), "button")
  invoker.focus()
  invoker.click()
  await Bun.sleep(0)
  expect(control<HTMLDialogElement>(dialogs.host, "dialog").open).toBe(true)
  scope.setState("resources", "status", "loading")
  scope.setState("submitting", true)
  scope.model.dialog(undefined)
  invoker.blur()
  await Bun.sleep(0)
  expect(document.activeElement).not.toBe(invoker)
  scope.setState("resources", "status", "ready")
  await Bun.sleep(0)
  expect(document.activeElement).not.toBe(invoker)
  scope.setState("submitting", false)
  await Bun.sleep(0)
  expect(document.activeElement).toBe(invoker)
})

test("native policy close preserves unrelated input focus while readiness is pending and releases its focus owner", async () => {
  const scope = fixture()
  using settings = mount(Settings, scope)
  using dialogs = mount(ResourceDialogs, scope)
  const invoker = control<HTMLButtonElement>(card(settings.host, "orchestra.actions.nativePolicy"), "button")
  const input = document.createElement("input")
  settings.host.append(input)
  invoker.focus()
  invoker.click()
  await Bun.sleep(0)
  const dialog = control<HTMLDialogElement>(dialogs.host, "dialog")
  expect(dialog.open).toBe(true)
  scope.setState("resources", "status", "loading")
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
  input.focus()
  await Bun.sleep(0)
  expect(scope.state.dialog).toBeUndefined()
  expect(document.activeElement).toBe(input)
  scope.setState("resources", "status", "ready")
  await Bun.sleep(0)
  expect(invoker.disabled).toBe(false)
  expect(document.activeElement).toBe(input)
  input.blur()
  scope.setState("resources", "status", "loading")
  scope.setState("resources", "status", "ready")
  await Bun.sleep(0)
  expect(document.activeElement).toBe(document.body)
})

test.each(["navigation", "binding", "revision", "detached", "disabled"])("policy focus drops stale %s invokers", async (change) => {
  const scope = fixture()
  using settings = mount(Settings, scope)
  const invoker = control<HTMLButtonElement>(card(settings.host, "orchestra.actions.nativePolicy"), "button")
  const footer = invoker.parentElement
  if (!footer) throw new Error("Missing invoker footer")
  invoker.focus()
  invoker.click()
  invoker.blur()
  if (change === "navigation") scope.setState("route", "view", "runs")
  if (change === "binding") scope.setState("binding", "id", Actions.BindingID.make("ab_other"))
  if (change === "revision") scope.setState("binding", "revision", 8)
  if (change === "detached") invoker.remove()
  if (change === "disabled") scope.setState("capabilities", "value", [{ operation: "resource.update", state: "unavailable", scope: "Repository", observedAt: 1 }])
  scope.model.dialog(undefined)
  await Bun.sleep(0)
  expect(document.activeElement).not.toBe(invoker)
  scope.setState("route", "view", "settings")
  scope.setState("binding", "id", Actions.BindingID.make("ab_policy"))
  scope.setState("binding", "revision", 7)
  scope.setState("capabilities", "value", [])
  if (change === "detached") footer.append(invoker)
  scope.setState("resources", "status", "loading")
  scope.setState("resources", "status", "ready")
  await Bun.sleep(0)
  expect(document.activeElement).not.toBe(invoker)
})

test("settings separates local retention from native evidence and routes each edit to its explicit target", () => {
  const scope = fixture()
  using view = mount(Settings, scope)
  const local = card(view.host, "orchestra.actions.settings.policy")
  const native = card(view.host, "orchestra.actions.nativePolicy")
  expect(local.textContent).toContain("17")
  expect(local.textContent).toContain("orchestra.actions.localPolicyDetail")
  expect(native.textContent).toContain("orchestra.actions.policyProjectDefault")
  expect(native.textContent).toContain("orchestra.actions.nativePolicyDetail")
  expect(native.textContent).not.toContain("orchestra.actions.retention")
  expect(control<HTMLElement>(native, "pre").textContent).toContain('"enabled": false')
  expect(control<HTMLElement>(native, "pre").dir).toBe("ltr")
  control<HTMLButtonElement>(local, "button").click()
  expect(scope.dialogs.at(-1)).toEqual({ kind: "project-settings", target: "local" })
  control<HTMLButtonElement>(native, "button").click()
  expect(scope.dialogs.at(-1)).toEqual({ kind: "project-settings", target: "native" })
  scope.setState("capabilities", "value", [{ operation: "resource.update", state: "unavailable", scope: "production", observedAt: 1 }])
  expect(control<HTMLButtonElement>(native, "button").disabled).toBe(false)
  scope.setState("capabilities", "value", [{ operation: "resource.update", state: "unavailable", scope: "Repository", observedAt: 2 }])
  expect(control<HTMLButtonElement>(native, "button").disabled).toBe(true)
  expect(control<HTMLButtonElement>(local, "button").disabled).toBe(false)
})

test("connection badge shows read availability, not account verification; stale binding and auth errors override reads", () => {
  const scope = fixture()
  scope.setState("resources", { status: "idle", value: undefined })
  using view = mount(Settings, scope)
  const connection = card(view.host, "orchestra.actions.settings.connection")
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.unknown")
  scope.setState("capabilities", "value", [{ operation: "workflows.list", state: "available", scope: "repository:42", observedAt: 1 },
    { operation: "resource.update", state: "unknown", observedAt: 1 }])
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.available")
  expect(scope.state.capabilities.value?.[1].state).toBe("unknown")
  expect(scope.state.binding?.account).toBe("alice")
  scope.setState("commandError", { kind: "binding_stale", message: "orchestra.actions.unavailable" })
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.unavailable")
  expect(control<HTMLElement>(connection, ".mx-badge").classList.contains("good")).toBe(false)
  scope.setState("commandError", undefined)
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.available")
  scope.setState("capabilities", { status: "error", error: { kind: "not_authenticated", message: "orchestra.actions.providerSignInRequired" } })
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.providerSignInRequired")
  expect(control<HTMLElement>(connection, ".mx-badge").classList.contains("good")).toBe(false)
})

test("project-settings identity includes target and binding revision; stale local form cannot own native form", async () => {
  const scope = fixture()
  scope.model.dialog({ kind: "project-settings" })
  using view = mount(ResourceDialogs, scope)
  await Bun.sleep(0)
  const old = control<HTMLDialogElement>(view.host, "dialog")
  expect(control<HTMLElement>(old, "h2").textContent).toBe("orchestra.actions.settings.policy")
  expect(control<HTMLInputElement>(old, '[name="retention"]').value).toBe("17")
  control<HTMLInputElement>(old, '[name="retention"]').value = "999"
  scope.model.dialog({ kind: "project-settings", target: "native" })
  await Bun.sleep(0)
  const native = control<HTMLDialogElement>(view.host, "dialog")
  expect(old.isConnected).toBe(false)
  expect(native).not.toBe(old)
  expect(control<HTMLElement>(native, "h2").textContent).toBe("orchestra.actions.nativePolicy")
  expect(native.querySelector('[name="retention"]')).toBeNull()
  expect(control<HTMLSelectElement>(native, '[name="policy"]').value).toBe("Project default")
  expect(control<HTMLButtonElement>(native, '[type="submit"]').disabled).toBe(false)
  old.dispatchEvent(new Event("close"))
  expect(scope.state.dialog).toEqual({ kind: "project-settings", target: "native" })
  control<HTMLSelectElement>(native, '[name="policy"]').value = "Restricted to approved actions"
  scope.setState("binding", "revision", 8)
  await Bun.sleep(0)
  const revised = control<HTMLDialogElement>(view.host, "dialog")
  expect(native.isConnected).toBe(false)
  expect(control<HTMLSelectElement>(revised, '[name="policy"]').value).toBe("Project default")
  scope.model.dialog({ kind: "project-settings", target: "local" })
  await Bun.sleep(0)
  expect(revised.isConnected).toBe(false)
  expect(control<HTMLInputElement>(view.host, '[name="retention"]').value).toBe("17")
})

test("unknown and local_only native policies never become default selections or retention forms", async () => {
  const scope = fixture("github", { policy: { retentionDays: 17, execution: "Project default" },
    nativePolicy: { state: "source_unresolved" }, nativeSettings: { enabled: false, allowed_actions: "local_only" }, resourceVersion: "native:version" })
  scope.model.dialog({ kind: "project-settings", target: "native" })
  using view = mount(ResourceDialogs, scope)
  await Bun.sleep(0)
  expect(control<HTMLSelectElement>(view.host, '[name="policy"]').value).toBe("")
  expect(control<HTMLSelectElement>(view.host, '[name="policy"]').disabled).toBe(true)
  expect(control<HTMLButtonElement>(view.host, '[type="submit"]').disabled).toBe(true)
  expect(view.host.querySelector('[name="retention"]')).toBeNull()
  expect(control<HTMLElement>(view.host, "pre").textContent).toContain('"allowed_actions": "local_only"')
  scope.model.dialog({ kind: "project-settings", target: "local" })
  await Bun.sleep(0)
  expect(control<HTMLSelectElement>(view.host, '[name="policy"]').value).toBe("Project default")
  expect(control<HTMLButtonElement>(view.host, '[type="submit"]').disabled).toBe(false)
})

test("GitLab native card and dialog show native-specific unavailability plus native settings; local policy stays editable", async () => {
  const scope = fixture("gitlab")
  using settings = mount(Settings, scope)
  const native = card(settings.host, "orchestra.actions.nativePolicy")
  expect(native.textContent).toContain("orchestra.actions.unavailable")
  expect(control<HTMLElement>(native, "pre").textContent).toContain('"keep_latest_artifact": false')
  expect(control<HTMLButtonElement>(native, "button").disabled).toBe(true)
  expect(control<HTMLButtonElement>(card(settings.host, "orchestra.actions.settings.policy"), "button").disabled).toBe(false)
  scope.model.dialog({ kind: "project-settings", target: "native" })
  using dialog = mount(ResourceDialogs, scope)
  await Bun.sleep(0)
  expect(control<HTMLElement>(dialog.host, "h2").textContent).toBe("orchestra.actions.nativePolicy")
  expect(dialog.host.textContent).toContain("orchestra.actions.unavailable")
  expect(control<HTMLElement>(dialog.host, "pre").textContent).toContain('"keep_latest_artifact": false')
  expect(dialog.host.querySelector('[name="retention"]')).toBeNull()
  expect(dialog.host.querySelector('[name="policy"]')).toBeNull()
  expect(control<HTMLButtonElement>(dialog.host, '[type="submit"]').disabled).toBe(true)
})
