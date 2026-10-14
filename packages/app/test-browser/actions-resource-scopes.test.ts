import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createComponent, createRoot, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { initial, type Filters, type Model, type State, type ViewProps } from "../src/orchestra/actions/contract"
import { createResourceScopes } from "../src/orchestra/actions/resource-scopes"
import { solidDom } from "./solid-dom"

const { Resources }: typeof import("../src/orchestra/actions/resources") = await import(solidDom("../src/orchestra/actions/resources", import.meta.dir))
const { ResourceDialogs }: typeof import("../src/orchestra/actions/resource-dialogs") = await import(solidDom("../src/orchestra/actions/resource-dialogs", import.meta.dir))

const binding = (kind: Actions.ProviderKind = "github", id = "ab_scope", revision = 1): Actions.Binding => ({
  id: Actions.BindingID.make(id), revision, remote: "origin", projectID: "42", projectPath: "org/repo",
  provider: { kind, hostname: `${kind}.com`, apiOrigin: `https://${kind}.com` },
})
const page = (names: string[], id = "ab_scope", extra: Partial<Actions.ResourcePage> = {}): Actions.ResourcePage => ({
  capturedAt: 1, items: names.map((name) => ({ id: name, name, bindingID: Actions.BindingID.make(id), kind: "environments", data: {} })), ...extra,
})
const variable = (scope: string, extra: Record<string, string | boolean | string[]> = {}): Actions.Resource => ({
  id: JSON.stringify(["TOKEN", scope, "Secret"]), name: "TOKEN", scope, kind: "variables", bindingID: Actions.BindingID.make("ab_scope"),
  sensitive: true, data: { type: "Secret", flags: ["Masked", "Hidden"], value: "must-never-render", ...extra },
})

function deferred<T>() {
  const callbacks: { resolve?: (value: T) => void; reject?: (error: unknown) => void } = {}
  const promise = new Promise<T>((resolve, reject) => { callbacks.resolve = resolve; callbacks.reject = reject })
  return { promise, resolve: (value: T) => callbacks.resolve?.(value), reject: (error: unknown) => callbacks.reject?.(error) }
}

function fixture(kind: Actions.ProviderKind = "github") {
  const [state, setState] = createStore<State>({ ...initial(), binding: binding(kind),
    route: { view: "resources", resourceKind: "variables" }, resources: { status: "ready", value: { items: [], capturedAt: 1 } },
    capabilities: { status: "ready", value: [] } })
  const reads: { signal: AbortSignal; result: ReturnType<typeof deferred<Actions.ResourcePage>> }[] = []
  const filters: Partial<Filters>[] = []
  const submissions: unknown[] = []
  const model: Model = {
    state,
    resourceScopes(signal) { const result = deferred<Actions.ResourcePage>(); reads.push({ signal, result }); return result.promise },
    filter(patch) { filters.push(patch); setState("filters", (prior) => ({ ...prior, ...patch })) },
    navigate(route) { setState("route", route) },
    dialog(dialog) { setState("dialog", dialog) },
    async submit(payload) { submissions.push(payload) },
    selectBinding() {}, async refresh() {}, async more() {}, async connect() {}, async removeBinding() {},
    async download() {}, async previewLog() {}, editSource() {}, async validateSource() {}, async resourceAction() {},
    async workflowState() {}, dispose() {},
    // This resource-only fixture has no source lease; source actions must fail loudly.
    sourceDiscardBlocked: false,
    discardSource() { throw new Error("Unexpected source discard") },
    async inspectWorkflow() { throw new Error("Unexpected workflow inspection") },
  }
  return { model, state, setState, reads, filters, submissions }
}

function mount(component: (props: ViewProps) => JSX.Element, scope: ReturnType<typeof fixture>) {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(component, { model: scope.model, t: (key) => key }), host)
  return { host, [Symbol.dispose]() { dispose(); host.remove() } }
}

function control<T extends Element>(host: Element, selector: string): T {
  const element = host.querySelector<T>(selector)
  if (!element) throw new Error(`Missing control: ${selector}`)
  return element
}

