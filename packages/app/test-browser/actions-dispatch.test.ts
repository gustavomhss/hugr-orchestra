import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createComponent } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { initial, type Dialog, type Model } from "../src/orchestra/actions/contract"
import { solidDom } from "./solid-dom"

const { Dialogs }: typeof import("../src/orchestra/actions/dialogs") = await import(solidDom("../src/orchestra/actions/dialogs", import.meta.dir))
const binding: Actions.Binding = { id: Actions.BindingID.make("ab_dialog"), revision: 7, remote: "origin", projectID: "1",
  projectPath: "owner/project", directory: "/repo", provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const workflow: Actions.Workflow = { id: "11", bindingID: binding.id, name: "CI", path: ".github/workflows/ci.yml",
  defaultRef: "native-default", state: "active", dispatchable: true }
const graph = (ref = "native-default"): Actions.Graph => ({ source: { bindingID: binding.id, path: workflow.path, ref,
  version: "a".repeat(40), text: "native source", editable: false }, state: "complete", jobs: [], diagnostics: [],
  triggers: { workflow_dispatch: { inputs: { debug: { type: "boolean", default: false }, target: { type: "choice", options: ["linux", "windows"], default: "linux" } } } } })
const run: Actions.Run = { id: "101", bindingID: binding.id, workflowID: workflow.id, name: "CI", commit: "b".repeat(40), ref: "native-default",
  status: "completed", conclusion: "failure", attempt: 2, event: "workflow_dispatch" }

function deferred<T>() {
  const result: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => { result.resolve = resolve })
  return { promise, resolve(value: T) { result.resolve?.(value) } }
}

function unexpected(): never { throw new Error("Unexpected model boundary") }

/** Render real dialogs; inject only native reads and command submission, never Solid or eligibility. */
function fixture(options: { dialog?: Dialog; deferred?: boolean; provider?: Actions.ProviderKind; conclusion?: string
  deny?: "run.retry" | "run.retryFailed"; dir?: "ltr" | "rtl" } = {}) {
  const [state, setState] = createStore({ ...initial(), binding: { ...binding, provider: options.provider === "gitlab"
    ? { kind: "gitlab" as const, hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } : binding.provider } })
  setState({ workflows: { status: "ready", value: { items: [workflow], capturedAt: 1 } },
    capabilities: { status: "ready", value: (["run.retry", "run.retryFailed"] as const)
      .map((operation) => ({ operation, state: operation === options.deny ? "unavailable" as const : "available" as const, observedAt: 1 })) },
    run: { status: "ready", value: { ...run, conclusion: options.conclusion ?? run.conclusion } },
    dialog: options.dialog ?? { kind: "dispatch", workflowID: workflow.id } })
  const requests: { workflowID: string; ref: string; signal: AbortSignal; response: ReturnType<typeof deferred<Actions.Graph>> }[] = []
  const submitted: unknown[] = []
  const model = {
    state,
    dialog(dialog?: Dialog) { setState({ dialog }) },
    async submit(payload: unknown) { submitted.push(payload) },
    inspectWorkflow(workflowID: string, ref: string, signal: AbortSignal) {
      const response = deferred<Actions.Graph>()
      requests.push({ workflowID, ref, signal, response })
      if (!options.deferred) response.resolve(graph(ref))
      return response.promise
    },
    async resourceScopes(): Promise<Actions.ResourcePage> { return { items: [], capturedAt: 1 } },
    navigate: unexpected, filter: unexpected, selectBinding: unexpected, refresh: unexpected, more: unexpected,
    connect: unexpected, removeBinding: unexpected, download: unexpected, previewLog: unexpected, editSource: unexpected,
    validateSource: unexpected, discardSource: unexpected, resourceAction: unexpected, workflowState: unexpected, dispose: unexpected,
  } satisfies Model
  const host = document.body.appendChild(document.createElement("div"))
  host.dir = options.dir ?? "ltr"
  const dispose = render(() => createComponent(Dialogs, { model, t: (key) => key }), host)
  return { state, setState, host, model, requests, submitted, [Symbol.dispose]() { dispose(); host.remove() } }
}

function control<T extends Element>(host: Element, selector: string) {
  const element = host.querySelector<T>(selector)
  if (!element) throw new Error(`Missing rendered control: ${selector}`)
  return element
}

