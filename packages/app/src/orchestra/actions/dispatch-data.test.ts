import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createStore } from "solid-js/store"
import { ActionsRequestError } from "./api"
import { initial } from "./contract"
import { createDispatchData, dispatchDefaultRef, dispatchDefinitions, dispatchSelection, environmentOptions, type DispatchData } from "./dispatch-data"
import { parseInputs } from "./source-dialogs"

const binding: Actions.Binding = { id: Actions.BindingID.make("ab_dispatch"), revision: 7, remote: "origin", projectID: "1",
  projectPath: "owner/project", directory: "/repo", provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const workflow: Actions.Workflow = { id: "11", bindingID: binding.id, name: "Release", path: ".github/workflows/release.yml",
  defaultRef: "native-default", state: "active", dispatchable: true }
const other: Actions.Workflow = { ...workflow, id: "22", path: ".github/workflows/other.yml", defaultRef: "other-default" }
const graph = (ref = "native-default"): Actions.Graph => ({ source: { bindingID: binding.id, path: workflow.path, ref,
  version: "b".repeat(40), text: "native source", editable: false }, state: "complete", jobs: [], diagnostics: [],
  triggers: { workflow_dispatch: { inputs: { debug: { type: "boolean", default: false }, target: { type: "choice", options: ["linux", "windows"], default: "linux" } } } } })
const environment = (name: string): Actions.Resource => ({ id: name, bindingID: binding.id, kind: "environments", name, data: {} })
const page = (items: readonly Actions.Resource[] = []): Actions.ResourcePage => ({ items, capturedAt: 1 })
function deferred<T>() {
  const result: { resolve?: (value: T) => void; reject?: (error: unknown) => void } = {}
  const promise = new Promise<T>((resolve, reject) => { result.resolve = resolve; result.reject = reject })
  return { promise, resolve(value: T) { result.resolve?.(value) }, reject(error: unknown) { result.reject?.(error) } }
}

/** Only native read seams are injected; selection, fencing, store updates and input parsing are real. */
function fixture(options: { inspect?: (workflowID: string, ref: string, signal: AbortSignal) => Promise<Actions.Graph>
  scopes?: (signal: AbortSignal) => Promise<Actions.ResourcePage> } = {}) {
  const state = initial()
  state.binding = { ...binding }
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [workflow, other] } }
  state.dialog = { kind: "dispatch", workflowID: workflow.id }
  const form = { ref: "native-default" }
  const [data, update] = createStore<DispatchData>({ status: "idle" })
  const requests: { workflowID: string; ref: string; signal: AbortSignal }[] = []
  const scopes: AbortSignal[] = []
  const reader = createDispatchData({ current: () => dispatchSelection(state, form.ref), update, model: {
    inspectWorkflow(id, ref, signal) { requests.push({ workflowID: id, ref, signal }); return options.inspect?.(id, ref, signal) ?? Promise.resolve(graph(ref)) },
    resourceScopes(signal) { scopes.push(signal); return options.scopes?.(signal) ?? Promise.resolve(page([environment("production")])) },
  } })
  return { state, form, data, reader, requests, scopes, [Symbol.dispose]() { reader.dispose() } }
}