describe("view-owned variable scope catalog", () => {
  test("captures binding revision, rejects late results and aborts on owner disposal", async () => {
    const scope = fixture()
    const owner = createRoot((dispose) => ({ dispose, catalog: createResourceScopes(scope.model) }))
    await Bun.sleep(0)
    expect(scope.reads).toHaveLength(1)
    expect(owner.catalog.status).toBe("loading")
    scope.setState("binding", binding("github", "ab_scope", 2))
    await Bun.sleep(0)
    expect(scope.reads[0].signal.aborted).toBe(true)
    expect(scope.reads).toHaveLength(2)
    scope.reads[1].result.resolve(page(["new-revision"], "ab_scope", { next: "next" }))
    await Bun.sleep(0)
    expect(owner.catalog.names).toEqual(["new-revision"])
    expect(owner.catalog.truncated).toBe(true)
    scope.reads[0].result.resolve(page(["old-revision"]))
    await Bun.sleep(0)
    expect(owner.catalog.names).toEqual(["new-revision"])
    scope.setState("binding", binding("github", "ab_next", 1))
    await Bun.sleep(0)
    expect(owner.catalog.names).toEqual([])
    expect(owner.catalog.truncated).toBe(false)
    expect(scope.reads).toHaveLength(3)
    owner.dispose()
    expect(scope.reads[2].signal.aborted).toBe(true)
    scope.reads[2].result.reject(new Error("late provider failure"))
    await Bun.sleep(0)
    expect(owner.catalog.status).toBe("loading")
    expect(owner.catalog.error).toBeUndefined()
  })

  test("errors clear old options, sanitize causes and never alter variable resources", async () => {
    const scope = fixture()
    scope.setState("resources", "value", { items: [variable("Repository")], capturedAt: 1 })
    const owner = createRoot((dispose) => ({ dispose, catalog: createResourceScopes(scope.model) }))
    await Bun.sleep(0)
    scope.reads[0].result.resolve(page(["production"]))
    await Bun.sleep(0)
    expect(owner.catalog.names).toEqual(["production"])
    scope.setState("binding", binding("github", "ab_scope", 2))
    await Bun.sleep(0)
    scope.reads[1].result.reject(new Error("private provider credentials"))
    await Bun.sleep(0)
    expect(owner.catalog.status).toBe("error")
    expect(owner.catalog.names).toEqual([])
    expect(owner.catalog.error?.message).toBe("orchestra.actions.unavailable")
    expect(JSON.stringify(owner.catalog)).not.toContain("private provider credentials")
    expect(scope.state.resources.value?.items).toEqual([variable("Repository")])
    owner.dispose()
  })
})

