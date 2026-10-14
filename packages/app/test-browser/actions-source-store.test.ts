import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createActionsAPI, decodeAction, snapshotAction } from "../src/orchestra/actions/api"
import { createActionsModel } from "../src/orchestra/actions/model"

const directory = "/repo/native-store"
const localNativeAPIBase = "http://127.0.0.1:4096"
const binding: Actions.Binding = { id: Actions.BindingID.make("ab_store"), revision: 7, remote: "origin", projectID: "42",
  projectPath: "owner/repo", directory, provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const base: Actions.SourceBase = { bindingID: binding.id, ref: "native-default", commit: "a".repeat(40) }
const path = ".github/workflows/native.yml"
const native: Actions.Source = { ...base, path, version: "b".repeat(40), text: "# café 雪 🦴\r\njobs: {}\r\n", editable: false,
  includes: ["templates/雪.yml"], diagnostics: ["native diagnostic"] }
const draft = "# local café 雪 🦴\r\non: workflow_dispatch\r\njobs: {}\r\n"
const resource: Actions.Resource = { id: '["TOKEN","production","Secret"]', bindingID: binding.id,
  name: "TOKEN", kind: "variables", scope: "production", sensitive: true,
  data: { type: "Secret", resourceVersion: "native:redacted-controls", redacted: true,
    flags: ["Masked", "Hidden"], limits: { remaining: 0, enabled: false, note: null } } }
const located = (data: unknown) => Response.json({ location: { directory }, data })

/** Fake only native HTTP; model, request owner, Solid stores, schemas and commands remain real. */
function fixture(existing = false) {
  const requests: Request[] = []
  const intents: Actions.OperationIntent[] = []
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    const url = new URL(request.url)
    expect(url.origin).toBe(localNativeAPIBase)
    expect(url.searchParams.get("location[directory]")).toBe(directory)
    requests.push(request.clone())
    if (url.pathname === "/api/actions/binding") return located([binding])
    if (url.pathname.endsWith("/capabilities")) return located([])
    if (url.pathname === `/api/actions/workflow/${binding.id}` || url.pathname === `/api/actions/run/${binding.id}`)
      return located({ items: [], capturedAt: 1 })
    if (url.pathname.endsWith("/base")) return located(base)
    if (url.pathname.endsWith("/source") && existing) return located(native)
    if (url.pathname.endsWith("/validate") || url.pathname.endsWith("/validate-draft")) {
      const source: Actions.Source = { ...native, text: draft, version: existing ? native.version : "draft:local-only" }
      const graph: Actions.Graph = { source, state: "complete", jobs: [], diagnostics: ["local projection"] }
      return located(graph)
    }
    if (url.pathname === `/api/actions/resource/${binding.id}`) return located({ items: [resource], capturedAt: 1 })
    if (url.pathname === `/api/actions/operation/${binding.id}` && request.method === "POST") {
      const intent = Schema.decodeUnknownSync(Actions.OperationIntent, { onExcessProperty: "error" })(await request.json())
      intents.push(intent)
      // Native admission refusal stops this partial chain before any provider execution.
      const operation: Actions.Operation = { id: Actions.OperationID.make("aop_store"), bindingID: binding.id,
        clientID: intent.clientID, kind: intent.kind, target: intent.target, state: "rejected", createdAt: 1, updatedAt: 1, expiresAt: 100 }
      return located(operation)
    }
    throw new Error(`Unexpected native wire request: ${request.method} ${url.pathname}`)
  }, { preconnect() {} })
  const api = createActionsAPI({ server: { type: "http", http: { url: localNativeAPIBase } }, fetch, directory })
  const root = createRoot((dispose) => ({ dispose, model: createActionsModel({ api, save: async () => undefined }) }))
  return { api, requests, intents, model: root.model, [Symbol.dispose]() { root.dispose() } }
}