describe("dispatch dialog data", () => {
  test("library default belongs to selected native catalog item, never recent run or unrelated route", () => {
    using scope = fixture()
    scope.state.route = { view: "library", workflowID: other.id, path: other.path, ref: "unrelated-route" }
    scope.state.source = { status: "ready", value: graph("unrelated-source").source }
    scope.state.run = { status: "ready", value: { id: "101", bindingID: binding.id, ref: "recent-run", commit: "a".repeat(40), name: "Old", event: "push", status: "completed" } }
    expect(dispatchDefaultRef(scope.state, { kind: "dispatch", workflowID: workflow.id })).toBe("native-default")
    expect(dispatchDefaultRef(scope.state, { kind: "dispatch", workflowID: other.id })).toBe("other-default")
    scope.state.workflows.value = { capturedAt: 1, items: [{ ...workflow, defaultRef: undefined }] }
    expect(dispatchDefaultRef(scope.state, { kind: "dispatch", workflowID: workflow.id })).toBe("")
    scope.state.workflows.value = { capturedAt: 1, items: [{ ...workflow, bindingID: Actions.BindingID.make("ab_foreign") }] }
    expect(dispatchDefaultRef(scope.state, { kind: "dispatch", workflowID: workflow.id })).toBe("")
  })

  test("only matching nonhistorical workflow/source selection preserves explicit ref", () => {
    using scope = fixture()
    const dialog = { kind: "dispatch" as const, workflowID: workflow.id }
    scope.state.route = { view: "workflow", workflowID: workflow.id, path: workflow.path, ref: "chosen-tag" }
    expect(dispatchDefaultRef(scope.state, dialog)).toBe("chosen-tag")
    scope.state.route = { ...scope.state.route, view: "source" }
    expect(dispatchDefaultRef(scope.state, dialog)).toBe("chosen-tag")
    scope.state.route = { ...scope.state.route, runID: "101" }
    expect(dispatchDefaultRef(scope.state, dialog)).toBe("native-default")
    scope.state.route = { view: "workflow", workflowID: workflow.id, path: other.path, ref: "wrong-path" }
    expect(dispatchDefaultRef(scope.state, dialog)).toBe("native-default")
  })

  test("opening one library dialog inspects only selected path/ref; main source/graph stay untouched", async () => {
    using scope = fixture()
    scope.state.route = { view: "library", workflowID: other.id, path: other.path, ref: "wrong-route" }
    scope.state.graph = { status: "ready", value: graph("main-graph-ref") }
    scope.state.source = { status: "ready", value: graph("editor-ref").source }
    const before = structuredClone(scope.state)
    expect(scope.requests).toEqual([])
    expect(scope.reader.ready()).toBe(false)
    const reading = scope.reader.load()
    expect(scope.data.status).toBe("loading")
    expect(scope.data.definitions).toBeUndefined()
    await reading
    expect(scope.requests.map((item) => [item.workflowID, item.ref])).toEqual([[workflow.id, "native-default"]])
    expect(scope.scopes).toEqual([])
    expect(scope.data.definitions?.map((item) => [item.name, item.type])).toEqual([["debug", "boolean"], ["target", "choice"]])
    expect(scope.data.status).toBe("ready")
    expect(scope.reader.ready()).toBe(true)
    expect(scope.state).toEqual(before)
  })

  test("ref change clears definitions immediately; ignored abort and same-ref ABA cannot install stale result", async () => {
    const old = deferred<Actions.Graph>(); const latest = deferred<Actions.Graph>(); const started = deferred<void>(); const restarted = deferred<void>()
    const responses = [old, latest]
    using scope = fixture({ inspect: async (_id, ref) => {
      if (ref !== "native-default") return graph(ref)
      const response = responses.shift()
      if (!response) throw new Error("Unexpected duplicate read")
      if (response === old) started.resolve()
      if (response === latest) restarted.resolve()
      return response.promise
    } })
    const reading = scope.reader.load(); await started.promise
    scope.form.ref = "new-ref"
    const newer = scope.reader.load()
    expect(scope.requests[0].signal.aborted).toBe(true)
    expect(scope.data.status).toBe("loading")
    expect(scope.reader.ready()).toBe(false)
    await newer
    expect(scope.reader.ready()).toBe(true)
    scope.form.ref = "native-default"
    expect(scope.reader.ready()).toBe(false)
    const final = scope.reader.load(); await restarted.promise
    old.resolve(graph())
    await reading
    expect(scope.data.status).toBe("loading")
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
    latest.resolve({ ...graph(), triggers: "workflow_dispatch" })
    await final
    expect(scope.requests).toHaveLength(3)
    expect(scope.requests[1].signal.aborted).toBe(true)
    expect(scope.data.definitions).toEqual([])
    expect(scope.reader.ready()).toBe(true)
  })

  ;["binding", "revision", "workflow", "path", "dialog", "close"].forEach((change) => test(`late completion fences changed ${change} even before reload/cancellation`, async () => {
    const response = deferred<Actions.Graph>(); const started = deferred<void>()
    using scope = fixture({ inspect: async () => { started.resolve(); return response.promise } })
    const reading = scope.reader.load(); await started.promise
    if (change === "binding") scope.state.binding = { ...binding, id: Actions.BindingID.make("ab_foreign") }
    if (change === "revision") scope.state.binding = { ...binding, revision: binding.revision + 1 }
    if (change === "workflow" && scope.state.dialog?.kind === "dispatch") {
      scope.state.workflows.value = { capturedAt: 1, items: [workflow, { ...other, path: workflow.path }] }
      scope.state.dialog.workflowID = other.id
    }
    if (change === "path") scope.state.workflows.value = { capturedAt: 1, items: [{ ...workflow, path: "new-path.yml" }] }
    if (change === "dialog") scope.state.dialog = { kind: "dispatch", workflowID: workflow.id }
    if (change === "close") scope.state.dialog = undefined
    response.resolve(graph()); await reading
    expect(scope.data.status).toBe("loading")
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
    await scope.reader.load()
    expect(scope.requests[0].signal.aborted).toBe(true)
  }))

  test("loading or failure clears previously ready definitions and keeps provider detail redacted", async () => {
    using scope = fixture({ inspect: async (_id, ref) => { if (ref === "bad") throw new ActionsRequestError("not_authenticated"); return graph(ref) } })
    await scope.reader.load()
    expect(scope.reader.ready()).toBe(true)
    scope.form.ref = "bad"
    expect(scope.reader.ready()).toBe(false)
    const reading = scope.reader.load()
    expect(scope.data.status).toBe("loading")
    expect(scope.data.definitions).toBeUndefined()
    await reading
    expect(scope.data.status).toBe("error")
    expect(scope.data.error?.message).toBe("orchestra.actions.providerSignInRequired")
    expect(scope.reader.ready()).toBe(false)
  })

  ;["bindingID", "path", "ref"].forEach((field) => test(`inspection rejects mismatched native source ${field}`, async () => {
    using scope = fixture({ inspect: async () => ({ ...graph(), source: { ...graph().source, [field]: "wrong" } }) })
    await scope.reader.load()
    expect(scope.data.status).toBe("error")
    expect(scope.data.error?.message).toBe("orchestra.actions.noSource")
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
  }))

  test("GitLab include definitions stay explicitly unresolved even with projected inputs", async () => {
    using scope = fixture({ inspect: async () => ({ ...graph(), state: "partial", inputs: [{ name: "invented", type: "boolean", required: false, default: true }],
      diagnostics: ["inputs_include_unresolved:external input definitions not fetched"] }) })
    scope.state.binding = { ...binding, provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } }
    await scope.reader.load()
    expect(scope.data.status).toBe("unresolved")
    expect(scope.data.error).toEqual({ kind: "inputs_include_unresolved", message: "orchestra.actions.partialGraph" })
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
    expect(scope.scopes).toEqual([])
    expect(dispatchDefinitions({ ...graph(), inputs: [], header: { spec: { include: "external.yml", inputs: {} } } }, "gitlab")).toBeUndefined()
  })

  test("environment choices load lazily from environment records, not variables page", async () => {
    const environments = deferred<Actions.ResourcePage>(); const started = deferred<void>()
    using scope = fixture({ inspect: async () => ({ ...graph(), triggers: { workflow_dispatch: { inputs: { target: { type: "environment", required: true, default: "production" } } } } }),
      scopes: async () => { started.resolve(); return environments.promise } })
    scope.state.resources = { status: "ready", value: page([{ ...environment("wrong-variable-scope"), kind: "variables", scope: "invented" }]) }
    const reading = scope.reader.load(); await started.promise
    expect(scope.requests).toHaveLength(1)
    expect(scope.scopes).toHaveLength(1)
    expect(scope.data.status).toBe("loading")
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
    environments.resolve(page([environment("production"), environment("staging"), environment("production"),
      { ...environment("foreign"), bindingID: Actions.BindingID.make("ab_foreign") }, { ...environment("variable"), kind: "variables" }]))
    await reading
    expect(scope.data.definitions).toEqual([{ name: "target", type: "environment", required: true, default: "production", options: ["production", "staging"] }])
    const form = new FormData(); form.set("input:target", "1")
    expect(parseInputs("", scope.data.definitions, "github", form)).toEqual({ value: { target: "staging" } })
    expect(scope.reader.ready()).toBe(true)
  })

  ;["ref", "close", "dispose"].flatMap((change) => ["resolve", "reject"].map((outcome) => ({ change, outcome }))).forEach((event) => test(`pending environment read aborts on ${event.change}; late ${event.outcome} stays inert`, async () => {
    const environments = deferred<Actions.ResourcePage>(); const started = deferred<void>()
    using scope = fixture({ inspect: async (_id, ref) => ({ ...graph(ref), triggers: { workflow_dispatch: { inputs: { target: { type: "environment" } } } } }),
      scopes: async () => { started.resolve(); return environments.promise } })
    const reading = scope.reader.load(); await started.promise
    if (event.change === "ref") { scope.form.ref = "new-ref"; scope.reader.cancel() }
    if (event.change === "close") { scope.state.dialog = undefined; await scope.reader.load() }
    if (event.change === "dispose") scope.reader.dispose()
    expect(scope.scopes[0].aborted).toBe(true)
    const before = JSON.stringify(scope.data)
    if (event.outcome === "resolve") environments.resolve(page([environment("stale")]))
    if (event.outcome === "reject") environments.reject(new Error("private provider detail"))
    await reading
    expect(JSON.stringify(scope.data)).toBe(before)
    expect(scope.reader.ready()).toBe(false)
  }))

  test("incomplete environments fail instead of guessing free-text choices/defaults", async () => {
    expect(environmentOptions(page([environment("prod"), environment("prod"), environment("")]), binding.id)).toEqual(["prod"])
    expect(() => environmentOptions({ ...page(), next: "more" }, binding.id)).toThrow("metadata_truncated")
    expect(() => environmentOptions({ ...page([environment("prod")]), total: 2 }, binding.id)).toThrow("metadata_truncated")
    using scope = fixture({ inspect: async () => ({ ...graph(), triggers: { workflow_dispatch: { inputs: { target: { type: "environment" } } } } }),
      scopes: async () => ({ ...page([environment("prod")]), next: "more" }) })
    await scope.reader.load()
    expect(scope.data.status).toBe("error")
    expect(scope.data.error?.kind).toBe("metadata_truncated")
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
  })

  test("environment read failure blocks inputs and exposes only typed safe error copy", async () => {
    using scope = fixture({ inspect: async () => ({ ...graph(), triggers: { workflow_dispatch: { inputs: { target: { type: "environment", default: "guess" } } } } }),
      scopes: async () => { throw new Error("private-token provider response") } })
    await scope.reader.load()
    expect(scope.data.status).toBe("error")
    expect(scope.data.error).toEqual({ kind: "transport_failed", message: "orchestra.actions.unavailable" })
    expect(JSON.stringify(scope.data)).not.toContain("private-token")
    expect(scope.data.definitions).toBeUndefined()
    expect(scope.reader.ready()).toBe(false)
  })

  test("native choice, number, boolean and array values survive existing form parser", () => {
    const definitions = dispatchDefinitions({ ...graph(), inputs: [
      { name: "count", type: "number", required: true, default: 2 },
      { name: "enabled", type: "boolean", required: true, default: false },
      { name: "targets", type: "array", required: true, default: ["linux", 3, false] },
      { name: "size", type: "number", required: true, options: [2, 4], default: 4 },
      { name: "mode", type: "boolean", required: true, options: [false, true], default: false },
    ] }, "gitlab")
    expect(definitions?.map((item) => [item.type, item.default])).toEqual([["number", 2], ["boolean", false], ["array", ["linux", 3, false]], ["choice", 4], ["choice", false]])
    const form = new FormData()
    form.set("input:count", "2.5"); form.set("input:targets", '["linux",3,false]'); form.set("input:size", "1"); form.set("input:mode", "0")
    expect(parseInputs("", definitions, "gitlab", form)).toEqual({ value: { count: 2.5, enabled: false, targets: ["linux", 3, false], size: 4, mode: false } })
    form.set("input:count", "NaN")
    expect(parseInputs("", definitions, "gitlab", form).error).toBe("invalid")
    form.set("input:count", "2"); form.set("input:targets", "{}")
    expect(parseInputs("", definitions, "gitlab", form).error).toBe("invalid")
  })

  test("missing selection/ref never starts native work; disposal prevents future reads", async () => {
    using scope = fixture()
    scope.form.ref = "  "
    await scope.reader.load()
    expect(scope.data.status).toBe("idle")
    expect(scope.reader.ready()).toBe(false)
    expect(scope.requests).toEqual([])
    scope.form.ref = "native-default"
    scope.state.dialog = undefined
    await scope.reader.load()
    expect(scope.requests).toEqual([])
    scope.state.dialog = { kind: "dispatch", workflowID: workflow.id }
    scope.reader.dispose()
    await scope.reader.load()
    expect(scope.requests).toEqual([])
  })
})
