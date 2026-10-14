import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createComponent } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { initial, type Model, type Route, type State } from "../src/orchestra/actions/contract"
import { solidDom } from "./solid-dom"

const { Library }: typeof import("../src/orchestra/actions/library") = await import(solidDom("../src/orchestra/actions/library", import.meta.dir))

function fixture(provider: Actions.ProviderKind = "github") {
  const binding: Actions.Binding = {
    id: Actions.BindingID.make("ab_library"), revision: 1, remote: "origin", projectID: "21", projectPath: "gustavomhss/hugr-orchestra",
    provider: { kind: provider, hostname: `${provider}.com`, apiOrigin: `https://${provider}.com` },
  }
  const workflow: Actions.Workflow = {
    id: provider === "github" ? "7531" : "gitlab:project:21:pipeline", bindingID: binding.id, name: "Native CI",
    path: provider === "github" ? ".github/workflows/test.yml" : ".ci/native.yml", defaultRef: "release/native",
    state: provider === "github" ? "active" : "configured", dispatchable: false, dispatchState: "unknown", triggers: ["push"],
  }
  const [state, setState] = createStore<State>({ ...initial(), binding,
    workflows: { status: "ready", value: { capturedAt: 1, items: [workflow], total: 1 } },
    runs: { status: "ready", value: { capturedAt: 1, items: [] } }, capabilities: { status: "ready", value: [] } })
  const routes: Route[] = []
  const unexpected = async () => { throw new Error("Unexpected library I/O or provider mutation") }
  const model: Model = {
    state, navigate(route) { routes.push(route) }, dialog(dialog) { setState("dialog", dialog) },
    filter() { throw new Error("Library filter leaked into native run requests") },
    selectBinding() {}, refresh: unexpected, more: unexpected, connect: unexpected, removeBinding: unexpected,
    submit: unexpected, download: unexpected, previewLog: unexpected, validateSource: unexpected, inspectWorkflow: unexpected,
    resourceScopes: unexpected, resourceAction: unexpected, workflowState: unexpected, editSource() {}, discardSource() {}, dispose() {},
  }
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(Library, { model, t: (key) => key, embedded: true }), host)
  return { host, state, setState, routes, workflow, [Symbol.dispose]() { dispose(); host.remove() } }
}

function control<T extends Element>(host: Element, selector: string) {
  const element = host.querySelector<T>(selector)
  if (!element) throw new Error(`Missing library control: ${selector}`)
  return element
}

test("native metadata card has empty latest run, lazy Source footer and bound actual CI navigation", () => {
  using view = fixture()
  expect(control(view.host, ".collection-preview").textContent).toContain("release/native")
  expect(control(view.host, ".collection-preview").textContent).toContain("orchestra.actions.unknown")
  expect(control(view.host, ".collection-last").textContent).toContain("orchestra.actions.emptyRuns")
  expect(control(view.host, ".collection-last").textContent).not.toContain("orchestra.actions.unknown")
  expect(control(view.host, ".collection-triggers").textContent).toContain("push")
  control<HTMLButtonElement>(view.host, ".mx-card-foot > div button:last-child").click()
  expect(view.routes.at(-1)).toEqual({ view: "source", workflowID: view.workflow.id, path: view.workflow.path, ref: "release/native" })
  control<HTMLButtonElement>(view.host, ".collection-reference").click()
  expect(view.routes.at(-1)).toEqual({ view: "workflow", workflowID: view.workflow.id, path: view.workflow.path, ref: "release/native", tab: "graph" })
  control<HTMLButtonElement>(view.host, ".collection-runs .section-title button").click()
  expect(view.routes.at(-1)).toEqual({ view: "runs" })
})

