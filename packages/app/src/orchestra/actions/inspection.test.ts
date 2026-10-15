import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createActionsAPI, type ActionsScope } from "./api"
import { initial } from "./contract"
import { createActionsInspection } from "./inspection"
import { rethrow } from "../../testing/rejection"

const binding: Actions.Binding = { id: Actions.BindingID.make("ab_inspection"), revision: 7, remote: "origin", directory: "/repo/inspection",
  projectID: "42", projectPath: "org/repo", account: "account-a", provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const path = ".github/workflows/ci.yml"
const graph = (ref = "release"): Actions.Graph => ({ state: "complete", jobs: [], diagnostics: [], source: {
  bindingID: binding.id, path, ref, commit: "a".repeat(40), version: "native-version", text: "jobs: {}", editable: true,
} })
const environment = (id: string): Actions.Resource => ({ id, name: id, bindingID: binding.id, kind: "environments", data: {} })
const page = (items: readonly Actions.Resource[]): Actions.ResourcePage => ({ items, capturedAt: 1, next: "more-environments" })

function fixture(reply: Partial<Pick<ReturnType<typeof createActionsAPI>, "graph" | "resources">> = {}) {
  const state = initial()
  state.binding = binding
  state.route = { view: "resources", resourceKind: "variables" }
  state.filters = { query: "TOKEN", status: "failed", ref: "unrelated", event: "push", scope: "production" }
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [
    { id: "11", bindingID: Actions.BindingID.make("ab_other"), name: "Foreign", path: "wrong.yml", state: "active", dispatchable: true },
    { id: "11", bindingID: binding.id, name: "CI", path, state: "active", dispatchable: true },
  ] } }
  const native = { ...graph("editor-main").source, path: ".github/workflows/editor.yml" }
  state.source = { status: "ready", value: native }
  state.graph = { status: "ready", value: { ...graph("editor-main"), source: native } }
  state.draft = "unsaved editor draft"
  state.resources = { status: "ready", value: page([{ ...environment("TOKEN"), kind: "variables" }]) }
  const lifecycle = { disposed: false }
  const calls: Array<{ method: string; scope: ActionsScope; query: unknown; signal: AbortSignal }> = []
  const api = {
    ...createActionsAPI({ directory: binding.directory, server: { type: "http", http: { url: "http://inspection.invalid" } },
      fetch: Object.assign(async () => { throw new Error("Unexpected network request") }, { preconnect() {} }) }),
    graph(target: ActionsScope, query: { path: string; ref: string }, signal: AbortSignal) {
      calls.push({ method: "graph", scope: target, query, signal })
      return reply.graph?.(target, query, signal) ?? Promise.resolve(graph(query.ref))
    },
    resources(target: ActionsScope, query: Actions.ResourceListInput, signal: AbortSignal) {
      calls.push({ method: "resources", scope: target, query, signal })
      return reply.resources?.(target, query, signal) ?? Promise.resolve(page([environment("production")]))
    },
  }
  return { state, lifecycle, calls, inspection: createActionsInspection({ api, state: () => state, disposed: () => lifecycle.disposed }) }
}

