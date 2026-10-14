import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createComponent, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { initial, type Dialog, type Model, type State, type ViewProps } from "../src/orchestra/actions/contract"
import { solidDom } from "./solid-dom"

const { Settings }: typeof import("../src/orchestra/actions/settings") = await import(solidDom("../src/orchestra/actions/settings", import.meta.dir))
const { ResourceDialogs }: typeof import("../src/orchestra/actions/resource-dialogs") = await import(solidDom("../src/orchestra/actions/resource-dialogs", import.meta.dir))

function fixture(kind: Actions.ProviderKind = "github", data?: Actions.Resource["data"]) {
  const binding: Actions.Binding = { id: Actions.BindingID.make("ab_policy"), revision: 7, remote: "origin", projectID: "42", projectPath: "org/repo",
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

function mount(component: (props: ViewProps) => JSX.Element, scope: ReturnType<typeof fixture>) {
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

test("settings separates local retention from native evidence and routes each edit to its explicit target", () => {
  const scope = fixture()
  using view = mount(Settings, scope)
  const local = card(view.host, "orchestra.actions.localPolicy")
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

test("connection badge uses observed read success and auth errors instead of binding existence", () => {
  const scope = fixture()
  scope.setState("resources", { status: "idle", value: undefined })
  using view = mount(Settings, scope)
  const connection = card(view.host, "orchestra.actions.github")
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.unknown")
  scope.setState("capabilities", "value", [{ operation: "workflows.list", state: "available", scope: "repository:42", observedAt: 1 },
    { operation: "resource.update", state: "unknown", observedAt: 1 }])
  expect(control<HTMLElement>(connection, ".mx-badge").textContent).toBe("orchestra.actions.connected")
  expect(scope.state.capabilities.value?.[1].state).toBe("unknown")
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
  expect(control<HTMLElement>(old, "h2").textContent).toBe("orchestra.actions.localPolicy")
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
  expect(control<HTMLButtonElement>(card(settings.host, "orchestra.actions.localPolicy"), "button").disabled).toBe(false)
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