function editRef(host: Element, value: string) {
  const ref = control<HTMLInputElement>(host, 'input[name="ref"]')
  ref.value = value
  ref.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("Actions dispatch DOM", () => {
  ;(["ltr", "rtl"] as const).forEach((dir) => test(`${dir}: whitespace-only ref edit preserves typed controls, choices and submitted values`, async () => {
    using scope = fixture({ dir })
    await Bun.sleep(0)
    const debug = control<HTMLInputElement>(scope.host, 'input[name="input:debug"]')
    const target = control<HTMLSelectElement>(scope.host, 'select[name="input:target"]')
    debug.checked = true
    target.value = "1"
    editRef(scope.host, " native-default  ")
    await Bun.sleep(0)
    expect(scope.requests).toHaveLength(1)
    expect(scope.requests[0].signal.aborted).toBe(false)
    expect(control(scope.host, 'input[name="input:debug"]')).toBe(debug)
    expect(control(scope.host, 'select[name="input:target"]')).toBe(target)
    expect(debug.checked).toBe(true)
    expect(target.value).toBe("1")
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
    control<HTMLFormElement>(scope.host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submitted).toEqual([{ provider: "github", ref: "native-default", inputs: { debug: true, target: "windows" } }])
  }))

  test("real ref ABA aborts both old generations; ignored late reads cannot install fields", async () => {
    using scope = fixture({ deferred: true })
    await Bun.sleep(0)
    editRef(scope.host, "other-ref")
    await Bun.sleep(0)
    editRef(scope.host, "native-default")
    await Bun.sleep(0)
    expect(scope.requests.map((item) => item.ref)).toEqual(["native-default", "other-ref", "native-default"])
    expect(scope.requests[0].signal.aborted).toBe(true)
    expect(scope.requests[1].signal.aborted).toBe(true)
    scope.requests[0].response.resolve(graph())
    await Bun.sleep(0)
    expect(scope.host.querySelector('input[name="input:debug"]')).toBeNull()
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(true)
    scope.requests[2].response.resolve({ ...graph(), triggers: { workflow_dispatch: { inputs: { fresh: { type: "string", default: "new-definition" } } } } })
    await Bun.sleep(0)
    const fresh = control<HTMLInputElement>(scope.host, 'input[name="input:fresh"]')
    expect(fresh.value).toBe("new-definition")
    scope.requests[1].response.resolve(graph("other-ref"))
    await Bun.sleep(0)
    expect(control(scope.host, 'input[name="input:fresh"]')).toBe(fresh)
    expect(scope.host.querySelector('input[name="input:debug"]')).toBeNull()
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
  })
})

describe("Actions retry modes DOM", () => {
  test("denied run.retry leaves failed-only retry requestable and denies tampered all-mode submit", async () => {
    using scope = fixture({ dialog: { kind: "retry", runID: run.id }, deny: "run.retry" })
    await Bun.sleep(0)
    const mode = control<HTMLSelectElement>(scope.host, 'select[name="mode"]')
    expect(mode.value).toBe("failed")
    expect(control<HTMLOptionElement>(mode, 'option[value="failed"]').disabled).toBe(false)
    expect(control<HTMLOptionElement>(mode, 'option[value="all"]').disabled).toBe(true)
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
    control<HTMLFormElement>(scope.host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submitted).toEqual([{ provider: "github", mode: "failed" }])
    mode.value = "all"
    mode.dispatchEvent(new Event("change", { bubbles: true }))
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(true)
    control<HTMLFormElement>(scope.host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submitted).toEqual([{ provider: "github", mode: "failed" }])
    expect(scope.requests).toEqual([])
  })

  ;[{ deny: "run.retryFailed" as const }, { conclusion: "success" }].forEach((options) => test(`native-valid default selects all when failed-only mode unavailable: ${JSON.stringify(options)}`, async () => {
    using scope = fixture({ ...options, dialog: { kind: "retry", runID: run.id } })
    await Bun.sleep(0)
    const mode = control<HTMLSelectElement>(scope.host, 'select[name="mode"]')
    expect(mode.value).toBe("all")
    expect(control<HTMLOptionElement>(mode, 'option[value="failed"]').disabled).toBe(true)
    expect(control<HTMLOptionElement>(mode, 'option[value="all"]').disabled).toBe(false)
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
    control<HTMLFormElement>(scope.host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submitted).toEqual([{ provider: "github", mode: "all" }])
  }))

  test("revoking selected mode disables submit and forced submission cannot call command boundary", async () => {
    using scope = fixture({ dialog: { kind: "retry", runID: run.id } })
    await Bun.sleep(0)
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
    scope.setState("capabilities", { status: "ready", value: [{ operation: "run.retryFailed", state: "unavailable", observedAt: 2 }] })
    expect(control<HTMLSelectElement>(scope.host, 'select[name="mode"]').value).toBe("failed")
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(true)
    control<HTMLFormElement>(scope.host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submitted).toEqual([])
  })

  test("historical attempt blocks both retry modes", async () => {
    using scope = fixture({ dialog: { kind: "retry", runID: run.id } })
    await Bun.sleep(0)
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
    scope.setState("route", { view: "run", runID: run.id, attempt: 1 })
    const mode = control<HTMLSelectElement>(scope.host, 'select[name="mode"]')
    expect(control<HTMLOptionElement>(mode, 'option[value="failed"]').disabled).toBe(true)
    expect(control<HTMLOptionElement>(mode, 'option[value="all"]').disabled).toBe(true)
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(true)
  })

  test("GitLab failed mode maps to native run.retry capability, never run.retryFailed", async () => {
    using scope = fixture({ provider: "gitlab", dialog: { kind: "retry", runID: run.id }, deny: "run.retryFailed" })
    await Bun.sleep(0)
    const mode = control<HTMLSelectElement>(scope.host, 'select[name="mode"]')
    expect(mode.value).toBe("failed")
    expect(mode.querySelector('option[value="all"]')).toBeNull()
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(false)
    scope.setState("capabilities", { status: "ready", value: [{ operation: "run.retry", state: "unavailable", observedAt: 2 }] })
    expect(control<HTMLOptionElement>(mode, 'option[value="failed"]').disabled).toBe(true)
    expect(control<HTMLButtonElement>(scope.host, 'button[type="submit"]').disabled).toBe(true)
    control<HTMLFormElement>(scope.host, "form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Bun.sleep(0)
    expect(scope.submitted).toEqual([])
  })
})