describe("Actions native DTOs in client Solid stores", () => {
  test("API-decoded SourceBase adopts real proxy; strict decoder bites while trusted snapshot detaches", async () => {
    using scope = fixture(true)
    await scope.model.refresh()
    const signal = new AbortController().signal
    const observed = await scope.api.sourceBase({ bindingID: binding.id, revision: binding.revision }, undefined, signal)
    expect(decodeAction(Actions.SourceBase, observed)).toEqual(base)
    expect(Object.getOwnPropertySymbols(observed)).toEqual([])
    const resources = await scope.api.resources({ bindingID: binding.id, revision: binding.revision }, { kind: "variables" }, signal)
    const [store, setStore] = createStore({ base: observed, source: await scope.api.source(
      { bindingID: binding.id, revision: binding.revision }, { path, ref: base.ref }, signal),
      data: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(resources.items[0]?.data) })
    // This fails under Solid's server store: prove the browser lane really created proxies.
    expect(Object.getOwnPropertySymbols(store.base).length).toBeGreaterThan(0)
    expect(() => decodeAction(Actions.SourceBase, store.base)).toThrow("invalid_input")
    expect(() => decodeAction(Actions.Source, store.source)).toThrow("invalid_input")
    expect(() => decodeAction(Schema.Record(Schema.String, Schema.Json), store.data)).toThrow("invalid_input")
    const capturedBase = snapshotAction(Actions.SourceBase, store.base)
    const captured = snapshotAction(Actions.Source, store.source)
    const metadata = snapshotAction(Schema.Record(Schema.String, Schema.Json), store.data)
    expect(capturedBase).toEqual(base)
    expect(captured).toEqual(native)
    expect(metadata).toEqual(resource.data)
    expect(new TextEncoder().encode(captured.text)).toEqual(new TextEncoder().encode(native.text))
    expect(captured.includes).not.toBe(store.source.includes)
    expect(captured.diagnostics).not.toBe(store.source.diagnostics)
    expect(metadata).not.toBe(store.data)
    expect(metadata.flags).not.toBe(store.data.flags)
    expect(metadata.limits).not.toBe(store.data.limits)
    ;[capturedBase, captured, captured.includes, captured.diagnostics, metadata, metadata.flags, metadata.limits].forEach((value) => {
      expect(value).toBeDefined()
      if (value && typeof value === "object") expect(Object.getOwnPropertySymbols(value)).toEqual([])
    })
    expect(Object.getPrototypeOf(capturedBase)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(captured)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(metadata)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(captured.includes)).toBe(Array.prototype)
    expect(Object.getPrototypeOf(captured.diagnostics)).toBe(Array.prototype)
    expect(Object.getPrototypeOf(metadata.flags)).toBe(Array.prototype)
    expect(Object.getPrototypeOf(metadata.limits)).toBe(Object.prototype)
    setStore("base", "ref", "later-branch")
    setStore("source", "text", "later text")
    setStore("source", "includes", ["later.yml"])
    setStore("source", "diagnostics", ["later diagnostic"])
    setStore("data", { flags: ["later"], limits: { remaining: 9 } })
    expect(capturedBase).toEqual(base)
    expect(captured).toEqual(native)
    expect(metadata).toEqual(resource.data)
  })

  test("new local workflow validates with exact observed base, never a fabricated native Source", async () => {
    using scope = fixture()
    await scope.model.refresh()
    expect(scope.model.state.workflows.value?.items).toEqual([])
    scope.model.dialog({ kind: "create-workflow" })
    await scope.model.submit({ name: "Local proposal", path, template: "blank", content: draft })
    expect(scope.model.state.draftBase).toEqual(base)
    expect(() => decodeAction(Actions.SourceBase, scope.model.state.draftBase)).toThrow("invalid_input")
    expect(scope.model.state.source).toEqual({ status: "idle" })
    expect(scope.model.state.draft).toBe(draft)
    const before = scope.requests.length
    await scope.model.validateSource()
    const validation = scope.requests.slice(before)
    expect(validation.map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([`POST /api/actions/source/${binding.id}/validate-draft`])
    expect(await validation[0].json()).toEqual({ base, path, draft })
    expect(new URL(validation[0].url).searchParams.get("revision")).toBe("7")
    expect(scope.model.state.graph.status).toBe("ready")
    expect(scope.model.state.graph.value?.source).toEqual({ ...native, text: draft, version: "draft:local-only" })
    expect(scope.model.state.source).toEqual({ status: "idle" })
    expect(scope.model.state.commandError).toBeUndefined()
    scope.model.dialog({ kind: "review-source" })
    expect(scope.model.state.dialog).toEqual({ kind: "review-source" })
    await scope.model.submit({ branch: "proposal", message: "ci: new workflow", title: "Review" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.intents[0]).toMatchObject({ kind: "source.branch", target: { path, ref: base.ref, resourceID: "proposal" } })
    expect(scope.intents[0].expected).toEqual({ commit: base.commit })
    expect(scope.model.state.commandError?.kind).toBe("operation_rejected")
    expect(scope.model.state.source).toEqual({ status: "idle" })
    scope.model.dialog(undefined)
    expect(scope.model.state.commandError).toBeUndefined()
    expect(scope.requests.filter((request) => request.method === "POST").map((request) => new URL(request.url).pathname))
      .toEqual([`/api/actions/source/${binding.id}/validate-draft`, `/api/actions/operation/${binding.id}`])
  })

  test("mutable native source validates and captures review from store without a native write", async () => {
    using scope = fixture(true)
    await scope.model.refresh()
    scope.model.navigate({ view: "source", path, ref: base.ref })
    await scope.model.refresh()
    expect(scope.model.state.source.status).toBe("ready")
    expect(scope.model.state.source.value).toEqual(native)
    expect(() => decodeAction(Actions.Source, scope.model.state.source.value)).toThrow("invalid_input")
    scope.model.editSource(draft)
    const before = scope.requests.length
    await scope.model.validateSource()
    const validation = scope.requests.slice(before)
    expect(validation.map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([`POST /api/actions/source/${binding.id}/validate`])
    expect(await validation[0].json()).toEqual({ source: native, draft })
    expect(scope.model.state.graph.status).toBe("ready")
    expect(scope.model.state.diagnostics).toEqual(["local projection", "native diagnostic"])
    scope.model.dialog({ kind: "review-source" })
    expect(scope.model.state.commandError).toBeUndefined()
    await scope.model.submit({ branch: "proposal", message: "ci: proposal", title: "Review" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.intents[0]).toMatchObject({ kind: "source.branch", binding: { id: binding.id, revision: 7 },
      target: { path, ref: base.ref, resourceID: "proposal" }, expected: { commit: base.commit, sourceVersion: native.version } })
    expect(scope.model.state.commandError?.kind).toBe("operation_rejected")
    expect(scope.model.state.dialog).toEqual({ kind: "review-source" })
    expect(scope.model.state.draft).toBe(draft)
    expect(scope.requests.slice(before).map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([`POST /api/actions/source/${binding.id}/validate`, `POST /api/actions/operation/${binding.id}`])
  })

  test("proxy resource metadata survives dialog selection and owner preparation without invalid_input", async () => {
    using scope = fixture()
    await scope.model.refresh()
    scope.model.navigate({ view: "resources", resourceKind: "variables" })
    await scope.model.refresh()
    const stored = scope.model.state.resources.value?.items[0]
    expect(stored).toEqual(resource)
    expect(() => decodeAction(Schema.Record(Schema.String, Schema.Json), stored?.data)).toThrow("invalid_input")
    const before = scope.requests.length
    scope.model.dialog({ kind: "delete-variable", id: resource.id, scope: resource.scope })
    expect(scope.model.state.commandError).toBeUndefined()
    expect(scope.model.state.dialog?.kind).toBe("delete-variable")
    await scope.model.submit({ provider: "github" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.intents[0]).toMatchObject({ kind: "resource.delete", target: { resourceKind: "variables",
      resourceID: "TOKEN", scope: "production" }, expected: { resourceVersion: "native:redacted-controls" } })
    expect(scope.model.state.operation?.state).toBe("rejected")
    expect(scope.model.state.commandError?.kind).toBe("operation_rejected")
    expect(scope.model.state.submitting).toBe(false)
    expect(scope.requests.slice(before).map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([`POST /api/actions/operation/${binding.id}`])
  })
})