describe("variable scope controls", () => {
  test("loads lazily, filters with exact GitHub environment scope and survives variables errors", async () => {
    const scope = fixture()
    scope.setState("route", { view: "resources", resourceKind: "artifacts" })
    using view = mount(Resources, scope)
    await Bun.sleep(0)
    expect(scope.reads).toHaveLength(0)
    scope.setState("route", { view: "resources", resourceKind: "variables" })
    await Bun.sleep(0)
    expect(scope.reads).toHaveLength(1)
    expect(view.host.textContent).toContain("orchestra.actions.loading")
    scope.reads[0].result.resolve(page(["production", "preview / 雪"], "ab_scope", { total: 3 }))
    await Bun.sleep(0)
    const input = control<HTMLInputElement>(view.host, ".ad-scope-field input")
    expect([...view.host.querySelectorAll("datalist option")].map((option) => option.getAttribute("value"))).toEqual(["Repository", "production", "preview / 雪"])
    expect(view.host.textContent).toContain("orchestra.actions.resourceScopesTruncated")
    input.value = "preview / 雪"
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(scope.filters).toEqual([{ scope: "preview / 雪" }])
    scope.setState("resources", { status: "error", error: { kind: "permission_denied", message: "orchestra.actions.unavailable" } })
    expect(control<HTMLInputElement>(view.host, ".ad-scope-field input").value).toBe("preview / 雪")
    expect(scope.reads).toHaveLength(1)
    scope.setState("route", { view: "resources", resourceKind: "runners" })
    expect(scope.reads[0].signal.aborted).toBe(true)
  })

  test("GitLab list accepts unseen wildcard scopes and empty filter means all, not '*'", async () => {
    const scope = fixture("gitlab")
    using view = mount(Resources, scope)
    await Bun.sleep(0)
    const input = control<HTMLInputElement>(view.host, ".ad-scope-field input")
    expect(input.value).toBe("")
    input.value = "review/*"
    input.dispatchEvent(new Event("change", { bubbles: true }))
    scope.reads[0].result.resolve(page(["production"]))
    await Bun.sleep(0)
    expect(input.value).toBe("review/*")
    expect([...view.host.querySelectorAll("datalist option")].map((option) => option.getAttribute("value"))).toEqual(["*", "production", "review/*"])
    input.value = "*"
    input.dispatchEvent(new Event("change", { bubbles: true }))
    input.value = "Repository"
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(control<HTMLOptionElement>(view.host, 'datalist option[value="Repository"]').label).toBe("Repository")
    input.value = ""
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(scope.filters).toEqual([{ scope: "review/*" }, { scope: "*" }, { scope: "Repository" }, { scope: undefined }])
  })

  test.each(["truncated", "error"])("GitHub known environment remains filter/create requestable after catalog %s", async (outcome) => {
    const scope = fixture()
    using list = mount(Resources, scope)
    await Bun.sleep(0)
    if (outcome === "truncated") scope.reads[0].result.resolve(page(Array.from({ length: 30 }, (_, index) => `env-${index}`), "ab_scope", { next: "next" }))
    if (outcome === "error") scope.reads[0].result.reject(new Error("catalog unavailable"))
    await Bun.sleep(0)
    const known = "outside-first-page / 雪"
    expect([...list.host.querySelectorAll("datalist option")].map((option) => option.getAttribute("value"))).not.toContain(known)
    expect(list.host.textContent).toContain(outcome === "truncated" ? "orchestra.actions.resourceScopesTruncated" : "orchestra.actions.unavailable")
    const filter = control<HTMLInputElement>(list.host, ".ad-scope-field input")
    expect(filter.disabled).toBe(false)
    expect(filter.readOnly).toBe(false)
    filter.value = known
    filter.dispatchEvent(new Event("change", { bubbles: true }))
    expect(scope.filters).toEqual([{ scope: known }])
    scope.model.dialog({ kind: "create-variable" })
    using modal = mount(ResourceDialogs, scope)
    await Bun.sleep(0)
    if (outcome === "truncated") scope.reads[1].result.resolve(page(["env-0"], "ab_scope", { next: "next" }))
    if (outcome === "error") scope.reads[1].result.reject(new Error("catalog unavailable"))
    await Bun.sleep(0)
    expect(modal.host.textContent).toContain(outcome === "truncated" ? "orchestra.actions.resourceScopesTruncated" : "orchestra.actions.unavailable")
    const input = control<HTMLInputElement>(modal.host, 'input[name="scope"]')
    expect(input.value).toBe(known)
    expect(input.disabled).toBe(false)
    expect(input.readOnly).toBe(false)
    input.value = `${known} exact`
    input.dispatchEvent(new Event("change", { bubbles: true }))
    control<HTMLInputElement>(modal.host, 'input[name="name"]').value = "TOKEN"
    control<HTMLInputElement>(modal.host, 'input[name="value"]').value = "replacement"
    const form = control<HTMLFormElement>(modal.host, "form")
    expect(form.checkValidity()).toBe(true)
    expect(control<HTMLButtonElement>(modal.host, 'button[type="submit"]').disabled).toBe(false)
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submissions).toEqual([{ provider: "github", name: "TOKEN", type: "Secret", scope: `${known} exact`, value: "replacement" }])
  })

  test("GitHub create uses independent environment records; edit keeps native name/type/scope locks", async () => {
    const scope = fixture()
    scope.model.dialog({ kind: "create-variable" })
    using view = mount(ResourceDialogs, scope)
    await Bun.sleep(0)
    scope.reads[0].result.resolve(page(["production"]))
    await Bun.sleep(0)
    expect([...view.host.querySelectorAll("datalist option")].map((option) => option.getAttribute("value"))).toEqual(["Repository", "production"])
    const resource = variable("retired")
    scope.setState("resources", "value", { items: [resource], capturedAt: 1 })
    scope.model.dialog({ kind: "edit-variable", id: resource.id, scope: resource.scope })
    await Bun.sleep(0)
    expect(scope.reads[0].signal.aborted).toBe(true)
    expect(control<HTMLSelectElement>(view.host, 'select[name="scope"]').disabled).toBe(true)
    expect(control<HTMLInputElement>(view.host, 'input[name="scope"]').value).toBe("retired")
    expect(control<HTMLInputElement>(view.host, 'input[name="name"]').readOnly).toBe(true)
    expect(control<HTMLSelectElement>(view.host, 'select[name="type"]').disabled).toBe(true)
    const value = control<HTMLInputElement>(view.host, 'input[name="value"]')
    expect(value.type).toBe("password")
    expect(value.value).toBe("")
    expect(view.host.innerHTML).not.toContain("must-never-render")
    value.value = "temporary replacement"
    scope.setState("binding", binding("github", "ab_scope", 2))
    await Bun.sleep(0)
    expect(value.isConnected).toBe(false)
    expect(control<HTMLInputElement>(view.host, 'input[name="value"]').value).toBe("")
    expect(scope.reads[1].signal.aborted).toBe(true)
  })

  test("GitLab literal Repository survives form editing and submission without becoming project scope", async () => {
    const scope = fixture("gitlab")
    const resource = variable("Repository")
    scope.setState("resources", "value", { items: [resource], capturedAt: 1 })
    scope.model.dialog({ kind: "edit-variable", id: resource.id, scope: resource.scope })
    using view = mount(ResourceDialogs, scope)
    const input = control<HTMLInputElement>(view.host, 'input[name="scope"]')
    expect(input.value).toBe("Repository")
    expect(control<HTMLOptionElement>(view.host, 'datalist option[value="Repository"]').label).toBe("Repository")
    control<HTMLInputElement>(view.host, 'input[name="value"]').value = "replacement"
    const form = control<HTMLFormElement>(view.host, "form")
    expect(form.checkValidity()).toBe(true)
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submissions).toEqual([{ provider: "gitlab", name: "TOKEN", type: "Secret", scope: "Repository", value: "replacement", protected: false, masked: true }])
  })

  test("GitLab create defaults '*', keeps arbitrary edit scope and retains hidden/read-only restrictions", async () => {
    const scope = fixture("gitlab")
    scope.model.dialog({ kind: "create-variable" })
    using view = mount(ResourceDialogs, scope)
    expect(control<HTMLInputElement>(view.host, 'input[name="scope"]').value).toBe("*")
    expect(control<HTMLInputElement>(view.host, 'input[name="hidden"]').disabled).toBe(false)
    const resource = variable("review/*")
    scope.setState("resources", "value", { items: [resource], capturedAt: 1 })
    scope.model.dialog({ kind: "edit-variable", id: resource.id, scope: resource.scope })
    await Bun.sleep(0)
    const input = control<HTMLInputElement>(view.host, 'input[name="scope"]')
    expect(input.value).toBe("review/*")
    expect(input.readOnly).toBe(false)
    expect(control<HTMLInputElement>(view.host, 'input[name="hidden"]').disabled).toBe(true)
    scope.reads.at(-1)?.result.reject(new Error("private provider detail"))
    await Bun.sleep(0)
    expect(view.host.textContent).toContain("orchestra.actions.unavailable")
    expect(view.host.innerHTML).not.toContain("private provider detail")
    expect(input.value).toBe("review/*")
    scope.setState("resources", "value", { items: [variable("review/*", { readOnly: true })], capturedAt: 1 })
    expect(control<HTMLButtonElement>(view.host, 'button[type="submit"]').disabled).toBe(true)
    expect(input.disabled).toBe(true)
    scope.model.dialog(undefined)
    expect(input.isConnected).toBe(false)
  })
})