describe("Actions dialog inspection", () => {
  test("graph and environment reads use their own selection without installing main-view state", async () => {
    const scope = fixture()
    const before = structuredClone(scope.state)
    const signal = new AbortController().signal
    const inspected = await scope.inspection.inspectWorkflow("11", "release", signal)
    const scopes = await scope.inspection.resourceScopes(signal)
    expect(inspected).toEqual(graph())
    expect(scopes).toEqual(page([environment("production")]))
    expect(scope.calls).toEqual([
      { method: "graph", scope: { bindingID: binding.id, revision: 7 }, query: { path, ref: "release" }, signal },
      { method: "resources", scope: { bindingID: binding.id, revision: 7 }, query: { kind: "environments", limit: 30 }, signal },
    ])
    expect(scope.state).toEqual(before)
  })

  test.each(["binding", "revision", "dispose", "abort"] as const)("late replies fail after %s even when API ignores cancellation", async (change) => {
    const graphReply = Promise.withResolvers<Actions.Graph>()
    const scopesReply = Promise.withResolvers<Actions.ResourcePage>()
    const scope = fixture({ graph: () => graphReply.promise, resources: () => scopesReply.promise })
    const abort = new AbortController()
    const inspecting = rethrow(scope.inspection.inspectWorkflow("11", "release", abort.signal))
    const listing = rethrow(scope.inspection.resourceScopes(abort.signal))
    expect(scope.calls).toHaveLength(2)
    if (change === "binding") scope.state.binding = { ...binding, id: Actions.BindingID.make("ab_other"), account: "account-b" }
    if (change === "revision") scope.state.binding = { ...binding, revision: 8 }
    if (change === "dispose") scope.lifecycle.disposed = true
    if (change === "abort") abort.abort()
    const before = structuredClone(scope.state)
    graphReply.resolve(graph())
    scopesReply.resolve(page([environment("production")]))
    expect(await inspecting).toThrow("binding_stale")
    expect(await listing).toThrow("binding_stale")
    expect(scope.state).toEqual(before)
  })

  test.each(["missing-binding", "disposed", "aborted"] as const)("%s refuses both reads before API access", async (condition) => {
    const scope = fixture()
    const abort = new AbortController()
    if (condition === "missing-binding") scope.state.binding = undefined
    if (condition === "disposed") scope.lifecycle.disposed = true
    if (condition === "aborted") abort.abort()
    await expect(scope.inspection.inspectWorkflow("11", "release", abort.signal)).rejects.toThrow("binding_stale")
    await expect(scope.inspection.resourceScopes(abort.signal)).rejects.toThrow("binding_stale")
    expect(scope.calls).toEqual([])
  })

  test("closing one dialog does not cancel another dialog's environment read", async () => {
    const graphReply = Promise.withResolvers<Actions.Graph>()
    const scopesReply = Promise.withResolvers<Actions.ResourcePage>()
    const scope = fixture({ graph: () => graphReply.promise, resources: () => scopesReply.promise })
    const abort = new AbortController()
    const inspecting = scope.inspection.inspectWorkflow("11", "release", abort.signal)
    const listing = scope.inspection.resourceScopes(new AbortController().signal)
    abort.abort()
    graphReply.resolve(graph())
    scopesReply.resolve(page([environment("production")]))
    await expect(inspecting).rejects.toThrow("binding_stale")
    expect(await listing).toEqual(page([environment("production")]))
    expect(scope.calls[1].signal.aborted).toBe(false)
    expect(scope.state.draft).toBe("unsaved editor draft")
  })

  test.each(["foreign-workflow", "missing-path", "missing-ref"] as const)("%s cannot guess source identity", async (condition) => {
    const scope = fixture()
    scope.state.workflows = { status: "ready", value: { capturedAt: 1, items: [{ id: "11", name: "CI", state: "active", dispatchable: true,
      bindingID: condition === "foreign-workflow" ? Actions.BindingID.make("ab_other") : binding.id,
      path: condition === "missing-path" ? "" : path }] } }
    await expect(scope.inspection.inspectWorkflow("11", condition === "missing-ref" ? "" : "release", new AbortController().signal))
      .rejects.toThrow("source_unresolved")
    expect(scope.calls).toEqual([])
  })

  test.each([
    { bindingID: Actions.BindingID.make("ab_other") }, { path: "other.yml" }, { ref: "same-name-tag" },
  ])("graph proof rejects mismatched identity %j", async (mismatch) => {
    const scope = fixture({ graph: async () => ({ ...graph(), source: { ...graph().source, ...mismatch } }) })
    const before = structuredClone(scope.state)
    await expect(scope.inspection.inspectWorkflow("11", "release", new AbortController().signal)).rejects.toThrow("source_conflict")
    expect(scope.state).toEqual(before)
  })

  test("environment inspection accepts exactly 30 items and keeps pagination evidence", async () => {
    const expected = page(Array.from({ length: 30 }, (_, index) => environment(String(index))))
    const scope = fixture({ resources: async () => expected })
    expect(await scope.inspection.resourceScopes(new AbortController().signal)).toBe(expected)
    expect(scope.calls).toHaveLength(1)
    const oversized = fixture({ resources: async () => page([...expected.items, environment("overflow")]) })
    await expect(oversized.inspection.resourceScopes(new AbortController().signal)).rejects.toThrow("metadata_truncated")
  })

  test.each([
    { bindingID: Actions.BindingID.make("ab_other") }, { kind: "variables" as const },
  ])("environment page rejects mixed account or family %j", async (mismatch) => {
    const scope = fixture({ resources: async () => page([environment("valid"), { ...environment("foreign"), ...mismatch }]) })
    const before = structuredClone(scope.state)
    await expect(scope.inspection.resourceScopes(new AbortController().signal)).rejects.toThrow("binding_stale")
    expect(scope.state).toEqual(before)
  })
})