test("observed active/disabled buttons filter cards locally and preserve unmatched-state honesty", () => {
  using view = fixture()
  const disabled = { ...view.workflow, id: "8642", name: "Disabled build", path: ".github/workflows/disabled.yml", state: "disabled_manually" }
  view.setState("workflows", "value", { capturedAt: 1, items: [view.workflow, disabled] })
  const filters = () => [...view.host.querySelectorAll<HTMLButtonElement>(".wf-range button")]
  expect(filters().map((button) => button.textContent)).toEqual(["orchestra.actions.all", "orchestra.actions.active", "orchestra.actions.disabled"])
  filters()[2].click()
  expect(filters()[2].getAttribute("aria-pressed")).toBe("true")
  expect(view.host.querySelectorAll(".workflow-card")).toHaveLength(1)
  expect(control(view.host, '.collection-section small[aria-label="orchestra.actions.library"]').textContent?.replace(/\s/g, "")).toBe("1/2")
  expect(control(view.host, ".workflow-card h3").textContent).toBe("Disabled build")
  const search = control<HTMLInputElement>(view.host, 'input[type="search"]')
  search.value = "missing-source"
  search.dispatchEvent(new Event("input", { bubbles: true }))
  expect(view.host.textContent).toContain("orchestra.actions.noMatches")
  expect(view.host.querySelectorAll(".workflow-card")).toHaveLength(0)
  expect(filters()).toHaveLength(3)
  expect(view.state.filters).toMatchObject({ query: "", status: "" })
})

test("GitLab configured is enabled and Unknown authorization permits request until native denial", () => {
  using view = fixture("gitlab")
  expect(control(view.host, ".mx-card-top > .mx-badge").textContent).toContain("orchestra.actions.enabled")
  const dispatch = control<HTMLButtonElement>(view.host, ".mx-card-foot > button")
  expect(dispatch.disabled).toBe(false)
  dispatch.click()
  expect(view.state.dialog).toEqual({ kind: "dispatch", workflowID: view.workflow.id })
  view.setState("dialog", undefined)
  view.setState("capabilities", { status: "ready", value: [{ operation: "workflow.dispatch", state: "unavailable", observedAt: 1 }] })
  expect(dispatch.disabled).toBe(true)
  dispatch.click()
  expect(view.state.dialog).toBeUndefined()
  expect(view.host.querySelector(".collection-reference")).toBeNull()
})

test("dispatch rejects malformed native workflow identity even when operation authorization is requestable", () => {
  using view = fixture()
  view.setState("workflows", "value", "items", [{ ...view.workflow, id: "display-only-name" }])
  expect(control<HTMLButtonElement>(view.host, ".mx-card-foot > button").disabled).toBe(true)
  view.setState("workflows", "value", "items", [{ ...view.workflow, path: ".github/workflows/nested/test.yml" }])
  expect(control<HTMLButtonElement>(view.host, ".mx-card-foot > button").disabled).toBe(true)
  expect(view.state.dialog).toBeUndefined()
  view.setState("workflows", "value", "items", [view.workflow])
  expect(control<HTMLButtonElement>(view.host, ".mx-card-foot > button").disabled).toBe(false)
})

test("recent list stays bounded, latest execution Unknown stays distinct from no run and load failures", () => {
  using view = fixture()
  const runs = Array.from({ length: 4 }, (_, index): Actions.Run => ({
    id: String(101 + index), bindingID: view.workflow.bindingID, workflowID: view.workflow.id, name: `Observed ${index}`,
    ref: "feature/native", commit: "a".repeat(40), event: "push", status: null, attempt: 1,
    createdAt: `2026-10-0${index + 1}T00:00:00Z`,
  }))
  view.setState("runs", { status: "ready", value: { capturedAt: 1, items: runs } })
  expect(view.host.querySelectorAll(".collection-runs .run-row")).toHaveLength(3)
  expect(control(view.host, ".collection-last").textContent).toContain("#104")
  expect(control(view.host, ".collection-last").textContent).toContain("orchestra.actions.unknown")
  expect(control(view.host, ".collection-last").textContent).not.toContain("orchestra.actions.emptyRuns")
  view.setState("runs", { status: "loading" })
  expect(control(view.host, ".collection-last").textContent).toContain("orchestra.actions.loading")
  view.setState("runs", { status: "error", error: { kind: "provider_unavailable", message: "orchestra.actions.unavailable" } })
  expect(control(view.host, ".collection-last [role=alert]").textContent).toBe("orchestra.actions.unavailable")
})
